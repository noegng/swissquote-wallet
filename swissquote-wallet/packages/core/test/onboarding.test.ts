import { describe, expect, it } from 'vitest';
import { accountOrigin, backupRootFromShares, createWalletMaterial, networkConfig } from '../src';

const { network } = networkConfig('regtest');

describe('matériel d’un nouveau wallet', () => {
  it('la clé de secours se reconstitue à l’identique depuis CLIENT + TIERS (I3)', () => {
    const m = createWalletMaterial(network);
    const root = backupRootFromShares([m.shares.client, m.shares.tiers], network);
    expect(accountOrigin(root)).toEqual(m.backupKey);
  });

  it('ne renvoie pas le secret de la clé de secours, seulement ses parts', () => {
    const m = createWalletMaterial(network);
    expect(Object.keys(m).sort()).toEqual(['backupKey', 'phoneKey', 'phoneSeed', 'shares']);
    expect(m.phoneKey.xpub).not.toBe(m.backupKey.xpub);
  });

  it('une seule part ne reconstitue pas la clé de secours (I2)', () => {
    const m = createWalletMaterial(network);
    expect(() => backupRootFromShares([m.shares.tiers], network)).toThrow();
    expect(() => backupRootFromShares([m.shares.client], network)).toThrow();
  });
});
