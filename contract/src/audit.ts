// SPDX-License-Identifier: Apache-2.0
//
// Off-chain audit arithmetic. This is the auditor's side of the protocol: it turns
// per-group counts into the private workbook the circuit consumes, using exactly
// the same integer cross-multiplication the circuit checks, so an honest auditor
// always produces a workbook that proves.
//
// Nothing here touches the network. It runs in the CLI and in the browser.

import type { AuditPolicy, AuditWorkbook } from '../managed/fairgate/contract/index.js';

/** Fixed number of group slots in the contract. */
export const GROUP_SLOTS = 8;

export interface GroupCounts {
  /** Human label, kept off-chain (for example "Hispanic or Latino / Female"). */
  label: string;
  applicants: number | bigint;
  selected: number | bigint;
}

export interface GroupEvaluation {
  label: string;
  applicants: bigint;
  selected: bigint;
  included: boolean;
  /** Selection rate as a fraction, for display only. */
  selectionRate: number | null;
  /** floor(100 * impact ratio) against the reference group, or null if excluded. */
  impactRatioPct: bigint | null;
  isReference: boolean;
}

export interface AuditEvaluation {
  groups: GroupEvaluation[];
  totalApplicants: bigint;
  groupsIncluded: number;
  reference: { index: number; applicants: bigint; selected: bigint } | null;
  /** floor(100 * minimum impact ratio) across included groups, or null if undefined. */
  minImpactRatioPct: bigint | null;
  /** Whether the circuit would accept this audit under the given policy. */
  passes: boolean;
  /** Human-readable reasons when it does not pass. Mirrors the circuit's assertions. */
  failures: string[];
}

const toBig = (v: number | bigint): bigint => (typeof v === 'bigint' ? v : BigInt(v));

/**
 * Evaluate counts against a policy exactly as the circuit will.
 * Pure function: safe to call on every keystroke in a UI.
 */
export function evaluateAudit(groups: GroupCounts[], policy: AuditPolicy): AuditEvaluation {
  if (groups.length > GROUP_SLOTS) {
    throw new Error(`FairGate: at most ${GROUP_SLOTS} groups per audit`);
  }
  const failures: string[] = [];
  const a = groups.map((g) => toBig(g.applicants));
  const s = groups.map((g) => toBig(g.selected));

  for (let i = 0; i < groups.length; i++) {
    if (a[i] < 0n || s[i] < 0n) failures.push(`${groups[i].label}: counts must be non-negative`);
    if (s[i] > a[i]) failures.push(`${groups[i].label}: selected exceeds applicants`);
  }

  const included = a.map((n) => n >= policy.minGroupSize);
  const totalApplicants = a.reduce((acc, n) => acc + n, 0n);
  const groupsIncluded = included.filter(Boolean).length;

  if (totalApplicants < policy.minTotalApplicants) {
    failures.push(`audit covers ${totalApplicants} applicants, policy requires ${policy.minTotalApplicants}`);
  }
  if (groupsIncluded < 2) failures.push('at least two groups must meet the minimum group size');

  // Reference group: highest selection rate among included groups.
  // Compare s_i/a_i > s_r/a_r as s_i * a_r > s_r * a_i.
  let ref: number | null = null;
  for (let i = 0; i < groups.length; i++) {
    if (!included[i]) continue;
    if (ref === null || s[i] * a[ref] > s[ref] * a[i]) ref = i;
  }
  if (ref !== null && s[ref] === 0n) failures.push('the best-performing group selected nobody');

  let minPct: bigint | null = null;
  const evaluations: GroupEvaluation[] = groups.map((g, i) => {
    let pct: bigint | null = null;
    if (included[i] && ref !== null && s[ref] > 0n) {
      // floor(100 * (s_i/a_i) / (s_r/a_r)) = floor(100 * s_i * a_r / (s_r * a_i))
      pct = (100n * s[i] * a[ref]) / (s[ref] * a[i]);
      if (minPct === null || pct < minPct) minPct = pct;
    }
    return {
      label: g.label,
      applicants: a[i],
      selected: s[i],
      included: included[i],
      selectionRate: a[i] > 0n ? Number(s[i]) / Number(a[i]) : null,
      impactRatioPct: pct,
      isReference: ref === i,
    };
  });

  if (minPct !== null && minPct < policy.thresholdPct) {
    failures.push(`minimum impact ratio ${minPct}% is below the ${policy.thresholdPct}% threshold`);
  }

  return {
    groups: evaluations,
    totalApplicants,
    groupsIncluded,
    reference: ref === null ? null : { index: ref, applicants: a[ref], selected: s[ref] },
    minImpactRatioPct: minPct,
    passes: failures.length === 0,
    failures,
  };
}

/**
 * Build the private workbook the `attestAudit` circuit consumes.
 * Throws if the audit would not pass, so a failing audit never reaches the proof server.
 */
export function buildWorkbook(groups: GroupCounts[], policy: AuditPolicy, nonce: Uint8Array): AuditWorkbook {
  if (nonce.length !== 32) throw new Error('FairGate: nonce must be 32 bytes');
  const ev = evaluateAudit(groups, policy);
  if (!ev.passes || ev.reference === null || ev.minImpactRatioPct === null) {
    throw new Error(`FairGate: audit does not pass: ${ev.failures.join('; ')}`);
  }
  const pad = <T>(xs: T[], fill: T): T[] => xs.concat(Array.from({ length: GROUP_SLOTS - xs.length }, () => fill));
  return {
    applicants: pad(ev.groups.map((g) => g.applicants), 0n),
    selected: pad(ev.groups.map((g) => g.selected), 0n),
    included: pad(ev.groups.map((g) => g.included), false),
    refApplicants: ev.reference.applicants,
    refSelected: ev.reference.selected,
    minRatioPct: ev.minImpactRatioPct,
    nonce,
  };
}

/** The default registry policy: four-fifths rule, groups of at least 10, audits of at least 100 applicants. */
export const DEFAULT_POLICY: AuditPolicy = {
  thresholdPct: 80n,
  minGroupSize: 10n,
  minTotalApplicants: 100n,
};

/** Random 32 bytes using the platform CSPRNG (Node and browsers). */
export function randomBytes32(): Uint8Array {
  const out = new Uint8Array(32);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error('FairGate: invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** SHA-256 of arbitrary bytes, used for model and dataset commitments. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
}
