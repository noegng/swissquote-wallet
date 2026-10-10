import { describe, expect, it } from 'vitest';
import {
  accountOrigin,
  buildSpend,
  combinePsbts,
  deriveAddress,
  descriptorString,
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

describe('descripteur 2 sur 3', () => {
  it('donne une adresse P2WSH regtest déterministe, indépendante de l’ordre des clés', () => {
    const { policy } = makeWallet();
    const a = deriveAddress(policy, 0, 0, network);
    const shuffled: WalletPolicy = { ...policy, keys: [policy.keys[2], policy.keys[0], policy.keys[1]] };
    expect(a.address).toMatch(/^bcrt1q/);
    expect(deriveAddress(shuffled, 0, 0, network).address).toBe(a.address);
    expect(deriveAddress(policy, 0, 1, network).address).not.toBe(a.address);
  });

  it('exporte un descripteur standard wsh(sortedmulti(2,…))', () => {
    const { policy } = makeWallet();
    const d = descriptorString(policy, 0);
    expect(d).toMatch(/^wsh\(sortedmulti\(2,\[[0-9a-f]{8}\/48'\/1'\/0'\/2'\]tpub/);
    expect(d.match(/tpub/g)).toHaveLength(3);
  });

  it('refuse une adresse d’un autre réseau', () => {
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

  it('envoie le change vers le descripteur du client', () => {
    const { policy } = makeWallet();
    const { psbt, change, fee } = unsignedSpend(policy);
    expect(change + fee + 30_000n).toBe(100_000n);
    expect(psbt.txOutputs[1].address).toBe(deriveAddress(policy, 1, 0, network).address);
  });
});

describe('invariants de signature (I1, I3)', () => {
  it('I1 : aucune clé seule ne peut finaliser, Swissquote compris', () => {
    const w = makeWallet();
    for (const root of [w.swissquote, w.phone, w.backup]) {
      const { psbt } = unsignedSpend(w.policy);
      signWithRoot(psbt, root);
      expect(() => finalizeSpend(psbt)).toThrow();
    }
  });

  it('les trois paires légitimes finalisent : quotidien, téléphone perdu, Swissquote disparu (I3)', () => {
    const w = makeWallet();
    const pairs = [
      [w.phone, w.swissquote], // usage quotidien
      [w.backup, w.swissquote], // téléphone perdu
      [w.phone, w.backup], // Swissquote disparu (I3)
    ];
    for (const [a, b] of pairs) {
      const { psbt } = unsignedSpend(w.policy);
      // Signatures produites sur deux copies séparées, comme entre l'app et le service.
      const copyA = signWithRoot(psbt.clone(), a).toBase64();
      const copyB = signWithRoot(psbt.clone(), b).toBase64();
      const { txid, hex } = finalizeSpend(combinePsbts([copyA, copyB], network));
      expect(txid).toMatch(/^[0-9a-f]{64}$/);
      expect(hex.length).toBeGreaterThan(0);
    }
  });

  it('une clé étrangère au wallet ne signe rien', () => {
    const w = makeWallet();
    const stranger = rootFromSeed(randomSeed(), network);
    const { psbt } = unsignedSpend(w.policy);
    expect(() => signWithRoot(psbt, stranger)).toThrow();
  });
});
