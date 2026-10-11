import { describe, expect, it } from 'vitest';
import { accountOrigin, backupRootFromShares, createWalletMaterial, networkConfig } from '../src';

const { network } = networkConfig('regtest');

describe('material for a new wallet', () => {
  it('the backup key is rebuilt identically from CLIENT + PARTNER (I3)', () => {
    const m = createWalletMaterial(network);
    const root = backupRootFromShares([m.shares.client, m.shares.tiers], network);
    expect(accountOrigin(root)).toEqual(m.backupKey);
  });

  it('does not return the backup key secret, only its shares', () => {
    const m = createWalletMaterial(network);
    expect(Object.keys(m).sort()).toEqual(['backupKey', 'phoneKey', 'phoneSeed', 'shares']);
    expect(m.phoneKey.xpub).not.toBe(m.backupKey.xpub);
  });

  it('a single share does not rebuild the backup key (I2)', () => {
    const m = createWalletMaterial(network);
    expect(() => backupRootFromShares([m.shares.tiers], network)).toThrow();
    expect(() => backupRootFromShares([m.shares.client], network)).toThrow();
  });
});
