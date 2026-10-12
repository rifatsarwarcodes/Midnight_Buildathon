# AKINDO submission text — Wave 2

Paste into the "progress in this Wave" field. Keep the links at the top; judges
score what they can open.

---

**FairGate** — zero-knowledge bias-audit attestations for automated hiring tools.

Links
- Repo (Apache-2.0, `midnightntwrk` topic): https://github.com/rifatsarwarcodes/Midnight_Buildathon
- Deployments, addresses and tx hashes: https://github.com/rifatsarwarcodes/Midnight_Buildathon/blob/main/DEPLOYMENTS.md
- Deck: https://github.com/rifatsarwarcodes/Midnight_Buildathon/blob/main/docs/deck/fairgate-deck.pdf
- Demo video: VIDEO_URL
- Front end: UI_URL
- CI (compiles with Compact 0.31.1, 40 tests): https://github.com/rifatsarwarcodes/Midnight_Buildathon/actions

**The problem.** NYC Local Law 144 and the EU AI Act require bias audits of
automated hiring tools against the EEOC four-fifths rule. Today an audit is a PDF:
publish the counts and small groups become identifiable and hiring volumes leak;
keep them secret and nobody can verify. FairGate makes the verdict public and keeps
the people private.

**What was built this Wave (everything, from an empty repository).**

1. *Compact contract* (`contract/src/fairgate.compact`, toolchain 0.31.1 / language
   0.23): 7 impure circuits (`setPolicy`, `accreditAuditor`, `revokeAuditor`,
   `rotateAdmin`, `registerTool`, `attestAudit`, `revokeAttestation`) and 6 exported
   pure circuits so TypeScript derives identical ids and commitments. `attestAudit`
   takes the per-group counts as a private witness and proves, with integer
   cross-multiplication only: counts are well formed, the inclusion mask follows
   the registry's minimum-group-size policy (an auditor cannot drop a failing
   group), the reference group is a real included group with the highest selection
   rate, every included group clears the threshold read from ledger state, and the
   published `minRatioPct` is exactly `floor(100 · min impact ratio)`. The ledger
   receives tool id, auditor id, period, threshold, the floor, the group count, a
   sha-256 of the dataset and a hiding `persistentCommit` of the counts. Period
   nullifier `H(toolId, period)` prevents auditor shopping. All identities are
   domain-separated hashes of local secrets; `ownPublicKey()` is never used.
2. *Tests*: 40 vitest cases against the compiled circuits via the simulator,
   including 12 lying-witness attacks (fabricated reference group, hidden failing
   group, overstated ratio, replay, revoked auditor) and a check that raw counts
   never reach the ledger. CI installs Compact 0.31.1, compiles and runs them on
   every push.
3. *CLI* (`cli/`): deploy to undeployed / preview / preprod, role-scoped commands for
   admin, employer, auditor and verifier; the auditor command refuses a failing
   audit before any transaction and writes a disclosure packet for regulators;
   `verify disclosure` reopens the commitment against chain state and rejects a
   tampered packet (exit 2).
4. *Front end* (`ui/`, React + Vite + Lace via DApp Connector 4.0.1): Verify page
   with no wallet, Auditor workbench with a live private/public split and
   "prove and attest with Lace", Employer registration, Regulator packet verifier,
   Admin. Reads the ledger directly from the public indexer.
5. *Public network*: registry deployed on **Midnight Preview** at
   `170ed2cd17ff93d221465f39d7be1b54618df761622952f0df3f03af7edacca8`; accreditation,
   tool registration, attestation (block 1262094) and disclosure verification all
   done on Preview, with explorer links in DEPLOYMENTS.md. Preprod deployment in progress.
6. *Docs*: privacy boundary table, threat model mapping each attack to its
   circuit assertion and test, demo script, deck.

**Numbers.** 7 circuits, k = 15 for `attestAudit` (10 MB prover key, 2 KB
verifier keys so deployment fits one transaction), attestation proof + submission
in ~33 s on the local devnet, 40/40 tests.

**Known limits, stated plainly.** Eight group slots per attestation (two
attestations for LL144 race × sex); the regulator disclosure is off chain by
design; a revoked attestation keeps its period spent; the auditor's counting of
the dataset is trusted but bound to the dataset hash and attributable.

**Wave 3 plan.** 16-slot intersectional circuit; employer co-signature of the
dataset hash (Jubjub Schnorr); on-chain disclosure receipts; hosted proof server
and DUST sponsorship so auditors need no Docker and no tokens; embeddable
verification badge for job postings.
