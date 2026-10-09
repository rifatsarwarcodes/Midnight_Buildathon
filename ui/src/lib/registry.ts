// SPDX-License-Identifier: Apache-2.0
//
// Read-only view of a FairGate registry, straight from the public indexer.
// No wallet, no proof server: anyone can verify an attestation.

import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { ledger, AttestationStatus, toHex, fromHex, type Attestation, type AuditPolicy, type Tool } from '../../../contract/src/index.ts';
import { config } from '../config';

const CONTRACT_STATE_QUERY = `
  query ContractState($address: HexEncoded!) {
    contractAction(address: $address) {
      state
    }
  }
`;

export interface ToolRow {
  id: string;
  tool: Tool;
  latest: { id: string; attestation: Attestation } | null;
}

export interface AttestationRow {
  id: string;
  attestation: Attestation;
}

export interface RegistrySnapshot {
  contractAddress: string;
  admin: string;
  policy: AuditPolicy;
  auditors: string[];
  tools: ToolRow[];
  attestations: AttestationRow[];
  toolCount: number;
  attestationCount: number;
  fetchedAt: Date;
}

export async function fetchRegistry(contractAddress: string): Promise<RegistrySnapshot> {
  if (!/^[0-9a-fA-F]{64}$/.test(contractAddress)) throw new Error('Contract address must be 64 hex characters');
  const res = await fetch(config.indexerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { address: contractAddress } }),
  });
  const gql = await res.json();
  if (gql.errors) throw new Error(gql.errors[0]?.message ?? 'Indexer query failed');
  const stateHex: string | undefined = gql.data?.contractAction?.state;
  if (!stateHex) throw new Error('Registry not found on this network');

  const state = ContractState.deserialize(fromHex(stateHex));
  const l = ledger(state.data);

  const attestations: AttestationRow[] = [];
  for (const [id, attestation] of l.attestations) attestations.push({ id: toHex(id), attestation });

  const tools: ToolRow[] = [];
  for (const [id, tool] of l.tools) {
    let latest: ToolRow['latest'] = null;
    if (l.latestAttestation.member(id)) {
      const aid = l.latestAttestation.lookup(id);
      latest = { id: toHex(aid), attestation: l.attestations.lookup(aid) };
    }
    tools.push({ id: toHex(id), tool, latest });
  }
  tools.sort((a, b) => Number(a.tool.sequence - b.tool.sequence));

  const auditors: string[] = [];
  for (const a of l.auditors) auditors.push(toHex(a));

  return {
    contractAddress,
    admin: toHex(l.admin),
    policy: l.policy,
    auditors,
    tools,
    attestations,
    toolCount: Number(l.toolCount),
    attestationCount: Number(l.attestationCount),
    fetchedAt: new Date(),
  };
}

export const isActive = (a: Attestation) => a.status === AttestationStatus.Active;

export const shortHex = (hex: string, n = 8) => (hex.length > 2 * n + 1 ? `${hex.slice(0, n)}…${hex.slice(-n)}` : hex);
