import { useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { sq, type Session } from '../api';

export interface PasskeyInfo {
  credentialDeviceType: string;
  synced: boolean;
  /** Identifiant de la passkey créée sur cet appareil (déclaré à Swissquote en récupération). */
  credentialId: string;
}

function explain(err: unknown): string {
  if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') return 'Création annulée.';
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'Création annulée ou délai dépassé. Réessayez et validez avec Windows Hello, Touch ID ou Face ID.';
  }
  if (err instanceof WebAuthnError && err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'Une passkey de votre compte existe déjà sur cet appareil (par exemple synchronisée par iCloud ou Google).';
  }
  return (err as Error).message;
}

export function Passkey({
  session,
  onDone,
  title = 'Créez votre passkey',
  allowExisting = false,
}: {
  session: Session;
  onDone: (info: PasskeyInfo) => void;
  title?: string;
  /** Récupération : si l'appareil a déjà une passkey du client, proposer de l'utiliser. */
  allowExisting?: boolean;
}) {
  const [platform, setPlatform] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(false);

  async function useExisting() {
    setBusy(true);
    setError('');
    try {
      const optionsJSON = await sq('/webauthn/device/options', {}, session.token);
      const response = await startAuthentication({ optionsJSON });
      const r = await sq<{ credentialId: string }>('/webauthn/device/verify', { response }, session.token);
      onDone({ credentialDeviceType: 'multiDevice', synced: true, credentialId: r.credentialId });
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    platformAuthenticatorIsAvailable().then(setPlatform).catch(() => setPlatform(false));
  }, []);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const optionsJSON = await sq('/webauthn/register/options', {}, session.token);
      const response = await startRegistration({ optionsJSON });
      const info = await sq<Omit<PasskeyInfo, 'credentialId'>>('/webauthn/register/verify', { response }, session.token);
      onDone({ ...info, credentialId: response.id });
    } catch (err) {
      if (err instanceof WebAuthnError && err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') setExisting(true);
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
      <h1>{title}</h1>
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
      {existing && allowExisting ? (
        <button className="primary" onClick={useExisting} disabled={busy}>
          {busy ? 'Validation sur l’appareil…' : 'Utiliser la passkey déjà présente sur cet appareil'}
        </button>
      ) : (
        <button className="primary" onClick={create} disabled={busy}>
          {busy ? 'Validation sur l’appareil…' : 'Créer ma passkey'}
        </button>
      )}
    </div>
  );
}
