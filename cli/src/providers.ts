// SPDX-License-Identifier: Apache-2.0
//
// Shared wiring between the FairGate CLI commands and Midnight.js 4.1.x.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import { Contract, witnesses, ledger, type Ledger, type FairGatePrivateState } from '../../contract/src/index.ts';
import type { NetworkConfig } from './network';
import type { WalletContext } from './wallet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where `npm run compile` puts the compiled contract, keys and ZK IR. */
export const ZK_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'contract', 'managed', 'fairgate');

export type Role = 'admin' | 'employer' | 'auditor' | string;

/** Private state is kept per role so one machine can play every party in a demo. */
export const privateStateIdFor = (role: Role) => `fairgate:${role}`;

export const PRIVATE_STATE_STORE = 'fairgate-private-state';

export function assertCompiled(): void {
  if (!fs.existsSync(path.join(ZK_CONFIG_PATH, 'contract', 'index.js'))) {
    console.error('\n  Contract not compiled. Run: npm run compile\n');
    process.exit(1);
  }
}

export function loadCompiledContract() {
  assertCompiled();
  return CompiledContract.make('fairgate', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
}

export function privateStatePassword(): string {
  // Midnight.js requires at least 16 characters. The default only protects a
  // local devnet store; set PRIVATE_STATE_PASSWORD for anything that matters.
  return process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';
}

export function createPrivateStateProvider(accountId: string) {
  return levelPrivateStateProvider<string, FairGatePrivateState>({
    privateStateStoreName: PRIVATE_STATE_STORE,
    accountId,
    privateStoragePasswordProvider: privateStatePassword,
  });
}

export function createProviders(walletCtx: WalletContext, networkConfig: NetworkConfig) {
  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(ZK_CONFIG_PATH);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: createPrivateStateProvider(accountId),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

/** Read the public ledger of a deployed FairGate registry through the indexer. No wallet needed. */
export async function readLedger(networkConfig: NetworkConfig, contractAddress: string): Promise<Ledger | null> {
  const publicDataProvider = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
  const state = await publicDataProvider.queryContractState(contractAddress);
  if (!state) return null;
  return ledger(state.data);
}

/** Poll the proof server until it answers. It is a distroless image with no shell healthcheck. */
export async function waitForProofServer(url: string, maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') return true;
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}
