// Matériel d'un nouveau wallet, généré sur l'appareil du client (skill slip39-backup).
// Le secret de la clé de secours n'est jamais renvoyé : seulement ses deux parts SLIP-39 et sa
// clé publique. L'appelant envoie la part TIERS scellée au partenaire, montre la part CLIENT,
// puis oublie les deux (I4, I5).
import type { Network } from 'bitcoinjs-lib';
import { combineBackupShares, newBackupSecret, splitBackupSecret, type BackupShares } from './backup';
import { accountOrigin, randomSeed, rootFromSeed, type KeyOrigin } from './keys';

export interface NewWalletMaterial {
  /** Graine de la clé téléphone : à chiffrer immédiatement sur l'appareil. */
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

/** Reconstitue la racine de la clé de secours à partir des parts CLIENT et TIERS (appareil du client uniquement). */
export function backupRootFromShares(mnemonics: string[], network: Network) {
  const secret = combineBackupShares(mnemonics);
  try {
    return rootFromSeed(secret, network);
  } finally {
    secret.fill(0);
  }
}
