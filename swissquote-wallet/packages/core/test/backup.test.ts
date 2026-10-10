import { describe, expect, it } from 'vitest';
import { combineMnemonics } from 'shamir-mnemonic-ts';
import vectors from './fixtures/slip39-vectors.json';
import {
  BACKUP_SECRET_BYTES,
  combineBackupShares,
  newBackupSecret,
  splitBackupSecret,
  toHex,
} from '../src';

// Vecteurs officiels : https://github.com/trezor/python-shamir-mnemonic/blob/master/vectors.json
// Format : [description, mnémoniques, secret maître hex ("" = invalide), xprv]. Phrase de passe "TREZOR".
describe('bibliothèque SLIP-39 : vecteurs officiels Trezor', () => {
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

describe('clé de secours : groupes CLIENT et TIERS (I2)', () => {
  const secret = newBackupSecret();
  const { client, tiers } = splitBackupSecret(secret);

  it('produit deux mnémoniques de 20 mots', () => {
    expect(secret).toHaveLength(BACKUP_SECRET_BYTES);
    expect(client.split(' ')).toHaveLength(20);
    expect(tiers.split(' ')).toHaveLength(20);
    expect(client).not.toBe(tiers);
  });

  it('CLIENT + TIERS restaure le secret (récupération légitime)', () => {
    expect(toHex(combineBackupShares([client, tiers]))).toBe(toHex(secret));
    expect(toHex(combineBackupShares([tiers, client]))).toBe(toHex(secret));
  });

  it('TIERS seul ne restaure rien : Swissquote + partenaire sont bloqués (I2)', () => {
    expect(() => combineBackupShares([tiers])).toThrow();
  });

  it('CLIENT seul ne restaure rien : voleur du papier (C1) ou du cloud (C2) bloqué', () => {
    expect(() => combineBackupShares([client])).toThrow();
  });

  it('C1 + C2 (même mnémonique CLIENT) ne restaurent rien sans le partenaire', () => {
    expect(() => combineBackupShares([client, client])).toThrow();
  });

  it('une part d’un autre wallet ne se combine pas', () => {
    const other = splitBackupSecret(newBackupSecret());
    expect(() => combineBackupShares([client, other.tiers])).toThrow();
  });

  it('tolère majuscules et espaces autour d’une saisie manuelle de C1', () => {
    expect(toHex(combineBackupShares([`  ${client.toUpperCase()} `, tiers]))).toBe(toHex(secret));
  });
});
