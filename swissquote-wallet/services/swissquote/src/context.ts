// [MOCK] Shared state of the Swissquote service: network, key, wallet registry, notifications.
import {
  descriptorString,
  networkConfig,
  type BtcNetworkName,
  type KeyOrigin,
  type SpendSummary,
  type WalletPolicy,
} from '@sqw/core';
import { randomUUID } from 'node:crypto';
import { SwissquoteSigner } from './signer';
import { audit, readJson, writeJson } from './store';

export const cfg = networkConfig(
  process.env.BTC_NETWORK as BtcNetworkName, // validated by env.ts
  process.env.BTC_NETWORK === 'signet' ? process.env.ESPLORA_URL_SIGNET : process.env.ESPLORA_URL_REGTEST,
);

let signer = new SwissquoteSigner(cfg);
export const getSigner = () => signer;
export const resetSigner = () => (signer = new SwissquoteSigner(cfg));

/** active: normal cosigning; frozen: recovery in progress or client freeze, no payment; recovered: funds moved. */
export type WalletStatus = 'active' | 'frozen' | 'recovered';

export interface WalletRecord {
  walletId: string;
  clientId: string;
  account: number;
  network: BtcNetworkName;
  policy: WalletPolicy;
  descriptor: string;
  createdAt: string;
  status?: WalletStatus;
  /** Who froze it: a recovery in progress, or the client themselves (stolen phone). */
  frozenBy?: 'recovery' | 'client';
  recoveredTo?: string;
}

export const wallets = () => readJson<Record<string, WalletRecord>>('wallets.json', {});
export const statusOf = (w: WalletRecord): WalletStatus => w.status ?? 'active';

export function saveWallet(record: WalletRecord): void {
  writeJson('wallets.json', { ...wallets(), [record.walletId]: record });
}

/** Creates a 2-of-3 wallet for this client: Swissquote derives a dedicated key (new BIP-48 account). */
export function createWalletRecord(clientId: string, phoneKey: KeyOrigin, backupKey: KeyOrigin): WalletRecord {
  const account = Object.keys(wallets()).length + 1;
  const policy: WalletPolicy = { threshold: 2, keys: [phoneKey, signer.keyForAccount(account), backupKey] };
  const record: WalletRecord = {
    walletId: randomUUID(),
    clientId,
    account,
    network: cfg.name,
    policy,
    descriptor: descriptorString(policy, 0),
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  saveWallet(record);
  return record;
}

/** Readable amount in an alert: "0.0008 BTC", trailing zeros removed. */
export function btcAmount(sats: bigint | string | number | unknown): string {
  const v = BigInt(sats as bigint | string | number);
  const frac = (v % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${v / 100_000_000n}${frac ? `.${frac}` : ''} BTC`;
}

export function notify(walletId: string, text: string): void {
  const all = readJson<Record<string, { at: string; text: string }[]>>('notifications.json', {});
  (all[walletId] ??= []).push({ at: new Date().toISOString(), text });
  writeJson('notifications.json', all);
  audit('notification', { walletId, text });
}

export function plain(summary: SpendSummary) {
  return {
    inputTotal: summary.inputTotal.toString(),
    sentExternal: summary.sentExternal.toString(),
    change: summary.change.toString(),
    fee: summary.fee.toString(),
    external: summary.external.map((o) => ({ address: o.address, value: o.value.toString() })),
  };
}

export function isKeyOrigin(k: unknown): k is KeyOrigin {
  const o = k as KeyOrigin;
  return !!o && typeof o.fingerprint === 'string' && typeof o.path === 'string' && typeof o.xpub === 'string';
}
