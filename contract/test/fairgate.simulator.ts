// SPDX-License-Identifier: Apache-2.0
//
// In-memory simulator for the FairGate contract. Runs the compiled circuits against
// a local ledger state with no node, indexer or proof server, which is what lets the
// test-suite exercise every assertion, including lying-witness attacks.

import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger,
  type AuditPolicy,
  type AuditWorkbook,
  type Ledger,
} from '../managed/fairgate/contract/index.js';
import { createFairGatePrivateState, witnesses, type FairGatePrivateState } from '../src/witnesses.js';
import { DEFAULT_POLICY, randomBytes32 } from '../src/audit.js';

// Any well-formed coin public key works for the simulator; no coins move in FairGate.
const COIN_PUBLIC_KEY = '0'.repeat(63) + '1';

export type WitnessOverrides = Partial<typeof witnesses>;

export class FairGateSimulator {
  readonly contract: Contract<FairGatePrivateState>;
  ctx: CircuitContext<FairGatePrivateState>;
  readonly adminSecret: Uint8Array;

  constructor(policy: AuditPolicy = DEFAULT_POLICY, overrides: WitnessOverrides = {}, adminSecret = randomBytes32()) {
    this.adminSecret = adminSecret;
    this.contract = new Contract<FairGatePrivateState>({ ...witnesses, ...overrides });
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(createFairGatePrivateState(adminSecret), COIN_PUBLIC_KEY),
      policy,
    );
    this.ctx = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  /** Act as the holder of `secret` for subsequent calls, optionally loading an audit workbook. */
  as(secret: Uint8Array, workbook?: AuditWorkbook): this {
    this.ctx = { ...this.ctx, currentPrivateState: createFairGatePrivateState(secret, workbook) };
    return this;
  }

  ledger(): Ledger {
    return ledger(this.ctx.currentQueryContext.state);
  }

  privateState(): FairGatePrivateState {
    return this.ctx.currentPrivateState;
  }

  // ─── Circuits ────────────────────────────────────────────────────────────────

  setPolicy(p: AuditPolicy): void {
    this.ctx = this.contract.impureCircuits.setPolicy(this.ctx, p).context;
  }

  accreditAuditor(pk: Uint8Array): void {
    this.ctx = this.contract.impureCircuits.accreditAuditor(this.ctx, pk).context;
  }

  revokeAuditor(pk: Uint8Array): void {
    this.ctx = this.contract.impureCircuits.revokeAuditor(this.ctx, pk).context;
  }

  rotateAdmin(newAdmin: Uint8Array): void {
    this.ctx = this.contract.impureCircuits.rotateAdmin(this.ctx, newAdmin).context;
  }

  registerTool(modelHash: Uint8Array, metadataHash: Uint8Array): Uint8Array {
    const r = this.contract.impureCircuits.registerTool(this.ctx, modelHash, metadataHash);
    this.ctx = r.context;
    return r.result;
  }

  attestAudit(toolId: Uint8Array, periodId: bigint, datasetCommit: Uint8Array): Uint8Array {
    const r = this.contract.impureCircuits.attestAudit(this.ctx, toolId, periodId, datasetCommit);
    this.ctx = r.context;
    return r.result;
  }

  revokeAttestation(attestationId: Uint8Array): void {
    this.ctx = this.contract.impureCircuits.revokeAttestation(this.ctx, attestationId).context;
  }
}
