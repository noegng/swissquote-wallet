// Choix du réseau Bitcoin et de l'API esplora. Seul endroit où le réseau est défini
// (voir la skill btc-multisig).
import { networks, type Network } from 'bitcoinjs-lib';

export type BtcNetworkName = 'regtest' | 'signet';

export interface NetworkConfig {
  name: BtcNetworkName;
  /** Paramètres bitcoinjs : signet partage ceux de testnet (adresses tb1…). */
  network: Network;
  esploraUrl: string;
  explorerTxUrl: (txid: string) => string;
}

// Signet : blockstream.info par défaut (mempool.space est injoignable sur certains réseaux,
// constaté le 10/10/2026). Les deux exposent la même API esplora.
const DEFAULT_ESPLORA: Record<BtcNetworkName, string> = {
  regtest: 'http://localhost:3000',
  signet: 'https://blockstream.info/signet/api',
};

function explorerBase(name: BtcNetworkName, esploraUrl: string): string {
  if (name === 'regtest') return 'http://localhost:5000';
  return esploraUrl.includes('mempool.space')
    ? 'https://mempool.space/signet'
    : 'https://blockstream.info/signet';
}

export function networkConfig(
  name: BtcNetworkName,
  esploraUrl: string = DEFAULT_ESPLORA[name],
): NetworkConfig {
  const explorer = explorerBase(name, esploraUrl);
  return {
    name,
    network: name === 'signet' ? networks.testnet : networks.regtest,
    esploraUrl,
    explorerTxUrl: (txid) => `${explorer}/tx/${txid}`,
  };
}
