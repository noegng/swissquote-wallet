// Scénarios du cosignataire Swissquote, contre le service lancé (npm run dev -w services/swissquote).
// Usage : npm run demo:cosign            (regtest)
// L'app (ce script) ne détient que la clé téléphone et la clé de secours ; la clé Swissquote
// reste dans le service (invariant I4).
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

// Authentificateur logiciel : joue le rôle de Windows Hello / Face ID pour ce script.
const passkey = await SoftAuthenticator.create(process.env.ORIGIN?.split(',')[0], process.env.RP_ID);
let walletId = '';
async function approve(purpose: 'cosign' | 'cancel', payload: string) {
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

// --- Connexion Swissquote (KYC simulé) et création de la passkey.
step('Connexion et passkey');
const session = await call('POST', '/kyc/login', { clientId: `client-demo-${Date.now()}` });
token = session.json.token;
const regOptions = await call('POST', '/webauthn/register/options');
const reg = await call('POST', '/webauthn/register/verify', { response: await passkey.register(regOptions.json) });
console.log(`Passkey enregistrée : ${reg.json.verified}`);

// --- Création du wallet : l'app génère ses deux clés, Swissquote fournit la sienne.
step('Création du wallet');
const phone = rootFromSeed(randomSeed(), cfg.network);
const backup = rootFromSeed(randomSeed(), cfg.network);
const created = await call('POST', '/wallets', {
  phoneKey: accountOrigin(phone),
  backupKey: accountOrigin(backup),
});
walletId = created.json.walletId;
const policy: WalletPolicy = created.json.policy;
console.log(`walletId ${walletId}`);
console.log(`adresse  ${created.json.firstAddress}`);

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
console.log(`solde    ${utxos.reduce((s, u) => s + u.value, 0n)} sats`);

let changeIndex = 0;
async function prepare(amount: bigint, to = externalAddress()) {
  utxos = await esplora.scanWallet(policy, cfg.network, 20);
  const { psbt } = buildSpend({ policy, network: cfg.network, utxos, to, amount, feeRate: 2, changeIndex: changeIndex++ });
  return { psbt, appSigned: signWithRoot(psbt.clone(), phone).toBase64() };
}
async function finishAndBroadcast(appSigned: string, sqSigned: string) {
  const { hex } = finalizeSpend(combinePsbts([appSigned, sqSigned], cfg.network));
  const txid = await esplora.broadcast(hex);
  console.log(`diffusée ${cfg.explorerTxUrl(txid)}`);
}

// --- Palier 1 : petit paiement, cosigné immédiatement.
step('Palier 1 : petit paiement (10 000 sats)');
{
  const { psbt, appSigned } = await prepare(10_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote : ${r.code} ${r.json.status} (palier ${r.json.tier})`);
  await finishAndBroadcast(appSigned, r.json.psbt);
}

// --- Attaques sur l'authentification.
step('Attaque : cosignature sans passkey');
{
  const { psbt } = await prepare(5_000n);
  const r = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64() });
  console.log(`Swissquote : ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('Attaque : la passkey approuve une transaction, l’app compromise en envoie une autre');
{
  const { psbt: shown } = await prepare(5_000n);
  const { psbt: swapped } = await prepare(5_000n, externalAddress());
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: swapped.toBase64(),
    authentication: await approve('cosign', shown.toBase64()),
  });
  console.log(`Swissquote : ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('Attaque : rejouer une assertion déjà utilisée');
{
  const { psbt } = await prepare(5_000n);
  const authentication = await approve('cosign', psbt.toBase64());
  const first = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64(), authentication });
  const replay = await call('POST', '/cosign', { walletId, psbt: psbt.toBase64(), authentication });
  console.log(`Première : ${first.code} ${first.json.status} ; rejeu : ${replay.code} ${replay.json.status} — ${replay.json.reason}`);
}

// --- I1 : la signature Swissquote seule ne suffit pas.
step('I1 : Swissquote seul ne peut pas finaliser');
{
  const { psbt } = await prepare(5_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  try {
    finalizeSpend(psbtFromBase64(r.json.psbt, cfg.network));
    console.log('ÉCHEC : la transaction a été finalisée avec la seule clé Swissquote');
  } catch {
    console.log('Finalisation refusée : il manque une deuxième signature (téléphone ou secours)');
  }
}
// --- Attaque : voleur du téléphone qui tente un gros retrait → mis en attente, le client annule.
step('Attaque : voleur du téléphone, gros retrait (200 000 sats)');
{
  const { psbt } = await prepare(200_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote : ${r.code} ${r.json.status} — ${r.json.reason}`);
  const inbox = await call('GET', `/notifications/${walletId}`);
  console.log(`Notification au client : « ${inbox.json.notifications.at(-1).text} »`);
  const c = await call('POST', `/cosign/${r.json.requestId}/cancel`, {
    authentication: await approve('cancel', r.json.requestId),
  });
  console.log(`Le client annule : ${c.json.status}`);
  const after = await call('GET', `/cosign/${r.json.requestId}`);
  console.log(`Statut final : ${after.json.status} (aucune signature Swissquote)`);
}

// --- Palier 2 légitime : gros paiement signé après le délai.
step('Palier 2 : gros paiement légitime (150 000 sats), signé après le délai');
{
  const { psbt, appSigned } = await prepare(150_000n);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote : ${r.code} ${r.json.status}, exécution après ${r.json.executeAfter}`);
  let s = await call('GET', `/cosign/${r.json.requestId}`);
  while (s.json.status === 'pending') {
    process.stdout.write(`  attente… ${s.json.secondsLeft} s\r`);
    await sleep(2000);
    s = await call('GET', `/cosign/${r.json.requestId}`);
  }
  console.log(`Swissquote : ${s.json.status} (palier ${s.json.tier})           `);
  await finishAndBroadcast(appSigned, s.json.psbt);
}

// --- Sanctions : destinataire sur la liste mockée → refus.
step('Destinataire sanctionné');
{
  const banned = externalAddress();
  await call('POST', '/admin/sanctions', { address: banned });
  const { psbt } = await prepare(5_000n, banned);
  const r = await call('POST', '/cosign', {
    walletId,
    psbt: psbt.toBase64(),
    authentication: await approve('cosign', psbt.toBase64()),
  });
  console.log(`Swissquote : ${r.code} ${r.json.status} — ${r.json.reason}`);
}

// --- Attaque : PSBT qui dépense les fonds d'un autre wallet → refus.
step('Attaque : faire signer les fonds d’un autre wallet');
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
  console.log(`Swissquote : ${r.code} ${r.json.status} — ${r.json.reason}`);
}

console.log('\nScénarios terminés.');
