// [MOCK] Service partenaire (fiduciaire indépendante) : détient la part SLIP-39 du groupe TIERS.
// Seul, il ne peut rien : sans la part CLIENT, la clé de secours ne se reconstitue pas (I2).
// Processus séparé avec son propre stockage (data/). Ne dépend pas de Swissquote : il doit
// fonctionner si Swissquote a disparu.
// Libération (récupération) : contrôle d'identité MOCK, délai, notification, puis la part est
// re-scellée pour la clé éphémère du nouvel appareil : elle ne transite jamais en clair.
// Personne de confiance (notaire, avocat) : le client peut lui confier la part TIERS. Le partenaire
// la re-scelle pour la clé de cette personne puis détruit sa copie ; il ne fait plus que relayer.
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

const RELEASE_DELAY_SECONDS = Number(process.env.RECOVERY_DELAY_SECONDS ?? 120);

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

// Clé de réception du partenaire. MOCK : en clair dans data/ ; en production, HSM du partenaire.
async function partnerKey(): Promise<{ publicJwk: JsonWebKey; privateKey: CryptoKey }> {
  let stored = readJson<{ publicJwk?: JsonWebKey; privateJwk?: JsonWebKey }>('partner-key.json', {});
  if (!stored.privateJwk) {
    const pair = await generateSealingKeyPair(true);
    stored = {
      publicJwk: await exportPublicJwk(pair.publicKey),
      privateJwk: await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey),
    };
    writeJson('partner-key.json', { ...stored, warning: 'MOCK : clé en clair, HSM en production' });
  }
  return { publicJwk: stored.publicJwk!, privateKey: await importPrivateJwk(stored.privateJwk!) };
}

interface ShareRecord {
  walletId: string;
  clientId: string;
  /** Part scellée pour le partenaire. Absente une fois la part confiée à une personne de confiance. */
  sealedShare?: SealedBox;
  depositedAt: string;
  /** Personne de confiance qui détient la part à la place du partenaire. */
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
  /** Part re-scellée pour l'appareil par la personne de confiance (le partenaire ne peut pas la lire). */
  sealedForDevice?: SealedBox;
}

// Invitation d'une personne de confiance à détenir la part TIERS. Son identifiant est le lien remis
// à cette personne : il n'est jamais renvoyé par une route publique.
interface Invitation {
  id: string;
  walletId: string;
  clientId: string;
  trusteeName: string;
  status: 'invited' | 'accepted' | 'confirmed' | 'collected' | 'cancelled';
  /** Clé publique créée sur l'appareil de la personne de confiance. */
  trusteeKey?: JsonWebKey;
  /** Part scellée pour cette clé : illisible pour le partenaire. */
  sealedForTrustee?: SealedBox;
  createdAt: string;
}

const invitations = () => readJson<Record<string, Invitation>>('invitations.json', {});
const saveInvitation = (i: Invitation) => writeJson('invitations.json', { ...invitations(), [i.id]: i });
const OPEN_INVITATION = ['invited', 'accepted', 'confirmed'];

const releases = () => readJson<Record<string, ReleaseTicket>>('releases.json', {});
const saveRelease = (t: ReleaseTicket) => writeJson('releases.json', { ...releases(), [t.id]: t });
const secondsLeft = (t: ReleaseTicket) => Math.max(0, Math.ceil((t.executeAfter - Date.now()) / 1000));

// Canal de notification propre au partenaire (MOCK : e-mail ou courrier du partenaire au client).
function notify(walletId: string, text: string) {
  const all = readJson<Record<string, { at: string; text: string }[]>>('notifications.json', {});
  (all[walletId] ??= []).push({ at: new Date().toISOString(), text });
  writeJson('notifications.json', all);
  audit('notification', { walletId, text });
}

const app = Fastify();
await app.register(cors, { origin: process.env.ORIGIN ?? 'http://localhost:5173' });

app.get('/health', async () => ({ mock: true, service: NAME, ok: true }));

// Clé publique du partenaire : l'app scelle la part TIERS pour elle.
// En production, cette clé serait épinglée dans l'app (pas récupérée à la volée).
app.get('/public-key', async () => ({ mock: true, publicKey: (await partnerKey()).publicJwk }));

// Dépôt de la part TIERS à la création du wallet. On vérifie qu'elle est bien scellée pour nous,
// sans jamais la journaliser ni la renvoyer.
app.post('/shares', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; sealedShare?: SealedBox };
  if (!body?.walletId || !body.clientId || !body.sealedShare) {
    return reply.code(400).send({ mock: true, error: 'walletId, clientId et sealedShare requis' });
  }
  if (shares()[body.walletId]) {
    return reply.code(409).send({ mock: true, error: 'Une part existe déjà pour ce wallet' });
  }
  try {
    const share = await openSealed(body.sealedShare, (await partnerKey()).privateKey);
    if (share.trim().split(/\s+/).length < 20) throw new Error('format');
  } catch {
    audit('share.refused', { walletId: body.walletId, reason: 'part illisible pour le partenaire' });
    return reply.code(400).send({ mock: true, error: 'Part illisible : elle doit être scellée pour le partenaire' });
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

// Statut d'une part (jamais son contenu) : qui la détient, et où en est une éventuelle invitation.
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

// --- Personne de confiance : invitation, acceptation, confirmation par le client, remise de la part.

// Le client invite une personne de confiance. MOCK : le partenaire croit le clientId fourni ; en
// production, son propre contrôle d'identité, un délai et une notification avant toute remise.
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

// Lu par le client (suivi) et par la personne de confiance (son portail). La part n'y figure que
// scellée pour la clé de cette personne.
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

// La personne de confiance accepte : elle envoie la clé publique créée sur son appareil.
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

// Le client confirme (après avoir comparé le code de la clé avec la personne) : le partenaire
// re-scelle la part pour la clé de cette personne. Elle ne transite jamais en clair.
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

// La personne de confiance confirme qu'elle a sa part : le partenaire détruit sa copie.
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

// Annulation par le client tant que la part n'a pas été remise.
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

// Demande de libération de la part TIERS depuis un nouvel appareil. Le partenaire ne dépend pas de
// Swissquote : il fait son propre contrôle d'identité (MOCK) et applique son propre délai.
app.post('/release', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; devicePublicKey?: JsonWebKey };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  if (!share || share.clientId !== body.clientId || !body.devicePublicKey) {
    return reply.code(404).send({ mock: true, error: 'Aucune part pour ce wallet et ce client' });
  }
  try {
    await sealFor(body.devicePublicKey, 'check');
  } catch {
    return reply.code(400).send({ mock: true, error: 'Clé publique P-256 de l’appareil requise' });
  }
  const active = Object.values(releases()).find((r) => r.walletId === share.walletId && r.status === 'pending');
  if (active) return reply.code(409).send({ mock: true, error: 'Une libération est déjà en cours', releaseId: active.id });
  const ticket: ReleaseTicket = {
    id: randomUUID(),
    walletId: share.walletId,
    clientId: share.clientId,
    devicePublicKey: body.devicePublicKey,
    status: 'pending',
    identityCheck: 'MOCK : contrôle d’identité du partenaire supposé réussi',
    createdAt: new Date().toISOString(),
    executeAfter: Date.now() + RELEASE_DELAY_SECONDS * 1000,
  };
  saveRelease(ticket);
  audit('release.requested', { walletId: ticket.walletId, releaseId: ticket.id, identityCheck: ticket.identityCheck });
  notify(
    ticket.walletId,
    `Demande de libération de votre part de secours. Elle sera transmise dans ${RELEASE_DELAY_SECONDS} s, ` +
      `chiffrée pour le nouvel appareil. Si ce n'est pas vous, annulez.`,
  );
  return { mock: true, releaseId: ticket.id, executeAfter: new Date(ticket.executeAfter).toISOString() };
});

// Après le délai : la part est re-scellée pour la clé publique du nouvel appareil (jamais en clair).
app.get('/release/:id', async (req, reply) => {
  const t = releases()[(req.params as { id: string }).id];
  if (!t) return reply.code(404).send({ mock: true, error: 'Demande inconnue' });
  if (t.status === 'cancelled') return { mock: true, status: 'cancelled' };
  const record = shares()[t.walletId];
  if (!record) return reply.code(404).send({ mock: true, error: 'Part introuvable pour ce wallet' });
  // Part détenue par une personne de confiance : le partenaire n'a rien à ouvrir, il attend qu'elle
  // approuve la demande et fournisse la part scellée pour l'appareil. Son délai s'applique quand même.
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
    notify(t.walletId, 'Votre part de secours a été transmise, chiffrée pour votre nouvel appareil.');
  }
  return { mock: true, status: 'released', sealedForDevice };
});

// La personne de confiance approuve une demande : elle fournit sa part, scellée sur son appareil
// pour la clé du nouvel appareil du client. Le lien d'invitation sert de preuve (MOCK : en
// production, authentification forte de cette personne).
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

// Annulation. MOCK : sans authentification (lien dans le message du partenaire). Un voleur pourrait
// annuler une libération légitime : simple retard, jamais de perte (documenté dans les menaces).
app.post('/release/:id/cancel', async (req, reply) => {
  const t = releases()[(req.params as { id: string }).id];
  if (!t) return reply.code(404).send({ mock: true, error: 'Demande inconnue' });
  if (t.status !== 'pending') return reply.code(409).send({ mock: true, error: `Demande déjà ${t.status}` });
  saveRelease({ ...t, status: 'cancelled' });
  audit('release.cancelled', { walletId: t.walletId, releaseId: t.id });
  notify(t.walletId, 'Libération de votre part de secours annulée.');
  return { mock: true, status: 'cancelled' };
});

// Annulation de toute libération en cours pour un wallet : appelée par l'app quand le client annule
// une récupération chez Swissquote (sinon l'appareil qui l'avait lancée recevrait quand même la part,
// et toute nouvelle demande serait refusée). MOCK : même niveau de confiance que l'annulation par lien.
app.post('/releases/cancel', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  if (!share || share.clientId !== body.clientId) {
    return reply.code(404).send({ mock: true, error: 'Aucune part pour ce wallet et ce client' });
  }
  const pending = Object.values(releases()).filter((r) => r.walletId === share.walletId && r.status === 'pending');
  for (const t of pending) {
    saveRelease({ ...t, status: 'cancelled' });
    audit('release.cancelled', { walletId: t.walletId, releaseId: t.id, via: 'client' });
  }
  if (pending.length) notify(share.walletId, 'Libération de votre part de secours annulée.');
  return { mock: true, cancelled: pending.length };
});

app.get('/notifications/:walletId', async (req) => {
  const all = readJson<Record<string, unknown[]>>('notifications.json', {});
  return { mock: true, notifications: all[(req.params as { walletId: string }).walletId] ?? [] };
});

// Démo uniquement : vide le stockage du service (une nouvelle clé de partenaire est générée).
app.post('/admin/reset', async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  audit('reset');
  return { mock: true, reset: true };
});

const port = Number(process.env.PARTNER_PORT ?? 4002);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${NAME}] écoute sur http://localhost:${port}`);
