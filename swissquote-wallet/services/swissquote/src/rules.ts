// [MOCK] Règles du cosignataire Swissquote, appliquées dans cet ordre (skill mock-service) :
//   1. la PSBT n'utilise que des fonds du wallet et le change revient au wallet (summarizeSpend)
//   2. aucun destinataire sur la liste de sanctions (mock : liste de démonstration)
//   3. palier 1 : cumul des 24 dernières heures sous le plafond → signature immédiate
//      palier 2 : au-dessus → mise en attente, notification, signature après délai sauf annulation
// Swissquote peut refuser ou retarder, jamais signer seul : il n'a qu'une clé sur trois.
import type { SpendSummary } from '@sqw/core';
import { readJson, writeJson } from './store';

export const DAILY_LIMIT_SATS = BigInt(process.env.DAILY_LIMIT_SATS ?? 50_000);
export const HIGH_VALUE_DELAY_SECONDS = Number(process.env.HIGH_VALUE_DELAY_SECONDS ?? 120);

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
  const sanctioned = new Set(sanctionedAddresses());
  const hit = summary.external.find((o) => sanctioned.has(o.address));
  if (hit) return { kind: 'refuse', reason: `Destinataire sur la liste de sanctions : ${hit.address}` };

  const already = spentLast24h(walletId);
  if (already + summary.sentExternal <= DAILY_LIMIT_SATS) return { kind: 'sign', tier: 1 };
  return {
    kind: 'hold',
    tier: 2,
    reason: `Au-dessus du plafond quotidien (${already + summary.sentExternal} > ${DAILY_LIMIT_SATS} sats)`,
  };
}
