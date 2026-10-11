// Swissquote cosigner scenarios, against the running service (npm run dev -w services/swissquote).
// Usage: npm run demo:cosign            (regtest)
// The app (this script) only holds the phone key and the backup key; the Swissquote key
// stays in the service (invariant I4).
import { join } from 'node:path';
import {
  Esplora,
  accountOrigin,
  buildSpend,
  combinePsbts,
  deriveAddress,
  finalizeSpend,
  networkConfig,
  psbtFromBase64,
  randomSeed,
  rootFromSeed,
  signWithRoot,
  type WalletPolicy,
} from '../packages/core/src/index';
import { SoftAuthenticator } from './lib/soft-authenticator';

try {
  process.loadEnvFile(join(import.meta.dirname, '../.env'));
} catch {}

const SQ = `http://localhost:${process.env.SWISSQUOTE_PORT ?? 4001}`;
const cfg = networkConfig('regtest', process.env.ESPLORA_URL_REGTEST);
const esplora = new Esplora(cfg);

let token = '';
async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(SQ + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { code: res.status, json: (await res.json()) as any };
}

// Software authenticator: plays the role of Windows Hello / Face ID for this script.
const passkey = await SoftAuthenticator.create(process.env.ORIGIN?.split(',')[0], process.env.RP_ID);
let walletId = '';
async function approve(purpose: 'cosign' | 'cancel' | 'unfreeze', payload: string) {
  const options = await call('POST', '/webauthn/operation/options', { walletId, purpose, payload });
  return passkey.authenticate(options.json);
}

const step = (t: string) => console.log(`\n=== ${t}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const externalAddress = () => {
  const r = rootFromSeed(randomSeed(), cfg.network);
  return deriveAddress(
    { threshold: 2, keys: [accountOrigin(r), accountOrigin(r, 1), accountOrigin(r, 2)] },
    0,
    0,
    cfg.network,
  ).address;
};

// --- Swissquote login (simulated KYC) and passkey creation.
step('Login and passkey');
const session = await call('POST', '/kyc/login', { clientId: `client-demo-${Date.now()}` });
token = session.json.token;
const regOptions = await call('POST', '/webauthn/register/options');
const reg = await call('POST', '/webauthn/register/verify', { response: await passkey.register(regOptions.json) });
console.log(`Passkey registered: ${reg.json.verified}`);

// --- Wallet creation: the app generates its two keys, Swissquote provides its own.
step('Wallet creation');
const phone = rootFromSeed(randomSeed(), cfg.network);
const backup = rootFromSeed(randomSeed(), cfg.network);
const created = await call('POST', '/wallets', {
  phoneKey: accountOrigin(phone),
  backupKey: accountOrigin(backup),
});
walletId = created.json.walletId;
const policy: WalletPolicy = created.json.policy;
console.log(`walletId ${walletId}`);
console.log(`address  ${created.json.firstAddress}`);

await fetch(`${cfg.esploraUrl}/faucet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: created.json.firstAddress }),
});
let utxos = await esplora.scanWallet(policy, cfg.network, 2);
for (let i = 0; i < 30 && utxos.length === 0; i++) {
  await sleep(1000);
  utxos = await esplora.scanWallet(policy, cfg.network, 2);
}
console.log(`balance  ${utxos.reduce((s, u) => s + u.value, 0n)} sats`);

let changeIndex = 0;
async function prepare(amount: bigint, to = externalAddress(), feeRate = 2) {
  utxos = await esplora.scanWallet(policy, cfg.network, 20);
  const { psbt } = buildSpend({ policy, network: cfg.network, utxos, to, amount, feeRate, changeIndex: changeIndex++ });
  return { psbt, appSigned: signWithRoot(psbt.clone(), phone).toBase64() };
}
async function finishAndBroadcast(appSigned: string, sqSigned: string) {
  const { hex } = finalizeSpend(combinePsbts([appSigned, sqSigned], cfg.network));
  const txid = await esplora.broadcast(hex);
  console.log(`broadcast ${cfg.explorerTxUrl(txid)}`);
}

// --- Tier 1: small payment, cosigned at once.
step('Tier 1: small payment (10,000 sats)');
{
  const { psbt, appSigned } = await prepare(10_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status} (tier ${r.json.tier})`);
  await finishAndBroadcast(appSigned, r.json.psbt);
}

// --- Attacks on authentication.
step('Attack: cosigning without a passkey');
{
  const { psbt } = await prepare(5_000n);
  const r = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64() });
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('Attack: the passkey approves one transaction, the compromised app sends another');
{
  const { psbt: shown } = await prepare(5_000n);
  const { psbt: swapped } = await prepare(5_000n, externalAddress());
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: swapped.toBase64(),
    authentication: await approve('cosign', shown.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('Attack: replaying an assertion already used');
{
  const { psbt } = await prepare(5_000n);
  const authentication = await approve('cosign', psbt.toBase64());
  const first = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64(), authentication });
  const replay = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64(), authentication });
  console.log(`First: ${first.code} ${first.json.status}; replay: ${replay.code} ${replay.json.status} — ${replay.json.reason}`);
}

// --- I1: the Swissquote signature alone is not enough.
step('I1: Swissquote alone cannot finalize');
{
  const { psbt } = await prepare(5_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  try {
    finalizeSpend(psbtFromBase64(r.json.psbt, cfg.network));
    console.log('FAIL: the transaction was finalized with the Swissquote key alone');
  } catch {
    console.log('Finalization refused: a second signature is missing (phone or backup)');
  }
}
// --- Attack: a phone thief tries a large withdrawal → held, the client cancels.
step('Attack: phone thief, large withdrawal (200,000 sats)');
{
  const { psbt } = await prepare(200_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
  const inbox = await call('GET', `/notifications/${walletId}`);
  console.log(`Notification to the client: "${inbox.json.notifications.at(-1).text}"`);
  const c = await call('POST', `/cosign/${r.json.requestId}/cancel`, {
    authentication: await approve('cancel', r.json.requestId),
  });
  console.log(`The client cancels: ${c.json.status}`);
  const after = await call('GET', `/cosign/${r.json.requestId}`);
  console.log(`Final status: ${after.json.status} (no Swissquote signature)`);
}

// --- Legitimate tier 2: large payment signed after the delay.
step('Tier 2: legitimate large payment (150,000 sats), signed after the delay');
{
  const { psbt, appSigned } = await prepare(150_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status}, runs after ${r.json.executeAfter}`);
  let s = await call('GET', `/cosign/${r.json.requestId}`);
  while (s.json.status === 'pending') {
    process.stdout.write(`  waiting… ${s.json.secondsLeft} s\r`);
    await sleep(2000);
    s = await call('GET', `/cosign/${r.json.requestId}`);
  }
  console.log(`Swissquote: ${s.json.status} (tier ${s.json.tier})           `);
  await finishAndBroadcast(appSigned, s.json.psbt);
}

// --- Sanctions: recipient on the mocked list → refused.
step('Sanctioned recipient');
{
  const banned = externalAddress();
  await call('POST', '/admin/sanctions', { address: banned });
  const { psbt } = await prepare(5_000n, banned);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
}

// --- Attack: a PSBT spending another wallet's funds → refused.
step('Attack: getting another wallet’s funds signed');
{
  const other = rootFromSeed(randomSeed(), cfg.network);
  const otherPolicy: WalletPolicy = {
    threshold: 2,
    keys: [accountOrigin(other), policy.keys[1], accountOrigin(other, 1)],
  };
  const { psbt } = buildSpend({
    policy: otherPolicy,
    network: cfg.network,
    utxos: [{ txid: '33'.repeat(32), vout: 0, value: 50_000n, chain: 0, index: 0 }],
    to: externalAddress(),
    amount: 5_000n,
    feeRate: 2,
    changeIndex: 0,
  });
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
}

// --- Fixed bug: fees count toward the limit.
step('Attack: 1,000 sats sent, about 900,000 sats of fees (destroying the funds)');
let feeAttackId = '';
{
  const { psbt } = await prepare(1_000n, externalAddress(), 4_500);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  feeAttackId = r.json.requestId;
  console.log(`Swissquote: ${r.code} ${r.json.status} — ${r.json.reason}`);
  console.log(`Fee seen by Swissquote: ${r.json.summary?.fee} sats`);
}

// --- Fixed bug: a client whose phone was stolen reacts from their client area.
step('Victim without a phone: cancellation from the client area (session, no passkey)');
{
  const r = await call('POST', `/cosign/${feeAttackId}/cancel`, {});
  console.log(`Cancellation: ${r.code} ${r.json.status} via ${r.json.via}`);
}

step('Emergency freeze from the client area, unfreeze only with the passkey');
{
  const f = await call('POST', `/wallets/${walletId}/freeze`, {});
  console.log(`Freeze: ${f.code} ${f.json.status} via ${f.json.via}`);
  const { psbt } = await prepare(1_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Payment during the freeze: ${r.code} ${r.json.reason}`);
  const u1 = await call('POST', `/wallets/${walletId}/unfreeze`, {});
  console.log(`Unfreeze with the session only: ${u1.code} ${u1.json.reason}`);
  const u2 = await call('POST', `/wallets/${walletId}/unfreeze`, { authentication: await approve('unfreeze', walletId) });
  console.log(`Unfreeze with the passkey: ${u2.code} ${u2.json.status}`);
}
console.log('\nScenarios complete.');
