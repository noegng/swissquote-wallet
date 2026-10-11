// The device's local vault (IndexedDB). The phone key seed is encrypted there with a
// **non-extractable** WebCrypto AES-GCM key: the page script can use it, but cannot
// read it. In production (native app), this encryption key would live in the Secure Enclave.
// Neither the backup key nor its shares are ever stored here.
import type { BtcNetworkName, WalletPolicy } from '@sqw/core';
import { btc } from './config';

const DB_NAME = 'swissquote-wallet';

// A wallet belongs to one network (regtest or signet): the vault keys carry that network, so
// that a regtest wallet already on the device is never reused when the app switches to signet.
const NET = btc.name;
const walletKey = (clientId: string) => `wallet:${NET}:${clientId}`;
// Old format (without network), still read as long as it matches the current network.
const legacyWalletKey = (clientId: string) => `wallet:${clientId}`;
const STORE = 'kv';

export interface StoredWallet {
  walletId: string;
  clientId: string;
  network: BtcNetworkName;
  policy: WalletPolicy;
  createdAt: string;
  /** False until the CLIENT share has been checked (C1) and encrypted (C2). */
  backupConfirmed: boolean;
  phoneSeed: { iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

const get = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key));
const put = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key));

async function deviceKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>('device-key');
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await put('device-key', key);
  return key;
}

/** Encrypts the phone seed with the device key, without storing anything. */
export async function sealWallet(
  wallet: Omit<StoredWallet, 'phoneSeed' | 'backupConfirmed'>,
  phoneSeed: Uint8Array,
): Promise<StoredWallet> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), phoneSeed as BufferSource);
  return { ...wallet, backupConfirmed: false, phoneSeed: { iv, ct } };
}

/** Stores a wallet as this client's wallet on this device. */
export const putWallet = (wallet: StoredWallet) => put(walletKey(wallet.clientId), wallet);

export async function saveWallet(
  wallet: Omit<StoredWallet, 'phoneSeed' | 'backupConfirmed'>,
  phoneSeed: Uint8Array,
): Promise<void> {
  await putWallet(await sealWallet(wallet, phoneSeed));
}

export async function markBackupConfirmed(clientId: string): Promise<StoredWallet> {
  const wallet = (await loadWallet(clientId))!;
  const updated = { ...wallet, backupConfirmed: true };
  await putWallet(updated);
  return updated;
}

/** Forgets this client's wallet on this device (phone seed included). Only for an empty wallet
 *  whose backup was never completed. */
export async function deleteWallet(clientId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(walletKey(clientId)));
  if ((await get<StoredWallet>(legacyWalletKey(clientId)))?.network === NET) {
    await tx('readwrite', (s) => s.delete(legacyWalletKey(clientId)));
  }
}

/** This client's wallet on this device, for the current network only. */
export async function loadWallet(clientId: string): Promise<StoredWallet | undefined> {
  const current = await get<StoredWallet>(walletKey(clientId));
  if (current) return current;
  const legacy = await get<StoredWallet>(legacyWalletKey(clientId));
  return legacy?.network === NET ? legacy : undefined;
}

/** Large payment waiting for the security delay: the PSBT already signed by the phone (one
 *  signature of two, so useless on its own) is kept so that it can complete after a reload. */
export interface PendingPayment {
  requestId: string;
  appSigned: string;
  to: string;
  amount: string;
  executeAfter: string;
}

export const savePending = (walletId: string, p: PendingPayment) => put(`pending:${walletId}`, p);
export const loadPending = (walletId: string) => get<PendingPayment>(`pending:${walletId}`);
export const clearPending = (walletId: string) => tx('readwrite', (s) => s.delete(`pending:${walletId}`));

/** Recovery in progress on this new device (survives a reload). The device key
 *  is non-extractable: it opens the partner's share, sealed for it alone. */
export interface RecoveryState {
  oldWalletId: string;
  oldPolicy: WalletPolicy;
  recoveryId: string;
  releaseId: string;
  /** The device's ECDH private key (non-extractable). */
  deviceKey: CryptoKey;
  credentialId: string;
  /** New wallet, stored once its backup is done and BEFORE the funds move: if the
   *  sweep fails or the device shuts down, it resumes without losing anything. Seed encrypted. */
  newWallet?: StoredWallet;
}

export const saveRecovery = (clientId: string, r: RecoveryState) => put(`recovery:${NET}:${clientId}`, r);
export const loadRecovery = (clientId: string) => get<RecoveryState>(`recovery:${NET}:${clientId}`);
export const clearRecovery = (clientId: string) => tx('readwrite', (s) => s.delete(`recovery:${NET}:${clientId}`));

/** Exit without Swissquote in progress (release requested from the partner). */
export interface ExitState {
  walletId: string;
  releaseId: string;
  /** The device's ECDH private key (non-extractable). */
  deviceKey: CryptoKey;
}

export const saveExit = (clientId: string, e: ExitState) => put(`exit:${NET}:${clientId}`, e);
export const loadExit = (clientId: string) => get<ExitState>(`exit:${NET}:${clientId}`);
export const clearExit = (clientId: string) => tx('readwrite', (s) => s.delete(`exit:${NET}:${clientId}`));

/** Wallets on this device for the current network (available without any Swissquote service). */
export async function listLocalWallets(): Promise<StoredWallet[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const clients = new Set(
    keys
      .map(String)
      .filter((k) => k.startsWith('wallet:'))
      .map((k) => k.split(':').at(-1)!),
  );
  const wallets = await Promise.all([...clients].map((c) => loadWallet(c)));
  return wallets.filter((w): w is StoredWallet => !!w);
}

/** Decrypts the phone key seed, just long enough to sign. */
export async function unlockPhoneSeed(wallet: StoredWallet): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wallet.phoneSeed.iv }, await deviceKey(), wallet.phoneSeed.ct);
  return new Uint8Array(pt);
}

/** A trusted person's invitation, client side: the link to give them (it is not a share). */
export interface TrusteeInvite {
  inviteId: string;
  trusteeName: string;
}

export const saveInvite = (walletId: string, i: TrusteeInvite) => put(`invite:${walletId}`, i);
export const loadInvite = (walletId: string) => get<TrusteeInvite>(`invite:${walletId}`);
export const clearInvite = (walletId: string) => tx('readwrite', (s) => s.delete(`invite:${walletId}`));

/** Trusted person side: ECDH private key (non-extractable) that opens their share, on their device. */
export const saveTrusteeKey = (inviteId: string, key: CryptoKey) => put(`trustee-key:${inviteId}`, key);
export const loadTrusteeKey = (inviteId: string) => get<CryptoKey>(`trustee-key:${inviteId}`);
