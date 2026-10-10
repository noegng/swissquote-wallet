// Sauvegarde de la clé de secours en SLIP-39 à groupes (skill slip39-backup).
// Seul module qui importe la bibliothèque SLIP-39 : le reste du code passe par ici.
//
// Configuration figée (invariants I2 et I5, voir docs/03-decisions.md) :
//   seuil de groupes 2, groupes [[1,1], [1,1]] = CLIENT et TIERS.
//   CLIENT : une mnémonique, stockée sur papier (C1) et chiffrée dans le cloud (C2).
//   TIERS  : une mnémonique, confiée au partenaire. Swissquote n'a aucune part.
// Ne jamais passer à 3 groupes avec un seuil de 2 : C1 + C2 suffiraient sans partenaire.
import { Buffer } from 'buffer';
import { combineMnemonics, generateMnemonics } from 'shamir-mnemonic-ts';
import { randomSeed } from './keys';

const GROUP_THRESHOLD = 2;
const GROUPS: Array<[number, number]> = [
  [1, 1], // CLIENT
  [1, 1], // TIERS
];

/** 16 octets = 128 bits : mnémoniques de 20 mots, seed BIP-32 valide. */
export const BACKUP_SECRET_BYTES = 16;

export interface BackupShares {
  /** Mnémonique du groupe CLIENT (C1 papier, C2 copie chiffrée). */
  client: string;
  /** Mnémonique du groupe TIERS (partenaire). */
  tiers: string;
}

export function newBackupSecret(): Uint8Array {
  return randomSeed(BACKUP_SECRET_BYTES);
}

export function splitBackupSecret(secret: Uint8Array): BackupShares {
  const [[client], [tiers]] = generateMnemonics(GROUP_THRESHOLD, GROUPS, Buffer.from(secret));
  return { client, tiers };
}

/**
 * Reconstitue le secret de la clé de secours. À n'appeler que sur l'appareil du client (I5),
 * et ne jamais persister ni transmettre le résultat. Lève une erreur si les parts ne suffisent pas.
 */
export function combineBackupShares(mnemonics: string[]): Uint8Array {
  return new Uint8Array(combineMnemonics(mnemonics.map((m) => m.trim().toLowerCase())));
}
