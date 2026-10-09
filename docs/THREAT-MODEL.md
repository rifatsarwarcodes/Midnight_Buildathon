# Threat model

Who can lie, what they would gain, and what stops them. Each mitigation that the
circuit enforces has a corresponding test in `contract/test/fairgate.test.ts`.

## Trust assumptions

1. The registry admin accredits auditors honestly. Accreditation is the root of
   trust, the same as in real-world audit regimes (NYC LL144 requires an
   "independent auditor"). Everything the admin does is public and attributable.
2. An accredited auditor computes the per-group counts honestly from the dataset.
   The circuit cannot see the dataset; it binds the attestation to the dataset's
   hash so a regulator can later check the counts against the file. Dishonest
   counting is detectable on disclosure and attributable to the auditor.
3. Midnight's proof system is sound. A valid proof of `attestAudit` means the
   assertions held for some private inputs consistent with the public outputs.

## Attacks the circuit prevents

| Attacker | Attack | Mitigation | Test |
|---|---|---|---|
| auditor | attest a tool whose worst group is below the threshold | in-circuit check `100 * s_i * refA >= T * refS * a_i` for every included group | `rejects a tool that fails the four-fifths rule` |
| auditor | exclude a large group that would fail | mask consistency: an excluded group must have fewer than `minGroupSize` applicants | `rejects excluding a large group to hide its failing rate` |
| auditor | include a tiny group to shift the reference | an included group must have at least `minGroupSize` applicants | `rejects including a group below the minimum size` |
| auditor | fabricate a reference group with a high rate to make the test easier to state | the reference must equal one of the included groups (fold over the vectors) | `rejects a fabricated reference group` |
| auditor | pick a weak reference group so every ratio looks high | the reference must have the maximum selection rate: `refS * a_i >= s_i * refA` for all included groups | `rejects a reference group that is not the best-performing group` |
| auditor | publish a flattering `minRatioPct` | two-sided bound: every group is at or above `p`, and at least one is below `p + 1` | `rejects overstating…` / `rejects understating…` |
| auditor | claim `selected > applicants` to inflate a rate | `s_i <= a_i` for every slot | `rejects selected counts larger than applicants` |
| auditor | audit a handful of applicants | `sum a_i >= minTotalApplicants` | `rejects an audit that covers too few applicants` |
| auditor | audit a single group so nothing can fail | at least two included groups | `rejects an audit with a single included group` |
| auditor | reference group that selected nobody (all ratios undefined) | `refS > 0` | `rejects a reference group that selected nobody` |
| auditor | attest with a weaker threshold than the registry demands | threshold is read from the ledger, not supplied by the prover | `enforces the registry policy in force at attestation time` |
| anyone | attest without accreditation | `auditors.member(auditorPk)` | `rejects an auditor who is not accredited` |
| anyone | keep attesting after accreditation is revoked | same check on every call | `rejects an auditor whose accreditation was revoked` |
| employer | shop for a second auditor after a bad audit in the same period | period nullifier `hash(toolId, periodId)` is spent by the first attestation, revoked or not | `spends the period nullifier…`, `lets the issuing auditor revoke and keeps the period spent` |
| employer | reuse an attestation for a new model version | tool id is `hash(employer, modelHash)`; a new model is a new tool with no attestation | `derives the tool id from employer identity and model hash` |
| employer | register someone else's model as their own | allowed and harmless: the id binds to the registering employer's secret, and attestations name the tool id | `refuses the same employer registering the same model twice, but another employer may` |
| anyone | revoke a competitor's attestation | only the issuing auditor or the admin can revoke | `lets the admin revoke, but nobody else` |
| anyone | learn the counts from the ledger | only commitments and `minRatioPct` are written; commitments are hiding | `never writes raw counts to the public ledger`, `hides the counts…` |
| anyone | forge a disclosure packet | the packet must open `countsCommit` and reproduce `minRatioPct` | CLI `verify disclosure` on a tampered packet exits 2 |

## Attacks outside the circuit

| Attack | Status |
|---|---|
| Auditor miscounts the dataset | detectable only on disclosure; attributable because attestations name the auditor and bind the dataset hash. Future work: have the employer's HR system co-sign the dataset hash. |
| Employer runs a different model in production than the one hashed | out of scope for any audit regime; the hash makes the substitution provable after the fact. |
| Admin accredits a complicit auditor | public and attributable; a multi-signature or DAO-controlled admin is a straightforward extension (`rotateAdmin` to a contract-controlled key). |
| Lost admin secret | the registry cannot accredit new auditors; existing attestations stay valid. Back up `cli/.fairgate-identities.json`. |
| Linkability of auditor across tools | intentional: auditors are accountable. Employers and auditors are hashes, not names, so the public linkage is pseudonymous. |
| `ownPublicKey()` is not used anywhere | the contract derives all identities from witness secrets, so no assertion depends on a prover-claimed key. |

## Known limitations in this wave

- Eight group slots per attestation. LL144 intersectional categories (14) need two
  attestations or a larger contract; a 16-slot variant is a constant change.
- Counts are `Uint<32>`. Enough for any employer; products are bounded by the
  compiler at compile time, so there is no overflow path.
- The regulator disclosure is off chain by design. An on-chain "disclosure
  receipt" circuit (regulator acknowledges an opening) is planned for Wave 3.
- A revoked attestation keeps the period spent. Deliberate, but a registry policy
  could allow one re-attestation after revocation.
