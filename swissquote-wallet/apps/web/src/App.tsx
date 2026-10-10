import { useState } from 'react';
import { loadSession, saveSession, type Session } from './api';
import { Login } from './screens/Login';
import { Passkey, type PasskeyInfo } from './screens/Passkey';

// Parcours : connexion Swissquote (mock) → passkey → création du wallet (à venir) → envoi → récupération.

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [passkey, setPasskey] = useState<PasskeyInfo | null>(null);

  function updateSession(s: Session | null) {
    saveSession(s);
    setSession(s);
  }

  let screen;
  if (!session) {
    screen = <Login onLogin={updateSession} />;
  } else if (!session.hasPasskey) {
    screen = (
      <Passkey
        session={session}
        onDone={(info) => {
          setPasskey(info);
          updateSession({ ...session, hasPasskey: true });
        }}
      />
    );
  } else {
    screen = (
      <div className="screen">
        <p className="eyebrow">Bonjour {session.clientId}</p>
        <h1>Passkey prête</h1>
        <p>
          {passkey
            ? passkey.synced
              ? 'Passkey créée. Elle est synchronisée par votre compte Apple ou Google (chiffrée de bout en bout).'
              : 'Passkey créée et liée à cet appareil.'
            : 'Votre passkey est enregistrée chez Swissquote.'}
        </p>
        <p className="note">Prochaine étape : création de votre wallet Bitcoin 2 sur 3.</p>
        <button className="secondary" onClick={() => updateSession(null)}>
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="mock-banner">PROTOTYPE · services Swissquote et partenaire MOCKÉS</div>
      <main>{screen}</main>
    </div>
  );
}
