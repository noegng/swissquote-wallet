// [MOCK] Service Swissquote : KYC mocké, passkeys, cosignataire avec règles, récupération,
// notifications « hors bande ». Processus séparé avec son propre stockage (data/).
// Routes métier à écrire pendant le hackathon : voir la skill mock-service.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'swissquote';
try {
  process.loadEnvFile(join(import.meta.dirname, '../../../.env'));
} catch {
  // pas de .env : valeurs par défaut
}

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

const port = Number(process.env.SWISSQUOTE_PORT ?? 4001);
await app.listen({ port, host: '127.0.0.1' });
console.log(`[MOCK ${NAME}] écoute sur http://localhost:${port}`);
