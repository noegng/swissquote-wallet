// Gros paiement en attente du délai de sécurité (palier 2) : compte à rebours, annulation par passkey,
// diffusion automatique une fois le délai écoulé.
import { useEffect, useRef, useState } from 'react';
import { formatBtc, shortAddress } from '../format';
import type { PendingPayment as Pending, StoredWallet } from '../keystore';
import { cancelPending, checkPending } from '../payments';

export function PendingPayment({
  wallet,
  pending,
  onDone,
}: {
  wallet: StoredWallet;
  pending: Pending;
  onDone: (result: { status: 'sent'; url: string } | { status: 'cancelled' }) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Le parent se re-rend souvent : on garde le dernier onDone sans relancer la boucle de suivi
  // (deux boucles en parallèle pourraient diffuser la transaction deux fois).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const latest = useRef({ wallet, pending });
  latest.current = { wallet, pending };

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await checkPending(latest.current.wallet, latest.current.pending);
        if (stop) return;
        if (r.status !== 'pending') return onDoneRef.current(r);
        setSecondsLeft(r.secondsLeft);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [wallet.walletId, pending.requestId]);

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await cancelPending(wallet, pending);
      onDone({ status: 'cancelled' });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card warning">
      <strong>Paiement en attente de sécurité</strong>
      <span>
        {formatBtc(pending.amount)} vers {shortAddress(pending.to)}. Ce montant dépasse votre plafond
        quotidien : Swissquote attend avant de cosigner, et vous a envoyé une alerte.
      </span>
      <span className="countdown">
        {secondsLeft === null ? '…' : secondsLeft > 0 ? `Départ dans ${secondsLeft} s` : 'Envoi en cours…'}
      </span>
      <span className="note">En production : 24 h à 7 jours. Si ce n’est pas vous, annulez.</span>
      {error && <span className="error">{error}</span>}
      <button className="primary" disabled={busy} onClick={cancel}>
        {busy ? 'Validation sur l’appareil…' : 'Annuler ce paiement'}
      </button>
    </div>
  );
}
