// Client minimal de l'API esplora (mempool.space signet, ou Chopsticks en regtest).
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

/** Transaction du wallet telle que la chaîne la donne (aucun service Swissquote interrogé). */
export interface WalletTx {
  txid: string;
  /** Variation du solde du wallet : positive = reçu, négative = envoyé (frais compris). */
  net: bigint;
  fee: bigint;
  confirmed: boolean;
  /** Horodatage du bloc, en secondes. Absent tant que la transaction n'est pas confirmée. */
  blockTime?: number;
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

  /** Diffuse une transaction. Le corps doit être le hex brut en text/plain (pas du JSON). */
  async broadcast(hex: string): Promise<string> {
    const res = await fetch(`${this.cfg.esploraUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: hex,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Diffusion refusée : ${body}`);
    return body.trim();
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

  /** Vrai si l'adresse a déjà reçu au moins une transaction (confirmée ou non). */
  async addressUsed(address: string): Promise<boolean> {
    const a = await this.get<{ chain_stats: { tx_count: number }; mempool_stats: { tx_count: number } }>(
      `/address/${address}`,
    );
    return a.chain_stats.tx_count + a.mempool_stats.tx_count > 0;
  }

  /** Premier index jamais utilisé sur une chaîne (réception 0 ou change 1), pour ne pas réutiliser d'adresse.
   *  Interroge les adresses par lots parallèles de 10. */
  async firstUnusedIndex(policy: WalletPolicy, network: Network, chain: Chain, max = 50): Promise<number> {
    for (let start = 0; start < max; start += 10) {
      const indexes = Array.from({ length: Math.min(10, max - start) }, (_, i) => start + i);
      const used = await Promise.all(
        indexes.map((i) => this.addressUsed(deriveAddress(policy, chain, i, network).address)),
      );
      const free = used.indexOf(false);
      if (free !== -1) return indexes[free];
    }
    return max;
  }

  /** Cherche les UTXO des `gap` premières adresses de réception et de change, par lots parallèles de 10
   *  (assez rapide, sans dépasser les limites de débit des API publiques). */
  async scanWallet(policy: WalletPolicy, network: Network, gap = 10): Promise<WalletUtxo[]> {
    const slots = ([0, 1] as Chain[]).flatMap((chain) => Array.from({ length: gap }, (_, index) => ({ chain, index })));
    const found: WalletUtxo[] = [];
    for (let start = 0; start < slots.length; start += 10) {
      const batch = await Promise.all(
        slots.slice(start, start + 10).map(async ({ chain, index }) => {
          const { address } = deriveAddress(policy, chain, index, network);
          return (await this.addressUtxos(address)).map((u) => ({
            txid: u.txid,
            vout: u.vout,
            value: BigInt(u.value),
            chain,
            index,
          }));
        }),
      );
      found.push(...batch.flat());
    }
    return found;
  }

  /** Historique du wallet lu sur la chaîne : transactions des `gap` premières adresses de réception
   *  et de change, dédoublonnées, les plus récentes d'abord (non confirmées en tête). */
  async walletTxs(policy: WalletPolicy, network: Network, gap = 10): Promise<WalletTx[]> {
    const addresses = ([0, 1] as Chain[]).flatMap((chain) =>
      Array.from({ length: gap }, (_, index) => deriveAddress(policy, chain, index, network).address),
    );
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
