// esplora client against a simulated API (fetch replaced): address discovery with a gap limit,
// diffusion rejouable.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accountOrigin,
  deriveAddress,
  Esplora,
  networkConfig,
  randomSeed,
  rootFromSeed,
  StaleTransactionError,
  type WalletPolicy,
} from '../src';

const cfg = networkConfig('regtest', 'http://esplora.test');
const { network } = cfg;

function makePolicy(): WalletPolicy {
  const key = () => accountOrigin(rootFromSeed(randomSeed(), network));
  return { threshold: 2, keys: [key(), key(), key()] };
}

/** Simulated API: `used` = addresses that already have a transaction, `utxos` = UTXOs per address. */
function fakeApi(used: Set<string>, utxos: Record<string, { txid: string; vout: number; value: number }[]> = {}) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(cfg.esploraUrl, '');
    calls.push(path);
    const m = path.match(/^\/address\/([^/]+)(\/utxo)?$/);
    if (!m) return new Response('not found', { status: 404 });
    if (m[2]) return Response.json((utxos[m[1]] ?? []).map((u) => ({ ...u, status: { confirmed: true } })));
    const n = used.has(m[1]) ? 1 : 0;
    return Response.json({ chain_stats: { tx_count: n }, mempool_stats: { tx_count: 0 } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('address discovery (gap limit)', () => {
  it('finds funds beyond index 20 as long as the gap stays under the gap limit', async () => {
    const policy = makePolicy();
    const addr = (chain: 0 | 1, i: number) => deriveAddress(policy, chain, i, network).address;
    // 25 used receive addresses (0 to 24), with a UTXO at index 24; change used up to 21.
    const used = new Set([...Array.from({ length: 25 }, (_, i) => addr(0, i)), ...Array.from({ length: 22 }, (_, i) => addr(1, i))]);
    fakeApi(used, {
      [addr(0, 24)]: [{ txid: 'a'.repeat(64), vout: 0, value: 5000 }],
      [addr(1, 21)]: [{ txid: 'b'.repeat(64), vout: 1, value: 700 }],
    });
    const state = await new Esplora(cfg).walletState(policy, network, 20);
    expect(state.nextReceive).toBe(25);
    expect(state.nextChange).toBe(22);
    expect(state.utxos.map((u) => [u.chain, u.index, u.value])).toEqual([
      [0, 24, 5000n],
      [1, 21, 700n],
    ]);
  }, 60_000);

  it('stops after `gap` consecutive empty addresses and reads UTXOs of used addresses only', async () => {
    const policy = makePolicy();
    const calls = fakeApi(new Set([deriveAddress(policy, 0, 0, network).address]));
    const state = await new Esplora(cfg).walletState(policy, network, 5);
    expect(state.nextReceive).toBe(1);
    expect(state.nextChange).toBe(0);
    expect(calls.filter((c) => c.endsWith('/utxo'))).toHaveLength(1);
  }, 30_000);
});

describe('provider failover', () => {
  it('moves to the other provider when the first one is over its request limit, and stays there', async () => {
    const two = { ...cfg, esploraUrl: 'http://first.test', esploraFallbacks: ['http://second.test'] };
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.startsWith('http://first.test')) return new Response('Too Many Requests', { status: 429 });
      return Response.json({ chain_stats: { tx_count: 3 }, mempool_stats: { tx_count: 1 } });
    });
    const client = new Esplora(two);
    await expect(client.addressTxCount('addr')).resolves.toBe(4);
    await expect(client.addressTxCount('addr')).resolves.toBe(4);
    expect(calls).toEqual(['http://first.test/address/addr', 'http://second.test/address/addr', 'http://second.test/address/addr']);
  });

  it('fails with the provider error when every provider refuses', async () => {
    const two = { ...cfg, esploraUrl: 'http://third.test', esploraFallbacks: ['http://fourth.test'] };
    vi.stubGlobal('fetch', async () => new Response('Too Many Requests', { status: 429 }));
    await expect(new Esplora(two).addressTxCount('addr')).rejects.toThrow(/429/);
  });
});

describe('diffusion rejouable', () => {
  function fakeBroadcast(error: string, known: boolean) {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(error, { status: 400 });
      if (url.endsWith('/status')) return known ? Response.json({ confirmed: true }) : new Response('Transaction not found', { status: 404 });
      return new Response('?', { status: 404 });
    });
  }

  it('a transaction the network already knows counts as broadcast', async () => {
    fakeBroadcast('sendrawtransaction RPC error: {"code":-27,"message":"Transaction already in block chain"}', true);
    await expect(new Esplora(cfg).broadcastOnce('00', 'c'.repeat(64))).resolves.toBe('c'.repeat(64));
  });

  it('inputs already spent elsewhere give a final error', async () => {
    fakeBroadcast('sendrawtransaction RPC error: {"code":-25,"message":"bad-txns-inputs-missingorspent"}', false);
    await expect(new Esplora(cfg).broadcastOnce('00', 'd'.repeat(64))).rejects.toBeInstanceOf(StaleTransactionError);
  });

  it('any other error stays an ordinary error (it can be retried)', async () => {
    fakeBroadcast('min relay fee not met', false);
    const err = await new Esplora(cfg).broadcastOnce('00', 'e'.repeat(64)).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(StaleTransactionError);
  });
});
