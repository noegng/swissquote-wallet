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
import { Brand, Screen } from './ui';

// Parcours : connexion Swissquote (mock) → passkey → création du wallet → accueil ⇄ envoi.
// Nouvel appareil (wallet existant chez Swissquote, absent ici) → récupération.
// Deux présentations du même parcours : cadre de téléphone (app) ou page web (grand écran).
// Depuis la connexion, sans session : « Swissquote a disparu » → sortie avec téléphone + secours.

type Layout = 'phone' | 'web';

const LAYOUT_KEY = 'sqw.layout';

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'web' ? 'web' : 'phone';
  } catch {
    return 'phone';
  }
}

export function App() {
  const [layout, setLayout] = useState<Layout>(loadLayout);
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
      // Le plus récent des wallets non récupérés (un client peut en avoir plusieurs).
      .then((ws) =>
        setRemote(
          [...ws].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((w) => w.status !== 'recovered') ?? null,
        ),
      )
      .catch(() => setRemote(null));
  }, [session, wallet]);

  function chooseLayout(l: Layout) {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      // stockage indisponible : le choix vaut pour cette visite
    }
  }

  function updateSession(s: Session | null) {
    saveSession(s);
    setSession(s);
  }

  const loading = (
    <Screen>
      <p className="note">Loading…</p>
    </Screen>
  );

  let screen;
  if (!session && view === 'exit') {
    // Sortie sans Swissquote : aucune session, aucun appel au service Swissquote.
    screen = <Exit onBack={() => setView('home')} />;
  } else if (!session) {
    screen = <Login onLogin={updateSession} onExit={() => setView('exit')} />;
  } else if (!session.hasPasskey) {
    screen = <Passkey session={session} onDone={() => updateSession({ ...session, hasPasskey: true })} />;
  } else if (wallet === undefined) {
    screen = loading;
  } else if (wallet === null && remote === undefined) {
    screen = loading;
  } else if (wallet === null && remote && !createInstead) {
    screen = (
      <Recover session={session} remote={remote} onRecovered={setWallet} onCreateInstead={() => setCreateInstead(true)} />
    );
  } else if (wallet === null) {
    screen = <CreateWallet session={session} onCreated={setWallet} />;
  } else if (view === 'send') {
    screen = <Send wallet={wallet} onBack={() => setView('home')} />;
  } else {
    screen = (
      <Home wallet={wallet} session={session} onSend={() => setView('send')} onLogout={() => updateSession(null)} />
    );
  }

  return (
    <div className={layout === 'web' ? 'stage web' : 'stage'}>
      <header className="topbar">
        <p className="mock-banner">Prototype. The Swissquote and partner services are mocked.</p>
        <div className="topbar-row">
          <Brand />
          <div className="segmented layout-switch" role="group" aria-label="Layout">
            {(
              [
                ['phone', 'App'],
                ['web', 'Web'],
              ] as const
            ).map(([l, label]) => (
              <button
                key={l}
                type="button"
                aria-pressed={l === layout}
                className={l === layout ? 'on' : undefined}
                onClick={() => chooseLayout(l)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="phone">
        <div className="statusbar" aria-hidden="true">
          <span>9:41</span>
          <span className="indicators">
            <span className="signal">
              {[5, 7, 9, 11].map((h) => (
                <i key={h} style={{ height: h }} />
              ))}
            </span>
            <span className="battery">
              <i />
            </span>
          </span>
        </div>
        {screen}
      </div>
    </div>
  );
}
