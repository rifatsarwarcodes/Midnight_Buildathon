# Privacy boundary

FairGate exists to answer one question in public, "did this hiring tool pass a
four-fifths impact-ratio audit?", while keeping the evidence private. This
document states exactly which values cross the boundary between a participant's
machine and the Midnight ledger, and why.

## Parties

| Party | Holds | Learns from the ledger |
|---|---|---|
| Registry admin | admin secret | everything public |
| Employer | employer secret, model artifact | everything public |
| Auditor | auditor secret, applicant-level dataset, per-group counts, nonce | everything public |
| Regulator | nothing on chain; receives a disclosure packet off chain on request | everything public, plus the opened counts |
| Candidate, journalist, anyone | nothing | everything public |

## What is public (written to the ledger)

| Value | Where | Why it must be public |
|---|---|---|
| `admin` | `admin` cell | so anyone can check who governs accreditation |
| policy (`thresholdPct`, `minGroupSize`, `minTotalApplicants`) | `policy` cell | the rule being enforced must be auditable |
| accredited auditor ids | `auditors` set | accountability: every attestation names its auditor |
| `toolId`, `employer` id, `modelHash`, `metadataHash` | `tools` map | binds an attestation to one exact model artifact of one employer |
| `attestationId`, `toolId`, `auditor`, `periodId`, `thresholdPct`, `status` | `attestations` map | the claim itself and who made it |
| `minRatioPct` | `attestations` map | the one statistic the public gets: the exact floor of the worst group's impact ratio |
| `groupsIncluded` | `attestations` map | lets a reader judge whether the audit covered enough groups |
| `datasetCommit` | `attestations` map | sha-256 of the applicant-level file; a regulator can later check the file the auditor used |
| `countsCommit` | `attestations` map | `persistentCommit(counts, nonce)`; a regulator can verify an off-chain disclosure against it |
| period nullifier | `periodNullifiers` set | hash of (`toolId`, `periodId`); prevents a second attestation for the same tool and period |

Ids are domain-separated `persistentHash` values of local secrets. The ledger never
holds a secret, a wallet address, or a name.

## What is private (never written to the ledger)

| Value | Lives in | Protected by |
|---|---|---|
| per-group applicant counts | auditor's workbook (witness) | only referenced inside the circuit; the proof reveals nothing beyond the asserted inequalities |
| per-group selection counts | auditor's workbook | same |
| inclusion mask (which groups were too small) | auditor's workbook | same; `groupsIncluded` is the only derived value disclosed |
| reference group identity and counts | auditor's workbook | same |
| commitment nonce | auditor's workbook, then the disclosure packet | random 32 bytes; makes `countsCommit` hiding |
| secrets of admin, employer, auditor | local storage (CLI identities file, browser localStorage) | only hashes are derived in-circuit |
| the applicant-level dataset | auditor's machine | only its sha-256 is committed |
| the model artifact | employer's machine | only its sha-256 is committed |

## What the public can infer

- From `minRatioPct` alone: the worst group's selection rate is at least that
  percentage of the best group's rate. With up to eight groups and counts in the
  hundreds, this is a single percentage and does not identify any group or count.
- From `groupsIncluded`: how many demographic categories met the minimum group
  size. It does not say which.
- From `countsCommit`: nothing. The commitment is hiding because the nonce is
  random and private. Two audits with identical counts produce different
  commitments (tested in `contract/test/fairgate.test.ts`).
- From the auditor id: which accredited auditor made the claim, which is the point.

## What a regulator can learn, and only from the auditor

The auditor keeps a disclosure packet (`cli/disclosures/<attestationId>.json`, or
the download in the browser) containing the labelled counts and the nonce. Opening
it to a regulator reveals the counts, nothing more. The regulator recomputes
`countsCommitment(counts, nonce)` with the exported pure circuit and compares it
with the on-chain `countsCommit`, and recomputes `minRatioPct` and compares it
with the attested value. A packet that has been edited cannot match (tested with
the `verify disclosure` command).

## Explicit `disclose()` sites in `fairgate.compact`

Every value that reaches the ledger passes through `disclose()`. The sites are:

- constructor: admin id, initial policy
- `setPolicy`: the new policy
- `accreditAuditor`, `revokeAuditor`, `rotateAdmin`: the ids passed in
- `registerTool`: tool id, employer id, model hash, metadata hash
- `attestAudit`: auditor id, tool id, period id, dataset commitment, counts
  commitment, `minRatioPct`, `groupsIncluded`
- `revokeAttestation`: the attestation id

The Compact compiler refuses to compile a contract that lets witness data reach the
ledger without one of these wrappers, which is the mechanism that keeps the list
above complete.
