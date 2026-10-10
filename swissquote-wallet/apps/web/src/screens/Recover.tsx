// Récupération sur un nouvel appareil : passkey de l'appareil → demandes (Swissquote + partenaire)
// → délai de sécurité → part du client (papier ou copie cloud) → transfert → nouvelle sauvegarde.
import { useEffect, useRef, useState } from 'react';
import { sq, type Session } from '../api';
import { loadRecovery, markBackupConfirmed, type RecoveryState, type StoredWallet } from '../keystore';
import {
  completeRecovery,
  recoveryProgress,
  startRecovery,
  type RecoveryProgress,
  type RemoteWallet,
} from '../recovery';
import { Btn, Callout, Checklist, Hero, Screen, Timeline, Title, formatClock, type TimelineItem } from '../ui';
import { BackupCeremony } from './BackupCeremony';
import { useClientShareInput } from './ClientShareInput';
import { Passkey } from './Passkey';

type Step = 'intro' | 'passkey' | 'waiting' | 'share' | 'finishing' | 'backup' | 'cancelled';

const STEPS = [
  { title: 'Set up a passkey on this device' },
  {
    title: 'Wait for the security delay',
    desc: 'Swissquote freezes the wallet and alerts you. Our partner prepares its share.',
  },
  { title: 'Enter your backup words', desc: 'Your paper copy, or your encrypted copy and passphrase.' },
  { title: 'Get your new keys', desc: 'Your bitcoin moves to a new wallet and the old phone stops working.' },
];

/** Les quatre étapes, avec l'étape `current` (0 à 3) en cours et les précédentes cochées. */
function steps(current: number, override?: Partial<TimelineItem>): TimelineItem[] {
  return STEPS.map((s, i) => ({
    ...s,
    state: i < current ? 'done' : i === current ? 'now' : 'todo',
    ...(i === current ? override : {}),
  }));
}

export function Recover({
  session,
  remote,
  onRecovered,
  onCreateInstead,
}: {
  session: Session;
  remote: RemoteWallet;
  onRecovered: (w: StoredWallet) => void;
  onCreateInstead: () => void;
}) {
  const [step, setStep] = useState<Step>('intro');
  const [state, setState] = useState<RecoveryState | null>(null);
  const [progress, setProgress] = useState<RecoveryProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ wallet: StoredWallet; newClientShare: string; txUrl: string } | null>(null);
  const started = useRef(false);
  // État du wallet chez Swissquote : gel, récupération en cours lancée ailleurs.
  const [remoteState, setRemoteState] = useState<{
    status: string;
    recovery: { recoveryId: string; secondsLeft: number } | null;
  } | null>(null);
  const [notice, setNotice] = useState('');

  async function refreshRemote() {
    try {
      setRemoteState(await sq(`/wallets/${remote.walletId}/recovery`));
    } catch {
      setRemoteState(null);
    }
  }

  useEffect(() => {
    refreshRemote();
  }, [remote.walletId]);

  // Actions de protection : la session de l'espace client suffit (le téléphone a pu être volé).
  async function freeze() {
    setError('');
    try {
      const r = await sq(`/wallets/${remote.walletId}/freeze`, {}, session.token);
      setNotice(`Wallet frozen. ${r.cancelledPayments} pending payment(s) cancelled.`);
      refreshRemote();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelForeignRecovery(recoveryId: string) {
    setError('');
    try {
      await sq(`/recovery/${recoveryId}/cancel`, {}, session.token);
      setNotice('Recovery cancelled. If your phone was stolen, freeze the wallet, then start your own recovery.');
      refreshRemote();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Une récupération déjà lancée sur cet appareil reprend après un rechargement.
  useEffect(() => {
    loadRecovery(session.clientId).then((r) => {
      if (r && r.oldWalletId === remote.walletId) {
        setState(r);
        setStep('waiting');
      }
    });
  }, [session.clientId, remote.walletId]);

  useEffect(() => {
    if (step !== 'waiting' || !state) return;
    let stop = false;
    async function tick() {
      try {
        const p = await recoveryProgress(state!);
        if (stop) return;
        setProgress(p);
        if (p.swissquote.status === 'cancelled') return setStep('cancelled');
        if (p.swissquote.secondsLeft === 0 && p.partner.status === 'released') return setStep('share');
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [step, state]);

  async function begin(credentialId: string) {
    if (started.current) return;
    started.current = true;
    setError('');
    try {
      setState(await startRecovery(session, remote, credentialId));
      setStep('waiting');
    } catch (e) {
      started.current = false;
      setError((e as Error).message);
      setStep('intro');
    }
  }

  async function finish(share: string) {
    setBusy(true);
    setError('');
    try {
      setStep('finishing');
      setLog([]);
      setResult(await completeRecovery(session, state!, share, (l) => setLog((x) => [...x, l])));
      setStep('backup');
    } catch (e) {
      setError((e as Error).message);
      setStep((s) => (s === 'finishing' ? 'finishing' : 'share'));
    } finally {
      setBusy(false);
    }
  }

  const share = useClientShareInput(finish);

  if (step === 'backup' && result) {
    return (
      <BackupCeremony
        walletId={result.wallet.walletId}
        clientShare={result.newClientShare}
        navTitle="New backup"
        onDone={async () => onRecovered(await markBackupConfirmed(session.clientId))}
      />
    );
  }

  if (step === 'passkey') {
    return (
      <Passkey
        session={session}
        title="Passkey for this new device"
        allowExisting
        onDone={(info) => begin(info.credentialId)}
      />
    );
  }

  if (step === 'cancelled') {
    return (
      <Screen
        footer={
          <Btn kind="secondary" onClick={() => setStep('intro')}>
            Back
          </Btn>
        }
      >
        <Hero tone="danger" />
        <Title
          center
          title="Recovery cancelled"
          lead="The recovery was cancelled from the phone linked to this wallet. If that was not you, your wallet is protected: nothing was moved."
        />
      </Screen>
    );
  }

  if (step === 'waiting') {
    const s = progress?.swissquote;
    const p = progress?.partner;
    const left = s && p ? Math.max(s.secondsLeft, p.status === 'released' ? 0 : p.secondsLeft) : null;
    return (
      <Screen title="Recovery" step={[2, 4]}>
        <Title
          title="Recovery in progress"
          lead="Your wallet is frozen and you have been alerted. The delay gives the real owner time to cancel."
        />
        <Timeline
          items={steps(1, {
            desc: (
              <>
                Swissquote: {s ? (s.secondsLeft > 0 ? `${formatClock(s.secondsLeft)} left` : 'delay over') : '…'}
                <br />
                Partner: {p ? (p.status === 'released' ? 'share sent' : `${formatClock(p.secondsLeft)} left`) : '…'}
              </>
            ),
            chip: left === null ? undefined : [left > 0 ? `${formatClock(left)} left` : 'Almost done', 'accent'],
          })}
        />
        <p className="note">Shortened for this demo. In production: 7 days, with alerts by SMS, email and post.</p>
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  if (step === 'share') {
    return (
      <Screen
        title="Recovery"
        step={[3, 4]}
        footer={
          <Btn disabled={busy || !share.ready} onClick={share.submit}>
            Recover your wallet
          </Btn>
        }
      >
        <Title
          title="Enter your backup words"
          lead="Our partner’s share has arrived, encrypted for this device. Yours is the missing half."
        />
        {error && <p className="error">{error}</p>}
        {share.fields}
      </Screen>
    );
  }

  if (step === 'finishing') {
    return (
      <Screen
        title="Recovery"
        step={[4, 4]}
        footer={
          error ? (
            <Btn kind="secondary" onClick={() => (setError(''), setStep('share'))}>
              Try again
            </Btn>
          ) : undefined
        }
      >
        <Title title="Moving to your new keys" />
        <Checklist lines={log} />
        {error && <p className="error">{error}</p>}
      </Screen>
    );
  }

  return (
    <Screen
      title="Recovery"
      footer={
        <>
          <Btn disabled={!!remoteState?.recovery} onClick={() => setStep('passkey')}>
            Start recovery
          </Btn>
          <Btn kind="text" onClick={onCreateInstead}>
            Create a new wallet instead
          </Btn>
        </>
      }
    >
      <Title
        title="Recover your wallet"
        lead="A Bitcoin wallet is linked to your account, but not to this device. Have you lost your phone?"
      />
      <Timeline items={steps(0)} />
      {remoteState?.recovery && (
        <Callout tone="danger" title="A recovery is already in progress from another device">
          If this is not you, cancel it from here. You do not need your phone.
          <Btn onClick={() => cancelForeignRecovery(remoteState.recovery!.recoveryId)}>This is not me: cancel</Btn>
        </Callout>
      )}
      {remoteState?.status === 'active' && (
        <Callout title="Phone stolen?">
          Freeze the wallet now: no payment can leave it and pending payments are cancelled. Unfreezing requires
          your passkey, and recovery stays possible.
          <Btn kind="secondary" onClick={freeze}>
            Freeze my wallet
          </Btn>
        </Callout>
      )}
      {notice && <p className="note">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <p className="note">
        Without your backup words or their encrypted copy, nobody can recover this wallet: not Swissquote, not our
        partner, not someone who stole your phone.
      </p>
    </Screen>
  );
}
