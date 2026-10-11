// Keeps reads of the public Bitcoin API under its rate limit (blockstream.info: 700 requests per
// hour and per IP, shared by everyone behind the same network).
// A full wallet scan costs 40 to 60 requests (gap limit of 20 on two chains). The home screen used
// to repeat it every few seconds; it is now done once, kept between screens, and redone only when
// something moved. In between, the app watches two receive addresses (2 requests per tick).
// Payments, recovery and exit still do their own full scan: they must never miss funds.
import { deriveAddress, Esplora, type WalletTx, type WalletUtxo } from '@sqw/core';
import { btc } from './config';
import type { StoredWallet } from './keystore';

const esplora = new Esplora(btc);

export interface ChainState {
  utxos: WalletUtxo[];
  nextReceive: number;
  nextChange: number;
}

interface Entry {
  state: ChainState;
  /** Transaction counts of the watched addresses when the state was read. */
  watched: string;
}

const states = new Map<string, Entry>();
const histories = new Map<string, { of: Entry; at: number; txs: WalletTx[] }>();

// After a payment from this app the API needs a moment to index it: full scans are forced for a
// short while, then the cheap watch takes over again.
const SETTLE_MS = 45_000;
let unsettledUntil = 0;

// A scan that fails (API unreachable or rate-limited) is not retried at once: each attempt costs
// requests, which would keep the limit saturated. The wait doubles up to 5 minutes.
let retryAt = 0;
let retryDelay = 30_000;

/** The receive address the app last handed out and the one it shows now: where payments arrive. */
async function watch(wallet: StoredWallet, nextReceive: number): Promise<string> {
  const indexes = nextReceive > 0 ? [nextReceive - 1, nextReceive] : [nextReceive];
  const counts = await Promise.all(
    indexes.map((i) => esplora.addressTxCount(deriveAddress(wallet.policy, 0, i, btc.network).address)),
  );
  return counts.join('/');
}

// One scan at a time per wallet: two screens asking together share the same read.
const scanning = new Map<string, Promise<ChainState>>();

function scan(wallet: StoredWallet): Promise<ChainState> {
  let running = scanning.get(wallet.walletId);
  if (!running) {
    running = fullScan(wallet).finally(() => scanning.delete(wallet.walletId));
    scanning.set(wallet.walletId, running);
  }
  return running;
}

async function fullScan(wallet: StoredWallet): Promise<ChainState> {
  try {
    const state = await esplora.walletState(wallet.policy, btc.network, 20);
    states.set(wallet.walletId, { state, watched: await watch(wallet, state.nextReceive) });
    retryDelay = 30_000;
    retryAt = 0;
    return state;
  } catch (e) {
    retryAt = Date.now() + retryDelay;
    retryDelay = Math.min(retryDelay * 2, 300_000);
    throw e;
  }
}

/** Wallet state: the one already read if nothing invalidated it, otherwise a full scan. */
export async function chainState(wallet: StoredWallet): Promise<ChainState> {
  const known = states.get(wallet.walletId);
  if (known && Date.now() > unsettledUntil) return known.state;
  if (!known && Date.now() < retryAt) throw new Error('Bitcoin API unavailable, waiting before the next try');
  return scan(wallet);
}

/** Cheap check (2 requests): true if the wallet must be read again. */
export async function chainMoved(wallet: StoredWallet): Promise<boolean> {
  const known = states.get(wallet.walletId);
  if (!known) return Date.now() >= retryAt;
  if (Date.now() <= unsettledUntil) return true;
  if ((await watch(wallet, known.state.nextReceive)) === known.watched) return false;
  states.delete(wallet.walletId);
  return true;
}

/** To call after this app broadcast a transaction or asked a faucet for coins. */
export function chainTouched(): void {
  states.clear();
  unsettledUntil = Date.now() + SETTLE_MS;
}

/** Transaction history, read again only when the wallet state changed (or while a transaction is
 *  still waiting for a block, at most once a minute). */
export async function chainHistory(wallet: StoredWallet): Promise<WalletTx[]> {
  const of = states.get(wallet.walletId);
  const known = histories.get(wallet.walletId);
  if (known && of && known.of === of) {
    const waiting = known.txs.some((t) => !t.confirmed);
    if (!waiting || Date.now() - known.at < 60_000) return known.txs;
  }
  const txs = await esplora.walletTxs(wallet.policy, btc.network, 20);
  if (of) histories.set(wallet.walletId, { of, at: Date.now(), txs });
  return txs;
}
