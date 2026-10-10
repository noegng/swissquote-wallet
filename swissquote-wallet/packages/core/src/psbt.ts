// PSBT : création (app), signature (chaque détenteur de clé), combinaison et finalisation.
import { Psbt, address as btcAddress, type Network } from 'bitcoinjs-lib';
import type { BIP32Interface } from 'bip32';
import { deriveAddress, type Chain, type WalletPolicy } from './descriptor';
import { ecc } from './keys';

/** Seuil de poussière d'une sortie P2WSH. */
export const DUST_SATS = 330n;

// Tailles approximatives (vB) d'une transaction P2WSH 2 sur 3, avec marge.
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
  /** Index de l'adresse de change (chemin /1/index du même descripteur). */
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

/** Construit une PSBT non signée : plus grosses UTXO d'abord, change vers le descripteur du client. */
export function buildSpend(args: BuildSpendArgs): BuiltSpend {
  const { policy, network, to, amount, feeRate, changeIndex } = args;
  if (amount < DUST_SATS) throw new Error(`Montant sous le seuil de poussière (${DUST_SATS} sats)`);
  btcAddress.toOutputScript(to, network); // lève une erreur si l'adresse n'est pas de ce réseau

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
  if (change < 0n) throw new Error(`Fonds insuffisants : ${total} sats disponibles`);
  if (change < DUST_SATS) {
    // Change trop petit : on l'abandonne aux frais plutôt que de créer une sortie refusée.
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

/** Signe toutes les entrées qui portent l'empreinte de cette racine. Ne touche pas aux autres. */
export function signWithRoot(psbt: Psbt, root: BIP32Interface): Psbt {
  psbt.signAllInputsHD(root);
  return psbt;
}

const validator = (pubkey: Uint8Array, msghash: Uint8Array, signature: Uint8Array) =>
  ecc.verify(msghash, pubkey, signature);

/** Relit une PSBT reçue en base64 (ex. côté service Swissquote). */
export function psbtFromBase64(base64: string, network: Network): Psbt {
  return Psbt.fromBase64(base64, { network });
}

/** Combine des copies signées séparément (ex. app et service Swissquote). */
export function combinePsbts(base64s: string[], network: Network): Psbt {
  const [first, ...rest] = base64s.map((b) => Psbt.fromBase64(b, { network }));
  return rest.length ? first.combine(...rest) : first;
}

/** Vérifie les signatures puis finalise. Échoue s'il manque une signature (moins de 2 sur 3). */
export function finalizeSpend(psbt: Psbt): { hex: string; txid: string } {
  if (!psbt.validateSignaturesOfAllInputs(validator)) throw new Error('Signature invalide');
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { hex: tx.toHex(), txid: tx.getId() };
}
