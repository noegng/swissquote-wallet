// Large payment waiting for the security delay (tier 2): countdown, cancellation by passkey,
// automatic broadcast once the delay is over.
import { useEffect, useRef, useState } from 'react';
import { sq } from '../api';
import { formatBtc, shortAddress } from '../format';
import type { PendingPayment as Pending, StoredWallet } from '../keystore';
import { cancelPending, checkPending } from '../payments';
import { Callout, Countdown } from '../ui';

export type Done =
  | { status: 'sent'; txid: string; url: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/** Tracks a pending payment. A single tracking loop per payment, however many times it renders. */
export function usePendingPayment(wallet: StoredWallet, pending: Pending, onDone: (result: Done) => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The parent re-renders often: keep the latest onDone without restarting the tracking loop
  // (two loops in parallel could broadcast the transaction twice).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const latest = useRef({ wallet, pending });
  latest.current = { wallet, pending };

  useEffect(() => {
    // Total length of the delay, for the gauge only.
    sq<{ highValueDelaySeconds: number }>('/rules')
      .then((r) => setTotal(r.highValueDelaySeconds))
      .catch(() => setTotal(undefined));
  }, []);

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
      onDoneRef.current({ status: 'cancelled' });
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Cancellation interrupted on the device.' : (e as Error).message);
      setBusy(false);
    }
  }

  return { secondsLeft, total, error, busy, cancel };
}

/** Countdown and explanation, shared by the home and send screens. */
export function PendingPaymentPanel({
  pending,
  secondsLeft,
  total,
  error,
}: {
  pending: Pending;
  secondsLeft: number | null;
  total?: number;
  error: string;
}) {
  return (
    <>
      <Countdown
        caption={`${formatBtc(pending.amount)} to ${shortAddress(pending.to)}`}
        secondsLeft={secondsLeft}
        total={total}
        footnote={secondsLeft === 0 ? 'Sending now…' : 'before the payment is sent'}
      />
      <div className="why">
        <strong>Beyond your instant payments for today</strong>
        <p>
          The payment is not blocked: Swissquote signs it once the delay is over. It has also sent you an alert, so
          you can cancel it if it is not you.
        </p>
      </div>
      <Callout title="Didn’t make this payment?">
        Cancel it now. You can also freeze your wallet from your Swissquote account on any device.
      </Callout>
      {error && <p className="error">{error}</p>}
      <p className="note">Shortened for this demo. In production: 24 hours to 7 days.</p>
    </>
  );
}
