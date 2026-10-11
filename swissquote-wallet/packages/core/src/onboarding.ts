// Material for a new wallet, generated on the client's device (skill slip39-backup).
// The backup key secret is never returned: only its two SLIP-39 shares and its
// public key. The caller sends the sealed PARTNER share to the partner, shows the CLIENT share,
// then forgets both (I4, I5).
import type { Network } from 'bitcoinjs-lib';
import { combineBackupShares, newBackupSecret, splitBackupSecret, type BackupShares } from './backup';
import { accountOrigin, randomSeed, rootFromSeed, type KeyOrigin } from './keys';

export interface NewWalletMaterial {
  /** Phone key seed: encrypt it on the device right away. */
  phoneSeed: Uint8Array;
  phoneKey: KeyOrigin;
  backupKey: KeyOrigin;
  shares: BackupShares;
}

export function createWalletMaterial(network: Network): NewWalletMaterial {
  const phoneSeed = randomSeed();
  const backupSecret = newBackupSecret();
  const material = {
    phoneSeed,
    phoneKey: accountOrigin(rootFromSeed(phoneSeed, network)),
    backupKey: accountOrigin(rootFromSeed(backupSecret, network)),
    shares: splitBackupSecret(backupSecret),
  };
  backupSecret.fill(0);
  return material;
}

/** Rebuilds the backup key root from the CLIENT and PARTNER shares (on the client's device only). */
export function backupRootFromShares(mnemonics: string[], network: Network) {
  const secret = combineBackupShares(mnemonics);
  try {
    return rootFromSeed(secret, network);
  } finally {
    secret.fill(0);
  }
}
