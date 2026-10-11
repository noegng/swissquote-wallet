// Recovery after the phone is lost, and attacks, against the running services (regtest).
// Usage: short delays recommended, e.g. RECOVERY_DELAY_SECONDS=6 for both services, then
//         npm run demo:recover
import {
  Esplora,
  accountOrigin,
  backupRootFromShares,
  buildSpend,
  buildSweep,
  combinePsbts,
  createWalletMaterial,
  deriveAddress,
  exportPublicJwk,
  finalizeSpend,
  generateSealingKeyPair,
  networkConfig,
  openSealed,
  rootFromSeed,
  sealFor,
  signWithRoot,
  type WalletPolicy,
} from '../packages/core/src/index';
import { call, ORIGIN, PARTNER, RP_ID, SQ, sleep } from './lib/http';
import { SoftAuthenticator } from './lib/soft-authenticator';

const cfg = networkConfig('regtest', process.env.ESPLORA_URL_REGTEST);
const esplora = new Esplora(cfg);
const step = (t: string) => console.log(`\n=== ${t}`);
const balanceOf = async (policy: WalletPolicy) =>
  (await esplora.scanWallet(policy, cfg.network, 20)).reduce((s, u) => s + u.value, 0n);

async function loginWithNewPasskey(clientId: string) {
  const { json } = await call('POST', `${SQ}/kyc/login`, { clientId });
  const passkey = await SoftAuthenticator.create(ORIGIN, RP_ID);
  const options = await call('POST', `${SQ}/webauthn/register/options`, {}, json.token);
  const response = await passkey.register(options.json);
  await call('POST', `${SQ}/webauthn/register/verify`, { response }, json.token);
  return { token: json.token as string, passkey, credentialId: response.id };
}

async function waitUntil(label: string, check: () => Promise<boolean>) {
  for (let i = 0; i < 120; i++) {
    if (await check()) return;
    if (i % 5 === 0) console.log(`  … ${label}`);
    await sleep(1000);
  }
  throw new Error(`Timed out: ${label}`);
}

// --- Starting point: a client with a funded wallet and their paper share (C1).
step('Starting point');
const clientId = `client-${Date.now()}`;
const oldPhone = await loginWithNewPasskey(clientId);
const m = createWalletMaterial(cfg.network);
const created = await call('POST', `${SQ}/wallets`, { phoneKey: m.phoneKey, backupKey: m.backupKey }, oldPhone.token);
const oldWalletId: string = created.json.walletId;
const oldPolicy: WalletPolicy = created.json.policy;
const partnerKey = (await call('GET', `${PARTNER}/public-key`)).json.publicKey;
await call('POST', `${PARTNER}/shares`, { walletId: oldWalletId, clientId, sealedShare: await sealFor(partnerKey, m.shares.tiers) });
const paperC1 = m.shares.client; // what the client wrote down at home
const oldPhoneSeed = m.phoneSeed; // what a phone thief would get
await fetch(`${cfg.esploraUrl}/faucet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: created.json.firstAddress }),
});
await waitUntil('funding', async () => (await balanceOf(oldPolicy)) > 0n);
console.log(`Wallet ${oldWalletId} funded: ${await balanceOf(oldPolicy)} sats`);

// --- Attack: a thief with the phone (phone key) and the email (access to the Swissquote account).
step('Attack: phone + email stolen, the thief starts a recovery');
const thief = await loginWithNewPasskey(clientId); // MOCK: identity check bypassed
const thiefRecovery = await call('POST', `${SQ}/recovery`, { walletId: oldWalletId, deviceCredentialId: thief.credentialId }, thief.token);
console.log(`Recovery opened by the thief: ${thiefRecovery.json.recoveryId}`);
const thiefDevice = await generateSealingKeyPair();
const thiefRelease = await call('POST', `${PARTNER}/release`, {
  walletId: oldWalletId,
  clientId,
  devicePublicKey: await exportPublicJwk(thiefDevice.publicKey),
});
const alerts = await call('GET', `${SQ}/notifications/${oldWalletId}`);
console.log(`Alert to the real client: "${alerts.json.notifications.at(-1).text}"`);

{
  // During the recovery the wallet is frozen: even a small payment is refused.
  const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
  const { psbt } = buildSpend({ policy: oldPolicy, network: cfg.network, utxos, to: created.json.firstAddress, amount: 1_000n, feeRate: 2, changeIndex: 0 });
  const r = await call('POST', `${SQ}/cosign`, { walletId: oldWalletId, psbt: psbt.toBase64() });
  console.log(`Payment during the recovery: ${r.code} ${r.json.reason}`);
}

await waitUntil('security delay (thief)', async () => (await call('GET', `${SQ}/recovery/${thiefRecovery.json.recoveryId}`)).json.secondsLeft === 0);
{
  const released = (await call('GET', `${PARTNER}/release/${thiefRelease.json.releaseId}`)).json;
  const tiers = await openSealed(released.sealedForDevice, thiefDevice.privateKey);
  try {
    backupRootFromShares([tiers], cfg.network);
    console.log('FAIL: backup key rebuilt without the CLIENT share');
  } catch {
    console.log('Partner share obtained, but without the client’s paper share the backup key cannot be rebuilt');
  }
  // The thief's last resort: sweep with the stolen phone key + Swissquote.
  const attackerKeys = createWalletMaterial(cfg.network);
  const nw = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/new-wallet`, { phoneKey: attackerKeys.phoneKey, backupKey: attackerKeys.backupKey }, thief.token);
  const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
  const { psbt } = buildSweep({ policy: oldPolicy, network: cfg.network, utxos, to: deriveAddress(nw.json.policy, 0, 0, cfg.network).address, feeRate: 2 });
  signWithRoot(psbt, rootFromSeed(oldPhoneSeed, cfg.network));
  const r = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/sweep`, { psbt: psbt.toBase64() }, thief.token);
  console.log(`Sweep signed with the stolen phone key: ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('The real client cancels from their phone (old device passkey)');
{
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: oldWalletId, purpose: 'cancel', payload: thiefRecovery.json.recoveryId });
  const r = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/cancel`, { authentication: await oldPhone.passkey.authenticate(options.json) });
  console.log(`Cancellation: ${r.json.status}; funds intact: ${await balanceOf(oldPolicy)} sats`);
}

step('The client notices the theft: freeze from the client area, without the phone (session only)');
const newDevice = await loginWithNewPasskey(clientId);
{
  const f = await call('POST', `${SQ}/wallets/${oldWalletId}/freeze`, {}, newDevice.token);
  console.log(`Freeze: ${f.code} ${f.json.status} via ${f.json.via}`);
}

// --- Legitimate recovery: the phone really is lost (wallet already frozen by the client).
step('Legitimate recovery from a new device');
const deviceKey = await generateSealingKeyPair();
const recovery = await call('POST', `${SQ}/recovery`, { walletId: oldWalletId, deviceCredentialId: newDevice.credentialId }, newDevice.token);
const release = await call('POST', `${PARTNER}/release`, { walletId: oldWalletId, clientId, devicePublicKey: await exportPublicJwk(deviceKey.publicKey) });
console.log(`Recovery ${recovery.json.recoveryId}, release ${release.json.releaseId} (delay ${recovery.json.delaySeconds} s)`);
await waitUntil('security delay', async () => (await call('GET', `${SQ}/recovery/${recovery.json.recoveryId}`)).json.secondsLeft === 0);
await waitUntil('partner release', async () => (await call('GET', `${PARTNER}/release/${release.json.releaseId}`)).json.status === 'released');

const sealed = (await call('GET', `${PARTNER}/release/${release.json.releaseId}`)).json.sealedForDevice;
const backupRoot = backupRootFromShares([paperC1, await openSealed(sealed, deviceKey.privateKey)], cfg.network);
console.log(`Backup key rebuilt on the device: ${accountOrigin(backupRoot).xpub === oldPolicy.keys[2].xpub}`);

const next = createWalletMaterial(cfg.network);
const nw = await call('POST', `${SQ}/recovery/${recovery.json.recoveryId}/new-wallet`, { phoneKey: next.phoneKey, backupKey: next.backupKey }, newDevice.token);
const newPolicy: WalletPolicy = nw.json.policy;
const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
const { psbt } = buildSweep({ policy: oldPolicy, network: cfg.network, utxos, to: deriveAddress(newPolicy, 0, 0, cfg.network).address, feeRate: 2 });
const backupSigned = signWithRoot(psbt, backupRoot).toBase64();
const sweep = await call('POST', `${SQ}/recovery/${recovery.json.recoveryId}/sweep`, { psbt: backupSigned }, newDevice.token);
console.log(`Swissquote: ${sweep.code} ${sweep.json.status}, ${sweep.json.revokedPasskeys} old passkey(s) revoked`);
const { hex } = finalizeSpend(combinePsbts([backupSigned, sweep.json.psbt], cfg.network));
console.log(`Sweep broadcast: ${cfg.explorerTxUrl(await esplora.broadcast(hex))}`);
await call('POST', `${PARTNER}/shares`, { walletId: nw.json.newWalletId, clientId, sealedShare: await sealFor(partnerKey, next.shares.tiers) });
await waitUntil('arrival on the new wallet', async () => (await balanceOf(newPolicy)) > 0n);

step('Checks after recovery');
console.log(`Old wallet: ${await balanceOf(oldPolicy)} sats; new wallet: ${await balanceOf(newPolicy)} sats`);
{
  // The thief tries to approve a payment on the new wallet with the lost phone's passkey.
  const utxos2 = await esplora.scanWallet(newPolicy, cfg.network, 20);
  const { psbt: p } = buildSpend({ policy: newPolicy, network: cfg.network, utxos: utxos2, to: created.json.firstAddress, amount: 5_000n, feeRate: 2, changeIndex: 0 });
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: nw.json.newWalletId, purpose: 'cosign', payload: p.toBase64() });
  const r = await call('POST', `${SQ}/cosign`, { walletId: nw.json.newWalletId, psbt: p.toBase64(), authentication: await oldPhone.passkey.authenticate(options.json) });
  console.log(`Lost phone passkey on the new wallet: ${r.code} ${r.json.reason}`);
}
{
  const utxos2 = await esplora.scanWallet(newPolicy, cfg.network, 20);
  const { psbt: p } = buildSpend({ policy: newPolicy, network: cfg.network, utxos: utxos2, to: created.json.firstAddress, amount: 5_000n, feeRate: 2, changeIndex: 0 });
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: nw.json.newWalletId, purpose: 'cosign', payload: p.toBase64() });
  const r = await call('POST', `${SQ}/cosign`, { walletId: nw.json.newWalletId, psbt: p.toBase64(), authentication: await newDevice.passkey.authenticate(options.json) });
  const phoneSigned = signWithRoot(p.clone(), rootFromSeed(next.phoneSeed, cfg.network)).toBase64();
  const { hex: h } = finalizeSpend(combinePsbts([phoneSigned, r.json.psbt], cfg.network));
  console.log(`First payment from the new device: ${r.json.status} → ${cfg.explorerTxUrl(await esplora.broadcast(h))}`);
}
console.log('\nRecovery scenarios complete.');
