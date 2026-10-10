import { describe, expect, it } from 'vitest';
import { networkConfig } from '../src/network';

describe('networkConfig', () => {
  it('pointe signet vers blockstream.info', () => {
    const cfg = networkConfig('signet');
    expect(cfg.esploraUrl).toBe('https://blockstream.info/signet/api');
    expect(cfg.explorerTxUrl('abc')).toBe('https://blockstream.info/signet/tx/abc');
  });

  it('pointe regtest vers le regtest Docker local', () => {
    expect(networkConfig('regtest').esploraUrl).toBe('http://localhost:3000');
  });
});
