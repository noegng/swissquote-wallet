// Choix du réseau Bitcoin et de l'API esplora. Seul endroit où le réseau est défini
// (voir la skill btc-multisig).

export type BtcNetworkName = 'regtest' | 'signet';

export interface NetworkConfig {
  name: BtcNetworkName;
  esploraUrl: string;
  explorerTxUrl: (txid: string) => string;
}

const DEFAULT_ESPLORA: Record<BtcNetworkName, string> = {
  regtest: 'http://localhost:3000',
  signet: 'https://mempool.space/signet/api',
};

export function networkConfig(
  name: BtcNetworkName,
  esploraUrl: string = DEFAULT_ESPLORA[name],
): NetworkConfig {
  return {
    name,
    esploraUrl,
    explorerTxUrl: (txid) =>
      name === 'signet'
        ? `https://mempool.space/signet/tx/${txid}`
        : `http://localhost:5000/tx/${txid}`,
  };
}
