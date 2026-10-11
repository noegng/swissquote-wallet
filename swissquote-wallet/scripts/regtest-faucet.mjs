// Sends regtest bitcoin to an address through Chopsticks (POST /faucet), then a block is mined.
// Usage: npm run regtest:faucet -- <bcrt1... address>
const address = process.argv[2];
if (!address) {
  console.error('Usage: npm run regtest:faucet -- <bcrt1... address>');
  process.exit(1);
}
const base = process.env.ESPLORA_URL_REGTEST ?? 'http://localhost:3000';
const res = await fetch(`${base}/faucet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address }),
});
console.log(res.status, await res.text());
