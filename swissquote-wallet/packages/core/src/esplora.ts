// Minimal client for the esplora API (blockstream.info or mempool.space on signet, Chopsticks on regtest).
import type { Network } from 'bitcoinjs-lib';
import { deriveAddress, type Chain, type WalletPolicy } from './descriptor';
import type { NetworkConfig } from './network';
import type { WalletUtxo } from './psbt';

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

interface EsploraTx {
  txid: string;
  fee: number;
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_time?: number };
}

/** A wallet transaction as the chain reports it (no Swissquote service involved). */
export interface WalletTx {
  txid: string;
  /** Change in the wallet balance: positive = received, negative = sent (fees included). */
  net: bigint;
  fee: bigint;
  confirmed: boolean;
  /** Block timestamp, in seconds. Missing until the transaction is confirmed. */
  blockTime?: number;
}

/** A transaction whose inputs are already spent elsewhere: broadcasting it again is pointless. */
export class StaleTransactionError extends Error {
  constructor(detail: string) {
    super(`Stale transaction, its funds were already spent: ${detail}`);
    this.name = 'StaleTransactionError';
  }
}

export class Esplora {
  constructor(private readonly cfg: NetworkConfig) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.cfg.esploraUrl + path);
    if (!res.ok) throw new Error(`esplora ${path} : ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async addressUtxos(address: string): Promise<EsploraUtxo[]> {
    return this.get(`/address/${address}/utxo`);
  }

  /** Broadcasts a transaction. The body must be the raw hex as text/plain (not JSON). */
  async broadcast(hex: string): Promise<string> {
    const res = await fetch(`${this.cfg.esploraUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: hex,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Broadcast rejected: ${body}`);
    return body.trim();
  }

  /**
   * Replayable broadcast: if the network rejects a transaction it already knows (an earlier
   * broadcast whose response was lost), that is a success. If its inputs are already spent
   * by another transaction, throws `StaleTransactionError`: retrying will never help.
   * Any other error (network, API) is rethrown as is: it can be retried.
   */
  async broadcastOnce(hex: string, txid: string): Promise<string> {
    try {
      return await this.broadcast(hex);
    } catch (e) {
      if (/txn-already-known|txn-already-in-mempool|already in block ?chain/i.test(String(e))) return txid;
      if (await this.txStatus(txid).then(() => true, () => false)) return txid;
      if (/missing ?inputs|missingorspent|mempool-conflict/i.test(String(e))) {
        throw new StaleTransactionError(String((e as Error).message ?? e));
      }
      throw e;
    }
  }

  async txStatus(txid: string): Promise<{ confirmed: boolean; block_height?: number }> {
    return this.get(`/tx/${txid}/status`);
  }

  /** sat/vB, objectif environ 3 blocs. Regtest : valeur fixe. */
  async feeRate(): Promise<number> {
    if (this.cfg.name === 'regtest') return 2;
    if (this.cfg.esploraUrl.includes('mempool.space')) {
      const fees = await this.get<{ halfHourFee: number }>('/v1/fees/recommended');
      return Math.max(1, fees.halfHourFee);
    }
    // API esplora standard (blockstream.info) : { "<nb de blocs>": sat/vB }
    const estimates = await this.get<Record<string, number>>('/fee-estimates');
    return Math.max(1, Math.ceil(estimates['3'] ?? estimates['6'] ?? 1));
  }

  /** True if the address has already received at least one transaction (confirmed or not). */
  async addressUsed(address: string): Promise<boolean> {
    const a = await this.get<{ chain_stats: { tx_count: number }; mempool_stats: { tx_count: number } }>(
      `/address/${address}`,
    );
    return a.chain_stats.tx_count + a.mempool_stats.tx_count > 0;
  }

  /**
   * Walks a chain (receive 0 or change 1) in parallel batches of 10 until it finds `gap`
   * consecutive never-used addresses (BIP-44 "gap limit"). No used address is missed,
   * whatever its index. Returns the used indexes and the first free index.
   */
  async usedIndexes(
    policy: WalletPolicy,
    network: Network,
    chain: Chain,
    gap = 20,
  ): Promise<{ used: { index: number; address: string }[]; firstUnused: number }> {
    const used: { index: number; address: string }[] = [];
    let firstUnused = -1;
    let unusedRun = 0;
    for (let start = 0; unusedRun < gap; start += 10) {
      const addresses = Array.from({ length: 10 }, (_, i) => deriveAddress(policy, chain, start + i, network).address);
      const flags = await Promise.all(addresses.map((a) => this.addressUsed(a)));
      addresses.forEach((address, k) => {
        const index = start + k;
        if (unusedRun >= gap) return;
        if (flags[k]) {
          used.push({ index, address });
          unusedRun = 0;
        } else {
          if (firstUnused === -1) firstUnused = index;
          unusedRun++;
        }
      });
    }
    return { used, firstUnused };
  }

  /** First never-used index on a chain (receive 0 or change 1), so that no address is reused. */
  async firstUnusedIndex(policy: WalletPolicy, network: Network, chain: Chain, gap = 20): Promise<number> {
    return (await this.usedIndexes(policy, network, chain, gap)).firstUnused;
  }

  /** Used addresses of the wallet (receive and change), discovered with the gap limit. */
  private async usedAddresses(policy: WalletPolicy, network: Network, gap: number) {
    const chains = await Promise.all(([0, 1] as Chain[]).map((chain) => this.usedIndexes(policy, network, chain, gap)));
    const used = chains.flatMap(({ used }, chain) => used.map((u) => ({ chain: chain as Chain, ...u })));
    return { used, firstUnused: chains.map((c) => c.firstUnused) as [receive: number, change: number] };
  }

  /**
   * Wallet state in a single pass: UTXOs of every used address (up to `gap` consecutive empty
   * addresses per chain) and the first free index of each chain (next receive address,
   * next change address). Requests in parallel batches of 10.
   */
  async walletState(
    policy: WalletPolicy,
    network: Network,
    gap = 20,
  ): Promise<{ utxos: WalletUtxo[]; nextReceive: number; nextChange: number }> {
    const { used, firstUnused } = await this.usedAddresses(policy, network, gap);
    const utxos: WalletUtxo[] = [];
    for (let start = 0; start < used.length; start += 10) {
      const batch = await Promise.all(
        used.slice(start, start + 10).map(async ({ chain, index, address }) =>
          (await this.addressUtxos(address)).map((u) => ({
            txid: u.txid,
            vout: u.vout,
            value: BigInt(u.value),
            chain,
            index,
          })),
        ),
      );
      utxos.push(...batch.flat());
    }
    return { utxos, nextReceive: firstUnused[0], nextChange: firstUnused[1] };
  }

  /** Wallet UTXOs, across all its used addresses (see `walletState`). */
  async scanWallet(policy: WalletPolicy, network: Network, gap = 20): Promise<WalletUtxo[]> {
    return (await this.walletState(policy, network, gap)).utxos;
  }

  /** Wallet history read from the chain: transactions of its used addresses (gap limit),
   *  deduplicated, most recent first (unconfirmed on top). */
  async walletTxs(policy: WalletPolicy, network: Network, gap = 20): Promise<WalletTx[]> {
    const addresses = (await this.usedAddresses(policy, network, gap)).used.map((a) => a.address);
    const mine = new Set(addresses);
    const byId = new Map<string, EsploraTx>();
    for (let start = 0; start < addresses.length; start += 10) {
      const batch = await Promise.all(
        addresses.slice(start, start + 10).map((a) => this.get<EsploraTx[]>(`/address/${a}/txs`)),
      );
      for (const tx of batch.flat()) byId.set(tx.txid, tx);
    }
    const sum = (items: ({ scriptpubkey_address?: string; value: number } | null)[]) =>
      items.reduce((s, o) => (o?.scriptpubkey_address && mine.has(o.scriptpubkey_address) ? s + BigInt(o.value) : s), 0n);
    return [...byId.values()]
      .map((tx) => ({
        txid: tx.txid,
        net: sum(tx.vout) - sum(tx.vin.map((i) => i.prevout)),
        fee: BigInt(tx.fee),
        confirmed: tx.status.confirmed,
        blockTime: tx.status.block_time,
      }))
      .sort((a, b) => (b.blockTime ?? Number.MAX_SAFE_INTEGER) - (a.blockTime ?? Number.MAX_SAFE_INTEGER));
  }
}
