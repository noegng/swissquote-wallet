// Cours BTC/CHF indicatif, pour afficher une contre-valeur à côté des montants en BTC.
// Lu sur une API publique (aucune donnée du client n'est envoyée) ; sans réponse, l'app affiche
// les montants en BTC seuls. Les pièces d'un réseau de test n'ont aucune valeur réelle.
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
      // source injoignable : on essaie la suivante
    }
  }
  return null;
}

function chfRate(): Promise<number | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return Promise.resolve(cached.rate);
  inflight ??= fetchRate()
    .then((rate) => {
      if (rate !== null) cached = { rate, at: Date.now() };
      // Source en panne : on garde le dernier cours connu plutôt que de retirer l'affichage.
      return rate ?? cached?.rate ?? null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Cours d'un bitcoin en CHF, ou null tant qu'il n'est pas connu. */
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
