// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeAll } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { pureCircuits, AttestationStatus, type AuditWorkbook, type AuditPolicy } from '../managed/fairgate/contract/index.js';
import { FairGateSimulator } from './fairgate.simulator.js';
import { buildWorkbook, evaluateAudit, randomBytes32, toHex, DEFAULT_POLICY, type GroupCounts } from '../src/audit.js';

beforeAll(() => setNetworkId('undeployed'));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const PERIOD = 2026n;
const bytes = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const MODEL_HASH = bytes(0xaa);
const META_HASH = bytes(0xbb);
const DATASET_COMMIT = bytes(0xcc);

// A tool that passes the four-fifths rule: the worst group is at exactly 80%.
const PASSING: GroupCounts[] = [
  { label: 'Group A', applicants: 500, selected: 100 }, // 20.0% (reference)
  { label: 'Group B', applicants: 400, selected: 64 },  // 16.0% -> 80%
  { label: 'Group C', applicants: 300, selected: 54 },  // 18.0% -> 90%
  { label: 'Group D', applicants: 6, selected: 0 },     // below minGroupSize -> excluded
];

// Same tool, but group B slipped to 15.5%: impact ratio 77%.
const FAILING: GroupCounts[] = [
  { label: 'Group A', applicants: 500, selected: 100 },
  { label: 'Group B', applicants: 400, selected: 62 },
  { label: 'Group C', applicants: 300, selected: 54 },
];

interface World {
  sim: FairGateSimulator;
  adminSk: Uint8Array;
  auditorSk: Uint8Array;
  auditorPk: Uint8Array;
  employerSk: Uint8Array;
  toolId: Uint8Array;
}

function world(policy: AuditPolicy = DEFAULT_POLICY): World {
  const adminSk = randomBytes32();
  const sim = new FairGateSimulator(policy, {}, adminSk);
  const auditorSk = randomBytes32();
  const auditorPk = pureCircuits.deriveUserPk(auditorSk);
  sim.as(adminSk).accreditAuditor(auditorPk);
  const employerSk = randomBytes32();
  const toolId = sim.as(employerSk).registerTool(MODEL_HASH, META_HASH);
  return { sim, adminSk, auditorSk, auditorPk, employerSk, toolId };
}

const attest = (w: World, wb: AuditWorkbook, period = PERIOD, auditorSk = w.auditorSk) =>
  w.sim.as(auditorSk, wb).attestAudit(w.toolId, period, DATASET_COMMIT);

// ─── Off-chain audit arithmetic ─────────────────────────────────────────────────

describe('evaluateAudit (auditor-side arithmetic)', () => {
  it('computes impact ratios against the highest-rate group and finds the exact floor', () => {
    const ev = evaluateAudit(PASSING, DEFAULT_POLICY);
    expect(ev.passes).toBe(true);
    expect(ev.reference?.index).toBe(0);
    expect(ev.groups.map((g) => g.impactRatioPct)).toEqual([100n, 80n, 90n, null]);
    expect(ev.minImpactRatioPct).toBe(80n);
    expect(ev.groupsIncluded).toBe(3);
    expect(ev.totalApplicants).toBe(1206n);
  });

  it('fails a tool whose worst group is below the threshold', () => {
    const ev = evaluateAudit(FAILING, DEFAULT_POLICY);
    expect(ev.passes).toBe(false);
    expect(ev.minImpactRatioPct).toBe(77n);
    expect(ev.failures.join(' ')).toMatch(/below the 80% threshold/);
  });

  it('excludes groups under the minimum size and needs at least two included groups', () => {
    const ev = evaluateAudit(
      [{ label: 'A', applicants: 200, selected: 50 }, { label: 'B', applicants: 9, selected: 9 }],
      DEFAULT_POLICY,
    );
    expect(ev.groups[1].included).toBe(false);
    expect(ev.passes).toBe(false);
    expect(ev.failures.join(' ')).toMatch(/at least two groups/);
  });

  it('floors fractional ratios (83.33% -> 83)', () => {
    const ev = evaluateAudit(
      [{ label: 'A', applicants: 120, selected: 60 }, { label: 'B', applicants: 120, selected: 50 }],
      { ...DEFAULT_POLICY, minTotalApplicants: 10n },
    );
    expect(ev.minImpactRatioPct).toBe(83n);
  });

  it('buildWorkbook refuses to build a workbook for a failing audit', () => {
    expect(() => buildWorkbook(FAILING, DEFAULT_POLICY, randomBytes32())).toThrow(/does not pass/);
  });

  it('buildWorkbook pads to eight slots and marks excluded groups', () => {
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());
    expect(wb.applicants).toHaveLength(8);
    expect(wb.included).toEqual([true, true, true, false, false, false, false, false]);
    expect(wb.refApplicants).toBe(500n);
    expect(wb.refSelected).toBe(100n);
    expect(wb.minRatioPct).toBe(80n);
  });
});

// ─── Registry administration ────────────────────────────────────────────────────

describe('registry administration', () => {
  it('deploys with the deployer as admin and the initial policy', () => {
    const adminSk = randomBytes32();
    const sim = new FairGateSimulator(DEFAULT_POLICY, {}, adminSk);
    const l = sim.ledger();
    expect(toHex(l.admin)).toBe(toHex(pureCircuits.deriveAdminPk(adminSk)));
    expect(l.policy).toEqual(DEFAULT_POLICY);
    expect(l.auditors.isEmpty()).toBe(true);
    expect(l.toolCount).toBe(0n);
  });

  it('rejects a policy weaker than 50% at deploy time', () => {
    expect(() => new FairGateSimulator({ ...DEFAULT_POLICY, thresholdPct: 40n })).toThrow(/threshold/);
  });

  it('only the admin can accredit or revoke auditors', () => {
    const w = world();
    const other = pureCircuits.deriveUserPk(randomBytes32());
    expect(() => w.sim.as(randomBytes32()).accreditAuditor(other)).toThrow(/not the registry admin/);
    expect(() => w.sim.as(randomBytes32()).revokeAuditor(w.auditorPk)).toThrow(/not the registry admin/);
    w.sim.as(w.adminSk).accreditAuditor(other);
    expect(w.sim.ledger().auditors.member(other)).toBe(true);
    w.sim.as(w.adminSk).revokeAuditor(other);
    expect(w.sim.ledger().auditors.member(other)).toBe(false);
  });

  it('refuses duplicate accreditation and revoking an unknown auditor', () => {
    const w = world();
    expect(() => w.sim.as(w.adminSk).accreditAuditor(w.auditorPk)).toThrow(/already accredited/);
    expect(() => w.sim.as(w.adminSk).revokeAuditor(bytes(7))).toThrow(/not accredited/);
  });

  it('lets the admin update the policy within bounds', () => {
    const w = world();
    const stricter = { thresholdPct: 90n, minGroupSize: 20n, minTotalApplicants: 1000n };
    w.sim.as(w.adminSk).setPolicy(stricter);
    expect(w.sim.ledger().policy).toEqual(stricter);
    expect(() => w.sim.as(w.adminSk).setPolicy({ ...stricter, thresholdPct: 101n })).toThrow(/threshold/);
    expect(() => w.sim.as(w.adminSk).setPolicy({ ...stricter, minGroupSize: 0n })).toThrow(/group size/);
    expect(() => w.sim.as(randomBytes32()).setPolicy(stricter)).toThrow(/not the registry admin/);
  });

  it('rotates the admin role to a new derived key', () => {
    const w = world();
    const newAdminSk = randomBytes32();
    w.sim.as(w.adminSk).rotateAdmin(pureCircuits.deriveAdminPk(newAdminSk));
    expect(() => w.sim.as(w.adminSk).accreditAuditor(bytes(1))).toThrow(/not the registry admin/);
    w.sim.as(newAdminSk).accreditAuditor(bytes(1));
    expect(w.sim.ledger().auditors.member(bytes(1))).toBe(true);
  });
});

// ─── Employers ──────────────────────────────────────────────────────────────────

describe('tool registration', () => {
  it('derives the tool id from employer identity and model hash', () => {
    const w = world();
    const employer = pureCircuits.deriveUserPk(w.employerSk);
    expect(toHex(w.toolId)).toBe(toHex(pureCircuits.toolIdFor(employer, MODEL_HASH)));
    const tool = w.sim.ledger().tools.lookup(w.toolId);
    expect(toHex(tool.employer)).toBe(toHex(employer));
    expect(toHex(tool.modelHash)).toBe(toHex(MODEL_HASH));
    expect(toHex(tool.metadataHash)).toBe(toHex(META_HASH));
    expect(tool.sequence).toBe(1n);
    expect(w.sim.ledger().toolCount).toBe(1n);
  });

  it('refuses the same employer registering the same model twice, but another employer may', () => {
    const w = world();
    expect(() => w.sim.as(w.employerSk).registerTool(MODEL_HASH, META_HASH)).toThrow(/already registered/);
    const otherId = w.sim.as(randomBytes32()).registerTool(MODEL_HASH, META_HASH);
    expect(toHex(otherId)).not.toBe(toHex(w.toolId));
    expect(w.sim.ledger().toolCount).toBe(2n);
  });
});

// ─── Attestation: happy path ────────────────────────────────────────────────────

describe('attestAudit (passing audit)', () => {
  it('records only commitments and the proven summary', () => {
    const w = world();
    const nonce = randomBytes32();
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, nonce);
    const id = attest(w, wb);

    const l = w.sim.ledger();
    expect(toHex(id)).toBe(toHex(pureCircuits.attestationIdFor(w.toolId, w.auditorPk, PERIOD)));
    expect(l.attestations.member(id)).toBe(true);
    const att = l.attestations.lookup(id);
    expect(toHex(att.toolId)).toBe(toHex(w.toolId));
    expect(toHex(att.auditor)).toBe(toHex(w.auditorPk));
    expect(toHex(att.datasetCommit)).toBe(toHex(DATASET_COMMIT));
    expect(att.periodId).toBe(PERIOD);
    expect(att.thresholdPct).toBe(80n);
    expect(att.minRatioPct).toBe(80n);
    expect(att.groupsIncluded).toBe(3n);
    expect(att.status).toBe(AttestationStatus.Active);
    expect(toHex(l.latestAttestation.lookup(w.toolId))).toBe(toHex(id));
    expect(l.periodNullifiers.member(pureCircuits.periodNullifierFor(w.toolId, PERIOD))).toBe(true);
    expect(l.attestationCount).toBe(1n);

    // The counts commitment opens with (counts, nonce) and nothing else.
    const expected = pureCircuits.countsCommitment(wb.applicants, wb.selected, wb.included, nonce);
    expect(toHex(att.countsCommit)).toBe(toHex(expected));
    const wrongNonce = pureCircuits.countsCommitment(wb.applicants, wb.selected, wb.included, randomBytes32());
    expect(toHex(att.countsCommit)).not.toBe(toHex(wrongNonce));
  });

  it('publishes the exact floor of the minimum impact ratio', () => {
    const w = world({ ...DEFAULT_POLICY, minTotalApplicants: 10n });
    const wb = buildWorkbook(
      [{ label: 'A', applicants: 120, selected: 60 }, { label: 'B', applicants: 120, selected: 50 }],
      w.sim.ledger().policy,
      randomBytes32(),
    );
    const id = attest(w, wb);
    expect(w.sim.ledger().attestations.lookup(id).minRatioPct).toBe(83n);
  });

  it('accepts a perfectly balanced tool at 100%', () => {
    const w = world();
    const wb = buildWorkbook(
      [{ label: 'A', applicants: 200, selected: 40 }, { label: 'B', applicants: 100, selected: 20 }],
      DEFAULT_POLICY,
      randomBytes32(),
    );
    const id = attest(w, wb);
    expect(w.sim.ledger().attestations.lookup(id).minRatioPct).toBe(100n);
  });

  it('allows the same tool to be attested again in a later period', () => {
    const w = world();
    attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()), 2026n);
    const id2 = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()), 2027n);
    expect(w.sim.ledger().attestationCount).toBe(2n);
    expect(toHex(w.sim.ledger().latestAttestation.lookup(w.toolId))).toBe(toHex(id2));
  });

  it('hides the counts: identical counts with different nonces give different commitments', () => {
    const w = world();
    const id1 = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()), 2026n);
    const id2 = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()), 2027n);
    const l = w.sim.ledger();
    expect(toHex(l.attestations.lookup(id1).countsCommit)).not.toBe(toHex(l.attestations.lookup(id2).countsCommit));
  });

  it('never writes raw counts to the public ledger', () => {
    const w = world();
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());
    const id = attest(w, wb);
    const att = w.sim.ledger().attestations.lookup(id);
    const publicNumbers = [att.periodId, att.thresholdPct, att.minRatioPct, att.groupsIncluded];
    for (const n of [500n, 100n, 400n, 64n, 300n, 54n, 1206n]) {
      expect(publicNumbers).not.toContain(n);
    }
    const publicBytes = [att.toolId, att.auditor, att.datasetCommit, att.countsCommit].map(toHex).join('');
    expect(publicBytes).not.toContain(toHex(wb.nonce));
  });
});

// ─── Attestation: access control and replay ────────────────────────────────────

describe('attestAudit (access control)', () => {
  it('rejects an auditor who is not accredited', () => {
    const w = world();
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());
    expect(() => attest(w, wb, PERIOD, randomBytes32())).toThrow(/not accredited/);
  });

  it('rejects an auditor whose accreditation was revoked', () => {
    const w = world();
    w.sim.as(w.adminSk).revokeAuditor(w.auditorPk);
    expect(() => attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()))).toThrow(/not accredited/);
  });

  it('rejects an unknown tool', () => {
    const w = world();
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());
    expect(() => w.sim.as(w.auditorSk, wb).attestAudit(bytes(9), PERIOD, DATASET_COMMIT)).toThrow(/unknown tool/);
  });

  it('spends the period nullifier: a second attestation in the same period fails, even from another auditor', () => {
    const w = world();
    attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()));
    expect(() => attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()))).toThrow(/already attested/);
    const auditor2Sk = randomBytes32();
    w.sim.as(w.adminSk).accreditAuditor(pureCircuits.deriveUserPk(auditor2Sk));
    expect(() => attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()), PERIOD, auditor2Sk)).toThrow(/already attested/);
  });

  it('fails when no workbook is loaded', () => {
    const w = world();
    expect(() => w.sim.as(w.auditorSk).attestAudit(w.toolId, PERIOD, DATASET_COMMIT)).toThrow(/no audit workbook/);
  });
});

// ─── Attestation: lying witnesses ──────────────────────────────────────────────
//
// Each test hand-crafts a workbook that an honest auditor would never produce and
// checks that the circuit refuses it. These are the attacks the ZK proof prevents.

describe('attestAudit (lying witnesses)', () => {
  const honest = () => buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());

  it('rejects a tool that fails the four-fifths rule', () => {
    const w = world();
    // Build the failing workbook by hand, bypassing the off-chain guard.
    const wb: AuditWorkbook = {
      ...honest(),
      applicants: [500n, 400n, 300n, 0n, 0n, 0n, 0n, 0n],
      selected: [100n, 62n, 54n, 0n, 0n, 0n, 0n, 0n],
      included: [true, true, true, false, false, false, false, false],
      refApplicants: 500n,
      refSelected: 100n,
      minRatioPct: 80n,
    };
    expect(() => attest(w, wb)).toThrow(/impact ratio below threshold/);
  });

  it('rejects excluding a large group to hide its failing rate', () => {
    const w = world();
    const wb: AuditWorkbook = {
      ...honest(),
      applicants: [500n, 400n, 300n, 0n, 0n, 0n, 0n, 0n],
      selected: [100n, 62n, 54n, 0n, 0n, 0n, 0n, 0n],
      included: [true, false, true, false, false, false, false, false],
      refApplicants: 500n,
      refSelected: 100n,
      minRatioPct: 90n,
    };
    expect(() => attest(w, wb)).toThrow(/large enough to include was excluded/);
  });

  it('rejects including a group below the minimum size', () => {
    const w = world();
    const wb = honest();
    wb.included = [true, true, true, true, false, false, false, false]; // slot 3 has 6 applicants
    expect(() => attest(w, wb)).toThrow(/below the minimum size/);
  });

  it('rejects a fabricated reference group', () => {
    const w = world();
    const wb = { ...honest(), refApplicants: 1000n, refSelected: 180n }; // 18%: not a real group
    expect(() => attest(w, wb)).toThrow(/not one of the included groups/);
  });

  it('rejects a reference group that is not the best-performing group', () => {
    const w = world();
    const wb = { ...honest(), refApplicants: 300n, refSelected: 54n, minRatioPct: 88n }; // group C, 18%
    expect(() => attest(w, wb)).toThrow(/does not have the highest selection rate/);
  });

  it('rejects overstating the minimum impact ratio', () => {
    const w = world();
    const wb = { ...honest(), minRatioPct: 81n };
    expect(() => attest(w, wb)).toThrow(/too high/);
  });

  it('rejects understating the minimum impact ratio', () => {
    const w = world();
    const wb = { ...honest(), minRatioPct: 79n };
    // 79 is below the 80% threshold, so the range check fires first.
    expect(() => attest(w, wb)).toThrow(/out of range|too low/);
    const w2 = world();
    const wb2 = buildWorkbook(
      [{ label: 'A', applicants: 500, selected: 100 }, { label: 'B', applicants: 400, selected: 72 }], // 90%
      DEFAULT_POLICY,
      randomBytes32(),
    );
    expect(() => attest(w2, { ...wb2, minRatioPct: 85n })).toThrow(/too low/);
  });

  it('rejects selected counts larger than applicants', () => {
    const w = world();
    const wb = honest();
    wb.selected = [100n, 401n, 54n, 0n, 0n, 0n, 0n, 0n];
    expect(() => attest(w, wb)).toThrow(/selected exceeds applicants/);
  });

  it('rejects an audit that covers too few applicants', () => {
    const w = world();
    const wb: AuditWorkbook = {
      ...honest(),
      applicants: [50n, 40n, 0n, 0n, 0n, 0n, 0n, 0n],
      selected: [10n, 8n, 0n, 0n, 0n, 0n, 0n, 0n],
      included: [true, true, false, false, false, false, false, false],
      refApplicants: 50n,
      refSelected: 10n,
      minRatioPct: 100n,
    };
    expect(() => attest(w, wb)).toThrow(/too few applicants/);
  });

  it('rejects an audit with a single included group', () => {
    const w = world();
    const wb: AuditWorkbook = {
      ...honest(),
      applicants: [500n, 5n, 0n, 0n, 0n, 0n, 0n, 0n],
      selected: [100n, 1n, 0n, 0n, 0n, 0n, 0n, 0n],
      included: [true, false, false, false, false, false, false, false],
      refApplicants: 500n,
      refSelected: 100n,
      minRatioPct: 100n,
    };
    expect(() => attest(w, wb)).toThrow(/at least two groups/);
  });

  it('rejects a reference group that selected nobody', () => {
    const w = world();
    const wb: AuditWorkbook = {
      ...honest(),
      applicants: [500n, 400n, 0n, 0n, 0n, 0n, 0n, 0n],
      selected: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      included: [true, true, false, false, false, false, false, false],
      refApplicants: 500n,
      refSelected: 0n,
      minRatioPct: 100n,
    };
    expect(() => attest(w, wb)).toThrow(/selected nobody/);
  });

  it('enforces the registry policy in force at attestation time', () => {
    const w = world();
    w.sim.as(w.adminSk).setPolicy({ ...DEFAULT_POLICY, thresholdPct: 90n });
    // PASSING has a group at exactly 80%, which is fine at 80 but not at 90.
    const wb = buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32());
    expect(() => attest(w, wb)).toThrow(/impact ratio below threshold/);
  });
});

// ─── Revocation ────────────────────────────────────────────────────────────────

describe('revokeAttestation', () => {
  it('lets the issuing auditor revoke and keeps the period spent', () => {
    const w = world();
    const id = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()));
    w.sim.as(w.auditorSk).revokeAttestation(id);
    expect(w.sim.ledger().attestations.lookup(id).status).toBe(AttestationStatus.Revoked);
    expect(() => attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()))).toThrow(/already attested/);
  });

  it('lets the admin revoke, but nobody else', () => {
    const w = world();
    const id = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()));
    expect(() => w.sim.as(randomBytes32()).revokeAttestation(id)).toThrow(/only the issuing auditor or the admin/);
    expect(() => w.sim.as(w.employerSk).revokeAttestation(id)).toThrow(/only the issuing auditor or the admin/);
    w.sim.as(w.adminSk).revokeAttestation(id);
    expect(w.sim.ledger().attestations.lookup(id).status).toBe(AttestationStatus.Revoked);
  });

  it('refuses to revoke twice or to revoke an unknown attestation', () => {
    const w = world();
    const id = attest(w, buildWorkbook(PASSING, DEFAULT_POLICY, randomBytes32()));
    w.sim.as(w.auditorSk).revokeAttestation(id);
    expect(() => w.sim.as(w.auditorSk).revokeAttestation(id)).toThrow(/already revoked/);
    expect(() => w.sim.as(w.auditorSk).revokeAttestation(bytes(3))).toThrow(/unknown attestation/);
  });
});
