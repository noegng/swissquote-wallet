// Cérémonie de sauvegarde de la part CLIENT, commune à la création et à la récupération :
// C1 sur papier (avec vérification de deux mots), puis C2 chiffrée par phrase de passe et téléchargée.
// La part n'est jamais stockée : elle vit dans la mémoire de cet écran, puis disparaît.
import { useMemo, useState } from 'react';
import { sealWithPassphrase } from '@sqw/core';
import { btc } from '../config';
import { Btn, Callout, Screen, Title } from '../ui';

function download(filename: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function pickTwo(max: number): [number, number] {
  const a = Math.floor(Math.random() * max);
  let b = Math.floor(Math.random() * (max - 1));
  if (b >= a) b++;
  return a < b ? [a, b] : [b, a];
}

export function BackupCeremony({
  walletId,
  clientShare,
  navTitle,
  stepOf,
  onDone,
}: {
  walletId: string;
  clientShare: string;
  /** Titre de la barre de navigation : « New wallet » à la création, « New backup » en récupération. */
  navTitle: string;
  /** Progression affichée sous la barre (création : étapes 2 et 3 sur 3) ; absente en récupération. */
  stepOf?: (step: 'paper' | 'verify' | 'cloud') => [number, number];
  onDone: () => void;
}) {
  const [step, setStep] = useState<'paper' | 'verify' | 'cloud'>('paper');
  const [answers, setAnswers] = useState(['', '']);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const words = clientShare.split(' ');
  const checks = useMemo(() => pickTwo(words.length), [clientShare]);

  async function finish() {
    setBusy(true);
    setError('');
    try {
      const box = await sealWithPassphrase(passphrase, clientShare);
      download(`swissquote-wallet-sauvegarde-C2-${walletId.slice(0, 8)}.json`, {
        type: 'swissquote-wallet/backup-c2',
        note: 'Copie chiffrée de votre part de secours (C2). À garder dans votre iCloud ou Google Drive.',
        walletId,
        network: btc.name,
        box,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (step === 'paper') {
    const rows = Math.ceil(words.length / 2);
    return (
      <Screen
        title={navTitle}
        step={stepOf?.('paper')}
        footer={<Btn onClick={() => setStep('verify')}>I have written them down</Btn>}
      >
        <Title
          title={`Write down these ${words.length} words`}
          lead="They are your half of the backup key. You will need them if you lose your phone."
        />
        <ol className="words" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
          {words.map((w, i) => (
            <li key={i} className={i % rows === 0 ? 'first' : undefined}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              {w}
            </li>
          ))}
        </ol>
        <p className="note">
          On their own these words do nothing: our partner’s share is needed too. Keep the paper in a safe place at
          home.
        </p>
      </Screen>
    );
  }

  if (step === 'verify') {
    const ok = checks.every((idx, k) => answers[k].trim().toLowerCase() === words[idx]);
    return (
      <Screen
        title={navTitle}
        step={stepOf?.('verify')}
        onBack={() => setStep('paper')}
        footer={
          <>
            <Btn disabled={!ok} onClick={() => setStep('cloud')}>
              Continue
            </Btn>
            <Btn kind="text" onClick={() => setStep('paper')}>
              Show the words again
            </Btn>
          </>
        }
      >
        <Title title="Check your copy" lead="Enter two of the words you have just written down." />
        <div className="fields">
          {checks.map((idx, k) => (
            <label className="field" key={idx}>
              <span>Word {idx + 1}</span>
              <input
                value={answers[k]}
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setAnswers((a) => a.map((v, j) => (j === k ? e.target.value : v)))}
              />
            </label>
          ))}
        </div>
      </Screen>
    );
  }

  const strong = passphrase.length >= 10 && passphrase === confirm;
  return (
    <Screen
      title={navTitle}
      step={stepOf?.('cloud')}
      footer={
        <Btn disabled={!strong || busy} onClick={finish}>
          {busy ? 'Encrypting…' : 'Save encrypted copy'}
        </Btn>
      }
    >
      <Title title="Save an encrypted copy" lead="It goes to your own cloud storage and can replace the paper." />
      <div className="fields">
        <label className="field">
          <span>Passphrase (at least 10 characters)</span>
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirm passphrase</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </div>
      <Callout>Keep your passphrase safe. Swissquote does not know it and cannot reset it.</Callout>
      {error && <p className="error">{error}</p>}
      <p className="note">
        Mock: the file is downloaded. In production it would be saved to your iCloud or Google Drive. It is never
        sent to Swissquote.
      </p>
    </Screen>
  );
}
