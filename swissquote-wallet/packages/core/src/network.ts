// Choice of the Bitcoin network and of the esplora API. The only place where the network is defined
// (see the btc-multisig skill).
import { networks, type Network } from 'bitcoinjs-lib';

export type BtcNetworkName = 'regtest' | 'signet';

export interface NetworkConfig {
  name: BtcNetworkName;
  /** bitcoinjs parameters: signet shares testnet's (tb1… addresses). */
  network: Network;
  esploraUrl: string;
  /** Other public providers of the same API, tried when `esploraUrl` refuses or does not answer. */
  esploraFallbacks: string[];
  explorerTxUrl: (txid: string) => string;
}

// Signet: blockstream.info by default (mempool.space is unreachable from some networks,
// seen on 10/10/2026). Both expose the same esplora API.
const DEFAULT_ESPLORA: Record<BtcNetworkName, string> = {
  regtest: 'http://localhost:3000',
  signet: 'https://blockstream.info/signet/api',
};

// Public signet providers: each caps anonymous use (blockstream.info: 700 requests per hour and
// per IP), so one takes over when the other refuses.
const SIGNET_PROVIDERS = ['https://blockstream.info/signet/api', 'https://mempool.space/signet/api'];

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
    esploraFallbacks: name === 'signet' ? SIGNET_PROVIDERS.filter((url) => url !== esploraUrl) : [],
    explorerTxUrl: (txid) => `${explorer}/tx/${txid}`,
  };
}
