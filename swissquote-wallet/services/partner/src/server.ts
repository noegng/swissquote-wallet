// [MOCK] Service partenaire : détient la part SLIP-39 du groupe TIERS (chiffrée), la libère
// après contrôle d'identité mocké et délai, chiffrée pour l'appareil du client.
// Processus séparé avec son propre stockage (data/). Ne dépend pas de Swissquote.
// Routes métier à écrire pendant le hackathon : voir la skill mock-service.
import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'partner';

const DATA_DIR = join(import.meta.dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

function audit(action: string, details: Record<string, unknown> = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), service: NAME, action, ...details });
  appendFileSync(join(DATA_DIR, 'audit.jsonl'), line + '\n');
  console.log(`[MOCK ${NAME}] ${action}`, details);
}

const app = Fastify();
await app.register(cors, { origin: process.env.ORIGIN ?? 'http://localhost:5173' });

app.get('/health', async () => ({ mock: true, service: NAME, ok: true }));

// Démo uniquement : vide le stockage du service.
app.post('/admin/reset', async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  audit('reset');
  return { mock: true, reset: true };
});

const port = Number(process.env.PARTNER_PORT ?? 4002);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${NAME}] écoute sur http://localhost:${port}`);
