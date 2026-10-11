/** Sats → "0.000795 BTC": useless trailing zeros are removed. */
export function formatBtc(sats: bigint | string): string {
  const v = BigInt(sats);
  const whole = (v / 100_000_000n).toLocaleString('en-US');
  const frac = (v % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} BTC`;
}

/** Numeric part of formatBtc ("0.000795"), to show it apart from the unit (animated counter). */
export const btcDigits = (sats: bigint | string) => formatBtc(sats).replace(/ BTC$/, '');

const chf = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Indicative value in Swiss francs ("≈ CHF 54.75"). Empty while the rate is unknown. */
export function formatChf(sats: bigint | string, rate: number | null): string {
  if (rate === null) return '';
  const value = (Number(BigInt(sats)) / 1e8) * rate;
  if (value > 0 && value < 0.01) return '< CHF 0.01';
  return `≈ CHF ${chf.format(value)}`;
}

/** "0.001" (BTC) → sats. Throws if the input is invalid. */
export function parseBtc(input: string): bigint {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error('Invalid amount (BTC, up to 8 decimals)');
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(frac.padEnd(8, '0'));
}

export const shortAddress = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;

export const shortId = (id: string) => `${id.slice(0, 12)}…${id.slice(-9)}`;
