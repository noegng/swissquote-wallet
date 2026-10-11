// PSBT: creation (app), signing (each key holder), combining and finalizing.
import { Psbt, address as btcAddress, type Network } from 'bitcoinjs-lib';
import type { BIP32Interface } from 'bip32';
import { deriveAddress, type Chain, type WalletPolicy } from './descriptor';
import { ecc, toHex, type KeyOrigin } from './keys';

/** Dust threshold of a P2WSH output. */
export const DUST_SATS = 330n;

// Approximate sizes (vB) of a 2-of-3 P2WSH transaction, with a margin.
const VBYTES_BASE = 11;
const VBYTES_PER_INPUT = 105;
const VBYTES_PER_OUTPUT = 43;

export interface WalletUtxo {
  txid: string;
  vout: number;
  value: bigint;
  chain: Chain;
  index: number;
}

export interface BuildSpendArgs {
  policy: WalletPolicy;
  network: Network;
  utxos: WalletUtxo[];
  to: string;
  amount: bigint;
  /** sat/vB */
  feeRate: number;
  /** Index of the change address (path /1/index of the same descriptor). */
  changeIndex: number;
}

export interface BuiltSpend {
  psbt: Psbt;
  fee: bigint;
  change: bigint;
}

function estimateFee(inputs: number, outputs: number, feeRate: number): bigint {
  const vbytes = VBYTES_BASE + VBYTES_PER_INPUT * inputs + VBYTES_PER_OUTPUT * outputs;
  return BigInt(Math.ceil(vbytes * feeRate));
}

/** Builds an unsigned PSBT: largest UTXOs first, change back to the client's descriptor. */
export function buildSpend(args: BuildSpendArgs): BuiltSpend {
  const { policy, network, to, amount, feeRate, changeIndex } = args;
  if (amount < DUST_SATS) throw new Error(`Amount below the dust threshold (${DUST_SATS} sats)`);
  btcAddress.toOutputScript(to, network); // throws if the address is not on this network

  const sorted = [...args.utxos].sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
  const selected: WalletUtxo[] = [];
  let total = 0n;
  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    if (total >= amount + estimateFee(selected.length, 2, feeRate)) break;
  }

  let fee = estimateFee(selected.length, 2, feeRate);
  let change = total - amount - fee;
  if (change < 0n) throw new Error(`Insufficient funds: ${total} sats available`);
  if (change < DUST_SATS) {
    // Change too small: leave it to the fee rather than create an output the network rejects.
    fee = total - amount;
    change = 0n;
  }

  const psbt = new Psbt({ network });
  for (const u of selected) {
    const d = deriveAddress(policy, u.chain, u.index, network);
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: d.output, value: u.value },
      witnessScript: d.witnessScript,
      bip32Derivation: d.bip32Derivation,
    });
  }
  psbt.addOutput({ address: to, value: amount });
  if (change > 0n) {
    const c = deriveAddress(policy, 1, changeIndex, network);
    psbt.addOutput({ address: c.address, value: change, bip32Derivation: c.bip32Derivation });
  }
  return { psbt, fee, change };
}

/** Moves all funds to a single address, with no change (recovery, exit). */
export function buildSweep(args: Omit<BuildSpendArgs, 'amount' | 'changeIndex'>): BuiltSpend {
  const { policy, network, utxos, to, feeRate } = args;
  if (utxos.length === 0) throw new Error('No funds to move');
  btcAddress.toOutputScript(to, network);
  const total = utxos.reduce((s, u) => s + u.value, 0n);
  const fee = estimateFee(utxos.length, 1, feeRate);
  if (total - fee < DUST_SATS) throw new Error(`Not enough funds to cover the fees (${total} sats)`);
  const psbt = new Psbt({ network });
  for (const u of utxos) {
    const d = deriveAddress(policy, u.chain, u.index, network);
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: d.output, value: u.value },
      witnessScript: d.witnessScript,
      bip32Derivation: d.bip32Derivation,
    });
  }
  psbt.addOutput({ address: to, value: total - fee });
  return { psbt, fee, change: 0n };
}

/** Signs every input carrying this root's fingerprint. Leaves the others untouched. */
export function signWithRoot(psbt: Psbt, root: BIP32Interface): Psbt {
  psbt.signAllInputsHD(root);
  return psbt;
}

const validator = (pubkey: Uint8Array, msghash: Uint8Array, signature: Uint8Array) =>
  ecc.verify(msghash, pubkey, signature);

/**
 * True if every input carries a valid signature from `key` (found by its fingerprint in
 * the BIP-32 paths). Used by the cosigner during recovery: require the backup key, not the
 * lost phone's.
 */
export function everyInputSignedBy(psbt: Psbt, key: KeyOrigin): boolean {
  return psbt.data.inputs.every((input, i) => {
    const d = input.bip32Derivation?.find((x) => toHex(x.masterFingerprint) === key.fingerprint);
    if (!d || !input.partialSig?.some((s) => toHex(s.pubkey) === toHex(d.pubkey))) return false;
    try {
      return psbt.validateSignaturesOfInput(i, validator, d.pubkey);
    } catch {
      return false;
    }
  });
}

/** Parses a PSBT received as base64 (e.g. on the Swissquote service side). */
export function psbtFromBase64(base64: string, network: Network): Psbt {
  return Psbt.fromBase64(base64, { network });
}

/** Combines copies signed separately (e.g. by the app and the Swissquote service). */
export function combinePsbts(base64s: string[], network: Network): Psbt {
  const [first, ...rest] = base64s.map((b) => Psbt.fromBase64(b, { network }));
  return rest.length ? first.combine(...rest) : first;
}

/** Checks the signatures, then finalizes. Fails if a signature is missing (fewer than 2 of 3). */
export function finalizeSpend(psbt: Psbt): { hex: string; txid: string } {
  if (!psbt.validateSignaturesOfAllInputs(validator)) throw new Error('Signature invalide');
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId() };
}
