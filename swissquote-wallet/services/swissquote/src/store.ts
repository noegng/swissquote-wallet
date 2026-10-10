// [MOCK] Stockage propre du service Swissquote : fichiers JSON dans services/swissquote/data/.
// En production : base de données, et la clé maître dans un HSM.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SERVICE = 'swissquote';
export const DATA_DIR = join(import.meta.dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

export function readJson<T>(file: string, initial: T): T {
  const path = join(DATA_DIR, file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : initial;
}

export function writeJson(file: string, value: unknown): void {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

export function audit(action: string, details: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), service: SERVICE, action, ...details });
  appendFileSync(join(DATA_DIR, 'audit.jsonl'), line + '\n');
  console.log(`[MOCK ${SERVICE}] ${action}`, details);
}

export function resetData(): void {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
}
