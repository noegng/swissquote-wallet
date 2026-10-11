import { describe, expect, it } from 'vitest';
import {
  accountOrigin,
  buildSpend,
  deriveAddress,
  networkConfig,
  randomSeed,
  rootFromSeed,
  summarizeSpend,
  type WalletPolicy,
} from '../src';

const { network } = networkConfig('regtest');

function wallet(): WalletPolicy {
  const r = () => rootFromSeed(randomSeed(), network);
  return { threshold: 2, keys: [accountOrigin(r()), accountOrigin(r(), 3), accountOrigin(r())] };
}

function spend(policy: WalletPolicy, to: string, utxoPolicy = policy) {
  return buildSpend({
    policy: utxoPolicy,
    network,
    utxos: [{ txid: '22'.repeat(32), vout: 1, value: 80_000n, chain: 0, index: 4 }],
    to,
    amount: 25_000n,
    feeRate: 2,
    changeIndex: 2,
  });
}

describe('PSBT summary checked against the descriptor', () => {
  it('separates recipient, change and fee', () => {
    const policy = wallet();
    const to = deriveAddress(wallet(), 0, 0, network).address;
    const { psbt, fee, change } = spend(policy, to);
    const s = summarizeSpend(psbt, policy, network);
    expect(s.inputTotal).toBe(80_000n);
    expect(s.external).toEqual([{ address: to, value: 25_000n }]);
    expect(s.sentExternal).toBe(25_000n);
    expect(s.change).toBe(change);
    expect(s.fee).toBe(fee);
  });

  it('rejects an input that belongs to another wallet', () => {
    const policy = wallet();
    const other = wallet();
    const { psbt } = spend(policy, deriveAddress(wallet(), 0, 0, network).address, other);
    expect(() => summarizeSpend(psbt, policy, network)).toThrow(/foreign/);
  });

  it('counts as external a "change" that does not match the descriptor', () => {
    const policy = wallet();
    const { psbt } = spend(policy, deriveAddress(wallet(), 0, 0, network).address);
    // A compromised app replaces the change metadata without changing the real address:
    // the address no longer matches what the derivation says, so it is not change.
    const real = psbt.data.outputs[1].bip32Derivation!;
    psbt.data.outputs[1].bip32Derivation = real.map((d) => ({ ...d, path: d.path.replace(/\/2$/, '/7') }));
    const s = summarizeSpend(psbt, policy, network);
    expect(s.change).toBe(0n);
    expect(s.external).toHaveLength(2);
  });
});
