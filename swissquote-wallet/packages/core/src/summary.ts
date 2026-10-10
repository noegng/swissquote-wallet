// Analyse d'une PSBT par rapport au descripteur du client. Utilisée par le cosignataire Swissquote
// pour vérifier la transaction indépendamment de l'app (une app compromise peut mentir), et par
// l'app pour afficher un résumé en clair avant signature.
import type { Psbt, Network } from 'bitcoinjs-lib';
import { deriveAddress, type Chain, type WalletPolicy } from './descriptor';
import type { KeyOrigin } from './keys';
import { toHex } from './keys';

export interface SpendSummary {
  inputTotal: bigint;
  /** Sorties qui quittent le wallet (destinataires). */
  external: { address: string; value: bigint }[];
  /** Total envoyé hors du wallet. */
  sentExternal: bigint;
  /** Total qui revient au wallet (change). */
  change: bigint;
  fee: bigint;
}

function equalBytes(a?: Uint8Array, b?: Uint8Array): boolean {
  return !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Retrouve (chaîne, index) d'un chemin `…/compte/chaîne/index` appartenant à cette clé. */
function chainIndexFor(
  derivations: { masterFingerprint: Uint8Array; path: string }[] | undefined,
  key: KeyOrigin,
): { chain: Chain; index: number } | null {
  for (const d of derivations ?? []) {
    if (toHex(d.masterFingerprint) !== key.fingerprint) continue;
    const m = d.path.match(/^(.*)\/([01])\/(\d+)$/);
    if (!m || m[1].replace(/h/g, "'") !== key.path) continue;
    return { chain: Number(m[2]) as Chain, index: Number(m[3]) };
  }
  return null;
}

/**
 * Vérifie que chaque entrée appartient au descripteur du client et classe chaque sortie en
 * change (vérifié par re-dérivation) ou destinataire externe. Lève une erreur sinon.
 * `ownKey` : la clé du vérificateur (ex. Swissquote), utilisée pour lire les chemins de dérivation.
 */
export function summarizeSpend(
  psbt: Psbt,
  policy: WalletPolicy,
  network: Network,
  ownKey: KeyOrigin = policy.keys[1],
): SpendSummary {
  let inputTotal = 0n;
  psbt.data.inputs.forEach((input, i) => {
    const at = chainIndexFor(input.bip32Derivation, ownKey);
    if (!at || !input.witnessUtxo) throw new Error(`Entrée ${i} étrangère au wallet`);
    const expected = deriveAddress(policy, at.chain, at.index, network);
    if (
      !equalBytes(input.witnessUtxo.script, expected.output) ||
      !equalBytes(input.witnessScript, expected.witnessScript)
    ) {
      throw new Error(`Entrée ${i} : script différent du descripteur du client`);
    }
    inputTotal += input.witnessUtxo.value;
  });

  const external: SpendSummary['external'] = [];
  let change = 0n;
  psbt.txOutputs.forEach((out, i) => {
    const at = chainIndexFor(psbt.data.outputs[i].bip32Derivation, ownKey);
    const isChange =
      at !== null &&
      at.chain === 1 &&
      equalBytes(out.script, deriveAddress(policy, 1, at.index, network).output);
    if (isChange) change += out.value;
    else external.push({ address: out.address ?? '(script inconnu)', value: out.value });
  });

  const sentExternal = external.reduce((s, o) => s + o.value, 0n);
  const fee = inputTotal - sentExternal - change;
  if (fee < 0n) throw new Error('Frais négatifs : PSBT incohérente');
  return { inputTotal, external, sentExternal, change, fee };
}
