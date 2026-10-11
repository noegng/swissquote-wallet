// H0 spike: a real 2-of-3 transaction (phone key + Swissquote key) on regtest or signet.
// Usage: npm run spike            (BTC_NETWORK from .env, regtest by default)
//        npm run spike:signet     (forces signet, whatever the terminal)
// The test seeds are kept in scripts/.spike/<network>.json (gitignored) so that the address can
// be funded from a faucet before running the script again. Test networks only.
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

// Seeds stored for this network
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
console.log(`Network     : ${name} (${cfg.esploraUrl})`);
console.log(`Descriptor  : ${descriptorString(policy, 0)}`);
console.log(`2-of-3 addr : ${receive.address}`);

let utxos = await esplora.scanWallet(policy, cfg.network, 3);
if (utxos.length === 0) {
  if (name === 'regtest') {
    console.log('No funds: funding from the regtest faucet…');
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
    console.log(`\nNo funds. Send signet sats to ${receive.address}`);
    console.log('Faucet: https://bitcoinsignetfaucet.com — then run again: npm run spike:signet');
    process.exit(0);
  }
}
const balance = utxos.reduce((s, u) => s + u.value, 0n);
console.log(`Balance     : ${balance} sats in ${utxos.length} UTXO(s)`);

// Sends a small amount to an address outside the wallet (the backup key of another set will do).
const other = rootFromSeed(randomSeed(), cfg.network);
const destination = deriveAddress(
  { threshold: 2, keys: [accountOrigin(other), accountOrigin(other, 1), accountOrigin(other, 2)] },
  0,
  0,
  cfg.network,
).address;
// Small balance (signet faucet: often 1,000 sats): 400 sats, just above dust (330).
const amount = balance > 20_000n ? 5_000n : 400n;
// Signet estimates are sometimes absurd (68 sat/vB seen on 10/10): with a small
// balance we use 2 sat/vB, so confirmation may take a few blocks.
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
console.log(`Sending     : ${amount} sats → ${destination} (fee ${fee}, change ${change})`);

// The app signs with the phone key; Swissquote signs its own copy; then we combine.
const appCopy = signWithRoot(psbt.clone(), phone).toBase64();
const sqCopy = signWithRoot(psbtFromBase64(psbt.toBase64(), cfg.network), swissquote).toBase64();
const { hex, txid } = finalizeSpend(combinePsbts([appCopy, sqCopy], cfg.network));
const broadcastTxid = await esplora.broadcast(hex);
console.log(`\nTransaction broadcast: ${broadcastTxid}`);
console.log(`Explorer             : ${cfg.explorerTxUrl(txid)}`);
