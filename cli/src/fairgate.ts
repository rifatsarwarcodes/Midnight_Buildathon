// SPDX-License-Identifier: Apache-2.0
//
// FairGate command line. One binary, four hats:
//
//   admin     accredit <auditorPk> | revoke-auditor <auditorPk> | set-policy <threshold> <minGroup> <minTotal>
//   employer  register --model-file <path> | --model-hash <hex> [--meta-file <path> | --meta-hash <hex>]
//   auditor   attest --tool <toolId> --period <n> --counts <counts.json> (--dataset-file <path> | --dataset-hash <hex>)
//             revoke <attestationId>
//   verify    tool <toolId> | attestation <attestationId> | disclosure <packet.json>
//   whoami    [--role <role>]            print the identity derived from this machine's secret
//   status                                dump the public registry state
//
// Every command takes --network undeployed|preview|preprod (sticky, see network.ts)
// and --role <name> to pick which locally stored secret to act with.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import {
  pureCircuits,
  AttestationStatus,
  buildWorkbook,
  evaluateAudit,
  randomBytes32,
  toHex,
  fromHex,
  sha256,
  createFairGatePrivateState,
  type AuditPolicy,
  type Ledger,
  type Attestation,
  type GroupCounts,
} from '../../contract/src/index.ts';
import { resolveNetwork, getOrCreateWallet, formatWalletBackupNotice, getDeployment } from './network';
import { createWallet, persistWalletState, unshieldedToken } from './wallet';
import {
  createProviders,
  loadCompiledContract,
  privateStateIdFor,
  readLedger,
  waitForProofServer,
} from './providers';
import { loadOrCreateSecret, listRoles } from './identities';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCLOSURE_DIR = path.resolve(__dirname, '..', 'disclosures');

// ─── Argument parsing ──────────────────────────────────────────────────────────

interface Args {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[a.slice(2)] = argv[++i];
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const flag = (args: Args, name: string): string | undefined => {
  const v = args.flags[name];
  return typeof v === 'string' ? v : undefined;
};

const need = (args: Args, name: string): string => {
  const v = flag(args, name);
  if (!v) die(`missing --${name}`);
  return v;
};

function die(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

async function hashArg(args: Args, kind: string): Promise<Uint8Array> {
  const file = flag(args, `${kind}-file`);
  const hex = flag(args, `${kind}-hash`);
  if (file) return sha256(new Uint8Array(fs.readFileSync(file)));
  if (hex) {
    const b = fromHex(hex);
    if (b.length !== 32) die(`--${kind}-hash must be 32 bytes of hex`);
    return b;
  }
  die(`provide --${kind}-file <path> or --${kind}-hash <hex>`);
}

const short = (b: Uint8Array) => `${toHex(b).slice(0, 10)}…${toHex(b).slice(-6)}`;

// ─── Identity ──────────────────────────────────────────────────────────────────

/** Load or create this machine's secret for a role on the active network. */
function loadSecret(network: string, role: string): Uint8Array {
  const { secret, created } = loadOrCreateSecret(network, role);
  if (created) console.log(`  Created a new ${role} identity for ${network} in cli/.fairgate-identities.json`);
  return secret;
}

// ─── Connection ────────────────────────────────────────────────────────────────

async function connect(network: ReturnType<typeof resolveNetwork>['network'], networkConfig: ReturnType<typeof resolveNetwork>['config'], role: string) {
  const deployment = getDeployment(network);
  if (!deployment) die(`No registry deployed on ${network}. Run: npm run deploy -- --network ${network}`);

  const WALLET = getOrCreateWallet(network);
  const notice = formatWalletBackupNotice(WALLET, network);
  if (notice) console.log(notice);

  console.log('  Connecting wallet (sync can take a while on public networks)...');
  const walletCtx = await createWallet({ network, networkConfig, seed: WALLET.seed });
  const state = await walletCtx.wallet.waitForSyncedState();
  await persistWalletState(network, walletCtx);
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`  Wallet ${walletCtx.unshieldedKeystore.getBech32Address()}  balance ${balance.toLocaleString()} tNIGHT`);
  if (balance === 0n && networkConfig.faucet) {
    console.log(`  Wallet is empty. Fund it at ${networkConfig.faucet} before sending transactions.`);
  }

  if (!(await waitForProofServer(networkConfig.proofServer))) die('Proof server not reachable. Run: npm run devnet:up');

  const providers = createProviders(walletCtx, networkConfig);
  const secret = loadSecret(network, role);
  const privateStateId = privateStateIdFor(role);

  const contract = await findDeployedContract(providers, {
    compiledContract: loadCompiledContract() as any,
    contractAddress: deployment.address,
    privateStateId,
    initialPrivateState: createFairGatePrivateState(secret),
  });

  return { deployment, walletCtx, providers, contract: contract as any, secret, privateStateId };
}

function printTx(label: string, tx: any) {
  console.log(`\n  ${label}`);
  console.log(`  tx id:        ${tx.public.txId}`);
  console.log(`  block height: ${tx.public.blockHeight}`);
  console.log(`  status:       ${tx.public.status}`);
}

// ─── Commands ──────────────────────────────────────────────────────────────────

async function cmdWhoami(args: Args) {
  const { network } = resolveNetwork();
  const role = flag(args, 'role') ?? 'auditor';
  const secret = loadSecret(network, role);
  console.log(`
  network:       ${network}`);
  console.log(`  role:          ${role}   (known roles: ${listRoles(network).join(', ')})`);
  console.log(`  user pk:       ${toHex(pureCircuits.deriveUserPk(secret))}`);
  if (role === 'admin') console.log(`  admin pk:      ${toHex(pureCircuits.deriveAdminPk(secret))}`);
  console.log('');
}

async function cmdStatus() {
  const { network, config } = resolveNetwork();
  const deployment = getDeployment(network);
  if (!deployment) die(`No registry deployed on ${network}.`);
  const l = await readLedger(config, deployment.address);
  if (!l) die('Registry not found on the indexer yet.');
  console.log(`\n  FairGate registry on ${network}`);
  console.log(`  contract:      ${deployment.address}`);
  console.log(`  admin:         ${toHex(l.admin)}`);
  console.log(`  policy:        threshold ${l.policy.thresholdPct}%, min group ${l.policy.minGroupSize}, min applicants ${l.policy.minTotalApplicants}`);
  console.log(`  auditors:      ${l.auditors.size()}`);
  for (const a of l.auditors) console.log(`                 ${toHex(a)}`);
  console.log(`  tools:         ${l.toolCount}`);
  for (const [id, t] of l.tools) console.log(`                 ${toHex(id)}  model ${short(t.modelHash)}  employer ${short(t.employer)}`);
  console.log(`  attestations:  ${l.attestationCount}`);
  for (const [id, a] of l.attestations) console.log(`                 ${toHex(id)}  ${describeAttestation(a)}`);
  console.log('');
}

function describeAttestation(a: Attestation): string {
  const status = a.status === AttestationStatus.Active ? 'ACTIVE' : 'REVOKED';
  return `${status}  period ${a.periodId}  min impact ratio ${a.minRatioPct}% (threshold ${a.thresholdPct}%)  groups ${a.groupsIncluded}  auditor ${short(a.auditor)}`;
}

async function cmdAdmin(args: Args) {
  const { network, config } = resolveNetwork();
  const sub = args.positional[1];
  const { walletCtx, contract } = await connect(network, config, flag(args, 'role') ?? 'admin');
  try {
    switch (sub) {
      case 'accredit': {
        const pk = fromHex(args.positional[2] ?? die('usage: admin accredit <auditorPkHex>'));
        const tx = await contract.callTx.accreditAuditor(pk);
        printTx(`Accredited auditor ${toHex(pk)}`, tx);
        break;
      }
      case 'revoke-auditor': {
        const pk = fromHex(args.positional[2] ?? die('usage: admin revoke-auditor <auditorPkHex>'));
        const tx = await contract.callTx.revokeAuditor(pk);
        printTx(`Revoked auditor ${toHex(pk)}`, tx);
        break;
      }
      case 'set-policy': {
        const [t, g, n] = args.positional.slice(2);
        if (!t || !g || !n) die('usage: admin set-policy <thresholdPct> <minGroupSize> <minTotalApplicants>');
        const policy: AuditPolicy = { thresholdPct: BigInt(t), minGroupSize: BigInt(g), minTotalApplicants: BigInt(n) };
        const tx = await contract.callTx.setPolicy(policy);
        printTx(`Policy set to threshold ${t}%, min group ${g}, min applicants ${n}`, tx);
        break;
      }
      default:
        die('usage: admin accredit|revoke-auditor|set-policy ...');
    }
  } finally {
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  }
}

async function cmdEmployer(args: Args) {
  const { network, config } = resolveNetwork();
  const sub = args.positional[1];
  if (sub !== 'register') die('usage: employer register --model-file <path>|--model-hash <hex> [--meta-file|--meta-hash]');
  const modelHash = await hashArg(args, 'model');
  const metaHash = flag(args, 'meta-file') || flag(args, 'meta-hash') ? await hashArg(args, 'meta') : new Uint8Array(32);
  const { walletCtx, contract, secret } = await connect(network, config, flag(args, 'role') ?? 'employer');
  try {
    const employer = pureCircuits.deriveUserPk(secret);
    const expectedToolId = pureCircuits.toolIdFor(employer, modelHash);
    console.log(`\n  Registering tool ${toHex(expectedToolId)}`);
    console.log(`  model hash:    ${toHex(modelHash)}`);
    console.log(`  metadata hash: ${toHex(metaHash)}`);
    console.log('  Proving and submitting (30-90 seconds)...');
    const tx = await contract.callTx.registerTool(modelHash, metaHash);
    printTx(`Tool registered. toolId ${toHex(tx.private.result)}`, tx);
  } finally {
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  }
}

interface CountsFile {
  groups: GroupCounts[];
  dimension?: string;
}

function readCounts(file: string): CountsFile {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as CountsFile;
  if (!Array.isArray(parsed.groups)) die(`${file}: expected { "groups": [{ label, applicants, selected }] }`);
  return parsed;
}

function printEvaluation(counts: CountsFile, policy: AuditPolicy) {
  const ev = evaluateAudit(counts.groups, policy);
  console.log(`\n  Audit workbook (${counts.dimension ?? 'protected dimension'}) — stays on this machine`);
  console.log('  group                       applicants  selected   rate    impact ratio');
  for (const g of ev.groups) {
    const rate = g.selectionRate === null ? '   -  ' : `${(g.selectionRate * 100).toFixed(1).padStart(5)}%`;
    const ratio = g.included ? `${g.impactRatioPct}%${g.isReference ? ' (reference)' : ''}` : 'excluded (below min group size)';
    console.log(`  ${g.label.padEnd(27)} ${String(g.applicants).padStart(10)}  ${String(g.selected).padStart(8)}  ${rate}  ${ratio}`);
  }
  console.log(`  total applicants ${ev.totalApplicants}, groups included ${ev.groupsIncluded}, minimum impact ratio ${ev.minImpactRatioPct ?? '-'}%`);
  if (!ev.passes) {
    console.log('  RESULT: does not pass');
    for (const f of ev.failures) console.log(`    - ${f}`);
  } else {
    console.log(`  RESULT: passes the ${policy.thresholdPct}% threshold`);
  }
  return ev;
}

async function cmdAuditor(args: Args) {
  const { network, config } = resolveNetwork();
  const sub = args.positional[1];
  const role = flag(args, 'role') ?? 'auditor';

  if (sub === 'revoke') {
    const id = fromHex(args.positional[2] ?? die('usage: auditor revoke <attestationIdHex>'));
    const { walletCtx, contract } = await connect(network, config, role);
    try {
      const tx = await contract.callTx.revokeAttestation(id);
      printTx(`Attestation ${toHex(id)} revoked`, tx);
    } finally {
      await persistWalletState(network, walletCtx);
      await walletCtx.wallet.stop();
    }
    return;
  }

  if (sub !== 'attest') die('usage: auditor attest --tool <toolId> --period <n> --counts <file> --dataset-file <path>|--dataset-hash <hex>');
  const toolId = fromHex(need(args, 'tool'));
  const periodId = BigInt(need(args, 'period'));
  const counts = readCounts(need(args, 'counts'));
  const datasetCommit = await hashArg(args, 'dataset');

  // Evaluate off-chain first so a failing audit never reaches the proof server.
  const deployment = getDeployment(network);
  if (!deployment) die(`No registry deployed on ${network}.`);
  const l = await readLedger(config, deployment.address);
  if (!l) die('Registry not found on the indexer yet.');
  if (!l.tools.member(toolId)) die(`Tool ${toHex(toolId)} is not registered.`);
  const ev = printEvaluation(counts, l.policy);
  if (!ev.passes) die('Refusing to attest: the tool does not pass. No transaction was sent.');

  const nonce = randomBytes32();
  const workbook = buildWorkbook(counts.groups, l.policy, nonce);

  const { walletCtx, contract, providers, secret, privateStateId } = await connect(network, config, role);
  try {
    const auditor = pureCircuits.deriveUserPk(secret);
    if (!l.auditors.member(auditor)) die(`This machine's auditor identity ${toHex(auditor)} is not accredited.`);

    // Load the workbook into private state so the auditWorkbook witness can see it.
    // The store is scoped per contract address in Midnight.js 4.1.x.
    providers.privateStateProvider.setContractAddress(deployment.address);
    await providers.privateStateProvider.set(privateStateId, createFairGatePrivateState(secret, workbook));
    console.log('\n  Proving the four-fifths rule and submitting (60-120 seconds)...');
    const tx = await contract.callTx.attestAudit(toolId, periodId, datasetCommit);
    // Scrub the workbook from the stored private state once the proof is made.
    await providers.privateStateProvider.set(privateStateId, createFairGatePrivateState(secret));

    const attestationId: Uint8Array = tx.private.result;
    printTx(`Attestation ${toHex(attestationId)} recorded`, tx);

    // Disclosure packet: what the auditor hands to a regulator on request.
    fs.mkdirSync(DISCLOSURE_DIR, { recursive: true });
    const packetPath = path.join(DISCLOSURE_DIR, `${toHex(attestationId)}.json`);
    const packet = {
      format: 'fairgate-disclosure/v1',
      network,
      contractAddress: deployment.address,
      attestationId: toHex(attestationId),
      toolId: toHex(toolId),
      periodId: periodId.toString(),
      auditor: toHex(auditor),
      datasetCommit: toHex(datasetCommit),
      txId: tx.public.txId,
      dimension: counts.dimension ?? null,
      groups: counts.groups.map((g) => ({ label: g.label, applicants: Number(g.applicants), selected: Number(g.selected) })),
      nonce: toHex(nonce),
    };
    fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2));
    console.log(`\n  Disclosure packet written to ${packetPath}`);
    console.log('  Keep it private. Share it only with a regulator; anyone holding it can open the counts.');
  } finally {
    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  }
}

async function cmdVerify(args: Args) {
  const { network, config } = resolveNetwork();
  const sub = args.positional[1];
  const deployment = getDeployment(network);
  const contractAddress = flag(args, 'contract') ?? deployment?.address ?? die('no registry address known; pass --contract <address>');
  const l = await readLedger(config, contractAddress);
  if (!l) die('Registry not found on the indexer.');

  switch (sub) {
    case 'tool': {
      const toolId = fromHex(args.positional[2] ?? die('usage: verify tool <toolIdHex>'));
      if (!l.tools.member(toolId)) die('Tool is not registered.');
      const t = l.tools.lookup(toolId);
      console.log(`\n  Tool ${toHex(toolId)}`);
      console.log(`  model hash:    ${toHex(t.modelHash)}`);
      console.log(`  employer:      ${toHex(t.employer)}`);
      if (!l.latestAttestation.member(toolId)) {
        console.log('  attestation:   NONE. This tool has not passed a bias audit on this registry.\n');
        return;
      }
      const id = l.latestAttestation.lookup(toolId);
      const a = l.attestations.lookup(id);
      console.log(`  attestation:   ${toHex(id)}`);
      console.log(`                 ${describeAttestation(a)}`);
      console.log(`  auditor accredited now: ${l.auditors.member(a.auditor) ? 'yes' : 'NO'}\n`);
      return;
    }
    case 'attestation': {
      const id = fromHex(args.positional[2] ?? die('usage: verify attestation <attestationIdHex>'));
      if (!l.attestations.member(id)) die('Unknown attestation.');
      const a = l.attestations.lookup(id);
      console.log(`\n  Attestation ${toHex(id)}`);
      console.log(`  ${describeAttestation(a)}`);
      console.log(`  tool:          ${toHex(a.toolId)}`);
      console.log(`  dataset:       ${toHex(a.datasetCommit)}`);
      console.log(`  counts commit: ${toHex(a.countsCommit)}\n`);
      return;
    }
    case 'disclosure': {
      const file = args.positional[2] ?? die('usage: verify disclosure <packet.json>');
      const packet = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const id = fromHex(packet.attestationId);
      if (!l.attestations.member(id)) die('Attestation in packet is not on chain.');
      const a = l.attestations.lookup(id);
      const wb = buildWorkbook(packet.groups, { ...l.policy, thresholdPct: a.thresholdPct }, fromHex(packet.nonce));
      const recomputed = pureCircuits.countsCommitment(wb.applicants, wb.selected, wb.included, fromHex(packet.nonce));
      const matches = toHex(recomputed) === toHex(a.countsCommit);
      console.log(`\n  Disclosure for attestation ${toHex(id)}`);
      printEvaluation(packet, { ...l.policy, thresholdPct: a.thresholdPct });
      console.log(`\n  recomputed counts commitment: ${toHex(recomputed)}`);
      console.log(`  on-chain counts commitment:   ${toHex(a.countsCommit)}`);
      console.log(`  on-chain minimum impact ratio: ${a.minRatioPct}%  (packet implies ${wb.minRatioPct}%)`);
      console.log(matches && wb.minRatioPct === a.minRatioPct
        ? '\n  VERIFIED: these counts are exactly what the auditor proved on chain.\n'
        : '\n  MISMATCH: this packet does not open the on-chain commitment.\n');
      if (!matches) process.exit(2);
      return;
    }
    default:
      die('usage: verify tool|attestation|disclosure ...');
  }
}

// ─── Entry ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args.positional[0];
  switch (cmd) {
    case 'whoami': return cmdWhoami(args);
    case 'status': return cmdStatus();
    case 'admin': return cmdAdmin(args);
    case 'employer': return cmdEmployer(args);
    case 'auditor': return cmdAuditor(args);
    case 'verify': return cmdVerify(args);
    default:
      console.log(`
  FairGate CLI

    npm run cli -- whoami [--role admin|employer|auditor]
    npm run cli -- status
    npm run cli -- admin accredit <auditorPk>
    npm run cli -- admin revoke-auditor <auditorPk>
    npm run cli -- admin set-policy <thresholdPct> <minGroupSize> <minTotalApplicants>
    npm run cli -- employer register --model-file <path> [--meta-file <path>]
    npm run cli -- auditor attest --tool <toolId> --period 2026 --counts examples/passing-audit.json --dataset-file <path>
    npm run cli -- auditor revoke <attestationId>
    npm run cli -- verify tool <toolId>
    npm run cli -- verify attestation <attestationId>
    npm run cli -- verify disclosure disclosures/<attestationId>.json

  Add --network undeployed|preview|preprod to any command.
`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('\n  Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
