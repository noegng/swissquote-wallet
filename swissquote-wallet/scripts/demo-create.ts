// Création d'un wallet de bout en bout, sans navigateur (services lancés : npm run dev:all).
// Usage : npm run demo:create
// Même enchaînement que l'app : connexion → passkey → clés → Swissquote → part TIERS scellée au
// partenaire → C2 chiffrée par phrase de passe → vérification.
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
console.log(`1. Connecté (${clientId}) et passkey enregistrée`);

const m = createWalletMaterial(cfg.network);
const created = await post(`${SQ}/wallets`, { phoneKey: m.phoneKey, backupKey: m.backupKey }, token);
const policy: WalletPolicy = created.policy;
console.log(`2. Wallet ${created.walletId}\n   adresse ${created.firstAddress}`);

const { publicKey } = await get(`${PARTNER}/public-key`);
const deposit = await post(`${PARTNER}/shares`, {
  walletId: created.walletId,
  clientId,
  sealedShare: await sealFor(publicKey, m.shares.tiers),
});
console.log(`3. Part TIERS scellée et déposée chez le partenaire : ${deposit.stored}`);

const c2 = await sealWithPassphrase('phrase de passe de démo', m.shares.client);
console.log(`4. C1 (papier) : ${m.shares.client.split(' ').slice(0, 3).join(' ')} … (${m.shares.client.split(' ').length} mots)`);
console.log(`   C2 (cloud)  : boîte chiffrée ${c2.alg}, ${c2.ct.length} caractères`);

// Vérifications
const sqKnowsBackup = JSON.stringify(policy.keys[2]) === JSON.stringify(m.backupKey);
const restored = backupRootFromShares([await openWithPassphrase(c2, 'phrase de passe de démo'), m.shares.tiers], cfg.network);
const status = await get(`${PARTNER}/shares/${created.walletId}`);
console.log('\nVérifications');
console.log(`   Swissquote a enregistré la clé publique de secours : ${sqKnowsBackup}`);
console.log(`   C2 déchiffrée + part TIERS → même clé de secours : ${JSON.stringify(accountOrigin(restored)) === JSON.stringify(m.backupKey)}`);
console.log(`   Le partenaire confirme le dépôt sans révéler la part : ${status.exists && !('sealedShare' in status)}`);
