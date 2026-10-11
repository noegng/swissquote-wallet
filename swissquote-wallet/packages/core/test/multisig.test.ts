import { describe, expect, it } from 'vitest';
import {
  accountOrigin,
  buildSpend,
  buildSweep,
  combinePsbts,
  deriveAddress,
  descriptorString,
  everyInputSignedBy,
  finalizeSpend,
  networkConfig,
  randomSeed,
  rootFromSeed,
  signWithRoot,
  type WalletPolicy,
} from '../src';

const { network } = networkConfig('regtest');

function makeWallet() {
  const phone = rootFromSeed(randomSeed(), network);
  const swissquote = rootFromSeed(randomSeed(), network);
  const backup = rootFromSeed(randomSeed(), network);
  const policy: WalletPolicy = {
    threshold: 2,
    keys: [accountOrigin(phone), accountOrigin(swissquote), accountOrigin(backup)],
  };
  return { phone, swissquote, backup, policy };
}

function unsignedSpend(policy: WalletPolicy) {
  const external = deriveAddress(makeWallet().policy, 0, 0, network).address;
  return buildSpend({
    policy,
    network,
    utxos: [{ txid: '11'.repeat(32), vout: 0, value: 100_000n, chain: 0, index: 0 }],
    to: external,
    amount: 30_000n,
    feeRate: 2,
    changeIndex: 0,
  });
}

describe('2-of-3 descriptor', () => {
  it('gives a deterministic regtest P2WSH address, independent of the key order', () => {
    const { policy } = makeWallet();
    const a = deriveAddress(policy, 0, 0, network);
    const shuffled: WalletPolicy = { ...policy, keys: [policy.keys[2], policy.keys[0], policy.keys[1]] };
    expect(a.address).toMatch(/^bcrt1q/);
    expect(deriveAddress(shuffled, 0, 0, network).address).toBe(a.address);
    expect(deriveAddress(policy, 0, 1, network).address).not.toBe(a.address);
  });

  it('exports a standard wsh(sortedmulti(2,…)) descriptor', () => {
    const { policy } = makeWallet();
    const d = descriptorString(policy, 0);
    expect(d).toMatch(/^wsh\(sortedmulti\(2,\[[0-9a-f]{8}\/48'\/1'\/0'\/2'\]tpub/);
    expect(d.match(/tpub/g)).toHaveLength(3);
  });

  it('rejects an address from another network', () => {
    const { policy } = makeWallet();
    expect(() =>
      buildSpend({
        policy,
        network,
        utxos: [{ txid: '11'.repeat(32), vout: 0, value: 100_000n, chain: 0, index: 0 }],
        to: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        amount: 30_000n,
        feeRate: 2,
        changeIndex: 0,
      }),
    ).toThrow();
  });

  it('sends the change back to the client descriptor', () => {
    const { policy } = makeWallet();
    const { psbt, change, fee } = unsignedSpend(policy);
    expect(change + fee + 30_000n).toBe(100_000n);
    expect(psbt.txOutputs[1].address).toBe(deriveAddress(policy, 1, 0, network).address);
  });
});

describe('invariants de signature (I1, I3)', () => {
  it('I1: no single key can finalize, Swissquote included', () => {
    const w = makeWallet();
    for (const root of [w.swissquote, w.phone, w.backup]) {
      const { psbt } = unsignedSpend(w.policy);
      signWithRoot(psbt, root);
      expect(() => finalizeSpend(psbt)).toThrow();
    }
  });

  it('the three legitimate pairs finalize: daily use, lost phone, Swissquote gone (I3)', () => {
    const w = makeWallet();
    const pairs = [
      [w.phone, w.swissquote], // usage quotidien
      [w.backup, w.swissquote], // lost phone
      [w.phone, w.backup], // Swissquote disparu (I3)
    ];
    for (const [a, b] of pairs) {
      const { psbt } = unsignedSpend(w.policy);
      // Signatures made on two separate copies, as between the app and the service.
      const copyA = signWithRoot(psbt.clone(), a).toBase64();
      const copyB = signWithRoot(psbt.clone(), b).toBase64();
      const { txid, hex } = finalizeSpend(combinePsbts([copyA, copyB], network));
      expect(txid).toMatch(/^[0-9a-f]{64}$/);
      expect(hex.length).toBeGreaterThan(0);
    }
  });

  it('a key foreign to the wallet signs nothing', () => {
    const w = makeWallet();
    const stranger = rootFromSeed(randomSeed(), network);
    const { psbt } = unsignedSpend(w.policy);
    expect(() => signWithRoot(psbt, stranger)).toThrow();
  });
});

describe('signature from a specific key (recovery)', () => {
  it('tells a PSBT signed by the backup key from one signed by the phone', () => {
    const w = makeWallet();
    const byBackup = signWithRoot(unsignedSpend(w.policy).psbt, w.backup);
    const byPhone = signWithRoot(unsignedSpend(w.policy).psbt, w.phone);
    expect(everyInputSignedBy(byBackup, w.policy.keys[2])).toBe(true);
    expect(everyInputSignedBy(byPhone, w.policy.keys[2])).toBe(false);
    expect(everyInputSignedBy(unsignedSpend(w.policy).psbt, w.policy.keys[2])).toBe(false);
  });
});

describe('moving all funds (recovery, exit)', () => {
  it('a single output, no change, signable by backup + Swissquote', () => {
    const w = makeWallet();
    const to = deriveAddress(makeWallet().policy, 0, 0, network).address;
    const { psbt, fee, change } = buildSweep({
      policy: w.policy,
      network,
      utxos: [
        { txid: '44'.repeat(32), vout: 0, value: 60_000n, chain: 0, index: 0 },
        { txid: '55'.repeat(32), vout: 1, value: 40_000n, chain: 1, index: 3 },
      ],
      to,
      feeRate: 2,
    });
    expect(change).toBe(0n);
    expect(psbt.txOutputs).toHaveLength(1);
    expect(psbt.txOutputs[0].value + fee).toBe(100_000n);
    const a = signWithRoot(psbt.clone(), w.backup).toBase64();
    const b = signWithRoot(psbt.clone(), w.swissquote).toBase64();
    expect(finalizeSpend(combinePsbts([a, b], network)).txid).toMatch(/^[0-9a-f]{64}$/);
  });
});
