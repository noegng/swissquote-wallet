import { describe, expect, it } from 'vitest';
import { networkConfig } from '../src/network';

describe('networkConfig', () => {
  it('pointe signet vers mempool.space', () => {
    const cfg = networkConfig('signet');
    expect(cfg.esploraUrl).toBe('https://mempool.space/signet/api');
    expect(cfg.explorerTxUrl('abc')).toBe('https://mempool.space/signet/tx/abc');
  });

  it('pointe regtest vers le regtest Docker local', () => {
    expect(networkConfig('regtest').esploraUrl).toBe('http://localhost:3000');
  });
});
