// Entry of the CLIENT share: paper (20 words) or cloud copy (C2 file + passphrase).
// Returns the fields and the submit action, so that the screen places the button in its footer.
import { useState, type ReactNode } from 'react';
import { clientShareFromFile, clientShareFromWords } from '../shareInput';
import { Segmented } from '../ui';

export function useClientShareInput(
  /** Receives the validated share; the caller uses it, then forgets it. */
  onShare: (share: string) => void,
): { fields: ReactNode; ready: boolean; submit: () => Promise<void> } {
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
  const fields = (
    <>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          ['paper', 'Paper copy'],
          ['cloud', 'Encrypted copy'],
        ]}
      />
      {mode === 'paper' ? (
        <label className="field">
          <span>Your 20 words, in order</span>
          <textarea
            rows={4}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>
      ) : (
        <div className="fields">
          <label className="field">
            <span>Encrypted backup file</span>
            <input type="file" accept="application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            <span>Passphrase</span>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="note">Your words stay on this phone. They are not sent to Swissquote or to our partner.</p>
    </>
  );
  return { fields, ready, submit };
}
