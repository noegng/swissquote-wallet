// Charge le .env du monorepo avant tout autre module (les règles lisent process.env à l'import).
// Cherché dans le dossier du monorepo (à côté de .env.example), puis dans le dossier parent (racine
// du dépôt git), pour qu'un .env posé un niveau trop haut ne soit pas ignoré en silence.
// Les variables déjà définies dans l'environnement gardent la priorité
// (process.loadEnvFile les écraserait, d'où parseEnv).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const candidates = [join(import.meta.dirname, '../../../.env'), join(import.meta.dirname, '../../../../.env')];
export const ENV_FILE = candidates.find((f) => existsSync(f)) ?? null;
if (ENV_FILE) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(ENV_FILE, 'utf8')))) {
    process.env[key] ??= value;
  }
}

// Réseau Bitcoin : une valeur mal écrite ne doit pas retomber en silence sur regtest.
const network = process.env.BTC_NETWORK?.trim() || 'regtest';
if (network !== 'regtest' && network !== 'signet') {
  throw new Error(`BTC_NETWORK=${process.env.BTC_NETWORK} invalide dans ${ENV_FILE ?? 'l’environnement'} : regtest ou signet`);
}
process.env.BTC_NETWORK = network;
console.log(`[MOCK] réseau Bitcoin : ${network} (${ENV_FILE ?? 'aucun .env trouvé, valeurs par défaut'})`);
