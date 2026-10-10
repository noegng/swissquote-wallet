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

/** Transaction dont les entrées sont déjà dépensées ailleurs : la rediffuser est inutile. */
export class StaleTransactionError extends Error {
  constructor(detail: string) {
    super(`Transaction obsolète, ses fonds ont déjà été dépensés : ${detail}`);
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

  /**
   * Diffusion rejouable : si le réseau refuse une transaction qu'il connaît déjà (diffusion
   * précédente dont la réponse s'est perdue), c'est un succès. Si ses entrées sont déjà dépensées
   * par une autre transaction, lève `StaleTransactionError` : la rejouer ne servira jamais à rien.
   * Toute autre erreur (réseau, API) est relancée telle quelle : on peut réessayer.
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

  /** Vrai si l'adresse a déjà reçu au moins une transaction (confirmée ou non). */
  async addressUsed(address: string): Promise<boolean> {
    const a = await this.get<{ chain_stats: { tx_count: number }; mempool_stats: { tx_count: number } }>(
      `/address/${address}`,
    );
    return a.chain_stats.tx_count + a.mempool_stats.tx_count > 0;
  }

  /**
   * Parcourt une chaîne (réception 0 ou change 1) par lots parallèles de 10, jusqu'à trouver `gap`
   * adresses consécutives jamais utilisées (« gap limit » BIP-44). Aucune adresse utilisée n'est
   * ainsi oubliée, quel que soit son index. Renvoie les index utilisés et le premier index libre.
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

  /** Premier index jamais utilisé sur une chaîne (réception 0 ou change 1), pour ne pas réutiliser d'adresse. */
  async firstUnusedIndex(policy: WalletPolicy, network: Network, chain: Chain, gap = 20): Promise<number> {
    return (await this.usedIndexes(policy, network, chain, gap)).firstUnused;
  }

  /** Adresses utilisées du wallet (réception et change), découvertes avec le gap limit. */
  private async usedAddresses(policy: WalletPolicy, network: Network, gap: number) {
    const chains = await Promise.all(([0, 1] as Chain[]).map((chain) => this.usedIndexes(policy, network, chain, gap)));
    const used = chains.flatMap(({ used }, chain) => used.map((u) => ({ chain: chain as Chain, ...u })));
    return { used, firstUnused: chains.map((c) => c.firstUnused) as [receive: number, change: number] };
  }

  /**
   * État du wallet en un seul parcours : UTXO de toutes les adresses utilisées (jusqu'à `gap` adresses
   * vides consécutives par chaîne) et premier index libre de chaque chaîne (prochaine adresse de
   * réception, prochaine adresse de change). Requêtes par lots parallèles de 10.
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

  /** UTXO du wallet, sur toutes ses adresses utilisées (voir `walletState`). */
  async scanWallet(policy: WalletPolicy, network: Network, gap = 20): Promise<WalletUtxo[]> {
    return (await this.walletState(policy, network, gap)).utxos;
  }

  /** Historique du wallet lu sur la chaîne : transactions de ses adresses utilisées (gap limit),
   *  dédoublonnées, les plus récentes d'abord (non confirmées en tête). */
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
