// Cérémonie de sauvegarde de la part CLIENT, commune à la création et à la récupération :
// C1 sur papier (avec vérification de deux mots), puis C2 chiffrée par phrase de passe et téléchargée.
// La part n'est jamais stockée : elle vit dans la mémoire de cet écran, puis disparaît.
import { useMemo, useState } from 'react';
import { sealWithPassphrase } from '@sqw/core';
import { btc } from '../config';

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
  stepLabel,
  onDone,
}: {
  walletId: string;
  clientShare: string;
  /** Ex. « Étape 2 sur 3 » à la création, « Nouvelle sauvegarde » en récupération. */
  stepLabel: (step: 'paper' | 'verify' | 'cloud') => string;
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
    return (
      <div className="screen">
        <p className="eyebrow">{stepLabel('paper')} · Votre part de secours</p>
        <h1>Recopiez ces 20 mots sur papier</h1>
        <p>
          C’est votre part de la clé de secours. Seule, elle ne permet rien : il faut aussi la part du
          partenaire. Gardez-la chez vous, avec vos documents importants.
        </p>
        <ol className="words">
          {words.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ol>
        <button className="primary" onClick={() => setStep('verify')}>
          Je les ai recopiés
        </button>
      </div>
    );
  }

  if (step === 'verify') {
    const ok = checks.every((idx, k) => answers[k].trim().toLowerCase() === words[idx]);
    return (
      <div className="screen">
        <p className="eyebrow">{stepLabel('verify')} · Vérification</p>
        <h1>Vérifions votre copie</h1>
        {checks.map((idx, k) => (
          <label className="field" key={idx}>
            <span>Mot n° {idx + 1}</span>
            <input
              value={answers[k]}
              autoComplete="off"
              onChange={(e) => setAnswers((a) => a.map((v, j) => (j === k ? e.target.value : v)))}
            />
          </label>
        ))}
        <button className="primary" disabled={!ok} onClick={() => setStep('cloud')}>
          Continuer
        </button>
        <button className="secondary" onClick={() => setStep('paper')}>
          Revoir les mots
        </button>
      </div>
    );
  }

  const strong = passphrase.length >= 10 && passphrase === confirm;
  return (
    <div className="screen">
      <p className="eyebrow">{stepLabel('cloud')} · Copie de sûreté</p>
      <h1>Une copie chiffrée dans votre cloud</h1>
      <p>
        Si vous perdez le papier, cette copie chiffrée le remplace. Choisissez une phrase de passe que
        vous retiendrez : sans elle, la copie est illisible, même pour Swissquote.
      </p>
      <label className="field">
        <span>Phrase de passe (10 caractères minimum)</span>
        <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
      </label>
      <label className="field">
        <span>Confirmer</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!strong || busy} onClick={finish}>
        {busy ? 'Chiffrement…' : 'Chiffrer et télécharger la copie'}
      </button>
      <p className="note">
        MOCK : le fichier est téléchargé ; en production, il serait enregistré dans votre iCloud ou Google
        Drive. Il n’est jamais envoyé à Swissquote.
      </p>
    </div>
  );
}
