// Envoie des bitcoins regtest à une adresse via Chopsticks (POST /faucet), puis un bloc est miné.
// Usage : npm run regtest:faucet -- <adresse bcrt1...>
const address = process.argv[2];
if (!address) {
  console.error('Usage : npm run regtest:faucet -- <adresse bcrt1...>');
  process.exit(1);
}
const base = process.env.ESPLORA_URL_REGTEST ?? 'http://localhost:3000';
const res = await fetch(`${base}/faucet`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address }),
});
console.log(res.status, await res.text());
