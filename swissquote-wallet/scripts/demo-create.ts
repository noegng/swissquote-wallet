// End-to-end wallet creation, without a browser (services running: npm run dev:all).
// Usage: npm run demo:create
// Same sequence as the app: login → passkey → keys → Swissquote → PARTNER share sealed for the
// partner → C2 encrypted with a passphrase → checks.
import { join } from 'node:path';
import {
  backupRootFromShares,
  accountOrigin,
  createWalletMaterial,
  networkConfig,
  openWithPassphrase,
  sealFor,
  sealWithPassphrase,
  type WalletPolicy,
} from '../packages/core/src/index';
import { SoftAuthenticator } from './lib/soft-authenticator';

try {
  process.loadEnvFile(join(import.meta.dirname, '../.env'));
} catch {}

const SQ = `http://localhost:${process.env.SWISSQUOTE_PORT ?? 4001}`;
const PARTNER = `http://localhost:${process.env.PARTNER_PORT ?? 4002}`;
const cfg = networkConfig('regtest');

async function post(url: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`${url} : ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const get = async (url: string) => (await fetch(url)).json() as Promise<any>;

const clientId = `client-${Date.now()}`;
const { token } = await post(`${SQ}/kyc/login`, { clientId });
const passkey = await SoftAuthenticator.create(process.env.ORIGIN?.split(',')[0], process.env.RP_ID);
await post(`${SQ}/webauthn/register/verify`, { response: await passkey.register(await post(`${SQ}/webauthn/register/options`, {}, token)) }, token);
console.log(`1. Logged in (${clientId}) and passkey registered`);

const m = createWalletMaterial(cfg.network);
const created = await post(`${SQ}/wallets`, { phoneKey: m.phoneKey, backupKey: m.backupKey }, token);
const policy: WalletPolicy = created.policy;
console.log(`2. Wallet ${created.walletId}\n   address ${created.firstAddress}`);

const { publicKey } = await get(`${PARTNER}/public-key`);
const deposit = await post(`${PARTNER}/shares`, {
  walletId: created.walletId,
  clientId,
  sealedShare: await sealFor(publicKey, m.shares.tiers),
});
console.log(`3. PARTNER share sealed and deposited with the partner: ${deposit.stored}`);

const c2 = await sealWithPassphrase('demo passphrase', m.shares.client);
console.log(`4. C1 (paper): ${m.shares.client.split(' ').slice(0, 3).join(' ')} … (${m.shares.client.split(' ').length} words)`);
console.log(`   C2 (cloud): encrypted box ${c2.alg}, ${c2.ct.length} characters`);

// Checks
const sqKnowsBackup = JSON.stringify(policy.keys[2]) === JSON.stringify(m.backupKey);
const restored = backupRootFromShares([await openWithPassphrase(c2, 'demo passphrase'), m.shares.tiers], cfg.network);
const status = await get(`${PARTNER}/shares/${created.walletId}`);
console.log('\nChecks');
console.log(`   Swissquote registered the backup public key: ${sqKnowsBackup}`);
console.log(`   decrypted C2 + PARTNER share → same backup key: ${JSON.stringify(accountOrigin(restored)) === JSON.stringify(m.backupKey)}`);
console.log(`   The partner confirms the deposit without revealing the share: ${status.exists && !('sealedShare' in status)}`);
