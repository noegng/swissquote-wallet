// Loads the monorepo's .env before any other module (the rules read process.env at import time).
// Looked up in the monorepo folder (next to .env.example), then in the parent folder (root of
// the git repository), so that a .env placed one level too high is not silently ignored.
// Variables already set in the environment keep priority
// (process.loadEnvFile would overwrite them, hence parseEnv).
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

// Bitcoin network: a misspelled value must not silently fall back to regtest.
const network = process.env.BTC_NETWORK?.trim() || 'regtest';
if (network !== 'regtest' && network !== 'signet') {
  throw new Error(`BTC_NETWORK=${process.env.BTC_NETWORK} is invalid in ${ENV_FILE ?? 'the environment'}: use regtest or signet`);
}
process.env.BTC_NETWORK = network;
console.log(`[MOCK] Bitcoin network: ${network} (${ENV_FILE ?? 'no .env found, defaults'})`);
