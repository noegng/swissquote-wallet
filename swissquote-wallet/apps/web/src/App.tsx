import { useEffect, useState } from 'react';
import { runCoreSpike } from './spikeCore';

// Écrans à construire pendant le hackathon (docs/09-plan-de-build.md) :
// Onboarding, Accueil, Envoyer, Récupération, Kit de sortie, panneau Démo.

const SERVICES = [
  { name: 'Swissquote', url: 'http://localhost:4001/health' },
  { name: 'Partenaire', url: 'http://localhost:4002/health' },
];

export function App() {
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [coreSpike] = useState(() => {
    try {
      return runCoreSpike();
    } catch (e) {
      return `ÉCHEC : ${String(e)}`;
    }
  });

  useEffect(() => {
    for (const s of SERVICES) {
      fetch(s.url)
        .then((r) => r.json())
        .then((j) => setStatus((prev) => ({ ...prev, [s.name]: Boolean(j.ok) })))
        .catch(() => setStatus((prev) => ({ ...prev, [s.name]: false })));
    }
  }, []);

  return (
    <div className="phone">
      <div className="mock-banner">PROTOTYPE · services Swissquote et partenaire MOCKÉS</div>
      <main>
        <h1>Swissquote Wallet</h1>
        <p>Vos bitcoins, vos clés, à un pas de votre compte.</p>
        <ul>
          {SERVICES.map((s) => (
            <li key={s.name}>
              {s.name} : {status[s.name] === undefined ? '…' : status[s.name] ? 'en ligne' : 'hors ligne'}
            </li>
          ))}
          <li data-testid="core-spike">Cœur : {coreSpike}</li>
        </ul>
      </main>
    </div>
  );
}
