# Engineering log

Chronological record of everything built, every failure hit, and how each was
resolved. Written for judges and for anyone reproducing the project. Times are
local (Asia/Dhaka, UTC+6) on the dates given; all work so far happened on
2026-10-09 and 2026-10-10.

## 0. Research before writing code (Oct 9, evening)

- Pulled the AKINDO program JSON from `api.akindo.io/public/wave-hacks/jaMZjqPOBsLXvjdG`
  and all 168 registered products with their wave submissions. Wave 1 had 159
  submissions and only 7 funded (top $945, lowest $189). Grants are distributed
  in proportion to judge points.
- Read the official rules PDF and the judging rubric. Hard gate: a compiling
  Compact contract, public Apache-2.0 repo with the `midnightntwrk` GitHub topic,
  deck, demo video, written progress per wave.
- Read the write-ups and repositories of the funded teams. Common pattern:
  deployed on a public network with tx hashes, many circuits with an explicit
  public/private table, large stated test counts with negative tests, a
  third-party verification path, and an honest known-limits section.
- Theme saturation in Wave 1: identity/credentials ~53 entries, finance ~33, AI
  agents ~22. AI-model certification existed (SealML, TrustAi) but nothing did an
  in-circuit statistical test. Chose a hiring-bias audit on a real regulation
  (NYC LL144, EU AI Act) with the four-fifths rule proven inside the circuit.

## 1. Toolchain (Oct 9, 23:30)

- Installed Compact devtools 0.5.3 with the official installer and pinned the
  compiler to **0.31.1** (`compact update 0.31.1`), the version in the Preprod,
  Preview and Mainnet compatibility matrix. The newest release (0.35.0,
  language 0.27) targets a ledger that is not deployed publicly.
- Pulled `midnightntwrk/proof-server:8.1.3`. Node 24.6, Docker 28.3 present.
- Scaffolded `create-mn-app@0.5.1 --template hello-world` into a scratch
  directory to copy its devnet `docker-compose.yml`, wallet and deploy scripts,
  and pinned package versions (Midnight.js 4.1.1, compact-runtime 0.16.0,
  wallet-sdk 1.2.0).
- Git: remote `git@github.com:rifatsarwarcodes/Midnight_Buildathon.git`. The
  machine's default SSH key authenticates as a different GitHub account, so the
  repo pins `core.sshCommand` to `~/.ssh/id_ed25519_rifatsarwarcodes`.

## 2. Contract (Oct 9, 23:40 to Oct 10, 00:40)

**Implementation.** `contract/src/fairgate.compact`, language 0.23. Seven impure
circuits (`setPolicy`, `accreditAuditor`, `revokeAuditor`, `rotateAdmin`,
`registerTool`, `attestAudit`, `revokeAttestation`) and six exported pure
circuits (`deriveUserPk`, `deriveAdminPk`, `toolIdFor`, `periodNullifierFor`,
`attestationIdFor`, `countsCommitment`). Design notes:

- All identities are domain-separated `persistentHash` values of a 32-byte local
  secret; `ownPublicKey()` is never used (it is prover-claimed).
- The eight group slots are fixed-size `Vector<8, _>` fields so every loop is
  bounded. Dynamic indexing by a witness value is not allowed in Compact, so the
  reference group is passed as `(refApplicants, refSelected)` and proven to equal
  one of the included groups with a `fold` over the vectors using an anonymous
  circuit that captures the outer `const`s (this works in 0.23).
- The four-fifths test and the exact floor of the minimum impact ratio are
  integer cross-multiplications: `100·s_i·refA ≥ T·refS·a_i` and the two-sided
  bound for `p`. No division.
- `countsCommit = persistentCommit([applicants, selected, included], nonce)`.
  The nonce is private; the commitment is hiding.
- Threshold is read from ledger state (`policy`), never supplied by the prover.
- One attestation per `(toolId, periodId)` via a nullifier set, regardless of
  auditor, and a revoked attestation keeps its period spent.

**Failure 1: proving-key generation could not download parameters.** The first
`compact compile` compiled all seven circuits to ZK IR but `zkir` failed with
`Failed to fetch data from https://midnight-s3-fileshare-dev-eu-west-1.s3…/bls_midnight_2p13 after 3 attempts`.
The S3 object answered a HEAD request fine; the compiler's own download timed
out on a slow link. Fix: `curl` the parameter files (`bls_midnight_2p10` to
`2p15`, 0.2 to 6 MB each) directly into `~/.cache/midnight/zk-params/`. The
second compile succeeded in 4m22s. `attestAudit` needs k = 15 (10 MB prover key);
all verifier keys are 2 KB, so deployment fits in one transaction (two Wave 1
teams hit the block size limit with 12 to 18 circuits).

## 3. Tests (Oct 10, 00:45 to 01:02)

- Simulator (`contract/test/fairgate.simulator.ts`) runs compiled circuits in
  memory via `@midnight-ntwrk/compact-runtime` with `createConstructorContext`
  and `createCircuitContext`, following the zkloan example.
- 40 vitest cases: auditor-side arithmetic, admin, employer, auditor happy path,
  access control and replay, 12 lying-witness attacks, revocation. All pass in
  1.3 s. CI (`.github/workflows/ci.yml`) installs Compact 0.31.1 with
  `midnightntwrk/setup-compact-action`, compiles, typechecks and runs them on
  every push; both runs so far are green.

## 4. Local devnet and CLI (Oct 10, 01:00 to 01:15)

**Failure 2: indexer port 8088 already allocated.** Another container on this
machine binds 127.0.0.1:8088. Fix: map the devnet indexer to host port 8089 in
`cli/docker-compose.yml` and `cli/src/network.ts`.

**Failure 3: `Contract address not set. Call setContractAddress()`** on the
first deploy. In Midnight.js 4.1.1 the level private-state provider scopes
state per contract address, so it cannot hold the admin secret before the
contract exists. Fix: role secrets live in `cli/.fairgate-identities.json`
(owner-only, gitignored) via `cli/src/identities.ts`; the auditor command calls
`setContractAddress` before loading the workbook into the provider.

**Failure 4: `expected instance of StateValue`** on the first `callTx`
(accreditAuditor). Two copies of `@midnight-ntwrk/onchain-runtime-v3` were
installed (3.1.2 hoisted, 3.0.0 nested under `midnight-js-protocol`), so
`instanceof` failed across the two WASM modules. The create-mn-app lockfile has
the same split. Fix: root `package.json` `overrides` pin onchain-runtime-v3 to
3.0.0 (the matrix version) plus `npm dedupe`. Documented in README "Versions".

**Result.** Deploy, accredit, registerTool, attestAudit (33 s wall clock
including proof and inclusion), `verify tool`, `verify disclosure` (match) and a
tampered packet (mismatch, exit 2) all worked. The failing sample audit was
refused client-side with no transaction. Addresses and tx hashes are in
`DEPLOYMENTS.md`.

## 5. Front end (Oct 10, 01:15 to 01:30)

- React + Vite; Lace via DApp Connector 4.0.1 following the official
  midnight-leaderboard example; reads the ledger straight from the indexer.
  Checked that `indexer.preprod.midnight.network` sends
  `Access-Control-Allow-Origin: *`, so no Blockfrost token is needed.

**Failure 5: `vite build` crashed in `vite-plugin-top-level-await`**
(`missing field type` from swc). The build target is already `esnext`, which
supports top-level await natively, so the plugin was removed. Build passes
(two WASM chunks, 1.4 MB and 10 MB).

**Failure 6: duplicate `window.midnight` declaration.** The connector package
already declares it; removed ours.

- Rendered the built UI in headless Chrome against the devnet: WASM initialised,
  registry fetched, the attested tool showed "passed 2026, 86%". (Note: macOS has
  no `timeout` command and Chrome's `--dump-dom` never exits with this page, so
  the check used a Python subprocess timeout and read the partial stdout.)

## 6. Docs and deck (Oct 10, 01:30 to 02:50)

- README, `docs/PRIVACY-BOUNDARY.md`, `docs/THREAT-MODEL.md` (each attack mapped
  to its assertion and test), `docs/DEMO.md` (video script), `docs/SUBMISSION.md`
  (AKINDO text), `docs/deck/deck.md` rendered to PDF with Marp.
- The agent session ended mid-render once; the PDF was produced on the second run.

## 7. Public network deployment (Oct 10, 01:15 onward)

**Failure 7: wallet sync on Preprod appears to hang.** `check-balance --network
preprod` ran 1h31m with no output. Root causes found later: (a) my pipeline used
`tail -15`, which prints nothing until exit; (b) a fresh wallet scans the whole
chain from genesis and the SDK has no "start from block" option
(`startWithSecretKeys(secretKeys)` only); (c) see Failure 8.

**Failure 8: `Wallet.Sync: [object Object]`** printed repeatedly by
`wallet-sdk-shielded`, `-unshielded-wallet` and `-dust-wallet` `Sync.js`. Wrote
`cli/scripts/sync-probe.ts` to print per-wallet `appliedIndex /
highestRelevantWalletIndex` every 5 s. Findings: Preview has ~264k relevant
indices; shielded scans at ~200 to 400 items/s, dust at ~40 to 130 items/s; the
errors are reconnects that do **not** reset progress; but in wallet-sdk 1.2.0
the retry backs off exponentially without a cap (confirmed by the Midnight
servicedesk runbook PR #224), so after a burst of disconnects the dust stream
sits idle for 40+ minutes before resuming. Running two or three syncs from one IP
at once increased the disconnects. Mitigations: run one sync at a time; patched
`cli/src/deploy.ts` to log scan progress every 30 s and dump error payloads;
wallet state is persisted after the first full sync so later commands restore in
seconds.

- Preview first sync: shielded complete at 30 min, dust frozen at 93% for 43 min
  (backoff), resumed, synced at ~1h27m. Wallet
  `mn_addr_preview12pf8rtunkne7xt4r43gla48czf3gwp2k6t5m58pax0h4yyrajghsa64j6k`
  funded with 5,000 tNIGHT from the faucet (tx
  `00062060a234d1d8713b737e85642ce48a172b7b42de8982efed9181a1ce47a370`). DUST
  registration and generation succeeded.

**Failure 9: `Wallet.Proving: Failed to prove transaction … 'prove' returned an
error: ClientError: Failed to prove: bad input`** on the deploy transaction.
The local proof server container is `midnightntwrk/proof-server:8.1.0` (from the
create-mn-app compose file); the Preview compatibility matrix lists 8.1.3. The
dust portion of the transaction is proven by the wallet through the same proof
server, and a ledger/proof-server minor-version mismatch is the leading
explanation. Status: **open**. Fix requires replacing the container with 8.1.3,
which is blocked by Failure 10.

**Failure 10: Docker daemon unresponsive.** From ~02:40 the Docker CLI hung on
`docker ps` / `docker info` (hard 20 s timeouts), although the already-running
proof-server container still answered HTTP on port 6300 and the devnet indexer
stopped answering. Not restarted automatically because unrelated containers of
the user run on the same daemon. Resolved on Oct 12 by the user restarting the
machine; Docker 28.3.3 came back healthy.

**Fix attempt for Failure 9 (Oct 12).** `cli/docker-compose.yml` now pins
`midnightntwrk/proof-server:8.1.3`. Supporting evidence: ledger 8.1.2 release
notes introduce stricter transaction decoding ("an 8.1.2 node rejects data an
8.1.1 node accepts"), the same class as "bad input". Started the container with
`docker compose up -d --wait proof-server` and re-ran
`npm run deploy -- --network preview`; the wallet restored from the saved sync
state instead of rescanning.

- Preprod deploy was started in parallel and then stopped deliberately to reduce
  concurrent connections; it will be run after Preview succeeds, reusing the
  same approach. Preprod wallet:
  `mn_addr_preprod16trexelxj0x2rs79u3j8a6zw7yfjfk4glz3qlme74armmskxjlwqhzngjv`.

**Result (Oct 12).** With proof-server 8.1.3 the deploy succeeded on the first
attempt: Preview registry `170ed2cd…cca8`, deploy tx `932f1b2e…78e8` at block
1262055. The hypothesis in Failure 9 held: 8.1.0 cannot prove transactions for a
chain running ledger 8.1.2+ decoding rules.

**Failure 11: `SubmissionError … disconnected from wss://rpc.preview.midnight.network/: 1000 Normal Closure`**
on the first `attestAudit` submission on Preview. The proof was generated (about
60 s) and the RPC WebSocket closed while submitting. `verify tool` confirmed no
transaction landed and no nullifier was spent, so the command was simply rerun
and succeeded (tx `02afe388…b6c3`, block 1262094). The CLI already scrubs the
workbook from private state only after success, so a retry needs no extra steps.
Fix: `cli/src/fairgate.ts` now wraps every `callTx` in `submitWithRetry` (3 attempts, 10 s apart) for transient submission errors only; circuit assertion failures still surface immediately.

**Observation: two transaction identifiers.** Midnight.js `FinalizedTxData.txId`
is a 33-byte identifier (66 hex chars, `00` prefix). The indexer and the
explorer key transactions by the 32-byte hash. The canonical hashes were
recovered with the indexer query
`contract(address) { actions(limit) { transaction { hash block { height } } } }`
and are what `DEPLOYMENTS.md` links. The UI only renders an explorer link for
64-hex values.

**Preview flow timings (Oct 12).** Wallet restore from saved state: seconds.
accreditAuditor, registerTool: about 40 s each including proof and inclusion.
attestAudit: about 70 s. Blocks on Preview are roughly 6 s apart.

**Failure 12: Preprod sync produced 26 `Wallet.Sync` errors and zero progress.**
Direct probe of `indexer.preprod.midnight.network` returned: "decommissioned on
2026-10-09. The Midnight indexer is now provided by Blockfrost." The official
"Networks and environments" guide confirms: Midnight-hosted Preprod indexer and
RPC shut down at 22:00 UTC on 9 October 2026 (mainnet's on 30 September); Preprod
and Mainnet are now served by Blockfrost and every request needs a per-network
project token (`?project_id=<token>`). **Preview endpoints remain Midnight-hosted
and token-free**, which is why the Preview deployment worked. The create-mn-app
scaffold (0.5.1) still ships the retired Preprod URLs. Fix: `cli/src/network.ts`
now builds Preprod URLs from `BLOCKFROST_PROJECT_ID`; a Blockfrost "Midnight
Preprod" project (free sign-up) is required before a Preprod deployment can be
attempted. Preprod is optional for Wave 2 since Preview is a public network.

**Failure 13: GitHub Pages workflow failed at `midnightntwrk/setup-compact-action`**
(three runs, 16 s each) while the same action passes in `ci.yml`. The Pages
workflow runs with a restricted `permissions` block, which the action's release
lookup or cache step does not tolerate. Fix: install Compact in that workflow
with the official installer script and `compact update 0.31.1`. Build and deploy
then succeeded.

**Failure 14: the published site showed "No registry address configured".**
The root `.gitignore` excluded all `.env` files, so `ui/.env` (public Preview
endpoints and contract address, no secrets) was never committed and CI built
without it. Fix: `!ui/.env` in `.gitignore`; `ui/.env.local` stays ignored.

## 7b. Front-end redesign (Oct 12)

Replaced the generic light dashboard with a "dossier" design: dark ink surfaces
with paper-toned type, a single acid verdict colour (`#c8ff3d`) with oxblood for
failures and a seal amber for warnings, Young Serif for display text, Source
Serif 4 for prose and Martian Mono for anything the ledger stores. Layout is a
sticky case-file index on the left and sheets on the right; the masthead carries
a live ticker read from the indexer. Private values are drawn as animated
redaction bars next to their labels, so the privacy boundary is visible on the
Verify and Auditor pages rather than described. Motion is limited to one
staggered page-load reveal, a rubber-stamp animation on verdict badges and a
sweep on hex values. Tabs are deep-linkable with `?tab=auditor` etc. Verified
with headless-Chrome screenshots at 1400 px; fixed two issues found there
(narrow group-name inputs, invisible preset buttons).

## 8. Open items

| Item | Owner | Status |
|---|---|---|
| Restart Docker Desktop, start proof-server 8.1.3 on port 6300 | user (machine owner) | pending |
| Re-run `npm run deploy -- --network preview` | agent | done 2026-10-12 |
| Preview: accredit, register, attest, verify, tampered packet | agent | done 2026-10-12 |
| Preprod deploy, same flow | needs a Blockfrost Midnight Preprod project id from the user, then faucet funding | blocked on token |
| Fill `DEPLOYMENTS.md`, `ui/.env` contract address, `docs/SUBMISSION.md` links | agent | done for Preview |
| Add `midnightntwrk` and other GitHub topics | user (no token on this machine) | pending |
| Record the demo video from `docs/DEMO.md` | user | pending |
| Host the UI on GitHub Pages | agent | done: https://rifatsarwarcodes.github.io/Midnight_Buildathon/ |
| Lace end-to-end test of the UI on Preview (needs the user's Lace wallet) | user, then agent fixes | pending |
| Demo video per docs/DEMO.md | user | pending |
| AKINDO submission text: fill video and UI URLs | agent | pending on the above |
