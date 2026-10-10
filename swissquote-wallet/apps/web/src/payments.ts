// Envoi d'un paiement (skills btc-multisig et custody-invariants) :
//   1. l'app construit la PSBT et en vérifie elle-même le résumé (destinataire, montant, frais, change) ;
//   2. le client approuve par passkey : le défi porte l'empreinte de cette PSBT précise ;
//   3. l'app signe avec la clé du téléphone, Swissquote cosigne selon ses règles ;
//   4. l'app combine, finalise et diffuse.
import { startAuthentication } from '@simplewebauthn/browser';
import {
  buildSpend,
  combinePsbts,
  Esplora,
  finalizeSpend,
  psbtFromBase64,
  rootFromSeed,
  signWithRoot,
  summarizeSpend,
  type SpendSummary,
} from '@sqw/core';
import { sq } from './api';
import { btc } from './config';
import { clearPending, savePending, unlockPhoneSeed, type PendingPayment, type StoredWallet } from './keystore';

export const esplora = new Esplora(btc);

// Les estimations de frais signet sont parfois aberrantes (68 sat/vB constaté le 10/10/2026) :
// plafond à 5 sat/vB sur ce réseau de test. Regtest : frais fixes.
const MAX_SIGNET_FEE_RATE = 5;

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
  const [utxos, changeIndex] = await Promise.all([
    esplora.scanWallet(wallet.policy, btc.network, 20),
    esplora.firstUnusedIndex(wallet.policy, btc.network, 1),
  ]);
  const feeRate = btc.name === 'regtest' ? 2 : Math.min(await esplora.feeRate(), MAX_SIGNET_FEE_RATE);
  const { psbt } = buildSpend({ policy: wallet.policy, network: btc.network, utxos, to, amount, feeRate, changeIndex });
  // L'app vérifie sa propre PSBT avec sa clé : ce qu'elle affiche est ce qui sera signé.
  const summary = summarizeSpend(psbt, wallet.policy, btc.network, wallet.policy.keys[0]);
  return { psbt: psbt.toBase64(), to, amount, summary, feeRate };
}

/** Approbation par passkey (Windows Hello, Touch ID, Face ID) liée à une opération précise. */
async function approve(walletId: string, purpose: 'cosign' | 'cancel', payload: string) {
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

async function broadcast(appSigned: string, sqSigned: string) {
  const { hex } = finalizeSpend(combinePsbts([appSigned, sqSigned], btc.network));
  const txid = await esplora.broadcast(hex);
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

/** Interroge Swissquote : une fois le délai écoulé (et sans annulation), le paiement est cosigné et diffusé. */
export async function checkPending(
  wallet: StoredWallet,
  pending: PendingPayment,
): Promise<{ status: 'pending'; secondsLeft: number } | { status: 'cancelled' } | { status: 'sent'; txid: string; url: string }> {
  const r = await sq(`/cosign/${pending.requestId}`);
  if (r.status === 'cancelled') {
    await clearPending(wallet.walletId);
    return { status: 'cancelled' };
  }
  if (r.status === 'signed') {
    const sent = await broadcast(pending.appSigned, r.psbt);
    await clearPending(wallet.walletId);
    return sent;
  }
  return { status: 'pending', secondsLeft: r.secondsLeft };
}

export async function cancelPending(wallet: StoredWallet, pending: PendingPayment): Promise<void> {
  const authentication = await approve(wallet.walletId, 'cancel', pending.requestId);
  await sq(`/cosign/${pending.requestId}/cancel`, { authentication });
  await clearPending(wallet.walletId);
}
