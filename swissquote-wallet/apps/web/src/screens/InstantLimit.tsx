// Threshold for immediate signing (the cosigner's "daily limit"). It is not a limit
// that blocks: above it, the payment still leaves, after a security delay and an alert.
// So we show what can still be paid at once today, and what happens beyond that.
import { useEffect, useState } from 'react';
import { sq } from '../api';
import { btcDigits, formatBtc, formatChf } from '../format';
import { RollingNumber } from '../anim/RollingNumber';

interface Limit {
  limit: bigint;
  spent: bigint;
  delaySeconds: number;
}

export const delayLabel = (s: number) => (s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes`);

/** Threshold, amount already spent over 24 h (fees included) and security delay, read from Swissquote. */
export function useInstantLimit(walletId: string, refreshKey?: unknown): Limit | null {
  const [value, setValue] = useState<Limit | null>(null);
  useEffect(() => {
    let stale = false;
    Promise.all([
      sq<{ dailyLimitSats: string; spentLast24hSats: string }>(`/wallets/${walletId}/limit`),
      sq<{ highValueDelaySeconds: number }>('/rules'),
    ])
      .then(([l, r]) => {
        if (stale) return;
        setValue({ limit: BigInt(l.dailyLimitSats), spent: BigInt(l.spentLast24hSats), delaySeconds: r.highValueDelaySeconds });
      })
      .catch(() => !stale && setValue(null));
    return () => {
      stale = true;
    };
  }, [walletId, refreshKey]);
  return value;
}

export function InstantLimit({ limit, rate }: { limit: Limit | null; rate: number | null }) {
  if (!limit) {
    return (
      <div className="sheet padded">
        <div className="limit-head">
          <strong>Instant payments</strong>
          <span>…</span>
        </div>
      </div>
    );
  }
  const left = limit.limit > limit.spent ? limit.limit - limit.spent : 0n;
  const usedPct = limit.limit > 0n ? Number((limit.spent * 100n) / limit.limit) : 100;
  return (
    <div className="sheet padded">
      <div className="limit-head">
        <strong>Instant payments</strong>
        <span>
          <RollingNumber value={btcDigits(left)} suffix=" BTC" /> left today{rate !== null && ` (${formatChf(left, rate)})`}
        </span>
      </div>
      <div
        className="limit-bar"
        role="meter"
        aria-label="Instant payments used today"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, usedPct)}
      >
        <i style={{ width: `${Math.min(100, usedPct)}%` }} />
      </div>
      <p className="note">
        Swissquote signs at once up to {formatBtc(limit.limit)} a day, fees included. Above that you can still pay:
        the payment waits {delayLabel(limit.delaySeconds)} and you get an alert, so you can cancel it if it is not
        you. Shortened for this demo: 24 hours to 7 days in production.
      </p>
    </div>
  );
}
