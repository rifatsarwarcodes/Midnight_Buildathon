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

## Public network

_Pending: filled in once the Preview/Preprod deployment lands._
