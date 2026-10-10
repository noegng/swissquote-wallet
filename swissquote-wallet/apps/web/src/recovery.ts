// Récupération après perte du téléphone, sur un nouvel appareil (skills slip39-backup et
// custody-invariants) :
//   1. demande chez Swissquote (wallet gelé, délai, alertes) et chez le partenaire (son propre délai),
//      avec une clé ECDH non exportable de cet appareil ;
//   2. après le délai, la part du partenaire arrive scellée pour cet appareil ; le client fournit sa
//      part (papier C1 ou copie cloud C2) ; la clé de secours est reconstituée ICI, en mémoire ;
//   3. nouveau jeu de clés, transfert de tous les fonds signé par la clé de secours et cosigné par
//      Swissquote, nouvelle part TIERS chez le partenaire ; la clé de secours reconstituée est oubliée.
import {
  accountOrigin,
  backupRootFromShares,
  buildSweep,
  combinePsbts,
  createWalletMaterial,
  deriveAddress,
  exportPublicJwk,
  finalizeSpend,
  generateSealingKeyPair,
  openSealed,
  sealFor,
  signWithRoot,
  type SealedBox,
  type WalletPolicy,
} from '@sqw/core';
import { partner, sq, type Session } from './api';
import { btc } from './config';
import { clearRecovery, loadWallet, saveRecovery, saveWallet, type RecoveryState, type StoredWallet } from './keystore';
import { currentFeeRate, esplora } from './payments';

export interface RemoteWallet {
  walletId: string;
  status: 'active' | 'frozen' | 'recovered';
  policy: WalletPolicy;
  createdAt: string;
}

export async function remoteWallets(session: Session): Promise<RemoteWallet[]> {
  return (await sq<{ wallets: RemoteWallet[] }>('/clients/me/wallets', undefined, session.token)).wallets;
}

export async function startRecovery(session: Session, wallet: RemoteWallet, credentialId: string): Promise<RecoveryState> {
  const device = await generateSealingKeyPair(false);
  const r = await sq('/recovery', { walletId: wallet.walletId, deviceCredentialId: credentialId }, session.token);
  const rel = await partner('/release', {
    walletId: wallet.walletId,
    clientId: session.clientId,
    devicePublicKey: await exportPublicJwk(device.publicKey),
  });
  const state: RecoveryState = {
    oldWalletId: wallet.walletId,
    oldPolicy: wallet.policy,
    recoveryId: r.recoveryId,
    releaseId: rel.releaseId,
    deviceKey: device.privateKey,
    credentialId,
  };
  await saveRecovery(session.clientId, state);
  return state;
}

export interface RecoveryProgress {
  swissquote: { status: string; secondsLeft: number };
  partner: { status: string; secondsLeft: number };
}

export async function recoveryProgress(state: RecoveryState): Promise<RecoveryProgress> {
  const [s, p] = await Promise.all([sq(`/recovery/${state.recoveryId}`), partner(`/release/${state.releaseId}`)]);
  return {
    swissquote: { status: s.status, secondsLeft: s.secondsLeft ?? 0 },
    partner: { status: p.status, secondsLeft: p.secondsLeft ?? 0 },
  };
}

export async function completeRecovery(
  session: Session,
  state: RecoveryState,
  clientShare: string,
  log: (line: string) => void,
): Promise<{ wallet: StoredWallet; newClientShare: string; txUrl: string }> {
  const rel = await partner<{ status: string; sealedForDevice?: SealedBox }>(`/release/${state.releaseId}`);
  if (!rel.sealedForDevice) throw new Error('Our partner’s share is not available yet');
  const tiers = await openSealed(rel.sealedForDevice, state.deviceKey);
  log('Partner’s share received and decrypted on this device');

  const backupRoot = backupRootFromShares([clientShare, tiers], btc.network);
  if (accountOrigin(backupRoot).xpub !== state.oldPolicy.keys[2].xpub) {
    throw new Error('These backup words do not match this wallet');
  }
  log('Backup key restored, in memory only');

  const next = createWalletMaterial(btc.network);
  const nw = await sq<{ newWalletId: string; policy: WalletPolicy }>(
    `/recovery/${state.recoveryId}/new-wallet`,
    { phoneKey: next.phoneKey, backupKey: next.backupKey },
    session.token,
  );
  log('New wallet created with new keys (phone, Swissquote, backup)');

  const utxos = await esplora.scanWallet(state.oldPolicy, btc.network, 20);
  const { psbt } = buildSweep({
    policy: state.oldPolicy,
    network: btc.network,
    utxos,
    to: deriveAddress(nw.policy, 0, 0, btc.network).address,
    feeRate: await currentFeeRate(),
  });
  const backupSigned = signWithRoot(psbt, backupRoot).toBase64();
  const sweep = await sq<{ psbt: string }>(`/recovery/${state.recoveryId}/sweep`, { psbt: backupSigned }, session.token);
  const { hex } = finalizeSpend(combinePsbts([backupSigned, sweep.psbt], btc.network));
  const txid = await esplora.broadcast(hex);
  log('Funds moved: signed by the backup key and by Swissquote');

  await saveWallet(
    {
      walletId: nw.newWalletId,
      clientId: session.clientId,
      network: btc.name,
      policy: nw.policy,
      createdAt: new Date().toISOString(),
    },
    next.phoneSeed,
  );
  next.phoneSeed.fill(0);
  const { publicKey } = await partner<{ publicKey: JsonWebKey }>('/public-key');
  await partner('/shares', {
    walletId: nw.newWalletId,
    clientId: session.clientId,
    sealedShare: await sealFor(publicKey, next.shares.tiers),
  });
  await clearRecovery(session.clientId);
  log('New backup share handed to our partner, old passkeys revoked');

  return {
    wallet: (await loadWallet(session.clientId))!,
    newClientShare: next.shares.client,
    txUrl: btc.explorerTxUrl(txid),
  };
}
