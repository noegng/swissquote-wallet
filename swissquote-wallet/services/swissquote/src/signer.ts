// [MOCK] Clé Swissquote. Une graine maître générée au premier lancement, en clair dans data/
// (en production : HSM ou enclave, double contrôle). Chaque wallet client a son propre compte
// BIP-48 dérivé de cette graine : la clé SQ d'un client ne signe jamais pour un autre client.
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
      writeJson('master-key.json', { ...master, warning: 'MOCK : clé en clair, HSM en production' });
    }
    this.root = rootFromSeed(fromHex(master.seed!), cfg.network);
  }

  keyForAccount(account: number): KeyOrigin {
    return accountOrigin(this.root, account);
  }
}
