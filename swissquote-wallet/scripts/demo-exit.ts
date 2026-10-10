// « Swissquote a disparu » (invariant I3), en deux phases, avec le service Swissquote VRAIMENT arrêté :
//   npm run demo:exit -- create   (services lancés) : crée et finance un wallet, garde l'état de test
//   … arrêter le service Swissquote (port 4001) …
//   npm run demo:exit -- exit     : sortie avec téléphone + secours ; vérifie que Swissquote ne répond plus
// L'état de test (graine téléphone, part papier) est écrit dans scripts/.demo-exit.json (gitignoré,
// regtest uniquement) : il joue le rôle du téléphone et du papier du client.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Esplora,
  accountOrigin,
  backupRootFromShares,
  buildSweep,
  createWalletMaterial,
  deriveAddress,
  exportPublicJwk,
  finalizeSpend,
  fromHex,
  generateSealingKeyPair,
  networkConfig,
  openSealed,
  randomSeed,
  rootFromSeed,
  sealFor,
  signWithRoot,
  toHex,
  type WalletPolicy,
} from '../packages/core/src/index';
import { call, ORIGIN, PARTNER, RP_ID, SQ, sleep } from './lib/http';
import { SoftAuthenticator } from './lib/soft-authenticator';

const cfg = networkConfig('regtest', process.env.ESPLORA_URL_REGTEST);
const esplora = new Esplora(cfg);
const STATE = join(import.meta.dirname, '.demo-exit.json');
const balanceOf = async (policy: WalletPolicy) =>
  (await esplora.scanWallet(policy, cfg.network, 20)).reduce((s, u) => s + u.value, 0n);

interface ExitTestState {
  walletId: string;
  clientId: string;
  policy: WalletPolicy;
  phoneSeed: string;
  paperC1: string;
}

async function create() {
  const clientId = `client-exit-${Date.now()}`;
  const { json } = await call('POST', `${SQ}/kyc/login`, { clientId });
  const passkey = await SoftAuthenticator.create(ORIGIN, RP_ID);
  const options = await call('POST', `${SQ}/webauthn/register/options`, {}, json.token);
  await call('POST', `${SQ}/webauthn/register/verify`, { response: await passkey.register(options.json) }, json.token);
  const m = createWalletMaterial(cfg.network);
  const created = await call('POST', `${SQ}/wallets`, { phoneKey: m.phoneKey, backupKey: m.backupKey }, json.token);
  const partnerKey = (await call('GET', `${PARTNER}/public-key`)).json.publicKey;
  await call('POST', `${PARTNER}/shares`, { walletId: created.json.walletId, clientId, sealedShare: await sealFor(partnerKey, m.shares.tiers) });
  await fetch(`${cfg.esploraUrl}/faucet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: created.json.firstAddress }),
  });
  for (let i = 0; i < 30 && (await balanceOf(created.json.policy)) === 0n; i++) await sleep(1000);
  const state: ExitTestState = {
    walletId: created.json.walletId,
    clientId,
    policy: created.json.policy,
    phoneSeed: toHex(m.phoneSeed),
    paperC1: m.shares.client,
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`Wallet ${state.walletId} créé et financé : ${await balanceOf(state.policy)} sats`);
  console.log('Arrêtez maintenant le service Swissquote, puis : npm run demo:exit -- exit');
}

async function exit() {
  if (!existsSync(STATE)) throw new Error('Lancer d’abord : npm run demo:exit -- create');
  const s: ExitTestState = JSON.parse(readFileSync(STATE, 'utf8'));

  const sqAlive = await fetch(`${SQ}/health`).then(() => true, () => false);
  console.log(`Service Swissquote joignable : ${sqAlive}`);
  if (sqAlive) throw new Error('Le service Swissquote répond encore : arrêtez-le pour une vraie démonstration');

  const device = await generateSealingKeyPair();
  const rel = await call('POST', `${PARTNER}/release`, {
    walletId: s.walletId,
    clientId: s.clientId,
    devicePublicKey: await exportPublicJwk(device.publicKey),
  });
  console.log(`Libération demandée au partenaire (sans Swissquote) : ${rel.json.releaseId}`);
  let released;
  for (let i = 0; i < 300; i++) {
    released = (await call('GET', `${PARTNER}/release/${rel.json.releaseId}`)).json;
    if (released.status === 'released') break;
    if (i % 5 === 0) console.log(`  … délai du partenaire : ${released.secondsLeft} s`);
    await sleep(1000);
  }
  const tiers = await openSealed(released.sealedForDevice, device.privateKey);
  const backupRoot = backupRootFromShares([s.paperC1, tiers], cfg.network);
  console.log(`Clé de secours reconstituée : ${accountOrigin(backupRoot).xpub === s.policy.keys[2].xpub}`);

  const other = rootFromSeed(randomSeed(), cfg.network);
  const destination = deriveAddress(
    { threshold: 2, keys: [accountOrigin(other), accountOrigin(other, 1), accountOrigin(other, 2)] },
    0,
    0,
    cfg.network,
  ).address;
  const utxos = await esplora.scanWallet(s.policy, cfg.network, 20);
  const { psbt } = buildSweep({ policy: s.policy, network: cfg.network, utxos, to: destination, feeRate: 2 });
  signWithRoot(psbt, rootFromSeed(fromHex(s.phoneSeed), cfg.network));
  signWithRoot(psbt, backupRoot);
  const { hex } = finalizeSpend(psbt);
  const txid = await esplora.broadcast(hex);
  console.log(`Sortie signée téléphone + secours, diffusée : ${cfg.explorerTxUrl(txid)}`);
  for (let i = 0; i < 20 && (await esplora.addressUtxos(destination)).length === 0; i++) await sleep(1000);
  const arrived = (await esplora.addressUtxos(destination)).reduce((t, u) => t + u.value, 0);
  console.log(`Ancien wallet : ${await balanceOf(s.policy)} sats ; destination : ${arrived} sats`);
  console.log('Swissquote n’a été contacté à aucun moment de la sortie.');
}

const phase = process.argv[2];
if (phase === 'create') await create();
else if (phase === 'exit') await exit();
else console.log('Usage : npm run demo:exit -- create | exit');
