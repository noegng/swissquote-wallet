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

/** Chiffre la graine téléphone avec la clé de l'appareil, sans rien enregistrer. */
export async function sealWallet(
  wallet: Omit<StoredWallet, 'phoneSeed' | 'backupConfirmed'>,
  phoneSeed: Uint8Array,
): Promise<StoredWallet> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), phoneSeed as BufferSource);
  return { ...wallet, backupConfirmed: false, phoneSeed: { iv, ct } };
}

/** Enregistre un wallet comme le wallet de ce client sur cet appareil. */
export const putWallet = (wallet: StoredWallet) => put(`wallet:${wallet.clientId}`, wallet);

export async function saveWallet(
  wallet: Omit<StoredWallet, 'phoneSeed' | 'backupConfirmed'>,
  phoneSeed: Uint8Array,
): Promise<void> {
  await putWallet(await sealWallet(wallet, phoneSeed));
}

export async function markBackupConfirmed(clientId: string): Promise<StoredWallet> {
  const wallet = (await loadWallet(clientId))!;
  const updated = { ...wallet, backupConfirmed: true };
  await put(`wallet:${clientId}`, updated);
  return updated;
}

/** Oublie le wallet de ce client sur cet appareil (graine téléphone comprise). Réservé à un wallet
 *  vide dont la sauvegarde n'a jamais été faite. */
export const deleteWallet = (clientId: string) => tx('readwrite', (s) => s.delete(`wallet:${clientId}`));

export function loadWallet(clientId: string): Promise<StoredWallet | undefined> {
  return get<StoredWallet>(`wallet:${clientId}`);
}

/** Gros paiement en attente du délai de sécurité : la PSBT déjà signée par le téléphone (une seule
 *  signature sur deux, donc inutilisable seule) est gardée pour pouvoir finir après un rechargement. */
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

/** Récupération en cours sur ce nouvel appareil (survit à un rechargement). La clé de l'appareil
 *  est non exportable : elle sert à ouvrir la part du partenaire, scellée pour elle seule. */
export interface RecoveryState {
  oldWalletId: string;
  oldPolicy: WalletPolicy;
  recoveryId: string;
  releaseId: string;
  /** Clé privée ECDH de l'appareil (non exportable). */
  deviceKey: CryptoKey;
  credentialId: string;
  /** Nouveau wallet, enregistré une fois sa sauvegarde faite et AVANT le transfert des fonds : si le
   *  transfert échoue ou que l'appareil s'éteint, il reprend sans rien perdre. Graine chiffrée. */
  newWallet?: StoredWallet;
}

export const saveRecovery = (clientId: string, r: RecoveryState) => put(`recovery:${clientId}`, r);
export const loadRecovery = (clientId: string) => get<RecoveryState>(`recovery:${clientId}`);
export const clearRecovery = (clientId: string) => tx('readwrite', (s) => s.delete(`recovery:${clientId}`));

/** Sortie sans Swissquote en cours (libération demandée au partenaire). */
export interface ExitState {
  walletId: string;
  releaseId: string;
  /** Clé privée ECDH de l'appareil (non exportable). */
  deviceKey: CryptoKey;
}

export const saveExit = (clientId: string, e: ExitState) => put(`exit:${clientId}`, e);
export const loadExit = (clientId: string) => get<ExitState>(`exit:${clientId}`);
export const clearExit = (clientId: string) => tx('readwrite', (s) => s.delete(`exit:${clientId}`));

/** Wallets présents sur cet appareil (accessibles sans aucun service Swissquote). */
export async function listLocalWallets(): Promise<StoredWallet[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
  const wallets = await Promise.all(
    keys.filter((k) => String(k).startsWith('wallet:')).map((k) => get<StoredWallet>(String(k))),
  );
  return wallets.filter((w): w is StoredWallet => !!w);
}

/** Déchiffre la graine de la clé téléphone, juste le temps de signer. */
export async function unlockPhoneSeed(wallet: StoredWallet): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wallet.phoneSeed.iv }, await deviceKey(), wallet.phoneSeed.ct);
  return new Uint8Array(pt);
}

/** Invitation d'une personne de confiance, côté client : le lien à lui remettre (ce n'est pas une part). */
export interface TrusteeInvite {
  inviteId: string;
  trusteeName: string;
}

export const saveInvite = (walletId: string, i: TrusteeInvite) => put(`invite:${walletId}`, i);
export const loadInvite = (walletId: string) => get<TrusteeInvite>(`invite:${walletId}`);
export const clearInvite = (walletId: string) => tx('readwrite', (s) => s.delete(`invite:${walletId}`));

/** Côté personne de confiance : clé privée ECDH (non exportable) qui ouvre sa part, sur son appareil. */
export const saveTrusteeKey = (inviteId: string, key: CryptoKey) => put(`trustee-key:${inviteId}`, key);
export const loadTrusteeKey = (inviteId: string) => get<CryptoKey>(`trustee-key:${inviteId}`);
