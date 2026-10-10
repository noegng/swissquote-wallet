// Descripteur du wallet : wsh(sortedmulti(2, téléphone, swissquote, secours)).
import { payments, type Network } from 'bitcoinjs-lib';
import { bip32, fromHex, type KeyOrigin } from './keys';

export type Chain = 0 | 1; // 0 = réception, 1 = change

export interface WalletPolicy {
  threshold: 2;
  /** Ordre fixe : [téléphone, swissquote, secours]. Le script trie les clés de toute façon. */
  keys: [phone: KeyOrigin, swissquote: KeyOrigin, backup: KeyOrigin];
}

export interface Bip32Derivation {
  masterFingerprint: Uint8Array;
  pubkey: Uint8Array;
  path: string;
}

export interface DerivedAddress {
  address: string;
  chain: Chain;
  index: number;
  /** scriptPubKey P2WSH. */
  output: Uint8Array;
  /** Script multisig (witnessScript). */
  witnessScript: Uint8Array;
  bip32Derivation: Bip32Derivation[];
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function deriveAddress(
  policy: WalletPolicy,
  chain: Chain,
  index: number,
  network: Network,
): DerivedAddress {
  const bip32Derivation = policy.keys.map((k) => ({
    masterFingerprint: fromHex(k.fingerprint),
    pubkey: bip32.fromBase58(k.xpub, network).derive(chain).derive(index).publicKey,
    path: `${k.path}/${chain}/${index}`,
  }));
  // sortedmulti (BIP-67) : clés publiques triées par ordre lexicographique des octets.
  const pubkeys = bip32Derivation.map((d) => d.pubkey).sort(compareBytes);
  const p2wsh = payments.p2wsh({
    redeem: payments.p2ms({ m: policy.threshold, pubkeys, network }),
    network,
  });
  return {
    address: p2wsh.address!,
    chain,
    index,
    output: p2wsh.output!,
    witnessScript: p2wsh.redeem!.output!,
    bip32Derivation,
  };
}

/**
 * Descripteur lisible (sans checksum), pour le kit de sortie et le registre Travel Rule.
 * Bitcoin Core calcule le checksum avec `getdescriptorinfo`.
 */
export function descriptorString(policy: WalletPolicy, chain: Chain): string {
  const keys = policy.keys
    .map((k) => `[${k.fingerprint}${k.path.slice(1)}]${k.xpub}/${chain}/*`)
    .join(',');
  return `wsh(sortedmulti(${policy.threshold},${keys}))`;
}
