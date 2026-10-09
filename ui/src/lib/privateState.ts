// SPDX-License-Identifier: Apache-2.0
//
// In-memory private state provider for the browser, following the pattern of the
// official bboard and leaderboard examples. FairGate's private state is small (a
// secret and, briefly, the auditor's workbook) and is reloaded from localStorage
// on every page load, so nothing needs to persist here.

import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

export const inMemoryPrivateStateProvider = <PSI extends PrivateStateId, PS = unknown>(): PrivateStateProvider<PSI, PS> => {
  const privateStates = new Map<ContractAddress, Map<PSI, PS>>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let contractAddress: ContractAddress | null = null;

  const requireContractAddress = (): ContractAddress => {
    if (contractAddress === null) throw new Error('Contract address not set');
    return contractAddress;
  };
  const scoped = (address: ContractAddress): Map<PSI, PS> => {
    let m = privateStates.get(address);
    if (!m) {
      m = new Map<PSI, PS>();
      privateStates.set(address, m);
    }
    return m;
  };
  const encode = <T>(v: T): string => JSON.stringify(v);
  const decode = <T>(v: string): T => JSON.parse(v) as T;

  return {
    setContractAddress(address) {
      contractAddress = address;
    },
    set(k, state) {
      scoped(requireContractAddress()).set(k, state);
      return Promise.resolve();
    },
    get(k) {
      return Promise.resolve(scoped(requireContractAddress()).get(k) ?? null);
    },
    remove(k) {
      scoped(requireContractAddress()).delete(k);
      return Promise.resolve();
    },
    clear() {
      privateStates.delete(requireContractAddress());
      return Promise.resolve();
    },
    setSigningKey(addr, k) {
      signingKeys.set(addr, k);
      return Promise.resolve();
    },
    getSigningKey(addr) {
      return Promise.resolve(signingKeys.get(addr) ?? null);
    },
    removeSigningKey(addr) {
      signingKeys.delete(addr);
      return Promise.resolve();
    },
    clearSigningKeys() {
      signingKeys.clear();
      return Promise.resolve();
    },
    exportPrivateStates(_o?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const address = requireContractAddress();
      const states = Object.fromEntries(Array.from(scoped(address).entries()).map(([k, v]) => [k, encode(v)]));
      return Promise.resolve({ format: 'midnight-private-state-export', encryptedPayload: encode({ contractAddress: address, states }), salt: 'in-memory' });
    },
    importPrivateStates(data: PrivateStateExport, o?: ImportPrivateStatesOptions): Promise<ImportPrivateStatesResult> {
      const address = requireContractAddress();
      const strategy = o?.conflictStrategy ?? 'error';
      const payload = decode<{ states?: Record<string, string> }>(data.encryptedPayload);
      const m = scoped(address);
      let imported = 0, skipped = 0, overwritten = 0;
      for (const [raw, serialized] of Object.entries(payload.states ?? {})) {
        const id = raw as PSI;
        if (m.has(id)) {
          if (strategy === 'skip') { skipped++; continue; }
          if (strategy === 'error') return Promise.reject(new Error(`Conflict: ${id}`));
          overwritten++;
        } else imported++;
        m.set(id, decode<PS>(serialized));
      }
      return Promise.resolve({ imported, skipped, overwritten });
    },
    exportSigningKeys(_o?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      return Promise.resolve({ format: 'midnight-signing-key-export', encryptedPayload: encode({ keys: Object.fromEntries(signingKeys.entries()) }), salt: 'in-memory' });
    },
    importSigningKeys(data: SigningKeyExport, o?: ImportSigningKeysOptions): Promise<ImportSigningKeysResult> {
      const strategy = o?.conflictStrategy ?? 'error';
      const payload = decode<{ keys?: Record<string, SigningKey> }>(data.encryptedPayload);
      let imported = 0, skipped = 0, overwritten = 0;
      for (const [addr, k] of Object.entries(payload.keys ?? {})) {
        if (signingKeys.has(addr)) {
          if (strategy === 'skip') { skipped++; continue; }
          if (strategy === 'error') return Promise.reject(new Error(`Conflict: ${addr}`));
          overwritten++;
        } else imported++;
        signingKeys.set(addr, k);
      }
      return Promise.resolve({ imported, skipped, overwritten });
    },
  };
};
