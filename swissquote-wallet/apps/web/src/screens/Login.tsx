import { useState, type FormEvent } from 'react';
import { sq, type Session } from '../api';

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
    <form className="screen" onSubmit={submit}>
      <p className="eyebrow">Espace client Swissquote</p>
      <h1>Connexion</h1>
      <p>Connectez-vous à votre compte pour ouvrir votre wallet Bitcoin en self-custody.</p>
      <label className="field">
        <span>Identifiant client</span>
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="username" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || clientId.trim().length < 3}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      <p className="note">
        MOCK : connexion simulée. Votre identité est supposée déjà vérifiée par Swissquote (KYC).
      </p>
      <button type="button" className="secondary" onClick={onExit}>
        Swissquote est indisponible ? Sortir mes fonds
      </button>
    </form>
  );
}
