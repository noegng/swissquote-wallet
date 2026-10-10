// Spike H0 : vraie transaction 2 sur 3 (clé téléphone + clé Swissquote) sur regtest ou signet.
// Usage : npm run spike            (BTC_NETWORK du .env, regtest par défaut)
//         npm run spike:signet     (force signet, quel que soit le terminal)
// Les graines de test sont gardées dans scripts/.spike/<réseau>.json (gitignoré) pour pouvoir
// financer l'adresse via un faucet puis relancer le script. Réseaux de test uniquement.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Esplora,
  accountOrigin,
  buildSpend,
  combinePsbts,
  deriveAddress,
  descriptorString,
  finalizeSpend,
  fromHex,
  networkConfig,
  psbtFromBase64,
  randomSeed,
  rootFromSeed,
  signWithRoot,
  toHex,
  type BtcNetworkName,
  type WalletPolicy,
} from '../packages/core/src/index';

try {
  process.loadEnvFile(join(import.meta.dirname, '../.env'));
} catch {}

const name = (process.argv[2] ?? process.env.BTC_NETWORK ?? 'regtest') as BtcNetworkName;
const cfg = networkConfig(
  name,
  name === 'signet' ? process.env.ESPLORA_URL_SIGNET : process.env.ESPLORA_URL_REGTEST,
);
const esplora = new Esplora(cfg);

// Graines persistées pour ce réseau
const dir = join(import.meta.dirname, '.spike');
mkdirSync(dir, { recursive: true });
const seedFile = join(dir, `${name}.json`);
if (!existsSync(seedFile)) {
  const seeds = { phone: toHex(randomSeed()), swissquote: toHex(randomSeed()), backup: toHex(randomSeed()) };
  writeFileSync(seedFile, JSON.stringify(seeds, null, 2));
}
const seeds = JSON.parse(readFileSync(seedFile, 'utf8'));
const phone = rootFromSeed(fromHex(seeds.phone), cfg.network);
const swissquote = rootFromSeed(fromHex(seeds.swissquote), cfg.network);
const backup = rootFromSeed(fromHex(seeds.backup), cfg.network);
const policy: WalletPolicy = {
  threshold: 2,
  keys: [accountOrigin(phone), accountOrigin(swissquote), accountOrigin(backup)],
};

const receive = deriveAddress(policy, 0, 0, cfg.network);
console.log(`Réseau      : ${name} (${cfg.esploraUrl})`);
console.log(`Descripteur : ${descriptorString(policy, 0)}`);
console.log(`Adresse 2/3 : ${receive.address}`);

let utxos = await esplora.scanWallet(policy, cfg.network, 3);
if (utxos.length === 0) {
  if (name === 'regtest') {
    console.log('Aucun fonds : financement via le faucet regtest…');
    const res = await fetch(`${cfg.esploraUrl}/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: receive.address }),
    });
    if (!res.ok) throw new Error(`Faucet : ${res.status} ${await res.text()}`);
    for (let i = 0; i < 30 && utxos.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      utxos = await esplora.scanWallet(policy, cfg.network, 3);
    }
  } else {
    console.log(`\nAucun fonds. Envoyer des sats signet à ${receive.address}`);
    console.log('Faucet : https://bitcoinsignetfaucet.com — puis relancer : npm run spike:signet');
    process.exit(0);
  }
}
const balance = utxos.reduce((s, u) => s + u.value, 0n);
console.log(`Solde       : ${balance} sats sur ${utxos.length} UTXO`);

// Envoi d'un petit montant vers une adresse hors du wallet (la clé de secours d'un autre jeu suffit).
const other = rootFromSeed(randomSeed(), cfg.network);
const destination = deriveAddress(
  { threshold: 2, keys: [accountOrigin(other), accountOrigin(other, 1), accountOrigin(other, 2)] },
  0,
  0,
  cfg.network,
).address;
// Petit solde (faucet signet : souvent 1 000 sats) : 400 sats, juste au-dessus de la poussière (330).
const amount = balance > 20_000n ? 5_000n : 400n;
// Les estimations signet sont parfois aberrantes (68 sat/vB constaté le 10/10) : avec un petit
// solde on fixe 2 sat/vB, la confirmation peut alors prendre quelques blocs.
const feeRate = balance > 20_000n ? await esplora.feeRate() : 2;
const { psbt, fee, change } = buildSpend({
  policy,
  network: cfg.network,
  utxos,
  to: destination,
  amount,
  feeRate,
  changeIndex: 0,
});
console.log(`Envoi       : ${amount} sats → ${destination} (frais ${fee}, change ${change})`);

// L'app signe avec la clé téléphone ; Swissquote signe sa propre copie ; on combine.
const appCopy = signWithRoot(psbt.clone(), phone).toBase64();
const sqCopy = signWithRoot(psbtFromBase64(psbt.toBase64(), cfg.network), swissquote).toBase64();
const { hex, txid } = finalizeSpend(combinePsbts([appCopy, sqCopy], cfg.network));
const broadcastTxid = await esplora.broadcast(hex);
console.log(`\nTransaction diffusée : ${broadcastTxid}`);
console.log(`Explorateur          : ${cfg.explorerTxUrl(txid)}`);
