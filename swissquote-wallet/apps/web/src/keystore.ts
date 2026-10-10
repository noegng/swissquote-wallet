// Coffre local de l'appareil (IndexedDB). La graine de la clé téléphone y est chiffrée par une clé
// AES-GCM WebCrypto **non exportable** : le script de la page peut l'utiliser, mais ne peut pas la
// lire. En production (app native), cette clé de chiffrement vivrait dans la Secure Enclave.
// Ni la clé de secours ni ses parts ne sont jamais stockées ici.
import type { BtcNetworkName, WalletPolicy } from '@sqw/core';

const DB_NAME = 'swissquote-wallet';
const STORE = 'kv';

export interface StoredWallet {
  walletId: string;
  clientId: string;
  network: BtcNetworkName;
  policy: WalletPolicy;
  createdAt: string;
  /** Faux tant que la part CLIENT n'a pas été vérifiée (C1) et chiffrée (C2). */
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

export async function saveWallet(
  wallet: Omit<StoredWallet, 'phoneSeed' | 'backupConfirmed'>,
  phoneSeed: Uint8Array,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), phoneSeed as BufferSource);
  await put(`wallet:${wallet.clientId}`, {
    ...wallet,
    backupConfirmed: false,
    phoneSeed: { iv, ct },
  } satisfies StoredWallet);
}

export async function markBackupConfirmed(clientId: string): Promise<StoredWallet> {
  const wallet = (await loadWallet(clientId))!;
  const updated = { ...wallet, backupConfirmed: true };
  await put(`wallet:${clientId}`, updated);
  return updated;
}

export function loadWallet(clientId: string): Promise<StoredWallet | undefined> {
  return get<StoredWallet>(`wallet:${clientId}`);
}

/** Déchiffre la graine de la clé téléphone, juste le temps de signer. */
export async function unlockPhoneSeed(wallet: StoredWallet): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wallet.phoneSeed.iv }, await deviceKey(), wallet.phoneSeed.ct);
  return new Uint8Array(pt);
}
