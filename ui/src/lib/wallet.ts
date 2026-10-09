// SPDX-License-Identifier: Apache-2.0
//
// Lace wallet connection and Midnight.js providers for the browser. Follows the
// official midnight-leaderboard example for DApp Connector API 4.x.

import semver from 'semver';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId, type NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { fromHex as rtFromHex, toHex as rtToHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { MidnightProviders, UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

import {
  Contract,
  witnesses,
  createFairGatePrivateState,
  type FairGatePrivateState,
  type AuditWorkbook,
} from '../../../contract/src/index.ts';
import { config } from '../config';
import { inMemoryPrivateStateProvider } from './privateState';
import { getSecret, type Role } from './identity';

export type CircuitKeys =
  | 'setPolicy' | 'accreditAuditor' | 'revokeAuditor' | 'rotateAdmin'
  | 'registerTool' | 'attestAudit' | 'revokeAttestation';
export type Providers = MidnightProviders<CircuitKeys, string, FairGatePrivateState>;

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';
const privateStateProvider = inMemoryPrivateStateProvider<string, FairGatePrivateState>();

export const privateStateIdFor = (role: Role) => `fairgate:${role}`;

function findWallet(): InitialAPI | undefined {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (w): w is InitialAPI => !!w && typeof w === 'object' && 'apiVersion' in w && semver.satisfies(w.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
}

export async function connectLace(): Promise<ConnectedAPI> {
  const deadline = Date.now() + 3000;
  let wallet = findWallet();
  while (!wallet && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    wallet = findWallet();
  }
  if (!wallet) throw new Error('Midnight Lace wallet not found. Install Lace and enable the Midnight network.');
  const connected = await Promise.race([
    wallet.connect(config.networkId),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Lace did not respond. Open the extension and approve the connection.')), 60_000)),
  ]);
  return connected;
}

let providersPromise: Promise<{ providers: Providers; connected: ConnectedAPI }> | undefined;

export function getProviders(): Promise<{ providers: Providers; connected: ConnectedAPI }> {
  return providersPromise ?? (providersPromise = initProviders().catch((e) => {
    providersPromise = undefined;
    throw e;
  }));
}

async function initProviders(): Promise<{ providers: Providers; connected: ConnectedAPI }> {
  setNetworkId(config.networkId as NetworkId);
  const connected = await connectLace();
  const walletConfig = await connected.getConfiguration();
  const proofServerUri = config.proofServerUrl || walletConfig.proverServerUri;
  if (!proofServerUri) throw new Error('No proof server configured. Set one in Lace (Settings > Midnight) or VITE_PROOF_SERVER_URL.');
  const shielded = await connected.getShieldedAddresses();
  const zkConfigProvider = new FetchZkConfigProvider<CircuitKeys>(window.location.origin, fetch.bind(window));

  const providers: Providers = {
    privateStateProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(proofServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(walletConfig.indexerUri ?? config.indexerUrl, walletConfig.indexerWsUri ?? config.indexerWsUrl),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await connected.balanceUnsealedTransaction(rtToHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', rtFromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connected.submitTransaction(rtToHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
  return { providers, connected };
}

const compiledContract = CompiledContract.make('fairgate', Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
);

/** Open the registry as a given role. Loads the role secret (and optional workbook) into private state. */
export async function openRegistry(role: Role, workbook?: AuditWorkbook) {
  if (!config.contractAddress) throw new Error('No registry address configured (VITE_CONTRACT_ADDRESS).');
  const { providers } = await getProviders();
  const secret = getSecret(role);
  const privateStateId = privateStateIdFor(role);
  providers.privateStateProvider.setContractAddress(config.contractAddress);
  await providers.privateStateProvider.set(privateStateId, createFairGatePrivateState(secret, workbook));
  const contract = await findDeployedContract(providers as any, {
    compiledContract: compiledContract as any,
    contractAddress: config.contractAddress,
    privateStateId,
  });
  return contract as any;
}

export interface TxReceipt {
  txId: string;
  blockHeight?: number;
  status: string;
}

export const receiptOf = (tx: any): TxReceipt => ({
  txId: String(tx.public.txId),
  blockHeight: tx.public.blockHeight !== undefined ? Number(tx.public.blockHeight) : undefined,
  status: String(tx.public.status),
});
