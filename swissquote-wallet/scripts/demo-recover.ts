// Récupération après perte du téléphone, et attaques, contre les services lancés (regtest).
// Usage : délais courts conseillés, ex. RECOVERY_DELAY_SECONDS=6 pour les deux services, puis
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
  throw new Error(`Délai dépassé : ${label}`);
}

// --- Situation de départ : un client avec un wallet financé et sa part papier (C1).
step('Situation de départ');
const clientId = `client-${Date.now()}`;
const oldPhone = await loginWithNewPasskey(clientId);
const m = createWalletMaterial(cfg.network);
const created = await call('POST', `${SQ}/wallets`, { phoneKey: m.phoneKey, backupKey: m.backupKey }, oldPhone.token);
const oldWalletId: string = created.json.walletId;
const oldPolicy: WalletPolicy = created.json.policy;
const partnerKey = (await call('GET', `${PARTNER}/public-key`)).json.publicKey;
await call('POST', `${PARTNER}/shares`, { walletId: oldWalletId, clientId, sealedShare: await sealFor(partnerKey, m.shares.tiers) });
const paperC1 = m.shares.client; // ce que le client a recopié chez lui
const oldPhoneSeed = m.phoneSeed; // ce qu'un voleur du téléphone obtiendrait
await fetch(`${cfg.esploraUrl}/faucet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: created.json.firstAddress }),
});
await waitUntil('financement', async () => (await balanceOf(oldPolicy)) > 0n);
console.log(`Wallet ${oldWalletId} financé : ${await balanceOf(oldPolicy)} sats`);

// --- Attaque : voleur avec le téléphone (clé téléphone) et l'e-mail (accès au compte Swissquote).
step('Attaque : téléphone + e-mail volés, le voleur lance une récupération');
const thief = await loginWithNewPasskey(clientId); // MOCK : vérification d'identité contournée
const thiefRecovery = await call('POST', `${SQ}/recovery`, { walletId: oldWalletId, deviceCredentialId: thief.credentialId }, thief.token);
console.log(`Récupération ouverte par le voleur : ${thiefRecovery.json.recoveryId}`);
const thiefDevice = await generateSealingKeyPair();
const thiefRelease = await call('POST', `${PARTNER}/release`, {
  walletId: oldWalletId,
  clientId,
  devicePublicKey: await exportPublicJwk(thiefDevice.publicKey),
});
const alerts = await call('GET', `${SQ}/notifications/${oldWalletId}`);
console.log(`Alerte au vrai client : « ${alerts.json.notifications.at(-1).text} »`);

{
  // Pendant la récupération, le wallet est gelé : même un petit paiement est refusé.
  const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
  const { psbt } = buildSpend({ policy: oldPolicy, network: cfg.network, utxos, to: created.json.firstAddress, amount: 1_000n, feeRate: 2, changeIndex: 0 });
  const r = await call('POST', `${SQ}/cosign`, { walletId: oldWalletId, psbt: psbt.toBase64() });
  console.log(`Paiement pendant la récupération : ${r.code} ${r.json.reason}`);
}

await waitUntil('délai de sécurité (voleur)', async () => (await call('GET', `${SQ}/recovery/${thiefRecovery.json.recoveryId}`)).json.secondsLeft === 0);
{
  const released = (await call('GET', `${PARTNER}/release/${thiefRelease.json.releaseId}`)).json;
  const tiers = await openSealed(released.sealedForDevice, thiefDevice.privateKey);
  try {
    backupRootFromShares([tiers], cfg.network);
    console.log('ÉCHEC : clé de secours reconstituée sans la part CLIENT');
  } catch {
    console.log('Part du partenaire obtenue, mais sans la part papier du client : clé de secours impossible à reconstituer');
  }
  // Dernier recours du voleur : transférer avec la clé du téléphone volé + Swissquote.
  const attackerKeys = createWalletMaterial(cfg.network);
  const nw = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/new-wallet`, { phoneKey: attackerKeys.phoneKey, backupKey: attackerKeys.backupKey }, thief.token);
  const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
  const { psbt } = buildSweep({ policy: oldPolicy, network: cfg.network, utxos, to: deriveAddress(nw.json.policy, 0, 0, cfg.network).address, feeRate: 2 });
  signWithRoot(psbt, rootFromSeed(oldPhoneSeed, cfg.network));
  const r = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/sweep`, { psbt: psbt.toBase64() }, thief.token);
  console.log(`Transfert signé avec la clé du téléphone volé : ${r.code} ${r.json.status} — ${r.json.reason}`);
}

step('Le vrai client annule depuis son téléphone (passkey de l’ancien appareil)');
{
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: oldWalletId, purpose: 'cancel', payload: thiefRecovery.json.recoveryId });
  const r = await call('POST', `${SQ}/recovery/${thiefRecovery.json.recoveryId}/cancel`, { authentication: await oldPhone.passkey.authenticate(options.json) });
  console.log(`Annulation : ${r.json.status} ; fonds intacts : ${await balanceOf(oldPolicy)} sats`);
}

// --- Récupération légitime : le téléphone est vraiment perdu.
step('Récupération légitime depuis un nouvel appareil');
const newDevice = await loginWithNewPasskey(clientId);
const deviceKey = await generateSealingKeyPair();
const recovery = await call('POST', `${SQ}/recovery`, { walletId: oldWalletId, deviceCredentialId: newDevice.credentialId }, newDevice.token);
const release = await call('POST', `${PARTNER}/release`, { walletId: oldWalletId, clientId, devicePublicKey: await exportPublicJwk(deviceKey.publicKey) });
console.log(`Récupération ${recovery.json.recoveryId}, libération ${release.json.releaseId} (délai ${recovery.json.delaySeconds} s)`);
await waitUntil('délai de sécurité', async () => (await call('GET', `${SQ}/recovery/${recovery.json.recoveryId}`)).json.secondsLeft === 0);
await waitUntil('libération du partenaire', async () => (await call('GET', `${PARTNER}/release/${release.json.releaseId}`)).json.status === 'released');

const sealed = (await call('GET', `${PARTNER}/release/${release.json.releaseId}`)).json.sealedForDevice;
const backupRoot = backupRootFromShares([paperC1, await openSealed(sealed, deviceKey.privateKey)], cfg.network);
console.log(`Clé de secours reconstituée sur l'appareil : ${accountOrigin(backupRoot).xpub === oldPolicy.keys[2].xpub}`);

const next = createWalletMaterial(cfg.network);
const nw = await call('POST', `${SQ}/recovery/${recovery.json.recoveryId}/new-wallet`, { phoneKey: next.phoneKey, backupKey: next.backupKey }, newDevice.token);
const newPolicy: WalletPolicy = nw.json.policy;
const utxos = await esplora.scanWallet(oldPolicy, cfg.network, 20);
const { psbt } = buildSweep({ policy: oldPolicy, network: cfg.network, utxos, to: deriveAddress(newPolicy, 0, 0, cfg.network).address, feeRate: 2 });
const backupSigned = signWithRoot(psbt, backupRoot).toBase64();
const sweep = await call('POST', `${SQ}/recovery/${recovery.json.recoveryId}/sweep`, { psbt: backupSigned }, newDevice.token);
console.log(`Swissquote : ${sweep.code} ${sweep.json.status}, ${sweep.json.revokedPasskeys} ancienne(s) passkey(s) révoquée(s)`);
const { hex } = finalizeSpend(combinePsbts([backupSigned, sweep.json.psbt], cfg.network));
console.log(`Transfert diffusé : ${cfg.explorerTxUrl(await esplora.broadcast(hex))}`);
await call('POST', `${PARTNER}/shares`, { walletId: nw.json.newWalletId, clientId, sealedShare: await sealFor(partnerKey, next.shares.tiers) });
await waitUntil('arrivée sur le nouveau wallet', async () => (await balanceOf(newPolicy)) > 0n);

step('Vérifications après récupération');
console.log(`Ancien wallet : ${await balanceOf(oldPolicy)} sats ; nouveau wallet : ${await balanceOf(newPolicy)} sats`);
{
  // Le voleur tente d'approuver un paiement sur le nouveau wallet avec la passkey du téléphone perdu.
  const utxos2 = await esplora.scanWallet(newPolicy, cfg.network, 20);
  const { psbt: p } = buildSpend({ policy: newPolicy, network: cfg.network, utxos: utxos2, to: created.json.firstAddress, amount: 5_000n, feeRate: 2, changeIndex: 0 });
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: nw.json.newWalletId, purpose: 'cosign', payload: p.toBase64() });
  const r = await call('POST', `${SQ}/cosign`, { walletId: nw.json.newWalletId, psbt: p.toBase64(), authentication: await oldPhone.passkey.authenticate(options.json) });
  console.log(`Passkey du téléphone perdu sur le nouveau wallet : ${r.code} ${r.json.reason}`);
}
{
  const utxos2 = await esplora.scanWallet(newPolicy, cfg.network, 20);
  const { psbt: p } = buildSpend({ policy: newPolicy, network: cfg.network, utxos: utxos2, to: created.json.firstAddress, amount: 5_000n, feeRate: 2, changeIndex: 0 });
  const options = await call('POST', `${SQ}/webauthn/operation/options`, { walletId: nw.json.newWalletId, purpose: 'cosign', payload: p.toBase64() });
  const r = await call('POST', `${SQ}/cosign`, { walletId: nw.json.newWalletId, psbt: p.toBase64(), authentication: await newDevice.passkey.authenticate(options.json) });
  const phoneSigned = signWithRoot(p.clone(), rootFromSeed(next.phoneSeed, cfg.network)).toBase64();
  const { hex: h } = finalizeSpend(combinePsbts([phoneSigned, r.json.psbt], cfg.network));
  console.log(`Premier paiement depuis le nouvel appareil : ${r.json.status} → ${cfg.explorerTxUrl(await esplora.broadcast(h))}`);
}
console.log('\nScénarios de récupération terminés.');
