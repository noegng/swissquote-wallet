// « Swissquote a disparu » : sortie avec la clé du téléphone et la clé de secours, sans aucun service
// Swissquote (accessible depuis l'écran de connexion, sans session).
import { useEffect, useState } from 'react';
import { config } from '../config';
import { exitWithoutSwissquote, partnerStatus, requestPartnerShare, walletBalance } from '../exit';
import { formatBtc, formatSats } from '../format';
import { listLocalWallets, loadExit, type ExitState, type StoredWallet } from '../keystore';
import { ClientShareInput } from './ClientShareInput';

type Step = 'choose' | 'intro' | 'waiting' | 'share' | 'finishing' | 'done';

export function Exit({ onBack }: { onBack: () => void }) {
  const [wallets, setWallets] = useState<StoredWallet[] | null>(null);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [state, setState] = useState<ExitState | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [to, setTo] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ url: string; amount: bigint } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [swissquoteUp, setSwissquoteUp] = useState<boolean | null>(null);

  useEffect(() => {
    listLocalWallets().then(setWallets).catch(() => setWallets([]));
    // Simple constat pour la démo : le service Swissquote répond-il encore ? (rien n'en dépend)
    fetch(`${config.swissquoteUrl}/health`)
      .then(() => setSwissquoteUp(true))
      .catch(() => setSwissquoteUp(false));
  }, []);

  async function select(w: StoredWallet) {
    setWallet(w);
    setError('');
    walletBalance(w).then(setBalance).catch(() => setBalance(null));
    const existing = await loadExit(w.clientId);
    if (existing && existing.walletId === w.walletId) {
      setState(existing);
      setStep('waiting');
    } else {
      setStep('intro');
    }
  }

  useEffect(() => {
    if (step !== 'waiting' || !state) return;
    let stop = false;
    async function tick() {
      try {
        const s = await partnerStatus(state!);
        if (stop) return;
        if (s.status === 'released') return setStep('share');
        if (s.status === 'cancelled') return setError('La libération a été annulée chez le partenaire.');
        setSecondsLeft(s.secondsLeft);
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

  async function request() {
    setBusy(true);
    setError('');
    try {
      setState(await requestPartnerShare(wallet!));
      setStep('waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exit(share: string) {
    setBusy(true);
    setError('');
    setLog([]);
    setStep('finishing');
    try {
      const r = await exitWithoutSwissquote(wallet!, state!, share, to.trim(), (l) => setLog((x) => [...x, l]));
      setResult(r);
      setStep('done');
    } catch (e) {
      const msg = (e as Error).message;
      setError(/Invalid|prefix|checksum|has no matching/i.test(msg) ? 'Adresse de destination invalide pour ce réseau.' : msg);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <p className="eyebrow">Sortie sans Swissquote</p>
      <p className="note">
        Service Swissquote :{' '}
        {swissquoteUp === null ? '…' : swissquoteUp ? 'joignable (non utilisé ici)' : 'injoignable — aucune importance'}
      </p>
    </>
  );

  if (step === 'done' && result) {
    return (
      <div className="screen">
        {header}
        <h1>Vos fonds sont sortis ✓</h1>
        <p>
          {formatBtc(result.amount)} envoyés avec la clé du téléphone et la clé de secours. Aucun service
          Swissquote n’a été contacté.
        </p>
        <a className="link" href={result.url} target="_blank" rel="noreferrer">
          Voir la transaction sur l’explorateur
        </a>
        <button className="secondary" onClick={onBack}>
          Retour
        </button>
      </div>
    );
  }

  if (step === 'share' || step === 'finishing') {
    return (
      <div className="screen">
        {header}
        <h1>Où envoyer vos fonds ?</h1>
        {step === 'share' ? (
          <>
            <label className="field">
              <span>Adresse de destination (un autre wallet à vous)</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="bcrt1… ou tb1…" autoComplete="off" />
            </label>
            <p>La part du partenaire est arrivée. Il manque la vôtre pour reconstituer la clé de secours.</p>
            {error && <p className="error">{error}</p>}
            {to.trim().length > 20 && <ClientShareInput busy={busy} submitLabel="Sortir mes fonds" onShare={exit} />}
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

  if (step === 'waiting') {
    return (
      <div className="screen">
        {header}
        <h1>Le partenaire prépare votre part</h1>
        <p>
          Le partenaire indépendant applique son propre délai de sécurité, sans passer par Swissquote, puis
          envoie sa part chiffrée pour cet appareil.
        </p>
        <p className="countdown">{secondsLeft === null ? '…' : `${secondsLeft} s restantes`}</p>
        <p className="note">En production : plusieurs jours, avec vérification d’identité par le partenaire.</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (step === 'intro' && wallet) {
    return (
      <div className="screen">
        {header}
        <h1>Sortir sans Swissquote</h1>
        <p>
          Votre wallet demande 2 signatures sur 3. Sans Swissquote, vous avez toujours les deux autres : la clé
          de ce téléphone, et la clé de secours (votre part papier + la part du partenaire).
        </p>
        <p>Solde : {balance === null ? '…' : `${formatBtc(balance)} (${formatSats(balance)})`}</p>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy} onClick={request}>
          Demander la part du partenaire
        </button>
        <button className="secondary" onClick={() => setStep('choose')}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      {header}
      <h1>Swissquote a disparu ?</h1>
      <p>
        Si les services Swissquote sont indisponibles pour de bon, vous pouvez quand même récupérer vos bitcoins
        depuis ce téléphone. Choisissez votre wallet :
      </p>
      {wallets === null ? (
        <p className="note">Chargement…</p>
      ) : wallets.length === 0 ? (
        <p className="note">
          Aucun wallet sur cet appareil. La sortie sans Swissquote demande le téléphone qui contient la clé du
          téléphone. À défaut, le kit de sortie permet de le faire dans un wallet du marché (Sparrow, Bitcoin Core).
        </p>
      ) : (
        <ul className="keys">
          {wallets.map((w) => (
            <li key={w.walletId}>
              <strong>{w.clientId}</strong>
              <span>
                Wallet créé le {new Date(w.createdAt).toLocaleDateString('fr-CH')} · {w.network}
              </span>
              <button className="secondary" onClick={() => select(w)}>
                Sortir les fonds de ce wallet
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="secondary" onClick={onBack}>
        Retour à la connexion
      </button>
    </div>
  );
}
