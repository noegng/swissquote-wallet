// Sending a payment (skills btc-multisig and custody-invariants):
//   1. the app builds the PSBT and checks its summary itself (recipient, amount, fee, change);
//   2. the client approves with the passkey: the challenge carries the hash of this exact PSBT;
//   3. the app signs with the phone key, Swissquote cosigns according to its rules;
//   4. the app combines, finalizes and broadcasts.
import { startAuthentication } from '@simplewebauthn/browser';
import {
  buildSpend,
  combinePsbts,
  Esplora,
  finalizeSpend,
  psbtFromBase64,
  rootFromSeed,
  signWithRoot,
  StaleTransactionError,
  summarizeSpend,
  type SpendSummary,
} from '@sqw/core';
import { sq } from './api';
import { btc } from './config';
import { clearPending, savePending, unlockPhoneSeed, type PendingPayment, type StoredWallet } from './keystore';

export const esplora = new Esplora(btc);

// Signet fee estimates are sometimes absurd (68 sat/vB seen on 10/10/2026):
// capped at 5 sat/vB on this test network. Regtest: fixed fees.
const MAX_SIGNET_FEE_RATE = 5;

export async function currentFeeRate(): Promise<number> {
  return btc.name === 'regtest' ? 2 : Math.min(await esplora.feeRate(), MAX_SIGNET_FEE_RATE);
}

export interface PreparedPayment {
  psbt: string;
  to: string;
  amount: bigint;
  summary: SpendSummary;
  feeRate: number;
}

export type SubmitResult =
  | { status: 'sent'; txid: string; url: string }
  | { status: 'pending'; pending: PendingPayment; reason: string };

export async function preparePayment(wallet: StoredWallet, to: string, amount: bigint): Promise<PreparedPayment> {
  const [{ utxos, nextChange: changeIndex }, feeRate] = await Promise.all([
    esplora.walletState(wallet.policy, btc.network, 20),
    currentFeeRate(),
  ]);
  const { psbt } = buildSpend({ policy: wallet.policy, network: btc.network, utxos, to, amount, feeRate, changeIndex });
  // The app checks its own PSBT with its key: what it shows is what will be signed.
  const summary = summarizeSpend(psbt, wallet.policy, btc.network, wallet.policy.keys[0]);
  return { psbt: psbt.toBase64(), to, amount, summary, feeRate };
}

/** Passkey approval (Windows Hello, Touch ID, Face ID) bound to one specific operation. */
export async function approve(walletId: string, purpose: 'cosign' | 'cancel' | 'unfreeze', payload: string) {
  const optionsJSON = await sq('/webauthn/operation/options', { walletId, purpose, payload });
  return startAuthentication({ optionsJSON });
}

async function signWithPhone(wallet: StoredWallet, psbt: string): Promise<string> {
  const seed = await unlockPhoneSeed(wallet);
  try {
    return signWithRoot(psbtFromBase64(psbt, btc.network), rootFromSeed(seed, btc.network)).toBase64();
  } finally {
    seed.fill(0);
  }
}

/** Replayable broadcast: a transaction already broadcast (lost response) counts as sent. */
async function broadcast(appSigned: string, sqSigned: string) {
  const { hex, txid } = finalizeSpend(combinePsbts([appSigned, sqSigned], btc.network));
  await esplora.broadcastOnce(hex, txid);
  return { status: 'sent' as const, txid, url: btc.explorerTxUrl(txid) };
}

export async function submitPayment(wallet: StoredWallet, p: PreparedPayment): Promise<SubmitResult> {
  const authentication = await approve(wallet.walletId, 'cosign', p.psbt);
  const appSigned = await signWithPhone(wallet, p.psbt);
  const r = await sq('/cosign', { walletId: wallet.walletId, psbt: p.psbt, authentication });
  if (r.status === 'signed') return broadcast(appSigned, r.psbt);
  const pending: PendingPayment = {
    requestId: r.requestId,
    appSigned,
    to: p.to,
    amount: p.amount.toString(),
    executeAfter: r.executeAfter,
  };
  await savePending(wallet.walletId, pending);
  return { status: 'pending', pending, reason: r.reason };
}

/** Polls Swissquote: once the delay is over (and without cancellation), the payment is cosigned and broadcast. */
export async function checkPending(
  wallet: StoredWallet,
  pending: PendingPayment,
): Promise<
  | { status: 'pending'; secondsLeft: number }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }
  | { status: 'sent'; txid: string; url: string }
> {
  const r = await sq(`/cosign/${pending.requestId}`);
  if (r.status === 'cancelled') {
    await clearPending(wallet.walletId);
    return { status: 'cancelled' };
  }
  if (r.status === 'signed') {
    try {
      const sent = await broadcast(pending.appSigned, r.psbt);
      await clearPending(wallet.walletId);
      return sent;
    } catch (e) {
      // Funds already spent by another transaction: this payment will never leave, so drop it
      // instead of blocking the app. Any other error (network): retry on the next pass.
      if (!(e instanceof StaleTransactionError)) throw e;
      await clearPending(wallet.walletId);
      return { status: 'failed', reason: 'Its funds were already spent by another transaction, so it was not sent.' };
    }
  }
  return { status: 'pending', secondsLeft: r.secondsLeft };
}

export async function cancelPending(wallet: StoredWallet, pending: PendingPayment): Promise<void> {
  const authentication = await approve(wallet.walletId, 'cancel', pending.requestId);
  await sq(`/cosign/${pending.requestId}/cancel`, { authentication });
  await clearPending(wallet.walletId);
}
