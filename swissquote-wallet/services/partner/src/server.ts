// [MOCK] Service partenaire (fiduciaire indépendante) : détient la part SLIP-39 du groupe TIERS.
// Seul, il ne peut rien : sans la part CLIENT, la clé de secours ne se reconstitue pas (I2).
// Processus séparé avec son propre stockage (data/). Ne dépend pas de Swissquote : il doit
// fonctionner si Swissquote a disparu.
// Libération (récupération) : contrôle d'identité MOCK, délai, notification, puis la part est
// re-scellée pour la clé éphémère du nouvel appareil : elle ne transite jamais en clair.
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
  sealedShare: SealedBox;
  depositedAt: string;
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
}

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

// Statut d'une part (jamais son contenu).
app.get('/shares/:walletId', async (req) => {
  const record = shares()[(req.params as { walletId: string }).walletId];
  return { mock: true, exists: !!record, depositedAt: record?.depositedAt ?? null };
});

// Demande de libération de la part TIERS depuis un nouvel appareil. Le partenaire ne dépend pas de
// Swissquote : il fait son propre contrôle d'identité (MOCK) et applique son propre délai.
app.post('/release', async (req, reply) => {
  const body = req.body as { walletId?: string; clientId?: string; devicePublicKey?: JsonWebKey };
  const share = body?.walletId ? shares()[body.walletId] : undefined;
  if (!share || share.clientId !== body.clientId || !body.devicePublicKey) {
    return reply.code(404).send({ mock: true, error: 'Aucune part pour ce wallet et ce client' });
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
  if (secondsLeft(t) > 0) return { mock: true, status: 'pending', secondsLeft: secondsLeft(t) };
  const share = await openSealed(shares()[t.walletId].sealedShare, (await partnerKey()).privateKey);
  const sealedForDevice = await sealFor(t.devicePublicKey, share);
  if (t.status !== 'released') {
    saveRelease({ ...t, status: 'released' });
    audit('release.delivered', { walletId: t.walletId, releaseId: t.id });
    notify(t.walletId, 'Votre part de secours a été transmise, chiffrée pour votre nouvel appareil.');
  }
  return { mock: true, status: 'released', sealedForDevice };
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
