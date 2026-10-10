// Création du wallet (skills slip39-backup et custody-invariants).
// Tout est généré sur l'appareil. La part TIERS part scellée chez le partenaire, la part CLIENT est
// montrée (C1) puis chiffrée par phrase de passe (C2), et les deux sont oubliées à la fin.
import { useState } from 'react';
import { createWalletMaterial, sealFor, type WalletPolicy } from '@sqw/core';
import { partner, sq, type Session } from '../api';
import { btc } from '../config';
import { markBackupConfirmed, saveWallet, type StoredWallet } from '../keystore';
import { BackupCeremony } from './BackupCeremony';

export function CreateWallet({ session, onCreated }: { session: Session; onCreated: (w: StoredWallet) => void }) {
  const [step, setStep] = useState<'intro' | 'working' | 'backup'>('intro');
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [walletId, setWalletId] = useState('');
  // Part CLIENT : gardée en mémoire uniquement le temps de la sauvegarde, puis oubliée.
  const [clientShare, setClientShare] = useState<string | null>(null);

  async function create() {
    setStep('working');
    setError('');
    setProgress([]);
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
      setStep('backup');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (step === 'backup' && clientShare) {
    return (
      <BackupCeremony
        walletId={walletId}
        clientShare={clientShare}
        stepLabel={(s) => (s === 'cloud' ? 'Étape 3 sur 3' : 'Étape 2 sur 3')}
        onDone={async () => {
          setClientShare(null);
          onCreated(await markBackupConfirmed(session.clientId));
        }}
      />
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
            <button className="secondary" onClick={create}>
              Réessayer
            </button>
          </>
        )}
      </div>
    );
  }

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
