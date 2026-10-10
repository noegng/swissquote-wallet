import { useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { sq, type Session } from '../api';
import { Btn, Group, Icon, Row, Screen, Title } from '../ui';

export interface PasskeyInfo {
  credentialDeviceType: string;
  synced: boolean;
  /** Identifiant de la passkey créée sur cet appareil (déclaré à Swissquote en récupération). */
  credentialId: string;
}

function explain(err: unknown): string {
  if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') return 'Passkey creation cancelled.';
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return 'Cancelled or timed out. Try again and confirm with Windows Hello, Touch ID or Face ID.';
  }
  if (err instanceof WebAuthnError && err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return 'This device already holds a passkey for your account (for example synced by iCloud or Google).';
  }
  return (err as Error).message;
}

export function Passkey({
  session,
  onDone,
  title = 'Create your passkey',
  allowExisting = false,
  onBack,
}: {
  session: Session;
  onDone: (info: PasskeyInfo) => void;
  title?: string;
  /** Récupération : si l'appareil a déjà une passkey du client, proposer de l'utiliser. */
  allowExisting?: boolean;
  /** Retour à l’écran précédent (connexion, ou début de la récupération). */
  onBack?: () => void;
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
      <Screen title="Passkey" onBack={onBack}>
        <Title
          title="Browser not supported"
          lead="This browser cannot use passkeys. Use a recent version of Chrome, Edge or Safari."
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Passkey"
      onBack={onBack}
      footer={
        existing && allowExisting ? (
          <Btn icon="face" onClick={useExisting} disabled={busy}>
            {busy ? 'Confirm on your device…' : 'Use the passkey on this device'}
          </Btn>
        ) : (
          <Btn icon="face" onClick={create} disabled={busy}>
            {busy ? 'Confirm on your device…' : 'Create your passkey'}
          </Btn>
        )
      }
    >
      <div className="hero start">
        <span className="glyph plain">
          <Icon name="face" size={36} stroke={1.75} />
        </span>
      </div>
      <Title
        title={title}
        lead="Approve payments with your face, fingerprint or device passcode instead of a password."
      />
      <Group>
        <Row icon="phone" title="Stored on this device only" />
        <Row icon="check" title="One approval per payment" />
        <Row icon="bank" title="Swissquote cannot approve for you" />
      </Group>
      {platform === false && (
        <p className="note">
          No biometric sensor found on this device: Chrome will offer a security key or a phone instead. For the
          demo, see the virtual authenticator in docs/00-demarrage.md.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </Screen>
  );
}
