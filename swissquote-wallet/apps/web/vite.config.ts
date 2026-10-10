import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  // Le .env est à la racine du monorepo : on en transmet à l'app uniquement ce qui est public.
  const env = loadEnv(mode, '../..', '');
  const network = env.BTC_NETWORK === 'signet' ? 'signet' : 'regtest';
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
    server: { port: 5173, strictPort: true },
  };
});
