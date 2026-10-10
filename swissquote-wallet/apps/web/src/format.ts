export function formatBtc(sats: bigint | string): string {
  const v = BigInt(sats);
  const whole = v / 100_000_000n;
  const frac = (v % 100_000_000n).toString().padStart(8, '0');
  return `${whole}.${frac} BTC`;
}

export function formatSats(sats: bigint | string): string {
  return `${BigInt(sats).toLocaleString('fr-CH')} sats`;
}

/** « 0.001 » (BTC) → sats. Lève une erreur si la saisie est invalide. */
export function parseBtc(input: string): bigint {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error('Montant invalide (BTC, 8 décimales maximum)');
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(frac.padEnd(8, '0'));
}

export const shortAddress = (a: string) => `${a.slice(0, 10)}…${a.slice(-8)}`;
