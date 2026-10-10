// Récupération après perte du téléphone, sur un nouvel appareil (skills slip39-backup et
// custody-invariants) :
//   1. demande chez Swissquote (wallet gelé, délai, alertes) et chez le partenaire (son propre délai),
//      avec une clé ECDH non exportable de cet appareil ;
//   2. après le délai, la part du partenaire arrive scellée pour cet appareil ; le client fournit sa
//      part (papier C1 ou copie cloud C2) ; la clé de secours est reconstituée ICI, en mémoire ;
//   3. nouveau jeu de clés, nouvelle part TIERS chez le partenaire, cérémonie de sauvegarde de la
//      nouvelle part CLIENT, puis le nouveau wallet est enregistré sur l'appareil (prepareNewWallet) ;
//   4. SEULEMENT ENSUITE, transfert de tous les fonds, signé par la clé de secours et cosigné par
//      Swissquote (sweepToNewWallet) ; la clé de secours reconstituée est oubliée.
// Les fonds ne partent donc jamais vers un wallet dont la clé ou la sauvegarde pourrait encore se
// perdre, et un transfert échoué se relance (Swissquote recosigne aux mêmes conditions).
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
import { clearRecovery, putWallet, saveRecovery, sealWallet, type RecoveryState, type StoredWallet } from './keystore';
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
  /** `trusteeName` : la part est détenue par une personne de confiance qui n'a pas encore approuvé. */
  partner: { status: string; secondsLeft: number; trusteeName?: string };
}

export async function recoveryProgress(state: RecoveryState): Promise<RecoveryProgress> {
  const [s, p] = await Promise.all([sq(`/recovery/${state.recoveryId}`), partner(`/release/${state.releaseId}`)]);
  return {
    swissquote: { status: s.status, secondsLeft: s.secondsLeft ?? 0 },
    partner: {
      status: p.status,
      secondsLeft: p.secondsLeft ?? 0,
      trusteeName: p.awaiting === 'trustee' ? p.trusteeName : undefined,
    },
  };
}

/** Reconstitue la clé de secours sur cet appareil (part du partenaire + part du client) et vérifie
 *  qu'elle est bien celle de l'ancien wallet. En mémoire uniquement (I5). */
async function restoreBackupRoot(state: RecoveryState, clientShare: string, log: (line: string) => void) {
  const rel = await partner<{ status: string; sealedForDevice?: SealedBox }>(`/release/${state.releaseId}`);
  if (!rel.sealedForDevice) throw new Error('Our partner’s share is not available yet');
  const tiers = await openSealed(rel.sealedForDevice, state.deviceKey);
  log('Partner’s share received and decrypted on this device');
  const backupRoot = backupRootFromShares([clientShare, tiers], btc.network);
  if (accountOrigin(backupRoot).xpub !== state.oldPolicy.keys[2].xpub) {
    throw new Error('These backup words do not match this wallet');
  }
  log('Backup key restored, in memory only');
  return backupRoot;
}

/**
 * Étape 1 : nouveau jeu de clés (téléphone, Swissquote, secours) et nouvelle part TIERS chez le
 * partenaire. Aucun fonds ne bouge. Renvoie le nouveau wallet (graine déjà chiffrée, rien
 * d'enregistré) et la nouvelle part CLIENT, à sauvegarder par le client avant le transfert.
 */
export async function prepareNewWallet(
  session: Session,
  state: RecoveryState,
  clientShare: string,
  log: (line: string) => void,
): Promise<{ newWallet: StoredWallet; newClientShare: string }> {
  // Vérifie les mots du client avant de créer quoi que ce soit.
  await restoreBackupRoot(state, clientShare, log);

  const next = createWalletMaterial(btc.network);
  const nw = await sq<{ newWalletId: string; policy: WalletPolicy }>(
    `/recovery/${state.recoveryId}/new-wallet`,
    { phoneKey: next.phoneKey, backupKey: next.backupKey },
    session.token,
  );
  log('New wallet created with new keys (phone, Swissquote, backup)');

  const { publicKey } = await partner<{ publicKey: JsonWebKey }>('/public-key');
  await partner('/shares', {
    walletId: nw.newWalletId,
    clientId: session.clientId,
    sealedShare: await sealFor(publicKey, next.shares.tiers),
  });
  log('New backup share handed to our partner');

  const newWallet = await sealWallet(
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
  return { newWallet, newClientShare: next.shares.client };
}

/**
 * Étape 2, une fois le nouveau wallet sauvegardé et enregistré (`state.newWallet`) : transfert de
 * tous les fonds de l'ancien wallet, signé par la clé de secours et cosigné par Swissquote. Rejouable :
 * si l'ancien wallet est déjà vide et la récupération close chez Swissquote, il n'y a plus rien à faire.
 */
export async function sweepToNewWallet(
  session: Session,
  state: RecoveryState,
  clientShare: string,
  log: (line: string) => void,
): Promise<{ wallet: StoredWallet; txUrl: string | null }> {
  const newWallet = state.newWallet;
  if (!newWallet?.backupConfirmed) throw new Error('Save your new backup before moving the funds');

  const backupRoot = await restoreBackupRoot(state, clientShare, log);
  const utxos = await esplora.scanWallet(state.oldPolicy, btc.network, 20);
  let txUrl: string | null = null;
  if (utxos.length === 0) {
    const ticket = await sq<{ status: string }>(`/recovery/${state.recoveryId}`);
    if (ticket.status !== 'completed') throw new Error('Your old wallet holds no bitcoin to move');
    log('Funds already moved to your new wallet');
  } else {
    const { psbt } = buildSweep({
      policy: state.oldPolicy,
      network: btc.network,
      utxos,
      to: deriveAddress(newWallet.policy, 0, 0, btc.network).address,
      feeRate: await currentFeeRate(),
    });
    const backupSigned = signWithRoot(psbt, backupRoot).toBase64();
    const sweep = await sq<{ psbt: string }>(`/recovery/${state.recoveryId}/sweep`, { psbt: backupSigned }, session.token);
    const { hex, txid } = finalizeSpend(combinePsbts([backupSigned, sweep.psbt], btc.network));
    await esplora.broadcastOnce(hex, txid);
    txUrl = btc.explorerTxUrl(txid);
    log('Funds moved: signed by the backup key and by Swissquote, old passkeys revoked');
  }

  await putWallet(newWallet);
  await clearRecovery(session.clientId);
  return { wallet: newWallet, txUrl };
}
