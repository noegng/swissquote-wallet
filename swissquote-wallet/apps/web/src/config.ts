import { networkConfig, type BtcNetworkName } from '@sqw/core';

declare const __SQW_CONFIG__: {
  network: BtcNetworkName;
  esploraUrl?: string;
  swissquoteUrl: string;
  partnerUrl: string;
};

export const config = __SQW_CONFIG__;
export const btc = networkConfig(config.network, config.esploraUrl || undefined);
