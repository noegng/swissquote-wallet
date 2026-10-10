import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // shamir-mnemonic-ts utilise le module crypto de Node (randomBytes, pbkdf2Sync, createHmac) :
    // polyfills crypto-browserify et Buffer pour le navigateur.
    nodePolyfills({ include: ['crypto', 'buffer', 'stream', 'util', 'process', 'vm'], globals: { Buffer: true, process: true } }),
  ],
  server: { port: 5173, strictPort: true },
});
