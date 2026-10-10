// Saisie de la part CLIENT : papier (20 mots) ou copie cloud (fichier C2 + phrase de passe).
import { useState } from 'react';
import { clientShareFromFile, clientShareFromWords } from '../shareInput';

export function ClientShareInput({
  busy,
  submitLabel,
  onShare,
}: {
  busy: boolean;
  submitLabel: string;
  /** Reçoit la part validée ; l'appelant l'utilise puis l'oublie. */
  onShare: (share: string) => void;
}) {
  const [mode, setMode] = useState<'paper' | 'cloud'>('paper');
  const [words, setWords] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      const share = mode === 'paper' ? clientShareFromWords(words) : await clientShareFromFile(file!, passphrase);
      setWords('');
      setPassphrase('');
      onShare(share);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const ready = mode === 'paper' ? words.trim().split(/\s+/).length >= 20 : !!file && !!passphrase;
  return (
    <>
      <div className="tabs">
        <button className={mode === 'paper' ? 'tab active' : 'tab'} onClick={() => setMode('paper')}>
          Papier (20 mots)
        </button>
        <button className={mode === 'cloud' ? 'tab active' : 'tab'} onClick={() => setMode('cloud')}>
          Copie cloud
        </button>
      </div>
      {mode === 'paper' ? (
        <label className="field">
          <span>Les 20 mots, dans l’ordre</span>
          <textarea rows={4} value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" />
        </label>
      ) : (
        <>
          <label className="field">
            <span>Fichier de sauvegarde C2</span>
            <input type="file" accept="application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            <span>Phrase de passe</span>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !ready} onClick={submit}>
        {submitLabel}
      </button>
    </>
  );
}
