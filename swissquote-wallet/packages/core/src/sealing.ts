// Encryption of the backup shares (skill slip39-backup). WebCrypto only, nothing hand-written:
//   - for a recipient (the partner, or the client's device during a recovery):
//     ephemeral ECDH P-256 + HKDF-SHA-256 + AES-256-GCM;
//   - for the C2 copy in the client's cloud: PBKDF2-SHA-256 (passphrase) + AES-256-GCM.
// Works in the browser and in Node 22 (globalThis.crypto.subtle).

const subtle = globalThis.crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const HKDF_INFO = new TextEncoder().encode('swissquote-wallet/seal/v1');
export const PBKDF2_ITERATIONS = 600_000;

export interface SealedBox {
  v: 1;
  alg: 'ECDH-P256+HKDF-SHA256+A256GCM';
  /** The sender's ephemeral public key. */
  epk: JsonWebKey;
  iv: string;
  ct: string;
}

export interface PassphraseBox {
  v: 1;
  alg: 'PBKDF2-SHA256+A256GCM';
  salt: string;
  iterations: number;
  iv: string;
  ct: string;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Receiving key pair. `extractable` for a service that keeps it in a file (mock). */
export function generateSealingKeyPair(extractable = false): Promise<CryptoKeyPair> {
  return subtle.generateKey(ECDH, extractable, ['deriveBits']) as Promise<CryptoKeyPair>;
}

export function exportPublicJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
  return subtle.exportKey('jwk', publicKey);
}

export function importPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle.importKey('jwk', jwk, ECDH, false, ['deriveBits']);
}

async function sharedAesKey(privateKey: CryptoKey, publicKey: CryptoKey, usage: KeyUsage): Promise<CryptoKey> {
  const secret = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Encrypts a text for the holder of the private key matching `recipient`. */
export async function sealFor(recipient: JsonWebKey, plaintext: string): Promise<SealedBox> {
  const recipientKey = await subtle.importKey('jwk', recipient, ECDH, false, []);
  const ephemeral = (await subtle.generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const aes = await sharedAesKey(ephemeral.privateKey, recipientKey, 'encrypt');
  const iv = random(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    alg: 'ECDH-P256+HKDF-SHA256+A256GCM',
    epk: await exportPublicJwk(ephemeral.publicKey),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

/** Opens a sealed box. Throws if the key is wrong or the box was tampered with. */
export async function openSealed(box: SealedBox, privateKey: CryptoKey): Promise<string> {
  const epk = await subtle.importKey('jwk', box.epk, ECDH, false, []);
  const aes = await sharedAesKey(privateKey, epk, 'decrypt');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, aes, fromB64(box.ct));
  return new TextDecoder().decode(pt);
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number, usage: KeyUsage) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Encrypts the C2 copy with a passphrase chosen by the client. */
export async function sealWithPassphrase(
  passphrase: string,
  plaintext: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<PassphraseBox> {
  const salt = random(16);
  const iv = random(12);
  const key = await passphraseKey(passphrase, salt, iterations, 'encrypt');
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    v: 1,
    alg: 'PBKDF2-SHA256+A256GCM',
    salt: toB64(salt),
    iterations,
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
  };
}

export async function openWithPassphrase(box: PassphraseBox, passphrase: string): Promise<string> {
  const key = await passphraseKey(passphrase, fromB64(box.salt), box.iterations, 'decrypt');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  return new TextDecoder().decode(pt);
}
