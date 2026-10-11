// Recovery after the phone is lost, on a new device (skills slip39-backup and
// custody-invariants):
//   1. request at Swissquote (wallet frozen, delay, alerts) and at the partner (its own delay),
//      with a non-extractable ECDH key of this device;
//   2. after the delay, the partner's share arrives sealed for this device; the client provides their
//      share (paper C1 or cloud copy C2); the backup key is rebuilt HERE, in memory;
//   3. new set of keys, new PARTNER share at the partner, backup ceremony for the
//      new CLIENT share, then the new wallet is stored on the device (prepareNewWallet);
//   4. ONLY THEN, sweep of all funds, signed by the backup key and cosigned by
//      Swissquote (sweepToNewWallet); the rebuilt backup key is forgotten.
// So funds never move to a wallet whose key or backup could still be
// lost, and a failed sweep can be retried (Swissquote cosigns again under the same conditions).
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
import { ApiError, partner, sq, type Session } from './api';
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

/** Cancels at the partner every release in progress for this wallet (when a recovery is cancelled). */
export const cancelPartnerRelease = (walletId: string, clientId: string) =>
  partner('/releases/cancel', { walletId, clientId });

export async function startRecovery(session: Session, wallet: RemoteWallet, credentialId: string): Promise<RecoveryState> {
  const device = await generateSealingKeyPair(false);
  const devicePublicKey = await exportPublicJwk(device.publicKey);
  const r = await sq('/recovery', { walletId: wallet.walletId, deviceCredentialId: credentialId }, session.token);
  const request = () => partner('/release', { walletId: wallet.walletId, clientId: session.clientId, devicePublicKey });
  let rel;
  try {
    try {
      rel = await request();
    } catch (e) {
      // An old request (abandoned or cancelled recovery) blocks the new one: it was
      // sealed for another device key, useless here. Cancel it and ask again.
      if (!(e instanceof ApiError && e.status === 409)) throw e;
      await cancelPartnerRelease(wallet.walletId, session.clientId);
      rel = await request();
    }
  } catch (e) {
    // Without the partner's share the recovery cannot succeed: close it at Swissquote
    // so the wallet is not left frozen by an orphan request.
    await sq(`/recovery/${r.recoveryId}/cancel`, {}, session.token).catch(() => {});
    throw e;
  }
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
  /** `trusteeName`: the share is held by a trusted person who has not approved yet. */
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

/** Rebuilds the backup key on this device (partner share + client share) and checks
 *  that it is the old wallet's. In memory only (I5). */
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
 * Step 1: new set of keys (phone, Swissquote, backup) and new PARTNER share at the
 * partner. No funds move. Returns the new wallet (seed already encrypted, nothing
 * stored yet) and the new CLIENT share, for the client to back up before the sweep.
 */
export async function prepareNewWallet(
  session: Session,
  state: RecoveryState,
  clientShare: string,
  log: (line: string) => void,
): Promise<{ newWallet: StoredWallet; newClientShare: string }> {
  // Check the client's words before creating anything.
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
 * Step 2, once the new wallet is backed up and stored (`state.newWallet`): sweep of
 * all funds of the old wallet, signed by the backup key and cosigned by Swissquote. Replayable:
 * if the old wallet is already empty and the recovery closed at Swissquote, there is nothing left to do.
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
    // Already swept (resumed after an interruption), or empty old wallet: nothing to move. The old wallet
    // stays frozen at Swissquote, with no funds; the new wallet is ready.
    const ticket = await sq<{ status: string }>(`/recovery/${state.recoveryId}`);
    log(ticket.status === 'completed' ? 'Funds already moved to your new wallet' : 'Your old wallet was empty: nothing to move');
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
