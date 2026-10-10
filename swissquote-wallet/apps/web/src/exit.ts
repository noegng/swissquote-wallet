// Sortie sans Swissquote (invariant I3) : si les services Swissquote ont définitivement disparu, le
// client dépense avec les DEUX clés qu'il contrôle :
//   - la clé du téléphone (dans le coffre de cet appareil) ;
//   - la clé de secours, reconstituée ici à partir de sa part (papier ou copie cloud) et de la part du
//     partenaire, qui ne dépend pas de Swissquote (son propre délai, sa propre vérification).
// Ce module n'appelle JAMAIS le service Swissquote : uniquement le partenaire et l'API Bitcoin.
import {
  accountOrigin,
  backupRootFromShares,
  buildSweep,
  Esplora,
  exportPublicJwk,
  finalizeSpend,
  generateSealingKeyPair,
  openSealed,
  rootFromSeed,
  signWithRoot,
  type SealedBox,
} from '@sqw/core';
import { partner } from './api';
import { btc } from './config';
import { clearExit, saveExit, unlockPhoneSeed, type ExitState, type StoredWallet } from './keystore';

const esplora = new Esplora(btc);

// Frais : pas de Swissquote pour conseiller ; estimation de l'API Bitcoin, plafonnée sur signet
// (estimations parfois aberrantes sur ce réseau de test).
async function feeRate(): Promise<number> {
  return btc.name === 'regtest' ? 2 : Math.min(await esplora.feeRate(), 5);
}

export async function walletBalance(wallet: StoredWallet): Promise<bigint> {
  return (await esplora.scanWallet(wallet.policy, btc.network, 20)).reduce((s, u) => s + u.value, 0n);
}

export async function requestPartnerShare(wallet: StoredWallet): Promise<ExitState> {
  const device = await generateSealingKeyPair(false);
  const r = await partner<{ releaseId: string }>('/release', {
    walletId: wallet.walletId,
    clientId: wallet.clientId,
    devicePublicKey: await exportPublicJwk(device.publicKey),
  });
  const state: ExitState = { walletId: wallet.walletId, releaseId: r.releaseId, deviceKey: device.privateKey };
  await saveExit(wallet.clientId, state);
  return state;
}

export async function partnerStatus(state: ExitState): Promise<{ status: string; secondsLeft: number }> {
  const r = await partner(`/release/${state.releaseId}`);
  return { status: r.status, secondsLeft: r.secondsLeft ?? 0 };
}

/** Transfère tous les fonds vers `to`, signés par le téléphone et la clé de secours, sans Swissquote. */
export async function exitWithoutSwissquote(
  wallet: StoredWallet,
  state: ExitState,
  clientShare: string,
  to: string,
  log: (line: string) => void,
): Promise<{ txid: string; url: string; amount: bigint }> {
  const rel = await partner<{ sealedForDevice?: SealedBox }>(`/release/${state.releaseId}`);
  if (!rel.sealedForDevice) throw new Error('La part du partenaire n’est pas encore disponible');
  const tiers = await openSealed(rel.sealedForDevice, state.deviceKey);
  log('Part du partenaire reçue et déchiffrée sur cet appareil');

  const backupRoot = backupRootFromShares([clientShare, tiers], btc.network);
  if (accountOrigin(backupRoot).xpub !== wallet.policy.keys[2].xpub) throw new Error('Cette part ne correspond pas à ce wallet');
  log('Clé de secours reconstituée, en mémoire uniquement');

  const utxos = await esplora.scanWallet(wallet.policy, btc.network, 20);
  const { psbt, fee } = buildSweep({ policy: wallet.policy, network: btc.network, utxos, to, feeRate: await feeRate() });
  const seed = await unlockPhoneSeed(wallet);
  try {
    signWithRoot(psbt, rootFromSeed(seed, btc.network));
  } finally {
    seed.fill(0);
  }
  signWithRoot(psbt, backupRoot);
  log('Transaction signée par la clé du téléphone et la clé de secours (2 sur 3, sans Swissquote)');

  const { hex } = finalizeSpend(psbt);
  const txid = await esplora.broadcast(hex);
  await clearExit(wallet.clientId);
  log('Diffusée directement sur le réseau Bitcoin');
  const total = utxos.reduce((s, u) => s + u.value, 0n);
  return { txid, url: btc.explorerTxUrl(txid), amount: total - fee };
}
