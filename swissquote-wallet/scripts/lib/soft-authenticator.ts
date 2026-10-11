// SOFTWARE WebAuthn authenticator, for the test scripts only (never in the app:
// in the app, the browser and the device's chip play this role).
// It tests the service's real verification path (SimpleWebAuthn) without a browser.
// Signatures and hashes: WebCrypto (ECDSA P-256, SHA-256). CBOR encoding: @levischuck/tiny-cbor
// (the library SimpleWebAuthn uses). Only the DER formatting of the signature lives here.
import { encodeCBOR } from '@levischuck/tiny-cbor';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

const subtle = globalThis.crypto.subtle;
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const utf8 = (s: string) => new TextEncoder().encode(s);
const sha256 = async (data: Uint8Array) => new Uint8Array(await subtle.digest('SHA-256', data));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};
const uint32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

/** Raw ECDSA signature (r || s, 64 bytes, WebCrypto format) → DER, the format WebAuthn expects. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    let v = bytes.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export class SoftAuthenticator {
  private counter = 0;

  private constructor(
    private readonly keys: CryptoKeyPair,
    private readonly credentialId: Uint8Array,
    private readonly origin: string,
    private readonly rpId: string,
  ) {}

  static async create(origin = 'http://localhost:5173', rpId = 'localhost'): Promise<SoftAuthenticator> {
    const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    return new SoftAuthenticator(keys, crypto.getRandomValues(new Uint8Array(16)), origin, rpId);
  }

  private clientData(type: string, challenge: string): Uint8Array {
    return utf8(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  async register(options: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
    const raw = new Uint8Array(await subtle.exportKey('raw', this.keys.publicKey)); // 04 || x || y
    const coseKey = encodeCBOR(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty : EC2
        [3, -7], // alg : ES256
        [-1, 1], // crv : P-256
        [-2, raw.slice(1, 33)],
        [-3, raw.slice(33, 65)],
      ]),
    );
    const authData = concat(
      await sha256(utf8(this.rpId)),
      new Uint8Array([0x45]), // UP + UV + AT
      uint32(this.counter),
      new Uint8Array(16), // AAGUID
      new Uint8Array([0, this.credentialId.length]),
      this.credentialId,
      coseKey,
    );
    const attestationObject = encodeCBOR(
      new Map<string, string | Uint8Array | Map<string, never>>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const id = b64url(this.credentialId);
    return {
      id,
      rawId: id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  async authenticate(options: PublicKeyCredentialRequestOptionsJSON): Promise<AuthenticationResponseJSON> {
    this.counter++;
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const authData = concat(await sha256(utf8(this.rpId)), new Uint8Array([0x05]), uint32(this.counter));
    const signed = concat(authData, await sha256(clientDataJSON));
    const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, signed));
    const id = b64url(this.credentialId);
    return {
      id,
      rawId: id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(rawToDer(raw)),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
