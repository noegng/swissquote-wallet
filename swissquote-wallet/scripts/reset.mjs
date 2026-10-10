// Remise à zéro entre deux répétitions de la démo (skill demo-run).
// Appelle POST /admin/reset sur chaque service mocké lancé.
const services = [
  ['swissquote', `http://localhost:${process.env.SWISSQUOTE_PORT ?? 4001}`],
  ['partner', `http://localhost:${process.env.PARTNER_PORT ?? 4002}`],
];

for (const [name, url] of services) {
  try {
    const res = await fetch(`${url}/admin/reset`, { method: 'POST' });
    console.log(`${name} : ${res.ok ? 'remis à zéro' : `erreur ${res.status}`}`);
  } catch {
    console.log(`${name} : service non lancé (rien à faire)`);
  }
}
console.log("Penser à vider le stockage local de l'app : DevTools > Application > Clear site data.");
