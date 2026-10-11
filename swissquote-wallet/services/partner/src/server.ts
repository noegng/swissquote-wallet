// [MOCK] Partner service (independent trust company): holds the SLIP-39 share of the PARTNER group.
// Alone it can do nothing: without the CLIENT share, the backup key cannot be rebuilt (I2).
// Separate process with its own storage (data/). Does not depend on Swissquote: it must
// keep working if Swissquote has disappeared.
// Release (recovery): MOCK identity check, delay, notification, then the share is
// re-sealed for the new device's ephemeral key: it never travels in clear.
// Trusted person (notary, lawyer): the client can entrust the PARTNER share to them. The partner
// re-seals it for that person's key, then destroys its copy; from then on it only relays.
import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exportPublicJwk,
  generateSealingKeyPair,
  importPrivateJwk,
  openSealed,
  sealFor,
  type SealedBox,
} from '@sqw/core';

const RELEASE_DELAY_SECONDS = Number(process.env.RECOVERY_DELAY_SECONDS ?? 30);

const NAME = 'partner';
const DATA_DIR = join(import.meta.dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

function readJson<T>(file: string, initial: T): T {
  const path = join(DATA_DIR, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : initial;
}

function writeJson(file: string, value: unknown) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

function audit(action: string, details: Record<string, unknown> = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), service: NAME, action, ...details });
  appendFileSync(join(DATA_DIR, 'audit.jsonl'), line + '\n');
  console.log(`[MOCK ${NAME}] ${action}`, details);
}

// The partner's receiving key. MOCK: in clear in data/; in production, the partner's HSM.
async function partnerKey(): Promise<{ publicJwk: JsonWebKey; privateKey: CryptoKey }> {
  let stored = readJson<{ publicJwk?: JsonWebKey; privateJwk?: JsonWebKey }>('partner-key.json', {});
  if (!stored.privateJwk) {
    const pair = await generateSealingKeyPair(true);
    stored = {
      publicJwk: await exportPublicJwk(pair.publicKey),
      privateJwk: await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey),
    };
    writeJson('partner-key.json', { ...stored, warning: 'MOCK: key in clear, HSM in production' });
  }
  return { publicJwk: stored.publicJwk!, privateKey: await importPrivateJwk(stored.privateJwk!) };
}

interface ShareRecord {
  walletId: string;
  clientId: string;
  /** Share sealed for the partner. Missing once the share has been entrusted to a trusted person. */
  sealedShare?: SealedBox;
  depositedAt: string;
  /** Trusted person who holds the share instead of the partner. */
  trustee?: { inviteId: string; name: string; since: string };
}

const shares = () => readJson<Record<string, ShareRecord>>('shares.json', {});

interface ReleaseTicket {
  id: string;
  walletId: string;
  clientId: string;
  devicePublicKey: JsonWebKey;
  status: 'pending' | 'released' | 'cancelled';
  identityCheck: string;
  createdAt: string;
  executeAfter: number;
  /** Share re-sealed for the device by the trusted person (the partner cannot read it). */
  sealedForDevice?: SealedBox;
}

// Invitation for a trusted person to hold the PARTNER share. Its id is the link given
// to that person: no public route ever returns it.
interface Invitation {
  id: string;
  walletId: string;
  clientId: string;
  trusteeName: string;
  status: 'invited' | 'accepted' | 'confirmed' | 'collected' | 'cancelled';
  /** Public key created on the trusted person's device. */
  trusteeKey?: JsonWebKey;
  /** Share sealed for that key: unreadable for the partner. */
  sealedForTrustee?: SealedBox;
  createdAt: string;
}

const invitations = () => readJson<Record<string, Invitation>>('invitations.json', {});
const saveInvitation = (i: Invitation) => writeJson('invitations.json', { ...invitations(), [i.id]: i });
const OPEN_INVITATION = ['invited', 'accepted', 'confirmed'];

const releases = () => readJson<Record<string, ReleaseTicket>>('releases.json', {});
const saveRelease = (t: ReleaseTicket) => writeJson('releases.json', { ...releases(), [t.id]: t });
const secondsLeft = (t: ReleaseTicket) => Math.max(0, Math.ceil((t.executeAfter - Date.now()) / 1000));

// The partner's own notification channel (MOCK: email or letter from the partner to the client).
function notify(walletId: string, text: string) {
  const all = readJson<Record<string, { at: string; text: string }[]>>('notifications.json', {});
  (all[walletId] ??= []).push({ at: new Date().toISOString(), text });
  writeJson('notifications.json', all);
  audit('notification', { walletId, text });
}

const app = Fastify();
await app.register(cors, { origin: process.env.ORIGIN ?? 'http://localhost:5173' });

app.get('/health', async () => ({ mock: true, service: NAME, ok: true }));

// The partner's public key: the app seals the PARTNER share for it.
// In production this key would be pinned in the app (not fetched on the fly).
app.get('/public-key', async () => ({ mock: true, publicKey: (await partnerKey()).publicJwk }));

// Deposit of the PARTNER share when the wallet is created. We check that it is sealed for us,
// without ever logging or returning it.
app.post('/shares', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; sealedShare?: SealedBox };
  if (!body?.walletId || !body.clientId || !body.sealedShare) {
    return reply.code(400).send({ mock: true, error: 'walletId, clientId and sealedShare are required' });
  }
  if (shares()[body.walletId]) {
    return reply.code(409).send({ mock: true, error: 'A share already exists for this wallet' });
  }
  try {
    const share = await openSealed(body.sealedShare, (await partnerKey()).privateKey);
    if (share.trim().split(/\s+/).length < 20) throw new Error('format');
  } catch {
    audit('share.refused', { walletId: body.walletId, reason: 'share unreadable for the partner' });
    return reply.code(400).send({ mock: true, error: 'Unreadable share: it must be sealed for the partner' });
  }
  const record: ShareRecord = {
    walletId: body.walletId,
    clientId: body.clientId,
    sealedShare: body.sealedShare,
    depositedAt: new Date().toISOString(),
  };
  writeJson('shares.json', { ...shares(), [record.walletId]: record });
  audit('share.deposited', { walletId: record.walletId, clientId: record.clientId });
  return { mock: true, stored: true, depositedAt: record.depositedAt };
});

// Status of a share (never its content): who holds it, and where a possible invitation stands.
app.get('/shares/:walletId', async (req) => {
  const record = shares()[(req.params as { walletId: string }).walletId];
  const invitation = record
    ? Object.values(invitations()).find((i) => i.walletId === record.walletId && OPEN_INVITATION.includes(i.status))
    : undefined;
  return {
    mock: true,
    exists: !!record,
    depositedAt: record?.depositedAt ?? null,
    holder: record?.trustee ? 'trustee' : 'partner',
    trusteeName: record?.trustee?.name ?? null,
    invitation: invitation ? { status: invitation.status, trusteeName: invitation.trusteeName } : null,
  };
});

// --- Trusted person: invitation, acceptance, confirmation by the client, handover of the share.

// The client invites a trusted person. MOCK: the partner trusts the clientId it is given; in
// production, its own identity check, a delay and a notification before any handover.
app.post('/invitations', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; trusteeName?: string };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  const trusteeName = body?.trusteeName?.trim();
  if (!share || share.clientId !== body.clientId || !trusteeName) {
    return reply.code(404).send({ mock: true, error: 'No share for this wallet and client' });
  }
  if (!share.sealedShare) {
    return reply.code(409).send({ mock: true, error: 'This share is already held by a trusted person' });
  }
  if (Object.values(invitations()).some((i) => i.walletId === share.walletId && OPEN_INVITATION.includes(i.status))) {
    return reply.code(409).send({ mock: true, error: 'An invitation is already open for this wallet' });
  }
  const invitation: Invitation = {
    id: randomUUID(),
    walletId: share.walletId,
    clientId: share.clientId,
    trusteeName,
    status: 'invited',
    createdAt: new Date().toISOString(),
  };
  saveInvitation(invitation);
  audit('invitation.created', { walletId: invitation.walletId, trusteeName });
  notify(
    invitation.walletId,
    `You invited ${trusteeName} to hold your third-party backup share. If this is not you, cancel the invitation.`,
  );
  return { mock: true, inviteId: invitation.id };
});

// Read by the client (tracking) and by the trusted person (their portal). The share only appears
// sealed for that person's key.
app.get('/invitations/:id', async (req, reply) => {
  const i = invitations()[(req.params as { id: string }).id];
  if (!i) return reply.code(404).send({ mock: true, error: 'Unknown invitation' });
  const requests =
    i.status === 'collected'
      ? Object.values(releases())
          .filter((r) => r.walletId === i.walletId && r.status === 'pending')
          .map((r) => ({
            releaseId: r.id,
            createdAt: r.createdAt,
            devicePublicKey: r.devicePublicKey,
            fulfilled: !!r.sealedForDevice,
            identityCheck: r.identityCheck,
          }))
      : [];
  return {
    mock: true,
    status: i.status,
    clientId: i.clientId,
    walletId: i.walletId,
    trusteeName: i.trusteeName,
    trusteeKey: i.trusteeKey ?? null,
    sealedForTrustee: i.status === 'confirmed' || i.status === 'collected' ? (i.sealedForTrustee ?? null) : null,
    requests,
  };
});

// The trusted person accepts: they send the public key created on their device.
app.post('/invitations/:id/accept', async (req, reply) => {
  const i = invitations()[(req.params as { id: string }).id];
  const publicKey = (req.body as { publicKey?: JsonWebKey })?.publicKey;
  if (!i) return reply.code(404).send({ mock: true, error: 'Unknown invitation' });
  if (i.status !== 'invited') return reply.code(409).send({ mock: true, error: `Invitation already ${i.status}` });
  try {
    await sealFor(publicKey!, 'check');
  } catch {
    return reply.code(400).send({ mock: true, error: 'A P-256 public key is required' });
  }
  saveInvitation({ ...i, status: 'accepted', trusteeKey: publicKey });
  audit('invitation.accepted', { walletId: i.walletId, trusteeName: i.trusteeName });
  notify(i.walletId, `${i.trusteeName} accepted your invitation. Check the code with them, then confirm.`);
  return { mock: true, status: 'accepted' };
});

// The client confirms (after comparing the key code with the person): the partner
// re-seals the share for that person's key. It never travels in clear.
app.post('/invitations/:id/confirm', async (req, reply) => {
  const i = invitations()[(req.params as { id: string }).id];
  if (!i) return reply.code(404).send({ mock: true, error: 'Unknown invitation' });
  if (i.clientId !== (req.body as { clientId?: string })?.clientId) {
    return reply.code(403).send({ mock: true, error: 'Only the client can confirm' });
  }
  if (i.status !== 'accepted' || !i.trusteeKey) {
    return reply.code(409).send({ mock: true, error: `Invitation is ${i.status}` });
  }
  const record = shares()[i.walletId];
  if (!record?.sealedShare) return reply.code(409).send({ mock: true, error: 'The partner no longer holds this share' });
  const share = await openSealed(record.sealedShare, (await partnerKey()).privateKey);
  saveInvitation({ ...i, status: 'confirmed', sealedForTrustee: await sealFor(i.trusteeKey, share) });
  audit('invitation.confirmed', { walletId: i.walletId, trusteeName: i.trusteeName });
  return { mock: true, status: 'confirmed' };
});

// The trusted person confirms they have their share: the partner destroys its copy.
app.post('/invitations/:id/collected', async (req, reply) => {
  const i = invitations()[(req.params as { id: string }).id];
  if (!i) return reply.code(404).send({ mock: true, error: 'Unknown invitation' });
  if (i.status !== 'confirmed') return reply.code(409).send({ mock: true, error: `Invitation is ${i.status}` });
  const { sealedShare: _destroyed, ...record } = shares()[i.walletId];
  writeJson('shares.json', {
    ...shares(),
    [i.walletId]: { ...record, trustee: { inviteId: i.id, name: i.trusteeName, since: new Date().toISOString() } },
  });
  saveInvitation({ ...i, status: 'collected' });
  audit('invitation.collected', { walletId: i.walletId, trusteeName: i.trusteeName, partnerCopy: 'destroyed' });
  notify(i.walletId, `${i.trusteeName} now holds your third-party backup share. Our copy has been destroyed.`);
  return { mock: true, status: 'collected' };
});

// Cancellation by the client as long as the share has not been handed over.
app.post('/invitations/:id/cancel', async (req, reply) => {
  const i = invitations()[(req.params as { id: string }).id];
  if (!i) return reply.code(404).send({ mock: true, error: 'Unknown invitation' });
  if (i.clientId !== (req.body as { clientId?: string })?.clientId) {
    return reply.code(403).send({ mock: true, error: 'Only the client can cancel' });
  }
  if (!OPEN_INVITATION.includes(i.status)) return reply.code(409).send({ mock: true, error: `Invitation is ${i.status}` });
  const { sealedForTrustee: _dropped, ...rest } = i;
  saveInvitation({ ...rest, status: 'cancelled' });
  audit('invitation.cancelled', { walletId: i.walletId, trusteeName: i.trusteeName });
  notify(i.walletId, `Invitation of ${i.trusteeName} cancelled. Our partner still holds your third-party share.`);
  return { mock: true, status: 'cancelled' };
});

// Request to release the PARTNER share from a new device. The partner does not depend on
// Swissquote: it runs its own identity check (MOCK) and applies its own delay.
app.post('/release', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; devicePublicKey?: JsonWebKey };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  if (!share || share.clientId !== body.clientId || !body.devicePublicKey) {
    return reply.code(404).send({ mock: true, error: 'No share for this wallet and client' });
  }
  try {
    await sealFor(body.devicePublicKey, 'check');
  } catch {
    return reply.code(400).send({ mock: true, error: 'The device P-256 public key is required' });
  }
  const active = Object.values(releases()).find((r) => r.walletId === share.walletId && r.status === 'pending');
  if (active) return reply.code(409).send({ mock: true, error: 'A release is already in progress', releaseId: active.id });
  const ticket: ReleaseTicket = {
    id: randomUUID(),
    walletId: share.walletId,
    clientId: share.clientId,
    devicePublicKey: body.devicePublicKey,
    status: 'pending',
    identityCheck: 'MOCK: partner identity check assumed successful',
    createdAt: new Date().toISOString(),
    executeAfter: Date.now() + RELEASE_DELAY_SECONDS * 1000,
  };
  saveRelease(ticket);
  audit('release.requested', { walletId: ticket.walletId, releaseId: ticket.id, identityCheck: ticket.identityCheck });
  notify(
    ticket.walletId,
    `Request to release your backup share. It will be sent in ${RELEASE_DELAY_SECONDS} s, ` +
      `encrypted for the new device. If this is not you, cancel.`,
  );
  return { mock: true, releaseId: ticket.id, executeAfter: new Date(ticket.executeAfter).toISOString() };
});

// After the delay: the share is re-sealed for the new device's public key (never in clear).
app.get('/release/:id', async (req, reply) => {
  const t = releases()[(req.params as { id: string }).id];
  if (!t) return reply.code(404).send({ mock: true, error: 'Unknown request' });
  if (t.status === 'cancelled') return { mock: true, status: 'cancelled' };
  const record = shares()[t.walletId];
  if (!record) return reply.code(404).send({ mock: true, error: 'No share found for this wallet' });
  // Share held by a trusted person: the partner has nothing to open, it waits for that person to
  // approve the request and provide the share sealed for the device. Its delay still applies.
  if (record.trustee && !t.sealedForDevice) {
    return {
      mock: true,
      status: 'pending',
      secondsLeft: secondsLeft(t),
      awaiting: 'trustee',
      trusteeName: record.trustee.name,
    };
  }
  if (secondsLeft(t) > 0) return { mock: true, status: 'pending', secondsLeft: secondsLeft(t) };
  const sealedForDevice =
    t.sealedForDevice ??
    (await sealFor(t.devicePublicKey, await openSealed(record.sealedShare!, (await partnerKey()).privateKey)));
  if (t.status !== 'released') {
    saveRelease({ ...t, status: 'released' });
    audit('release.delivered', { walletId: t.walletId, releaseId: t.id });
    notify(t.walletId, 'Your backup share was sent, encrypted for your new device.');
  }
  return { mock: true, status: 'released', sealedForDevice };
});

// The trusted person approves a request: they provide their share, sealed on their device
// for the client's new device key. The invitation link serves as proof (MOCK: in
// production, strong authentication of that person).
app.post('/release/:id/fulfil', async (req, reply) => {
  const t = releases()[(req.params as { id: string }).id];
  const body = req.body as { inviteId?: string; sealedForDevice?: SealedBox };
  const i = body?.inviteId ? invitations()[body.inviteId] : undefined;
  if (!t || !i || i.status !== 'collected' || i.walletId !== t.walletId || !body.sealedForDevice) {
    return reply.code(404).send({ mock: true, error: 'Unknown request for this trusted person' });
  }
  if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Request already ${t.status}` });
  saveRelease({ ...t, sealedForDevice: body.sealedForDevice });
  audit('release.approved', { walletId: t.walletId, releaseId: t.id, by: i.trusteeName });
  notify(t.walletId, `${i.trusteeName} approved the release of your backup share. It is encrypted for your new device.`);
  return { mock: true, status: 'approved', secondsLeft: secondsLeft(t) };
});

// Cancellation. MOCK: no authentication (link in the partner's message). A thief could
// cancel a legitimate release: only a delay, never a loss (documented in the threat model).
app.post('/release/:id/cancel', async (req, reply) => {
  const t = releases()[(req.params as { id: string }).id];
  if (!t) return reply.code(404).send({ mock: true, error: 'Unknown request' });
  if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Request already ${t.status}` });
  saveRelease({ ...t, status: 'cancelled' });
  audit('release.cancelled', { walletId: t.walletId, releaseId: t.id });
  notify(t.walletId, 'Release of your backup share cancelled.');
  return { mock: true, status: 'cancelled' };
});

// Cancels every release in progress for a wallet: called by the app when the client cancels
// a recovery at Swissquote (otherwise the device that started it would still receive the share,
// and any new request would be refused). MOCK: same trust level as cancelling by link.
app.post('/releases/cancel', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  if (!share || share.clientId !== body.clientId) {
    return reply.code(404).send({ mock: true, error: 'No share for this wallet and client' });
  }
  const pending = Object.values(releases()).filter((r) => r.walletId === share.walletId && r.status === 'pending');
  for (const t of pending) {
    saveRelease({ ...t, status: 'cancelled' });
    audit('release.cancelled', { walletId: t.walletId, releaseId: t.id, via: 'client' });
  }
  if (pending.length) notify(share.walletId, 'Release of your backup share cancelled.');
  return { mock: true, cancelled: pending.length };
});

app.get('/notifications/:walletId', async (req) => {
  const all = readJson<Record<string, unknown[]>>('notifications.json', {});
  return { mock: true, notifications: all[(req.params as { walletId: string }).walletId] ?? [] };
});

// Demo only: empties the service storage (a new partner key is generated).
app.post('/admin/reset', async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  audit('reset');
  return { mock: true, reset: true };
});

const port = Number(process.env.PARTNER_PORT ?? 4002);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${NAME}] listening on http://localhost:${port}`);
