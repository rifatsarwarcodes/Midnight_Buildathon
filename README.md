# FairGate

**Zero-knowledge bias-audit attestations for automated hiring tools, on Midnight.**

An employer registers the exact model it uses to screen applicants. An accredited
auditor proves, inside a Compact circuit, that every demographic group's selection
rate clears the four-fifths rule, and publishes only that fact plus the exact floor
of the worst impact ratio. The applicant counts never leave the auditor's machine.
Candidates, journalists and regulators verify the claim on the public ledger; a
regulator can additionally ask the auditor to open the committed counts and check
them against chain state without trusting anyone.

[![CI](https://github.com/rifatsarwarcodes/Midnight_Buildathon/actions/workflows/ci.yml/badge.svg)](https://github.com/rifatsarwarcodes/Midnight_Buildathon/actions/workflows/ci.yml)
Apache-2.0 · Compact 0.31.1 (language 0.23) · Midnight.js 4.1.1 · Midnight Buildathon on AKINDO, Wave 2

> Midnight-related code in this repository was written from scratch for the Buildathon.

## Why this needs a privacy chain

Bias audits of automated employment decision tools are law in New York City
(Local Law 144) and are required for high-risk AI systems under the EU AI Act.
Everywhere, the standard test is the EEOC four-fifths rule: no group's selection
rate may fall below 80% of the best group's rate. Today an audit is a PDF: the
employer trusts the auditor, the public trusts the employer, and the raw
numbers either stay secret (unverifiable) or get published (small groups become
identifiable, hiring volumes leak to competitors).

Midnight's dual ledger removes the trade-off. The counts are private witness
data. The circuit checks the rule with integer cross-multiplication and discloses
only the verdict, the threshold, the floor of the minimum impact ratio, and
commitments to the dataset and the counts. Anyone can verify; only the auditor can
open.

## What is in the box

| Directory | What | Status |
|---|---|---|
| `contract/` | `fairgate.compact` (7 circuits, 6 exported pure helpers), witnesses, off-chain audit arithmetic, 40 simulator tests incl. 12 lying-witness attacks | compiles, tests pass |
| `cli/` | deploy script, role-scoped commands for admin / employer / auditor / verifier, disclosure packets, local devnet compose | verified end to end on the local devnet |
| `ui/` | React front end: Verify (no wallet), Auditor workbench with a private/public split, Employer, Regulator packet verifier, Admin; Lace wallet via DApp Connector 4.x | builds, renders, reads the ledger |
| `docs/` | [Privacy boundary](docs/PRIVACY-BOUNDARY.md), [Threat model](docs/THREAT-MODEL.md), [deck](docs/deck/), [demo script](docs/DEMO.md) | |
| `.github/workflows/` | CI: install Compact 0.31.1, compile, typecheck, run tests | |

## How judges can evaluate this in 10 minutes

Requirements: Node 22+, Docker Desktop with Compose v2, macOS or Linux.

```bash
# 1. Toolchain (once). Pins the compiler version from the Preprod compatibility matrix.
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1

# 2. Build and test the contract. No network needed.
npm install
npm run compile          # compact compile contract/src/fairgate.compact -> contract/managed/fairgate
npm test                 # 40 tests against the compiled circuits (vitest)

# 3. Run the whole protocol on a local Midnight devnet (node + indexer + proof server).
npm run devnet:up
npm run deploy           # deploys the registry; the deployer becomes admin
cd cli
npm run cli -- whoami --role auditor                # prints this machine's auditor id
npm run cli -- admin accredit <auditor id>          # admin accredits the auditor
npm run cli -- employer register --model-file examples/model-card.json
npm run cli -- auditor attest --tool <toolId> --period 2026 \
    --counts examples/passing-audit.json --dataset-file examples/passing-audit.json
npm run cli -- verify tool <toolId>                  # read-only, through the indexer
npm run cli -- verify disclosure disclosures/<attestationId>.json
npm run cli -- auditor attest --tool <toolId> --period 2026 \
    --counts examples/failing-audit.json --dataset-file examples/failing-audit.json
#   -> "Refusing to attest: the tool does not pass. No transaction was sent."

# 4. Front end against the same devnet.
cd .. && npm run ui      # http://localhost:3000 (reads ui/.env.local)
```

The local devnet maps the indexer to host port 8089 (8088 is often taken).
Tear it down with `npm run devnet:down`.

### Public network

The registry is deployed on Midnight **Preprod**; see [DEPLOYMENTS.md](DEPLOYMENTS.md)
for the contract address, transaction hashes and the hosted front end. To
transact from the front end you need the Lace wallet with Midnight enabled, some
tNIGHT from the [Preprod faucet](https://midnight-tmnight-preprod.nethermind.dev/),
and a proof server (Lace's local proof server setting, or `docker run -p 6300:6300 midnightntwrk/proof-server:8.1.3 midnight-proof-server -v`).
Verification pages work with no wallet at all.

## The protocol

```
Employer                      Auditor                               Public ledger (Midnight)
   |                             |                                        |
   | registerTool(modelHash)     |                                        |
   |---------------------------------------------------------------------->| tools[toolId] = {employer, modelHash}
   |                             |                                        |
   |  hands over applicant-level dataset (off chain)                      |
   |---------------------------->|                                        |
   |                             | counts per group  (private witness)    |
   |                             | attestAudit(toolId, period, H(dataset))|
   |                             |--------------------------------------->| attestations[id] = {toolId, auditor,
   |                             |   proof: for every included group i    |   thresholdPct, minRatioPct, groupsIncluded,
   |                             |   100*s_i*refA >= T*refS*a_i, ...      |   datasetCommit, countsCommit, status}
   |                             |                                        | periodNullifiers += H(toolId, period)
Candidate / anyone               |                                        |
   | verify tool ------------------------------------------------------->| read-only via indexer
Regulator                        |                                        |
   | <--- disclosure packet (counts, nonce) ---------------------------|   
   | recompute countsCommitment(counts, nonce) == countsCommit ---------->| read-only via indexer
```

### What the circuit proves (`attestAudit`)

Given private witness `(a_1..a_8, s_1..s_8, included_1..8, refA, refS, p, nonce)`:

1. **Shape**: `s_i <= a_i`; `included_i` is true exactly when `a_i >= minGroupSize`
   (so an auditor cannot drop a large group that fails).
2. **Coverage**: `sum a_i >= minTotalApplicants`; at least two groups included.
3. **Reference**: `(refA, refS)` equals one of the included groups, `refS > 0`,
   and `refS * a_i >= s_i * refA` for all included groups (it really is the best rate).
4. **Four-fifths**: `100 * s_i * refA >= T * refS * a_i` for all included groups,
   where `T` is read from the registry policy, not supplied by the prover.
5. **Exact floor**: `p` satisfies `100 * s_i * refA >= p * refS * a_i` for all
   included `i`, and `100 * s_j * refA < (p+1) * refS * a_j` for some included `j`.
   So `p = floor(100 * min_i impactRatio_i)` exactly.
6. **Binding**: `countsCommit = persistentCommit([a, s, included], nonce)`.

No division, no floating point, bounded loops over the eight slots. Proving key
for this circuit is 10 MB (k = 15); the other six circuits are 3 to 5 MB.

### What stays private, what goes public

See [docs/PRIVACY-BOUNDARY.md](docs/PRIVACY-BOUNDARY.md) for the full table. In short:
counts, inclusion mask, reference group, nonce, dataset and model artifact stay
private. Tool id, auditor id, period, threshold, the floor of the minimum impact
ratio, the number of groups and two commitments go public.

### Identities

Every participant holds a 32-byte secret. Admin, employer and auditor ids are
domain-separated `persistentHash` values of it. `ownPublicKey()` is never used,
so no check depends on a prover-claimed key. One tool per `(employer, modelHash)`,
one attestation per `(tool, period)` regardless of auditor, revocation by the
issuing auditor or the admin only. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Repository layout

```
contract/src/fairgate.compact      the contract
contract/src/witnesses.ts          private state + witness implementations
contract/src/audit.ts              auditor-side arithmetic shared by CLI and UI
contract/test/                     simulator + 40 tests
cli/src/deploy.ts                  deploy to undeployed | preview | preprod
cli/src/fairgate.ts                admin / employer / auditor / verify commands
cli/examples/                      sample counts (one passing, one failing) and a model card
ui/src/pages/                      Verify, Auditor, Employer, Regulator, Admin
ui/src/lib/wallet.ts               Lace connection and Midnight.js providers
docs/                              privacy boundary, threat model, deck, demo script
```

## Versions

Pinned to the Preprod compatibility matrix (October 2026): Compact toolchain
0.31.1, compact-runtime 0.16.0, Midnight.js 4.1.1, DApp Connector API 4.0.1,
wallet SDK 1.2.0, proof server 8.1.x, Node 22+. The root `package.json` overrides
`@midnight-ntwrk/onchain-runtime-v3` to 3.0.0 so that exactly one copy of the
WASM runtime is loaded; with two copies, `instanceof StateValue` checks fail
inside `callTx`.

## Roadmap

- **Wave 2 (this submission)**: contract, tests, CLI, devnet run, Preprod
  deployment, browser front end with Lace, docs.
- **Wave 3**: intersectional audits (14 LL144 categories) via a 16-slot circuit;
  on-chain disclosure receipts (regulator acknowledges an opening); employer
  co-signature of the dataset hash with a Jubjub Schnorr attestation so the
  auditor cannot substitute data; a hosted proof server so the front end works
  without Docker; DUST fee sponsorship so auditors never need tokens.

## License

Apache-2.0. See [LICENSE](LICENSE).
