// [MOCK] Connexion Swissquote (KYC déjà fait, simulé) et passkeys WebAuthn (réel, SimpleWebAuthn).
// La passkey est créée par le navigateur dans la puce de l'appareil (Secure Enclave, TPM via
// Windows Hello…). Chaque opération sensible exige une assertion fraîche dont le défi est lié à
// l'opération : empreinte de la PSBT pour une cosignature, identifiant pour une annulation.
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
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

export type Purpose = 'cosign' | 'cancel';

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

/** Consomme un défi (usage unique) et vérifie qu'il correspond à ce qui est attendu. */
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

// --- Connexion Swissquote mockée -----------------------------------------------------------

export function login(clientId: string): string | null {
  if (!/^[a-z0-9-]{3,40}$/.test(clientId)) return null;
  const token = randomBytes(24).toString('base64url');
  const sessions = readJson<Record<string, { clientId: string; at: string }>>('sessions.json', {});
  writeJson('sessions.json', { ...sessions, [token]: { clientId, at: new Date().toISOString() } });
  audit('kyc.login', { clientId, note: 'MOCK : KYC supposé déjà fait par Swissquote' });
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

// --- Enregistrement d'une passkey ----------------------------------------------------------

export async function registrationOptions(clientId: string) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: clientId,
    userDisplayName: `Client Swissquote ${clientId}`,
    attestationType: 'none',
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
  if (!result.verified) throw new Error('Passkey refusée');
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
  // credentialBackedUp = passkey synchronisée (ex. iCloud Keychain) : à traiter différemment en production.
  audit('passkey.registered', { clientId, credentialDeviceType, synced: credentialBackedUp });
  return { credentialDeviceType, synced: credentialBackedUp };
}

export function credentialBelongsTo(clientId: string, credentialId: string): boolean {
  return (credentials()[clientId] ?? []).some((c) => c.id === credentialId);
}

/**
 * Fin de récupération : révoque toutes les passkeys du client sauf celle du nouvel appareil
 * (celle du téléphone perdu ne doit plus pouvoir annuler ni approuver quoi que ce soit).
 * Renvoie le nombre de passkeys révoquées.
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

// --- Authentification liée à une opération -------------------------------------------------

export async function operationOptions(clientId: string, purpose: Purpose, payload: string) {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: (credentials()[clientId] ?? []).map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: 'required',
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
 * Vérifie qu'une assertion passkey approuve exactement cette opération pour ce client.
 * Lève une erreur sinon (passkey inconnue, défi expiré, déjà utilisé, ou opération différente).
 */
export async function verifyOperation(
  clientId: string,
  purpose: Purpose,
  payload: string,
  response: AuthenticationResponseJSON | undefined,
): Promise<void> {
  if (!response?.id) throw new Error('Authentification passkey requise');
  const all = credentials();
  const credential = (all[clientId] ?? []).find((c) => c.id === response.id);
  if (!credential) throw new Error('Passkey inconnue pour ce client');
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
      throw new Error('Défi passkey invalide : expiré, déjà utilisé, ou émis pour une autre opération');
    }
    throw e;
  }
  if (!result.verified) throw new Error('Assertion passkey invalide');
  credential.counter = result.authenticationInfo.newCounter;
  writeJson('credentials.json', all);
}
