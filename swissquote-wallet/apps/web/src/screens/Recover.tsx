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
import { BackupCeremony } from './BackupCeremony';
import { ClientShareInput } from './ClientShareInput';
import { Passkey } from './Passkey';

type Step = 'intro' | 'passkey' | 'waiting' | 'share' | 'finishing' | 'backup' | 'cancelled';

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
      setNotice(`Wallet gelé. ${r.cancelledPayments} paiement(s) en attente annulé(s).`);
      refreshRemote();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelForeignRecovery(recoveryId: string) {
    setError('');
    try {
      await sq(`/recovery/${recoveryId}/cancel`, {}, session.token);
      setNotice('Récupération annulée. Si votre téléphone a été volé, gelez le wallet puis lancez votre propre récupération.');
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

  if (step === 'backup' && result) {
    return (
      <BackupCeremony
        walletId={result.wallet.walletId}
        clientShare={result.newClientShare}
        stepLabel={() => 'Nouvelle sauvegarde'}
        onDone={async () => onRecovered(await markBackupConfirmed(session.clientId))}
      />
    );
  }

  if (step === 'passkey') {
    return (
      <Passkey
        session={session}
        title="Passkey de ce nouvel appareil"
        allowExisting
        onDone={(info) => begin(info.credentialId)}
      />
    );
  }

  if (step === 'cancelled') {
    return (
      <div className="screen">
        <h1>Récupération annulée</h1>
        <p>
          La récupération a été annulée depuis le téléphone associé au wallet. Si ce n’était pas vous,
          votre wallet est protégé : rien n’a été transféré.
        </p>
        <button className="secondary" onClick={() => setStep('intro')}>
          Retour
        </button>
      </div>
    );
  }

  if (step === 'waiting') {
    const s = progress?.swissquote;
    const p = progress?.partner;
    return (
      <div className="screen">
        <p className="eyebrow">Récupération en cours</p>
        <h1>Délai de sécurité</h1>
        <p>
          Votre wallet est gelé et vous avez reçu des alertes. Ce délai laisse au vrai propriétaire le temps
          d’annuler si ce n’est pas lui qui demande la récupération.
        </p>
        <ul className="progress">
          <li>
            Swissquote : {s ? (s.secondsLeft > 0 ? `${s.secondsLeft} s restantes` : 'délai écoulé ✓') : '…'}
          </li>
          <li>
            Partenaire : {p ? (p.status === 'released' ? 'part transmise ✓' : `${p.secondsLeft} s restantes`) : '…'}
          </li>
        </ul>
        <p className="note">En production : 7 jours, avec alertes par SMS, e-mail et courrier.</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (step === 'share' || step === 'finishing') {
    return (
      <div className="screen">
        <p className="eyebrow">Dernière étape</p>
        <h1>Votre part de secours</h1>
        {step === 'share' ? (
          <>
            <p>La part du partenaire est arrivée, chiffrée pour cet appareil. Il manque la vôtre.</p>
            {error && <p className="error">{error}</p>}
            <ClientShareInput busy={busy} submitLabel="Récupérer mon wallet" onShare={finish} />
          </>
        ) : (
          <>
            <ul className="progress">
              {log.map((l) => (
                <li key={l}>✓ {l}</li>
              ))}
            </ul>
            {error && (
              <>
                <p className="error">{error}</p>
                <button className="secondary" onClick={() => (setError(''), setStep('share'))}>
                  Réessayer
                </button>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="eyebrow">Nouvel appareil</p>
      <h1>Récupérer votre wallet</h1>
      <p>Un wallet Bitcoin est associé à votre compte, mais pas à cet appareil. Avez-vous perdu votre téléphone ?</p>
      <ul className="facts">
        <li>Vous créez une passkey pour cet appareil.</li>
        <li>Swissquote gèle le wallet et vous alerte ; le partenaire prépare sa part. Délai de sécurité.</li>
        <li>Vous saisissez votre part papier (ou votre copie cloud) : la clé de secours est reconstituée ici.</li>
        <li>Vos fonds sont transférés vers un nouveau wallet, avec de nouvelles clés.</li>
      </ul>
      <p className="note">
        Sans votre part papier ou sa copie, personne ne peut récupérer ce wallet : ni Swissquote, ni le
        partenaire, ni un voleur de votre téléphone.
      </p>
      {remoteState?.recovery && (
        <div className="card warning">
          <strong>Une récupération est déjà en cours, lancée depuis un autre appareil</strong>
          <span>Si ce n’est pas vous, annulez-la depuis votre espace client : pas besoin de votre téléphone.</span>
          <button className="primary" onClick={() => cancelForeignRecovery(remoteState.recovery!.recoveryId)}>
            Ce n’est pas moi : annuler
          </button>
        </div>
      )}
      {remoteState?.status === 'active' && (
        <div className="card">
          <strong>Téléphone volé ?</strong>
          <span className="label">
            Gelez le wallet tout de suite depuis votre espace client : plus aucun paiement, et les paiements en
            attente sont annulés. Le dégel exigera votre passkey ; la récupération reste possible.
          </span>
          <button className="secondary" onClick={freeze}>
            Geler mon wallet
          </button>
        </div>
      )}
      {notice && <p className="note">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!!remoteState?.recovery} onClick={() => setStep('passkey')}>
        Commencer la récupération
      </button>
      <button className="secondary" onClick={onCreateInstead}>
        Créer plutôt un nouveau wallet
      </button>
    </div>
  );
}
