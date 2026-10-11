import { useEffect, useState } from 'react';
import { loadSession, saveSession, type Session } from './api';
import { loadRecovery, loadWallet, type StoredWallet } from './keystore';
import { CreateWallet } from './screens/CreateWallet';
import { Exit } from './screens/Exit';
import { Home } from './screens/Home';
import { InviteTrustee } from './screens/InviteTrustee';
import { Login } from './screens/Login';
import { Passkey } from './screens/Passkey';
import { Recover } from './screens/Recover';
import { Send } from './screens/Send';
import { Trustee } from './screens/Trustee';
import { remoteWallets, type RemoteWallet } from './recovery';
import { Brand, Screen } from './ui';

// Flow: Swissquote login (mock) → passkey → wallet creation → home ⇄ send.
// New device (wallet known to Swissquote, missing here) → recovery.
// Two layouts of the same flow: phone frame (app) or web page (large screen).
// Invitation link (?trustee=…): the trusted person's portal, with no Swissquote account.
// From the login screen, with no session: "Swissquote is gone" → exit with phone + backup key.

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
  const [view, setView] = useState<'home' | 'send' | 'exit' | 'trustee'>('home');
  const [trusteeInvite, setTrusteeInvite] = useState(() => new URLSearchParams(location.search).get('trustee'));
  // The client's wallet known to Swissquote but missing on this device (lost phone?).
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
    Promise.all([remoteWallets(session), loadRecovery(session.clientId).catch(() => undefined)])
      .then(([ws, local]) =>
        setRemote(
          // Recovery started on this device: resume it, even if Swissquote already marked
          // the old wallet as recovered (sweep broadcast, but not finalized here yet).
          ws.find((w) => w.walletId === local?.oldWalletId) ??
            // Otherwise, the most recent wallet not yet recovered (a client can have several).
            [...ws].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((w) => w.status !== 'recovered') ??
            null,
        ),
      )
      .catch(() => setRemote(null));
  }, [session, wallet]);

  function chooseLayout(l: Layout) {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }

  function updateSession(s: Session | null) {
    saveSession(s);
    setSession(s);
    if (!s) {
      // Logout: nothing from the previous flow may steer the next login.
      setRemote(undefined);
      setCreateInstead(false);
    }
  }

  const loading = (
    <Screen>
      <p className="note">Loading…</p>
    </Screen>
  );

  let screen;
  if (trusteeInvite) {
    screen = (
      <Trustee
        inviteId={trusteeInvite}
        onClose={() => {
          history.replaceState(null, '', location.pathname);
          setTrusteeInvite(null);
        }}
      />
    );
  } else if (!session && view === 'exit') {
    // Exit without Swissquote: no session, no call to the Swissquote service.
    screen = <Exit onBack={() => setView('home')} />;
  } else if (!session) {
    screen = <Login onLogin={updateSession} onExit={() => setView('exit')} />;
  } else if (!session.hasPasskey) {
    screen = (
      <Passkey
        session={session}
        onDone={() => updateSession({ ...session, hasPasskey: true })}
        onBack={() => updateSession(null)}
      />
    );
  } else if (wallet === undefined) {
    screen = loading;
  } else if (wallet === null && remote === undefined) {
    screen = loading;
  } else if (wallet === null && remote && !createInstead) {
    screen = (
      <Recover
        session={session}
        remote={remote}
        onRecovered={setWallet}
        onCreateInstead={() => setCreateInstead(true)}
        onBack={() => updateSession(null)}
      />
    );
  } else if (wallet === null) {
    // Came from the recovery ("create a new wallet instead"): the back arrow returns there.
    screen = (
      <CreateWallet
        session={session}
        onCreated={setWallet}
        onBack={remote ? () => setCreateInstead(false) : () => updateSession(null)}
      />
    );
  } else if (view === 'send') {
    screen = <Send wallet={wallet} onBack={() => setView('home')} />;
  } else if (view === 'trustee') {
    screen = <InviteTrustee wallet={wallet} onBack={() => setView('home')} />;
  } else {
    screen = (
      <Home
        wallet={wallet}
        session={session}
        onSend={() => setView('send')}
        onTrustee={() => setView('trustee')}
        onLogout={() => updateSession(null)}
        onDiscard={() => {
          setCreateInstead(true);
          setWallet(null);
        }}
      />
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
