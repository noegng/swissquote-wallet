/** Sats → « 0.000795 BTC » : les zéros de fin inutiles sont retirés. */
export function formatBtc(sats: bigint | string): string {
  const v = BigInt(sats);
  const whole = (v / 100_000_000n).toLocaleString('en-US');
  const frac = (v % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} BTC`;
}

const chf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Contre-valeur indicative en francs suisses (« ≈ CHF 54.75 »). Vide tant que le cours est inconnu. */
export function formatChf(sats: bigint | string, rate: number | null): string {
  if (rate === null) return '';
  const value = (Number(BigInt(sats)) / 1e8) * rate;
  if (value > 0 && value < 0.01) return '< CHF 0.01';
  return `≈ CHF ${chf.format(value)}`;
}

/** « 0.001 » (BTC) → sats. Lève une erreur si la saisie est invalide. */
export function parseBtc(input: string): bigint {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error('Invalid amount (BTC, up to 8 decimals)');
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(frac.padEnd(8, '0'));
}

export const shortAddress = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;

export const shortId = (id: string) => `${id.slice(0, 12)}…${id.slice(-9)}`;
