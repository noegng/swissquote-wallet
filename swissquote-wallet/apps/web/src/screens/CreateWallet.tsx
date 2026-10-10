// Création du wallet (skills slip39-backup et custody-invariants).
// Tout est généré sur l'appareil. La part TIERS part scellée chez le partenaire, la part CLIENT est
// montrée (C1) puis chiffrée par phrase de passe (C2), et les deux sont oubliées à la fin.
import { useMemo, useState } from 'react';
import { createWalletMaterial, sealFor, sealWithPassphrase, type WalletPolicy } from '@sqw/core';
import { partner, sq, type Session } from '../api';
import { btc } from '../config';
import { markBackupConfirmed, saveWallet, type StoredWallet } from '../keystore';

type Step = 'intro' | 'working' | 'paper' | 'verify' | 'cloud';

function download(filename: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function pickTwo(max: number): [number, number] {
  const a = Math.floor(Math.random() * max);
  let b = Math.floor(Math.random() * (max - 1));
  if (b >= a) b++;
  return a < b ? [a, b] : [b, a];
}

export function CreateWallet({ session, onCreated }: { session: Session; onCreated: (w: StoredWallet) => void }) {
  const [step, setStep] = useState<Step>('intro');
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [walletId, setWalletId] = useState('');
  // Part CLIENT : gardée en mémoire uniquement le temps de la sauvegarde, puis oubliée.
  const [clientShare, setClientShare] = useState<string | null>(null);
  const [answers, setAnswers] = useState(['', '']);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const words = clientShare?.split(' ') ?? [];
  const checks = useMemo(() => pickTwo(20), [clientShare]);

  async function create() {
    setStep('working');
    setError('');
    const log = (line: string) => setProgress((p) => [...p, line]);
    try {
      const m = createWalletMaterial(btc.network);
      log('Clés du téléphone et de secours générées sur cet appareil');

      const created = await sq<{ walletId: string; policy: WalletPolicy }>(
        '/wallets',
        { phoneKey: m.phoneKey, backupKey: m.backupKey },
        session.token,
      );
      log('Swissquote a ajouté sa clé et enregistré votre wallet');

      const { publicKey } = await partner<{ publicKey: JsonWebKey }>('/public-key');
      await partner('/shares', {
        walletId: created.walletId,
        clientId: session.clientId,
        sealedShare: await sealFor(publicKey, m.shares.tiers),
      });
      log('Part de secours chiffrée et confiée au partenaire indépendant');

      await saveWallet(
        {
          walletId: created.walletId,
          clientId: session.clientId,
          network: btc.name,
          policy: created.policy,
          createdAt: new Date().toISOString(),
        },
        m.phoneSeed,
      );
      m.phoneSeed.fill(0);
      log('Clé du téléphone chiffrée dans le coffre de cet appareil');

      setWalletId(created.walletId);
      setClientShare(m.shares.client);
      setStep('paper');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finish() {
    setBusy(true);
    setError('');
    try {
      const box = await sealWithPassphrase(passphrase, clientShare!);
      download(`swissquote-wallet-sauvegarde-C2-${walletId.slice(0, 8)}.json`, {
        type: 'swissquote-wallet/backup-c2',
        note: 'Copie chiffrée de votre part de secours (C2). À garder dans votre iCloud ou Google Drive.',
        walletId,
        network: btc.name,
        box,
      });
      setClientShare(null);
      onCreated(await markBackupConfirmed(session.clientId));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (step === 'intro') {
    return (
      <div className="screen">
        <p className="eyebrow">Étape 1 sur 3</p>
        <h1>Votre wallet Bitcoin</h1>
        <p>Votre wallet est protégé par trois clés. Il en faut deux pour envoyer des bitcoins.</p>
        <ul className="keys">
          <li>
            <strong>Clé du téléphone</strong>
            <span>Sur cet appareil, déverrouillée par votre passkey. Pour l’usage quotidien.</span>
          </li>
          <li>
            <strong>Clé Swissquote</strong>
            <span>Cosigne vos paiements selon vos plafonds. Ne peut jamais rien faire seule.</span>
          </li>
          <li>
            <strong>Clé de secours</strong>
            <span>Découpée en deux parts : une pour vous, une chez un partenaire indépendant.</span>
          </li>
        </ul>
        <button className="primary" onClick={create}>
          Créer mon wallet
        </button>
      </div>
    );
  }

  if (step === 'working') {
    return (
      <div className="screen">
        <h1>Création en cours…</h1>
        <ul className="progress">
          {progress.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
        {error && (
          <>
            <p className="error">{error}</p>
            <button className="secondary" onClick={() => (setProgress([]), create())}>
              Réessayer
            </button>
          </>
        )}
      </div>
    );
  }

  if (step === 'paper') {
    return (
      <div className="screen">
        <p className="eyebrow">Étape 2 sur 3 · Votre part de secours</p>
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
        <p className="eyebrow">Étape 2 sur 3 · Vérification</p>
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
      <p className="eyebrow">Étape 3 sur 3 · Copie de sûreté</p>
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
