// Analysis of a PSBT against the client's descriptor. Used by the Swissquote cosigner
// to check the transaction independently of the app (a compromised app can lie), and by
// the app to show a plain-language summary before signing.
import type { Psbt, Network } from 'bitcoinjs-lib';
import { deriveAddress, type Chain, type WalletPolicy } from './descriptor';
import type { KeyOrigin } from './keys';
import { toHex } from './keys';

export interface SpendSummary {
  inputTotal: bigint;
  /** Outputs that leave the wallet (recipients). */
  external: { address: string; value: bigint }[];
  /** Total sent out of the wallet. */
  sentExternal: bigint;
  /** Total that comes back to the wallet (change). */
  change: bigint;
  fee: bigint;
}

function equalBytes(a?: Uint8Array, b?: Uint8Array): boolean {
  return !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Finds (chain, index) from a `…/account/chain/index` path that belongs to this key. */
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
 * Checks that every input belongs to the client's descriptor and classifies each output as
 * change (checked by re-deriving it) or external recipient. Throws otherwise.
 * `ownKey`: the verifier's key (e.g. Swissquote), used to read the derivation paths.
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
    if (!at || !input.witnessUtxo) throw new Error(`Input ${i} is foreign to the wallet`);
    const expected = deriveAddress(policy, at.chain, at.index, network);
    if (
      !equalBytes(input.witnessUtxo.script, expected.output) ||
      !equalBytes(input.witnessScript, expected.witnessScript)
    ) {
      throw new Error(`Input ${i}: script differs from the client's descriptor`);
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
    else external.push({ address: out.address ?? '(unknown script)', value: out.value });
  });

  const sentExternal = external.reduce((s, o) => s + o.value, 0n);
  const fee = inputTotal - sentExternal - change;
  if (fee < 0n) throw new Error('Negative fee: inconsistent PSBT');
  return { inputTotal, external, sentExternal, change, fee };
}
