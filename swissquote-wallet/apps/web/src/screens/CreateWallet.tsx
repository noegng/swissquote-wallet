// Création du wallet (skills slip39-backup et custody-invariants).
// Tout est généré sur l'appareil. La part TIERS part scellée chez le partenaire, la part CLIENT est
// montrée (C1) puis chiffrée par phrase de passe (C2), et les deux sont oubliées à la fin.
import { useRef, useState } from 'react';
import { createWalletMaterial, sealFor, type NewWalletMaterial, type WalletPolicy } from '@sqw/core';
import { partner, sq, type Session } from '../api';
import { btc } from '../config';
import { markBackupConfirmed, saveWallet, type StoredWallet } from '../keystore';
import { Btn, Checklist, Group, Row, Screen, Title } from '../ui';
import { BackupCeremony } from './BackupCeremony';

export function CreateWallet({
  session,
  onCreated,
  onBack,
}: {
  session: Session;
  onCreated: (w: StoredWallet) => void;
  /** Retour : vers la récupération si le client en venait, sinon vers la connexion. */
  onBack: () => void;
}) {
  const [step, setStep] = useState<'intro' | 'working' | 'backup'>('intro');
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [walletId, setWalletId] = useState('');
  // Part CLIENT : gardée en mémoire uniquement le temps de la sauvegarde, puis oubliée.
  const [clientShare, setClientShare] = useState<string | null>(null);
  // Étapes déjà réussies : « Try again » reprend où l'erreur s'est produite, au lieu de tout recréer
  // (sinon chaque essai laisserait chez Swissquote un wallet orphelin, sans part chez le partenaire).
  const done = useRef<{ m?: NewWalletMaterial; created?: { walletId: string; policy: WalletPolicy }; deposited?: boolean }>({});

  async function create() {
    setStep('working');
    setError('');
    setProgress([]);
    const log = (line: string) => setProgress((p) => [...p, line]);
    try {
      const m = (done.current.m ??= createWalletMaterial(btc.network));
      log('Phone key and backup key created on this device');

      const created = (done.current.created ??= await sq<{ walletId: string; policy: WalletPolicy }>(
        '/wallets',
        { phoneKey: m.phoneKey, backupKey: m.backupKey },
        session.token,
      ));
      log('Swissquote added its key and registered your wallet');

      if (!done.current.deposited) {
        const { publicKey } = await partner<{ publicKey: JsonWebKey }>('/public-key');
        await partner('/shares', {
          walletId: created.walletId,
          clientId: session.clientId,
          sealedShare: await sealFor(publicKey, m.shares.tiers),
        });
        done.current.deposited = true;
      }
      log('Backup share encrypted and handed to our independent partner');

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
      done.current = {};
      log('Phone key encrypted in this device’s vault');

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
        navTitle="New wallet"
        stepOf={(s) => (s === 'cloud' ? [3, 3] : [2, 3])}
        onDone={async () => {
          setClientShare(null);
          onCreated(await markBackupConfirmed(session.clientId));
        }}
      />
    );
  }

  if (step === 'working') {
    return (
      <Screen
        title="New wallet"
        step={[1, 3]}
        onBack={error ? () => setStep('intro') : undefined}
        footer={
          error ? (
            <Btn kind="secondary" onClick={create}>
              Try again
            </Btn>
          ) : undefined
        }
      >
        <Title title="Creating your wallet" />
        <Checklist lines={progress} />
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  return (
    <Screen title="New wallet" step={[1, 3]} onBack={onBack} footer={<Btn onClick={create}>Create your wallet</Btn>}>
      <Title title="Your wallet has three keys" lead="Any payment needs two of them." />
      <Group>
        <Row icon="phone" title="Phone key" sub="On this phone, for your daily payments" chip={['You', 'accent']} />
        <Row
          icon="bank"
          title="Swissquote key"
          sub="Signs with you up to your daily limit"
          chip={['Swissquote', 'neutral']}
        />
        <Row icon="key" title="Backup key" sub="For emergencies, shared with a partner" chip={['Shared', 'neutral']} />
      </Group>
      <p className="note">Your keys are created on this phone. Swissquote cannot make a payment alone.</p>
    </Screen>
  );
}
