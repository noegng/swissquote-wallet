// Génération et dérivation des clés (BIP-32 / BIP-48). Aucune primitive écrite à la main :
// bip32 + @bitcoinerlab/secp256k1, aléa via WebCrypto (navigateur et Node).
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory, type BIP32Interface } from 'bip32';
import { initEccLib, type Network } from 'bitcoinjs-lib';

initEccLib(ecc);
export const bip32 = BIP32Factory(ecc);
export { ecc };

/** Chemin de compte BIP-48 multisig P2WSH sur les réseaux de test (coin type 1, script type 2). */
export function accountPath(account = 0): string {
  return `m/48'/1'/${account}'/2'`;
}

/** Clé publique de compte avec son origine, telle qu'elle apparaît dans le descripteur. */
export interface KeyOrigin {
  /** Empreinte de la racine (8 caractères hex). */
  fingerprint: string;
  /** Chemin de la racine au compte, ex. m/48'/1'/0'/2'. */
  path: string;
  /** xpub (tpub) du compte. */
  xpub: string;
}

export function randomSeed(bytes = 32): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(bytes));
}

export function rootFromSeed(seed: Uint8Array, network: Network): BIP32Interface {
  return bip32.fromSeed(seed, network);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
}

export function accountOrigin(root: BIP32Interface, account = 0): KeyOrigin {
  const path = accountPath(account);
  return {
    fingerprint: toHex(root.fingerprint),
    path,
    xpub: root.derivePath(path).neutered().toBase58(),
  };
}
