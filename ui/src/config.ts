// SPDX-License-Identifier: Apache-2.0
export type NetworkName = 'undeployed' | 'preview' | 'preprod';

export const config = {
  networkId: (import.meta.env.VITE_NETWORK_ID as NetworkName) || 'preprod',
  indexerUrl: (import.meta.env.VITE_INDEXER_URL as string) || 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWsUrl: (import.meta.env.VITE_INDEXER_WS_URL as string) || 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  contractAddress: ((import.meta.env.VITE_CONTRACT_ADDRESS as string) || '').trim(),
  proofServerUrl: ((import.meta.env.VITE_PROOF_SERVER_URL as string) || '').trim(),
};

export const explorerTxUrl = (txId: string): string | null =>
  config.networkId === 'preprod'
    ? `https://preprod.midnightexplorer.com/transactions/${txId}`
    : config.networkId === 'preview'
      ? `https://preview.midnightexplorer.com/transactions/${txId}`
      : null;

export const explorerContractUrl = (address: string): string | null =>
  config.networkId === 'preprod'
    ? `https://preprod.midnightexplorer.com/contracts/${address}`
    : config.networkId === 'preview'
      ? `https://preview.midnightexplorer.com/contracts/${address}`
      : null;
