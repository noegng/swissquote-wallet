// Choice of the Bitcoin network and of the esplora API. The only place where the network is defined
// (see the btc-multisig skill).
import { networks, type Network } from 'bitcoinjs-lib';

export type BtcNetworkName = 'regtest' | 'signet';

export interface NetworkConfig {
  name: BtcNetworkName;
  /** bitcoinjs parameters: signet shares testnet's (tb1… addresses). */
  network: Network;
  esploraUrl: string;
  explorerTxUrl: (txid: string) => string;
}

// Signet: blockstream.info by default (mempool.space is unreachable from some networks,
// seen on 10/10/2026). Both expose the same esplora API.
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
