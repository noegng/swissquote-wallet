import { useEffect, useState } from 'react';
import { loadSession, saveSession, type Session } from './api';
import { loadWallet, type StoredWallet } from './keystore';
import { CreateWallet } from './screens/CreateWallet';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Passkey } from './screens/Passkey';

// Parcours : connexion Swissquote (mock) → passkey → création du wallet → accueil.
// À venir : envoi, récupération, sortie sans Swissquote.

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [wallet, setWallet] = useState<StoredWallet | null | undefined>(undefined);

  useEffect(() => {
    if (!session) return setWallet(undefined);
    loadWallet(session.clientId)
      .then((w) => setWallet(w ?? null))
      .catch(() => setWallet(null));
  }, [session]);

  function updateSession(s: Session | null) {
    saveSession(s);
    setSession(s);
  }

  let screen;
  if (!session) {
    screen = <Login onLogin={updateSession} />;
  } else if (!session.hasPasskey) {
    screen = <Passkey session={session} onDone={() => updateSession({ ...session, hasPasskey: true })} />;
  } else if (wallet === undefined) {
    screen = <p className="note">Chargement…</p>;
  } else if (wallet === null) {
    screen = <CreateWallet session={session} onCreated={setWallet} />;
  } else {
    screen = <Home wallet={wallet} onLogout={() => updateSession(null)} />;
  }

  return (
    <div className="phone">
      <div className="mock-banner">PROTOTYPE · services Swissquote et partenaire MOCKÉS</div>
      <main>{screen}</main>
    </div>
  );
}
