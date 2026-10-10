// Charge le .env du monorepo avant tout autre module (les règles lisent process.env à l'import).
// Les variables déjà définies dans l'environnement gardent la priorité
// (process.loadEnvFile les écraserait, d'où parseEnv).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const file = join(import.meta.dirname, '../../../.env');
if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    process.env[key] ??= value;
  }
}
