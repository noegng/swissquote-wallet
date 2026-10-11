// Exit without Swissquote (invariant I3): if Swissquote's services are gone for good, the
// client spends with the TWO keys they control:
//   - the phone key (in this device's vault);
//   - the backup key, rebuilt here from their share (paper or cloud copy) and the partner's
//     share, which does not depend on Swissquote (its own delay, its own check).
// This module NEVER calls the Swissquote service: only the partner and the Bitcoin API.
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

// Fees: no Swissquote to advise; estimate from the Bitcoin API, capped on signet
// (estimates are sometimes absurd on this test network).
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

export async function partnerStatus(
  state: ExitState,
): Promise<{ status: string; secondsLeft: number; trusteeName?: string }> {
  const r = await partner(`/release/${state.releaseId}`);
  // `trusteeName`: the share is held by a trusted person who has not approved yet.
  return {
    status: r.status,
    secondsLeft: r.secondsLeft ?? 0,
    trusteeName: r.awaiting === 'trustee' ? r.trusteeName : undefined,
  };
}

/** Moves all funds to `to`, signed by the phone key and the backup key, without Swissquote. */
export async function exitWithoutSwissquote(
  wallet: StoredWallet,
  state: ExitState,
  clientShare: string,
  to: string,
  log: (line: string) => void,
): Promise<{ txid: string; url: string; amount: bigint }> {
  const rel = await partner<{ sealedForDevice?: SealedBox }>(`/release/${state.releaseId}`);
  if (!rel.sealedForDevice) throw new Error('Our partner’s share is not available yet');
  const tiers = await openSealed(rel.sealedForDevice, state.deviceKey);
  log('Partner’s share received and decrypted on this device');

  const backupRoot = backupRootFromShares([clientShare, tiers], btc.network);
  if (accountOrigin(backupRoot).xpub !== wallet.policy.keys[2].xpub) throw new Error('These backup words do not match this wallet');
  log('Backup key restored, in memory only');

  const utxos = await esplora.scanWallet(wallet.policy, btc.network, 20);
  const { psbt, fee } = buildSweep({ policy: wallet.policy, network: btc.network, utxos, to, feeRate: await feeRate() });
  const seed = await unlockPhoneSeed(wallet);
  try {
    signWithRoot(psbt, rootFromSeed(seed, btc.network));
  } finally {
    seed.fill(0);
  }
  signWithRoot(psbt, backupRoot);
  log('Transaction signed by the phone key and the backup key (2 of 3, without Swissquote)');

  const { hex, txid } = finalizeSpend(psbt);
  await esplora.broadcastOnce(hex, txid);
  await clearExit(wallet.clientId);
  log('Broadcast directly to the Bitcoin network');
  const total = utxos.reduce((s, u) => s + u.value, 0n);
  return { txid, url: btc.explorerTxUrl(txid), amount: total - fee };
}
