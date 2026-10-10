// Envoi : saisie → résumé en clair vérifié par l'app → approbation passkey → résultat.
import { useEffect, useState, type FormEvent } from 'react';
import { sq } from '../api';
import { formatBtc, formatSats, parseBtc } from '../format';
import type { PendingPayment as Pending, StoredWallet } from '../keystore';
import { preparePayment, submitPayment, type PreparedPayment } from '../payments';
import { PendingPayment } from './PendingPayment';

type Outcome =
  | { kind: 'sent'; url: string }
  | { kind: 'pending'; pending: Pending }
  | { kind: 'cancelled' };

function explain(e: unknown): string {
  const err = e as Error;
  if (err.name === 'NotAllowedError') return 'Approbation annulée sur l’appareil.';
  return err.message;
}

export function Send({ wallet, onBack }: { wallet: StoredWallet; onBack: () => void }) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sq('/rules')
      .then((r) => setLimit(r.dailyLimitSats))
      .catch(() => setLimit(null));
  }, []);

  async function review(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setPrepared(await preparePayment(wallet, to.trim(), parseBtc(amount)));
    } catch (err) {
      const msg = explain(err);
      setError(/Invalid|network|prefix|checksum|has no matching/i.test(msg) ? 'Adresse invalide pour ce réseau.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const r = await submitPayment(wallet, prepared!);
      setOutcome(r.status === 'sent' ? { kind: 'sent', url: r.url } : { kind: 'pending', pending: r.pending });
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  if (outcome?.kind === 'sent') {
    return (
      <div className="screen">
        <p className="eyebrow">Paiement envoyé</p>
        <h1>C’est parti ✓</h1>
        <p>La transaction est signée par votre téléphone et par Swissquote, puis diffusée sur le réseau Bitcoin.</p>
        <a className="link" href={outcome.url} target="_blank" rel="noreferrer">
          Voir la transaction sur l’explorateur
        </a>
        <button className="secondary" onClick={onBack}>
          Retour
        </button>
      </div>
    );
  }

  if (outcome?.kind === 'cancelled') {
    return (
      <div className="screen">
        <h1>Paiement annulé</h1>
        <p>Swissquote n’a pas cosigné : aucun bitcoin n’a quitté votre wallet.</p>
        <button className="secondary" onClick={onBack}>
          Retour
        </button>
      </div>
    );
  }

  if (outcome?.kind === 'pending') {
    return (
      <div className="screen">
        <h1>Délai de sécurité</h1>
        <PendingPayment
          wallet={wallet}
          pending={outcome.pending}
          onDone={(r) => setOutcome(r.status === 'sent' ? { kind: 'sent', url: r.url } : { kind: 'cancelled' })}
        />
        <button className="secondary" onClick={onBack}>
          Retour (le paiement continue)
        </button>
      </div>
    );
  }

  if (prepared) {
    const s = prepared.summary;
    const overLimit = limit !== null && s.sentExternal > BigInt(limit);
    return (
      <div className="screen">
        <p className="eyebrow">Vérifiez avant d’approuver</p>
        <h1>Vous envoyez {formatBtc(s.sentExternal)}</h1>
        <dl className="summary">
          <dt>À</dt>
          <dd className="address">{prepared.to}</dd>
          <dt>Montant</dt>
          <dd>{formatSats(s.sentExternal)}</dd>
          <dt>Frais du réseau</dt>
          <dd>
            {formatSats(s.fee)} ({prepared.feeRate} sat/vB)
          </dd>
          <dt>Retour sur votre wallet</dt>
          <dd>{formatSats(s.change)}</dd>
        </dl>
        {overLimit && (
          <p className="note">
            Au-dessus de votre plafond de {formatSats(limit!)} par 24 h : Swissquote appliquera un délai de
            sécurité avant de cosigner, et vous préviendra.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy} onClick={confirm}>
          {busy ? 'Validation sur l’appareil…' : 'Approuver avec ma passkey'}
        </button>
        <button className="secondary" disabled={busy} onClick={() => setPrepared(null)}>
          Modifier
        </button>
      </div>
    );
  }

  return (
    <form className="screen" onSubmit={review}>
      <p className="eyebrow">Envoyer des bitcoins</p>
      <h1>Nouveau paiement</h1>
      <label className="field">
        <span>Adresse du destinataire</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="bcrt1… ou tb1…" autoComplete="off" />
      </label>
      <label className="field">
        <span>Montant (BTC)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0001" />
      </label>
      {limit && <p className="note">Plafond sans délai : {formatSats(limit)} par 24 h.</p>}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !to || !amount}>
        {busy ? 'Préparation…' : 'Vérifier le paiement'}
      </button>
      <button type="button" className="secondary" onClick={onBack}>
        Annuler
      </button>
    </form>
  );
}
