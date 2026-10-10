import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Le .env est à la racine du monorepo (à côté de .env.example) ; à défaut, à la racine du dépôt git,
// un niveau au-dessus. Chemins résolus depuis ce fichier, pas depuis le dossier de lancement.
const monorepo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envDir = [monorepo, resolve(monorepo, '..')].find((d) => existsSync(join(d, '.env'))) ?? monorepo;

export default defineConfig(({ mode }) => {
  // On ne transmet à l'app que ce qui est public.
  const env = loadEnv(mode, envDir, '');
  const raw = env.BTC_NETWORK?.trim() || 'regtest';
  if (raw !== 'regtest' && raw !== 'signet') {
    throw new Error(`BTC_NETWORK=${env.BTC_NETWORK} invalide dans ${join(envDir, '.env')} : regtest ou signet`);
  }
  const network = raw;
  console.log(`[web] réseau Bitcoin : ${network} (${existsSync(join(envDir, '.env')) ? join(envDir, '.env') : 'aucun .env trouvé'})`);
  const config = {
    network,
    esploraUrl: network === 'signet' ? env.ESPLORA_URL_SIGNET : env.ESPLORA_URL_REGTEST,
    swissquoteUrl: `http://localhost:${env.SWISSQUOTE_PORT || 4001}`,
    partnerUrl: `http://localhost:${env.PARTNER_PORT || 4002}`,
  };
  return {
    plugins: [
      react(),
      // shamir-mnemonic-ts utilise le module crypto de Node (randomBytes, pbkdf2Sync, createHmac) :
      // polyfills crypto-browserify et Buffer pour le navigateur.
      nodePolyfills({
        include: ['crypto', 'buffer', 'stream', 'util', 'process', 'vm'],
        globals: { Buffer: true, process: true },
      }),
    ],
    define: { __SQW_CONFIG__: JSON.stringify(config) },
    // envDir : Vite surveille ce .env et redémarre quand il change (réseau, URL de l'API).
    envDir,
    server: { port: 5173, strictPort: true },
  };
});
