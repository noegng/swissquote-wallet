import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// The .env lives at the root of the monorepo (next to .env.example); failing that, at the root of the
// git repository, one level up. Paths are resolved from this file, not from the launch folder.
const monorepo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envDir = [monorepo, resolve(monorepo, '..')].find((d) => existsSync(join(d, '.env'))) ?? monorepo;

export default defineConfig(({ mode }) => {
  // Only what is public is passed to the app.
  const env = loadEnv(mode, envDir, '');
  const raw = env.BTC_NETWORK?.trim() || 'regtest';
  if (raw !== 'regtest' && raw !== 'signet') {
    throw new Error(`BTC_NETWORK=${env.BTC_NETWORK} is invalid in ${join(envDir, '.env')}: use regtest or signet`);
  }
  const network = raw;
  console.log(`[web] Bitcoin network: ${network} (${existsSync(join(envDir, '.env')) ? join(envDir, '.env') : 'no .env found'})`);
  const config = {
    network,
    esploraUrl: network === 'signet' ? env.ESPLORA_URL_SIGNET : env.ESPLORA_URL_REGTEST,
    swissquoteUrl: `http://localhost:${env.SWISSQUOTE_PORT || 4001}`,
    partnerUrl: `http://localhost:${env.PARTNER_PORT || 4002}`,
  };
  return {
    plugins: [
      react(),
      // shamir-mnemonic-ts uses Node's crypto module (randomBytes, pbkdf2Sync, createHmac):
      // crypto-browserify and Buffer polyfills for the browser.
      nodePolyfills({
        include: ['crypto', 'buffer', 'stream', 'util', 'process', 'vm'],
        globals: { Buffer: true, process: true },
      }),
    ],
    define: { __SQW_CONFIG__: JSON.stringify(config) },
    // envDir: Vite watches this .env and restarts when it changes (network, API URL).
    envDir,
    server: { port: 5173, strictPort: true },
  };
});
