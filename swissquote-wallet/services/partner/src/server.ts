// [MOCK] Service partenaire (fiduciaire indépendante) : détient la part SLIP-39 du groupe TIERS.
// Seul, il ne peut rien : sans la part CLIENT, la clé de secours ne se reconstitue pas (I2).
// Processus séparé avec son propre stockage (data/). Ne dépend pas de Swissquote : il doit
// fonctionner si Swissquote a disparu. À venir : libération de la part (récupération).
import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exportPublicJwk,
  generateSealingKeyPair,
  importPrivateJwk,
  openSealed,
  type SealedBox,
} from '@sqw/core';

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
