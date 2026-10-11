// [MOCK] Rules of the Swissquote cosigner, applied in this order (skill mock-service):
//   1. the PSBT only uses the wallet's funds and the change comes back to the wallet (summarizeSpend)
//   2. no recipient on the sanctions list (mock: demo list)
//   3. tier 1: total of the last 24 hours (amounts + fees) within the instant amount → signed at once
//      tier 2: above it → held, notification, signed after a delay unless cancelled
// Swissquote can refuse or delay, never sign alone: it holds only one key out of three.
import type { SpendSummary } from '@sqw/core';
import { btcAmount } from './context';
import { readJson, writeJson } from './store';

export const DAILY_LIMIT_SATS = BigInt(process.env.DAILY_LIMIT_SATS ?? 50_000);
export const HIGH_VALUE_DELAY_SECONDS = Number(process.env.HIGH_VALUE_DELAY_SECONDS ?? 20);

const DAY_MS = 24 * 3600 * 1000;

interface SpendRecord {
  walletId: string;
  at: number;
  sats: string;
}

export function sanctionedAddresses(): string[] {
  return readJson<string[]>('sanctions.json', []);
}

export function spentLast24h(walletId: string, now = Date.now()): bigint {
  return readJson<SpendRecord[]>('spends.json', [])
    .filter((r) => r.walletId === walletId && now - r.at < DAY_MS)
    .reduce((s, r) => s + BigInt(r.sats), 0n);
}

export function recordSpend(walletId: string, sats: bigint): void {
  const spends = readJson<SpendRecord[]>('spends.json', []);
  spends.push({ walletId, at: Date.now(), sats: sats.toString() });
  writeJson('spends.json', spends);
}

export type Decision =
  | { kind: 'sign'; tier: 1 }
  | { kind: 'hold'; tier: 2; reason: string }
  | { kind: 'refuse'; reason: string };

export function decide(walletId: string, summary: SpendSummary): Decision {
  const sanctioned = new Set(sanctionedAddresses().map((a) => a.toLowerCase()));
  const hit = summary.external.find((o) => sanctioned.has(o.address.toLowerCase()));
  if (hit) return { kind: 'refuse', reason: `Recipient on the sanctions list: ${hit.address}` };

  // Fees count toward the limit: otherwise a thief could destroy the funds by paying huge
  // fees (e.g. 1,000 sats sent, 900,000 sats of fees) without going through the delay.
  const already = spentLast24h(walletId);
  const total = already + outgoing(summary);
  if (total <= DAILY_LIMIT_SATS) return { kind: 'sign', tier: 1 };
  return {
    kind: 'hold',
    tier: 2,
    reason: `Beyond today's instant payments, fees included (${btcAmount(total)} > ${btcAmount(DAILY_LIMIT_SATS)})`,
  };
}

/** What really leaves the wallet: amount sent + network fee. */
export function outgoing(summary: SpendSummary): bigint {
  return summary.sentExternal + summary.fee;
}
