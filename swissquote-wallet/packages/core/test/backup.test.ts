import { describe, expect, it } from 'vitest';
import { combineMnemonics } from 'shamir-mnemonic-ts';
import vectors from './fixtures/slip39-vectors.json';
import {
  BACKUP_SECRET_BYTES,
  combineBackupShares,
  newBackupSecret,
  shareGroup,
  splitBackupSecret,
  toHex,
} from '../src';

// Vecteurs officiels : https://github.com/trezor/python-shamir-mnemonic/blob/master/vectors.json
// Format: [description, mnemonics, master secret hex ("" = invalid), xprv]. Passphrase "TREZOR".
describe('SLIP-39 library: official Trezor vectors', () => {
  for (const [description, mnemonics, secretHex] of vectors as [string, string[], string, string][]) {
    it(description, () => {
      if (secretHex) {
        expect(combineMnemonics(mnemonics, 'TREZOR').toString('hex')).toBe(secretHex);
      } else {
        expect(() => combineMnemonics(mnemonics, 'TREZOR')).toThrow();
      }
    });
  }
});

describe('backup key: CLIENT and PARTNER groups (I2)', () => {
  const secret = newBackupSecret();
  const { client, tiers } = splitBackupSecret(secret);

  it('produces two 20-word mnemonics', () => {
    expect(secret).toHaveLength(BACKUP_SECRET_BYTES);
    expect(client.split(' ')).toHaveLength(20);
    expect(tiers.split(' ')).toHaveLength(20);
    expect(client).not.toBe(tiers);
  });

  it('CLIENT + PARTNER restores the secret (legitimate recovery)', () => {
    expect(toHex(combineBackupShares([client, tiers]))).toBe(toHex(secret));
    expect(toHex(combineBackupShares([tiers, client]))).toBe(toHex(secret));
  });

  it('PARTNER alone restores nothing: Swissquote + partner are blocked (I2)', () => {
    expect(() => combineBackupShares([tiers])).toThrow();
  });

  it('CLIENT alone restores nothing: a thief of the paper (C1) or the cloud copy (C2) is blocked', () => {
    expect(() => combineBackupShares([client])).toThrow();
  });

  it('C1 + C2 (same CLIENT mnemonic) restore nothing without the partner', () => {
    expect(() => combineBackupShares([client, client])).toThrow();
  });

  it('a share from another wallet does not combine', () => {
    const other = splitBackupSecret(newBackupSecret());
    expect(() => combineBackupShares([client, other.tiers])).toThrow();
  });

  it('identifies the group of a share and detects a typo', () => {
    expect(shareGroup(client)).toBe('client');
    expect(shareGroup(tiers)).toBe('tiers');
    const words = client.split(' ');
    words[5] = words[5] === 'academic' ? 'acid' : 'academic';
    expect(() => shareGroup(words.join(' '))).toThrow();
  });

  it('tolerates capitals and spaces around a manually typed C1', () => {
    expect(toHex(combineBackupShares([`  ${client.toUpperCase()} `, tiers]))).toBe(toHex(secret));
  });
});
