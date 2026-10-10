import { useEffect, useState } from 'react';
import { loadSession, saveSession, type Session } from './api';
import { loadWallet, type StoredWallet } from './keystore';
import { CreateWallet } from './screens/CreateWallet';
import { Exit } from './screens/Exit';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Passkey } from './screens/Passkey';
import { Recover } from './screens/Recover';
import { Send } from './screens/Send';
import { remoteWallets, type RemoteWallet } from './recovery';

// Parcours : connexion Swissquote (mock) → passkey → création du wallet → accueil ⇄ envoi.
// Nouvel appareil (wallet existant chez Swissquote, absent ici) → récupération.
// Depuis la connexion, sans session : « Swissquote a disparu » → sortie avec téléphone + secours.

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [wallet, setWallet] = useState<StoredWallet | null | undefined>(undefined);
  const [view, setView] = useState<'home' | 'send' | 'exit'>('home');
  // Wallet du client connu de Swissquote mais absent de cet appareil (téléphone perdu ?).
  const [remote, setRemote] = useState<RemoteWallet | null | undefined>(undefined);
  const [createInstead, setCreateInstead] = useState(false);

  useEffect(() => {
    if (!session) return setWallet(undefined);
    loadWallet(session.clientId)
      .then((w) => setWallet(w ?? null))
      .catch(() => setWallet(null));
  }, [session]);

  useEffect(() => {
    if (!session || wallet !== null) return;
    remoteWallets(session)
      .then((ws) => setRemote(ws.find((w) => w.status !== 'recovered') ?? null))
      .catch(() => setRemote(null));
  }, [session, wallet]);

  function updateSession(s: Session | null) {
    saveSession(s);
    setSession(s);
  }

  let screen;
  if (!session && view === 'exit') {
    // Sortie sans Swissquote : aucune session, aucun appel au service Swissquote.
    screen = <Exit onBack={() => setView('home')} />;
  } else if (!session) {
    screen = <Login onLogin={updateSession} onExit={() => setView('exit')} />;
  } else if (!session.hasPasskey) {
    screen = <Passkey session={session} onDone={() => updateSession({ ...session, hasPasskey: true })} />;
  } else if (wallet === undefined) {
    screen = <p className="note">Chargement…</p>;
  } else if (wallet === null && remote === undefined) {
    screen = <p className="note">Chargement…</p>;
  } else if (wallet === null && remote && !createInstead) {
    screen = (
      <Recover session={session} remote={remote} onRecovered={setWallet} onCreateInstead={() => setCreateInstead(true)} />
    );
  } else if (wallet === null) {
    screen = <CreateWallet session={session} onCreated={setWallet} />;
  } else if (view === 'send') {
    screen = <Send wallet={wallet} onBack={() => setView('home')} />;
  } else {
    screen = <Home wallet={wallet} onSend={() => setView('send')} onLogout={() => updateSession(null)} />;
  }

  return (
    <div className="phone">
      <div className="mock-banner">PROTOTYPE · services Swissquote et partenaire MOCKÉS</div>
      <main>{screen}</main>
    </div>
  );
}
