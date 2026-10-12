# Deployments

All addresses below can be checked with no wallet:

```bash
cd cli && npm run cli -- status --network <network>
npm run cli -- verify tool <toolId> --network <network>
```

## Local devnet (undeployed)

Reproducible on any machine with `npm run devnet:up && npm run deploy`. The run
recorded on 2026-10-10 while developing:

| Step | Value |
|---|---|
| registry contract | `2963f40a88a72bbac0ca1db2ee01ad9d0dca8aa67ea18141168ba2795a245d69` |
| admin id | `bf6580feaa4c0baaedf3ab4df9c64445431255e3fe90a0d177ebd7a1c4125f2e` |
| accredit auditor tx | `000fd4704656ca34799e9ed9cec170e1c0a2d98336e5886d7482e0fc1b642e2ecf` (block 55) |
| registerTool tx | `005245c258145e02be9a59cec91e91252085fa9fe016b5b2a018ba7dbac7cd781d` (block 60) |
| tool id | `565fc1ea770545d8582ff47e7b1803680d3ba7fb9a75b270eedf55b117430766` |
| attestAudit tx | `005db0d364fa9b864670371fbfb8f1a043c6b27b947205b4303920a0b9fa19f9c5` (block 67) |
| attestation id | `605ed46a87aa69e4c145eda107aa2cbd3e37a21f322fa6a9bf4efcf5ac45e0fb` |
| attested result | period 2026, threshold 80%, minimum impact ratio 86%, 6 groups |
| wall-clock for attestAudit | 33 s including wallet sync, proof and block inclusion |

## Midnight Preview (public network)

Deployed 2026-10-12. Every row is public and checkable on the explorer with no wallet.

| Step | Value |
|---|---|
| registry contract | [`170ed2cd17ff93d221465f39d7be1b54618df761622952f0df3f03af7edacca8`](https://preview.midnightexplorer.com/contracts/170ed2cd17ff93d221465f39d7be1b54618df761622952f0df3f03af7edacca8) |
| deploy tx | [`932f1b2ee691533bc551d2cc0b8c95658df78c2062471c9c87dd8901b65b78e8`](https://preview.midnightexplorer.com/transactions/932f1b2ee691533bc551d2cc0b8c95658df78c2062471c9c87dd8901b65b78e8) (block 1262055) |
| admin id | `77c50268c3cdc0b6ed8c45669c733c99c7566e3c26fa1371a5fd039b1fc23ede` |
| policy | threshold 80%, min group size 10, min applicants 100 |
| accreditAuditor tx | [`1cc552be8e1fe246b4a5e5fe230f631dacf470a9aeec4d021d93d2cd27ef2394`](https://preview.midnightexplorer.com/transactions/1cc552be8e1fe246b4a5e5fe230f631dacf470a9aeec4d021d93d2cd27ef2394) (block 1262070) |
| auditor id | `f863e33bde442757cf60e3d30942f36f1efa5de7abd06223254904355a21be3c` |
| registerTool tx | [`65ab8f5f43720bef74fb9d92d883e772459a0d02fa7b09940d95737af1a1c992`](https://preview.midnightexplorer.com/transactions/65ab8f5f43720bef74fb9d92d883e772459a0d02fa7b09940d95737af1a1c992) (block 1262076) |
| tool id | `05be0e321fb2bed20542c9bc6c68fcb4c5e32206bef84aa8b565b25faefa328a` |
| model hash | `0cc996112d0692d5356ed6617f660be56af66939b93e69a9a45344977a54e44e` (sha-256 of `cli/examples/model-card.json`) |
| attestAudit tx | [`02afe388e9ffe02c7547feb837e707c6b5a494c9f98b14da9f971212e33ab6c3`](https://preview.midnightexplorer.com/transactions/02afe388e9ffe02c7547feb837e707c6b5a494c9f98b14da9f971212e33ab6c3) (block 1262094) |
| attestation id | `db127b853df814c645a17c4514f15b9f962c6f81a331a9fa4bf525b4012fef8f` |
| attested result | period 2026, threshold 80%, minimum impact ratio 86%, 6 groups included |
| counts commitment | `f6aa3e8d79496dea22ad3e0c4182d0fea229a2422290f78aa5c96c29deb4418b` |
| deployer wallet | `mn_addr_preview12pf8rtunkne7xt4r43gla48czf3gwp2k6t5m58pax0h4yyrajghsa64j6k` |

Checks run against this deployment on 2026-10-12:

- `verify tool 05be…328a --network preview` → ACTIVE, 86%, auditor still accredited.
- `verify disclosure <packet> --network preview` → recomputed commitment equals the on-chain commitment, 86% reproduced, VERIFIED.
- The same packet with one count edited → MISMATCH, exit code 2.
- `auditor attest … failing-audit.json` → refused client-side, no transaction sent.

Note on transaction ids: Midnight.js returns a 33-byte transaction *identifier*
(66 hex characters starting with `00`). The explorer and the indexer use the
32-byte transaction *hash*, which is what the table shows. Both are recorded in
`docs/ENGINEERING-LOG.md`.

## Midnight Preprod

_Not yet deployed._ Midnight retired its Preprod indexer and RPC on 2026-10-09;
Preprod is now served by Blockfrost and needs a project token
(`BLOCKFROST_PROJECT_ID`). The CLI supports it; deployment will follow once a
token is available and the Preprod wallet
`mn_addr_preprod16trexelxj0x2rs79u3j8a6zw7yfjfk4glz3qlme74armmskxjlwqhzngjv` is funded.
