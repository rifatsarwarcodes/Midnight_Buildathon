// SPDX-License-Identifier: Apache-2.0
//
// Private state and witness implementations for the FairGate contract.
//
// Everything in this file stays on the participant's machine. The contract only
// ever sees what the circuits explicitly `disclose()`.

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { AuditWorkbook, Ledger } from '../managed/fairgate/contract/index.js';

export type FairGatePrivateState = {
  /** 32-byte secret from which the admin, employer and auditor identities are derived. */
  readonly secretKey: Uint8Array;
  /** The auditor's private workbook for the attestation currently being built. */
  readonly workbook?: AuditWorkbook;
};

export const createFairGatePrivateState = (
  secretKey: Uint8Array,
  workbook?: AuditWorkbook,
): FairGatePrivateState => ({ secretKey, workbook });

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, FairGatePrivateState>): [FairGatePrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],

  auditWorkbook: ({
    privateState,
  }: WitnessContext<Ledger, FairGatePrivateState>): [FairGatePrivateState, AuditWorkbook] => {
    if (!privateState.workbook) {
      throw new Error('FairGate: no audit workbook loaded in private state');
    }
    return [privateState, privateState.workbook];
  },
};

export type FairGateWitnesses = typeof witnesses;
