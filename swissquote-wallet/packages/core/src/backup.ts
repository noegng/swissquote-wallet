// Backup key stored as SLIP-39 with groups (skill slip39-backup).
// The only module that imports the SLIP-39 library: the rest of the code goes through here.
//
// Fixed configuration (invariants I2 and I5, see docs/03-decisions.md):
//   group threshold 2, groups [[1,1], [1,1]] = CLIENT and PARTNER ("tiers").
//   CLIENT:  one mnemonic, kept on paper (C1) and encrypted in the cloud (C2).
//   PARTNER: one mnemonic, entrusted to the partner. Swissquote holds no share.
// Never move to 3 groups with a threshold of 2: C1 + C2 would be enough without the partner.
import { Buffer } from 'buffer';
import { combineMnemonics, generateMnemonics, Share } from 'shamir-mnemonic-ts';
import { randomSeed } from './keys';

const GROUP_THRESHOLD = 2;
const GROUPS: Array<[number, number]> = [
  [1, 1], // CLIENT
  [1, 1], // TIERS
];

/** 16 bytes = 128 bits: 20-word mnemonics, a valid BIP-32 seed. */
export const BACKUP_SECRET_BYTES = 16;

export interface BackupShares {
  /** Mnemonic of the CLIENT group (C1 on paper, C2 encrypted copy). */
  client: string;
  /** Mnemonic of the PARTNER group. */
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
 * Rebuilds the backup key secret. Call it on the client's device only (I5),
 * and never store or send the result. Throws if the shares are not enough.
 */
export function combineBackupShares(mnemonics: string[]): Uint8Array {
  return new Uint8Array(combineMnemonics(mnemonics.map((m) => m.trim().toLowerCase().split(/\s+/).join(' '))));
}

/**
 * Identifies a share typed by the client (SLIP-39 checksum included): 'client' or 'tiers' (partner).
 * Throws if the mnemonic is invalid (unknown word, typo) or belongs to another scheme.
 */
export function shareGroup(mnemonic: string): 'client' | 'tiers' {
  const share = Share.fromMnemonic(mnemonic.trim().toLowerCase().split(/\s+/).join(' '));
  if (share.groupThreshold !== GROUP_THRESHOLD || share.groupCount !== GROUPS.length) {
    throw new Error('Valid SLIP-39 share, but not a Swissquote Wallet backup share');
  }
  return share.groupIndex === 0 ? 'client' : 'tiers';
}
