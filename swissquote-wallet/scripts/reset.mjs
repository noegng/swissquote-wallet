// Reset between two demo rehearsals (skill demo-run).
// Calls POST /admin/reset on each running mocked service.
const services = [
  ['swissquote', `http://localhost:${process.env.SWISSQUOTE_PORT ?? 4001}`],
  ['partner', `http://localhost:${process.env.PARTNER_PORT ?? 4002}`],
];

for (const [name, url] of services) {
  try {
    const res = await fetch(`${url}/admin/reset`, { method: 'POST' });
    console.log(`${name}: ${res.ok ? 'reset' : `error ${res.status}`}`);
  } catch {
    console.log(`${name}: service not running (nothing to do)`);
  }
}
console.log('Remember to clear the app storage too: DevTools > Application > Clear site data.');
