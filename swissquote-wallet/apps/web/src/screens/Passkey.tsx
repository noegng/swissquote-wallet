import { useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { sq, type Session } from '../api';

export interface PasskeyInfo {
  credentialDeviceType: string;
  synced: boolean;
}

function explain(err: unknown): string {
  if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') return 'Création annulée.';
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'Création annulée ou délai dépassé. Réessayez et validez avec Windows Hello, Touch ID ou Face ID.';
  }
  if (err instanceof WebAuthnError && err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'Une passkey existe déjà sur cet appareil pour ce compte.';
  }
  return (err as Error).message;
}

export function Passkey({ session, onDone }: { session: Session; onDone: (info: PasskeyInfo) => void }) {
  const [platform, setPlatform] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformAuthenticatorIsAvailable().then(setPlatform).catch(() => setPlatform(false));
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const optionsJSON = await sq('/webauthn/register/options', {}, session.token);
      const response = await startRegistration({ optionsJSON });
      const info = await sq<PasskeyInfo>('/webauthn/register/verify', { response }, session.token);
      onDone(info);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  if (!browserSupportsWebAuthn()) {
    return (
      <div className="screen">
        <h1>Navigateur non compatible</h1>
        <p>Ce navigateur ne gère pas les passkeys. Utilisez une version récente de Chrome, Edge ou Safari.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="eyebrow">Bonjour {session.clientId}</p>
      <h1>Créez votre passkey</h1>
      <p>
        Votre passkey remplace le mot de passe. Elle est créée et gardée dans la puce sécurisée de cet
        appareil, et ne la quitte jamais.
      </p>
      <ul className="facts">
        <li>Vous approuvez chaque paiement avec votre visage, votre empreinte ou votre code.</li>
        <li>Chaque approbation vaut pour un seul paiement précis : impossible de la réutiliser.</li>
        <li>Swissquote vérifie la passkey, mais ne peut rien signer à votre place.</li>
      </ul>
      {platform === false && (
        <p className="note">
          Aucun capteur détecté sur cet appareil : Chrome proposera une clé de sécurité ou un téléphone.
          Pour la démo, voir « authentificateur virtuel » dans docs/00-demarrage.md.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={create} disabled={busy}>
        {busy ? 'Validation sur l’appareil…' : 'Créer ma passkey'}
      </button>
    </div>
  );
}
