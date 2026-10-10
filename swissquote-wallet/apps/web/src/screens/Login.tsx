import { useState, type FormEvent } from 'react';
import { sq, type Session } from '../api';
import { Brand, Btn, Icon, Screen, Title } from '../ui';

export function Login({ onLogin, onExit }: { onLogin: (s: Session) => void; onExit: () => void }) {
  const [clientId, setClientId] = useState('client-demo');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await sq<Session>('/kyc/login', { clientId });
      onLogin({ token: r.token, clientId: r.clientId, hasPasskey: r.hasPasskey });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      onSubmit={submit}
      footer={
        <>
          <Btn disabled={busy || clientId.trim().length < 3}>{busy ? 'Logging in…' : 'Log in'}</Btn>
          <Btn type="button" kind="text" onClick={onExit}>
            Swissquote unavailable? Use your exit kit
          </Btn>
        </>
      }
    >
      <Brand large />
      <Title title="Log in" lead="Use your Swissquote login to access your Bitcoin wallet." />
      <label className="field">
        <span>Client ID</span>
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="username" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="info">
        <Icon name="check" size={16} stroke={2.5} />
        <p className="note">
          Your wallet is linked to your Swissquote account, so there is no new identity check. Mock login: your
          identity is assumed to be verified already.
        </p>
      </div>
    </Screen>
  );
}
