// Indicative BTC/CHF rate, to show a value next to the amounts in BTC.
// Read from a public API (no client data is sent); without an answer, the app shows
// amounts in BTC only. Coins on a test network have no real value.
import { useEffect, useState } from 'react';

const SOURCES: [url: string, read: (json: any) => unknown][] = [
  ['https://api.coinbase.com/v2/prices/BTC-CHF/spot', (j) => j?.data?.amount],
  ['https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=chf', (j) => j?.bitcoin?.chf],
];

const MAX_AGE_MS = 5 * 60 * 1000;

let cached: { rate: number; at: number } | null = null;
let inflight: Promise<number | null> | null = null;

async function fetchRate(): Promise<number | null> {
  for (const [url, read] of SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rate = Number(read(await res.json()));
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch {
      // source unreachable: try the next one
    }
  }
  return null;
}

function chfRate(): Promise<number | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.rate);
  inflight ??= fetchRate()
    .then((rate) => {
      if (rate !== null) cached = { rate, at: Date.now() };
      // Source down: keep the last known rate rather than removing the display.
      return rate ?? cached?.rate ?? null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Price of one bitcoin in CHF, or null while it is unknown. */
export function useChfRate(): number | null {
  const [rate, setRate] = useState<number | null>(cached?.rate ?? null);
  useEffect(() => {
    let stop = false;
    const load = () => chfRate().then((r) => !stop && setRate(r));
    load();
    const timer = setInterval(load, MAX_AGE_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);
  return rate;
}
