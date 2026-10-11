// [MOCK] Swissquote key. A master seed generated on first start, in clear in data/
// (in production: HSM or enclave, dual control). Each client wallet has its own BIP-48
// account derived from this seed: one client's SQ key never signs for another client.
import {
  accountOrigin,
  fromHex,
  randomSeed,
  rootFromSeed,
  toHex,
  type KeyOrigin,
  type NetworkConfig,
} from '@sqw/core';
import { readJson, writeJson } from './store';

export class SwissquoteSigner {
  readonly root: ReturnType<typeof rootFromSeed>;

  constructor(cfg: NetworkConfig) {
    let master = readJson<{ seed?: string }>('master-key.json', {});
    if (!master.seed) {
      master = { seed: toHex(randomSeed()) };
      writeJson('master-key.json', { ...master, warning: 'MOCK: key in clear, HSM in production' });
    }
    this.root = rootFromSeed(fromHex(master.seed!), cfg.network);
  }

  keyForAccount(account: number): KeyOrigin {
    return accountOrigin(this.root, account);
  }
}
