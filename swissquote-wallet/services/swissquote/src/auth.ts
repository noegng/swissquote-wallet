// [MOCK] Swissquote login (KYC already done, simulated) and WebAuthn passkeys (real, SimpleWebAuthn).
// The passkey is created by the browser in the device's chip (Secure Enclave, TPM via
// Windows Hello…). Every sensitive operation requires a fresh assertion whose challenge is bound to
// the operation: PSBT hash for a cosignature, request id for a cancellation.
import { createHash, randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { audit, readJson, writeJson } from './store';

const RP_ID = process.env.RP_ID ?? 'localhost';
const RP_NAME = process.env.RP_NAME ?? 'Swissquote Wallet (MOCK)';
const ORIGINS = (process.env.ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim());
// The Windows Hello / Face ID prompt can take a while to appear: 120 s for the prompt, 3 min for the challenge.
const WEBAUTHN_TIMEOUT_MS = 120_000;
const CHALLENGE_TTL_MS = 3 * 60 * 1000;

export type Purpose = 'cosign' | 'cancel' | 'unfreeze' | 'device';

interface StoredCredential {
  id: string;
  publicKey: string; // base64url
  counter: number;
  transports?: string[];
  createdAt: string;
}

interface StoredChallenge {
  clientId: string;
  kind: 'register' | 'auth';
  purpose?: Purpose;
  payloadHash?: string;
  expiresAt: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const credentials = () => readJson<Record<string, StoredCredential[]>>('credentials.json', {});
const challenges = () => readJson<Record<string, StoredChallenge>>('challenges.json', {});

function saveChallenge(challenge: string, record: StoredChallenge) {
  const all = challenges();
  for (const [c, r] of Object.entries(all)) if (r.expiresAt < Date.now()) delete all[c];
  writeJson('challenges.json', { ...all, [challenge]: record });
}

/** Consumes a challenge (single use) and checks that it matches what is expected. */
function consumeChallenge(challenge: string, expected: Omit<StoredChallenge, 'expiresAt'>): boolean {
  const all = challenges();
  const record = all[challenge];
  if (!record) return false;
  delete all[challenge];
  writeJson('challenges.json', all);
  return (
    record.expiresAt >= Date.now() &&
    record.clientId === expected.clientId &&
    record.kind === expected.kind &&
    record.purpose === expected.purpose &&
    record.payloadHash === expected.payloadHash
  );
}

// --- Mocked Swissquote login ---------------------------------------------------------------

export function login(clientId: string): string | null {
  if (!/^[a-z0-9-]{3,40}$/.test(clientId)) return null;
  const token = randomBytes(24).toString('base64url');
  const sessions = readJson<Record<string, { clientId: string; at: string }>>('sessions.json', {});
  writeJson('sessions.json', { ...sessions, [token]: { clientId, at: new Date().toISOString() } });
  audit('kyc.login', { clientId, note: 'MOCK: KYC assumed to be done by Swissquote already' });
  return token;
}

export function clientFromAuthHeader(header: string | undefined): string | null {
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  return readJson<Record<string, { clientId: string }>>('sessions.json', {})[token]?.clientId ?? null;
}

export function hasPasskey(clientId: string): boolean {
  return (credentials()[clientId] ?? []).length > 0;
}

// --- Passkey registration ------------------------------------------------------------------

export async function registrationOptions(clientId: string) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: clientId,
    userDisplayName: `Swissquote client ${clientId}`,
    attestationType: 'none',
    timeout: WEBAUTHN_TIMEOUT_MS,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: (credentials()[clientId] ?? []).map((c) => ({ id: c.id, transports: c.transports })),
  });
  saveChallenge(options.challenge, { clientId, kind: 'register', expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return options;
}

export async function verifyRegistration(clientId: string, response: RegistrationResponseJSON) {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, { clientId, kind: 'register' }),
    expectedOrigin: ORIGINS,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error('Passkey rejected');
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const all = credentials();
  (all[clientId] ??= []).push({
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports,
    createdAt: new Date().toISOString(),
  });
  writeJson('credentials.json', all);
  // credentialBackedUp = synced passkey (e.g. iCloud Keychain): to be handled differently in production.
  audit('passkey.registered', { clientId, credentialDeviceType, synced: credentialBackedUp });
  return { credentialDeviceType, synced: credentialBackedUp };
}

export function credentialBelongsTo(clientId: string, credentialId: string): boolean {
  return (credentials()[clientId] ?? []).some((c) => c.id === credentialId);
}

/**
 * End of recovery: revokes all of the client's passkeys except the new device's
 * (the lost phone's must no longer be able to cancel or approve anything).
 * Returns the number of revoked passkeys.
 */
export function revokeCredentialsExcept(clientId: string, keepId: string): number {
  const all = credentials();
  const before = all[clientId] ?? [];
  all[clientId] = before.filter((c) => c.id === keepId);
  writeJson('credentials.json', all);
  const revoked = before.length - all[clientId].length;
  if (revoked) audit('passkey.revoked', { clientId, revoked });
  return revoked;
}

// --- Protective actions -----------------------------------------------------------------------

/**
 * Cancelling a payment, cancelling a recovery or freezing the wallet are actions that PROTECT
 * the funds: they are accepted with the passkey OR with the Swissquote client-area session. A
 * client whose phone (and so passkey) was stolen must be able to react from a computer.
 * At worst, an attacker with the session delays or freezes: they cannot move anything.
 * Whatever RELAXES the protection (unfreezing) requires the passkey.
 */
export async function authorizeProtective(
  walletClientId: string,
  authorizationHeader: string | undefined,
  passkeyPayload: string,
  authentication: AuthenticationResponseJSON | undefined,
): Promise<'session' | 'passkey'> {
  if (clientFromAuthHeader(authorizationHeader) === walletClientId) return 'session';
  await verifyOperation(walletClientId, 'cancel', passkeyPayload, authentication);
  return 'passkey';
}

// --- Authentication bound to an operation ---------------------------------------------------

export async function operationOptions(clientId: string, purpose: Purpose, payload: string) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: (credentials()[clientId] ?? []).map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: 'required',
    timeout: WEBAUTHN_TIMEOUT_MS,
  });
  saveChallenge(options.challenge, {
    clientId,
    kind: 'auth',
    purpose,
    payloadHash: sha256(payload),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return options;
}

/**
 * Checks that a passkey assertion approves exactly this operation for this client.
 * Throws otherwise (unknown passkey, expired or already used challenge, or a different operation).
 */
export async function verifyOperation(
  clientId: string,
  purpose: Purpose,
  payload: string,
  response: AuthenticationResponseJSON | undefined,
): Promise<void> {
  if (!response?.id) throw new Error('Passkey authentication required');
  const all = credentials();
  const credential = (all[clientId] ?? []).find((c) => c.id === response.id);
  if (!credential) throw new Error('Unknown passkey for this client');
  let challengeOk = true;
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (c) =>
        (challengeOk = consumeChallenge(c, { clientId, kind: 'auth', purpose, payloadHash: sha256(payload) })),
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: true,
    });
  } catch (e) {
    if (!challengeOk) {
      throw new Error('Invalid passkey challenge: expired, already used, or issued for another operation');
    }
    throw e;
  }
  if (!result.verified) throw new Error('Invalid passkey assertion');
  credential.counter = result.authenticationInfo.newCounter;
  writeJson('credentials.json', all);
}

// --- Passkey already on the device ------------------------------------------------------------

/**
 * A device that already holds one of the client's passkeys (synced by iCloud or Google, or the
 * same authenticator) cannot create a second one: the browser refuses. It then proves
 * that it holds it with an assertion, and that passkey becomes "the device passkey" for the
 * recovery. Documented limit: a synced passkey also exists on the old phone.
 */
export function deviceProofOptions(clientId: string) {
  return operationOptions(clientId, 'device', `device:${clientId}`);
}

export async function verifyDeviceProof(
  clientId: string,
  response: AuthenticationResponseJSON | undefined,
): Promise<string> {
  await verifyOperation(clientId, 'device', `device:${clientId}`, response);
  audit('passkey.device-proof', { clientId });
  return response!.id;
}
