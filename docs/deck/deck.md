---
marp: true
theme: default
paginate: true
size: 16:9
style: |
  section { font-family: Inter, system-ui, sans-serif; font-size: 26px; padding: 56px 64px; }
  h1 { font-size: 54px; margin-bottom: 8px; }
  h2 { font-size: 38px; color: #2f4df5; margin-bottom: 18px; }
  code { font-family: 'JetBrains Mono', Menlo, monospace; font-size: 20px; }
  pre { font-size: 18px; }
  table { font-size: 22px; }
  .muted { color: #5f6673; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .private { background: #f3eefc; padding: 16px 20px; border-radius: 12px; }
  .public { background: #e9f1ff; padding: 16px 20px; border-radius: 12px; }
  footer { color: #9aa0a9; font-size: 16px; }
footer: FairGate · Midnight Buildathon · Wave 2
---

# FairGate
## Zero-knowledge bias-audit attestations for automated hiring tools

Prove a hiring algorithm passed the four-fifths rule.
Publish the verdict. Keep the people private.

<span class="muted">Built on Midnight with Compact · Apache-2.0 · github.com/rifatsarwarcodes/Midnight_Buildathon</span>

---

## The problem: audits that cannot be both verifiable and private

- **NYC Local Law 144** and the **EU AI Act** require bias audits of automated hiring tools.
- The standard test is the EEOC **four-fifths rule**: every group's selection rate must be ≥ 80% of the best group's rate.
- Today the audit is a PDF.
  - Publish the counts → small groups become identifiable, hiring volumes leak to competitors.
  - Keep the counts → candidates, journalists and partners cannot verify anything.
- Nobody can check that the auditor's arithmetic was honest.

---

## FairGate on Midnight

<div class="two">
<div class="private">

**Private (witness data)**
- applicants and selections per group
- which groups were too small to include
- the reference (best) group
- the commitment nonce
- the dataset and the model artifact

</div>
<div class="public">

**Public (ledger)**
- tool id = H(employer, model hash)
- period, auditor id, threshold
- **exact floor of the minimum impact ratio**
- number of groups included
- sha-256 of the dataset, commitment to the counts

</div>
</div>

A failing tool cannot obtain a proof at all. A regulator can ask the auditor to open the commitment and verify the counts against chain state.

---

## What the `attestAudit` circuit proves

For private counts `(a_i, s_i)`, inclusion mask, reference `(refA, refS)`, claimed floor `p`:

| Check | Constraint (integer, no division) |
|---|---|
| shape | `s_i ≤ a_i`; `included_i ⇔ a_i ≥ minGroupSize` |
| coverage | `Σ a_i ≥ minTotal`, ≥ 2 groups included |
| reference is real and best | `(refA, refS)` ∈ included groups; `refS·a_i ≥ s_i·refA` ∀ i |
| four-fifths | `100·s_i·refA ≥ T·refS·a_i` ∀ included i, `T` read from the registry policy |
| exact floor | `100·s_i·refA ≥ p·refS·a_i` ∀ i and `100·s_j·refA < (p+1)·refS·a_j` for some j |
| binding | `countsCommit = persistentCommit([a, s, included], nonce)` |

Seven circuits, six exported pure helpers so TypeScript derives identical ids and commitments.

---

## Lying auditors, rejected by the circuit

Twelve hand-crafted workbooks in the test-suite, each refused by an assertion:

- exclude a large group that would fail → `a group large enough to include was excluded`
- fabricate a flattering reference group → `reference group is not one of the included groups`
- pick a weak reference so ratios look high → `does not have the highest selection rate`
- overstate or understate the published floor → `claimed minimum impact ratio is too high / too low`
- `selected > applicants`, too few applicants, one group, reference selected nobody
- attest with a weaker threshold → threshold is ledger state, not a prover input
- attest twice in a period, even via another auditor → period nullifier `H(toolId, period)`

40 tests total · `npm test` · CI compiles with Compact 0.31.1 on every push

---

## Live on Midnight

- **Local devnet**: deploy → accredit → register → attest → verify in under two minutes; attestation proof lands in ~33 s.
- **Preprod**: registry deployed, see `DEPLOYMENTS.md` for addresses and transaction hashes.
- **CLI**: `admin accredit`, `employer register`, `auditor attest`, `verify tool | attestation | disclosure`.
- **Browser**: Verify (no wallet), Auditor workbench with private/public split, Employer, Regulator packet verifier, Admin. Lace wallet via DApp Connector 4.x; reads the ledger straight from the indexer. Live: https://rifatsarwarcodes.github.io/Midnight_Buildathon/
- A tampered disclosure packet fails verification; an honest one reproduces both the commitment and the attested floor.

---

## Who uses it

| Party | What they do | What they learn |
|---|---|---|
| Employer | registers the exact model it runs | nothing new |
| Accredited auditor | proves the rule over private counts | nothing new |
| Candidate, journalist | checks a tool id on the Verify page | passed / revoked / none, floor ratio |
| Regulator | asks the auditor for the packet, verifies it on chain | the counts, and that they are the proven ones |

Adoption path: start with LL144-covered employers in NYC (annual audits are already mandatory), sell to the auditors who issue them. Attestations become a portable, checkable credential for any AI hiring vendor.

---

## Wave 3 and beyond

- **Intersectional audits**: 16-slot circuit for the 14 LL144 intersectional categories.
- **Employer co-signed datasets**: Jubjub Schnorr attestation on the dataset hash so an auditor cannot substitute data.
- **On-chain disclosure receipts**: a regulator acknowledges an opening without revealing it.
- **Hosted proof server and DUST sponsorship**: auditors need no Docker and no tokens.
- **Lace-free verification embeds**: a one-line badge employers paste into job postings.

<br/>

**FairGate — the proof is public, the people are private.**
<span class="muted">github.com/rifatsarwarcodes/Midnight_Buildathon · Apache-2.0</span>
