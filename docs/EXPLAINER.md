# FairGate, explained from the ground up

This document starts from zero and goes deeper section by section. Stop whenever
you have what you need; each level stands on its own.

---

## Level 0: the one-sentence version

FairGate lets a company prove, in public, that the computer program it uses to
screen job applicants does not discriminate, without showing anyone the
applicants' data.

---

## Level 1: the problem, in plain words

Many companies no longer have a person read every job application. A program
ranks or filters applicants first. These programs can be unfair: for example,
they might select 20% of applicants from one group but only 12% from another.

Because of this, laws now require audits:

- New York City's **Local Law 144** says an employer using an automated hiring
  tool must have it audited for bias every year.
- The European Union's **AI Act** treats hiring software as "high risk" and
  requires similar checks.

The standard test used in these audits is called the **four-fifths rule**. It
says: take the group with the highest selection rate; every other group's rate
must be at least four fifths (80%) of it. If one group is selected at 20% and
another at 12%, the ratio is 12/20 = 60%, which fails. If the second group were
at 16%, the ratio would be 80%, which passes.

Here is the catch. To check the rule you need the numbers: how many people from
each group applied, and how many were selected. Those numbers are sensitive.

- If the employer **publishes** them, small groups become identifiable (if 7
  people of one background applied and 1 was hired, colleagues can guess who),
  and competitors learn the company's hiring volumes.
- If the employer **keeps them secret**, nobody outside can check that the audit
  was done honestly. A candidate, a journalist or a partner has to take the
  company's word, in a PDF.

So today it is "verifiable or private, pick one". FairGate's point is that you
can have both.

---

## Level 2: what FairGate does, as a story

Four people are involved.

1. **The employer** (say, Acme) uses a screening program called ResumeRank. Acme
   registers ResumeRank in FairGate. Registering means publishing a fingerprint
   of the exact program file (a hash), so nobody can later swap the program and
   keep the audit.
2. **The auditor** is an independent firm that Acme hires, like an accountant.
   The auditor gets Acme's applicant data, counts applicants and selections per
   group, and runs the four-fifths test. Then, instead of signing a PDF, the
   auditor produces a **mathematical proof** that the test passed, and publishes
   that proof on a public ledger. The counts themselves stay on the auditor's
   computer.
3. **Anyone** (a candidate, a journalist, a customer of Acme) can look up
   ResumeRank on the ledger and see: "audited in 2026 by auditor X, passed, the
   worst group was at 86% of the best group". They cannot see how many people
   applied or how many were hired. They do not have to trust Acme or the auditor,
   because the proof itself guarantees the test was run correctly.
4. **A regulator** can go further. If the law requires it, the regulator asks the
   auditor for the actual counts. The auditor hands over a small file. The
   regulator can check that this file matches what was proven on the ledger, so
   the auditor cannot hand over a different set of numbers than the ones that
   were tested.

That is the whole product: the verdict is public, the people are private, and
the honesty of the audit is enforced by mathematics rather than by trust.

---

## Level 3: why a blockchain, and why Midnight

A blockchain is a shared record that nobody can edit after the fact and that
everybody can read. That is what you want for an audit registry: once "ResumeRank
passed in 2026" is written, Acme cannot quietly delete it after a bad year, and
anyone can read it without asking Acme's permission.

Ordinary blockchains (Bitcoin, Ethereum) have a problem for this use: everything
written to them is public, including the inputs to any computation. If the
auditor ran the four-fifths test on a normal blockchain, the counts would be
visible to the world.

**Midnight** is a blockchain built for exactly this situation. It has two
"ledgers" at once:

- a **public ledger**, like any blockchain, which everybody sees, and
- **private state**, which stays on the participant's own machine.

A program on Midnight (called a **contract**) can read private data, do
calculations with it, and write only the *result* to the public ledger, along
with a proof that the calculation was done correctly. This proof is a
zero-knowledge proof, explained next.

Midnight contracts are written in a language called **Compact**, which looks like
TypeScript. The project's contract is one file, `contract/src/fairgate.compact`.

---

## Level 4: zero-knowledge proofs, intuitively

A zero-knowledge proof is a way to convince someone that a statement is true
without telling them why it is true.

Everyday example: you want to prove you are over 18 without showing your date
of birth. Your ID card shows the date; a zero-knowledge proof would be a
document that says "the holder is over 18", stamped in a way that could only
have been produced from a genuine ID, while not containing the date.

In FairGate the statement is:

> "I, an accredited auditor, know applicant and selection counts for this tool
> such that every group's selection rate is at least 80% of the best group's
> rate, the smallest ratio is exactly 86%, and these counts hash to this
> fingerprint."

The proof convinces the ledger (and everyone reading it) that this statement is
true, while revealing nothing about the counts except the number 86.

Two properties matter:

- **Soundness**: you cannot produce a valid proof for a false statement. If the
  real worst ratio is 72%, no amount of cleverness yields a proof that says 86%.
- **Zero knowledge**: the proof leaks nothing beyond the statement. The counts
  cannot be recovered from it.

How this works mathematically is deep (elliptic curves, polynomial commitments)
and FairGate does not implement it; Midnight's toolchain does. What FairGate
implements is the **statement**: a precise list of checks, written as a Compact
"circuit". The toolchain turns that circuit into a prover (which the auditor
runs) and a verifier (which the blockchain runs).

---

## Level 5: the four-fifths rule as arithmetic the circuit can do

Inside a zero-knowledge circuit you cannot divide numbers freely, and every loop
must have a fixed size. So the test is rewritten with multiplication only.

Let group *i* have *a_i* applicants and *s_i* selected. Its selection rate is
*s_i / a_i*. Let the reference group (the best one) have *A* applicants and *S*
selected, rate *S / A*.

The four-fifths rule for group *i* is:

    (s_i / a_i) / (S / A)  ≥  80 / 100

Multiply both sides out to remove all divisions:

    100 · s_i · A  ≥  80 · S · a_i

That is a check the circuit can do with integers. It is done once per group.

To prove the reference group really is the best, the circuit checks for every
group:

    S · a_i  ≥  s_i · A        (which is  S/A ≥ s_i/a_i  without division)

To publish the *exact* worst ratio as a whole percentage *p* (86 in the demo),
the circuit checks two things: every group is at or above *p* percent, and at
least one group is below *p + 1* percent. Together those pin *p* to exactly the
floor of the minimum ratio. The auditor cannot overstate or understate it.

Groups with fewer applicants than a minimum (10 in the current policy) are
excluded, because a ratio over 7 people is meaningless and because publishing
anything about a 7-person group risks identifying them. The circuit checks that
the exclusions are honest: a group is excluded if and only if it is below the
minimum, so an auditor cannot drop a large group that would fail.

The threshold (80) and the minimum group size (10) are not chosen by the
auditor. They are read from the registry's public policy, which only the
registry admin can set.

---

## Level 6: what exactly is on the ledger and what is not

**Public, on the ledger**

| Item | Why it must be public |
|---|---|
| tool id = hash(employer id, program fingerprint) | ties the audit to one exact program of one employer |
| auditor id | accountability: every attestation names who made it |
| audit period (e.g. 2026) | audits are annual |
| threshold used (80%) | the rule being enforced must be visible |
| the exact floor of the worst ratio (86%) | the one statistic the public gets |
| number of groups included (6) | lets a reader judge coverage |
| sha-256 of the applicant dataset | a regulator can later check the auditor used this file |
| a commitment to the counts | explained in Level 7 |

**Private, never on the ledger**

- applicants per group, selections per group
- which groups were excluded as too small
- which group was the reference group
- the random nonce used in the commitment
- the dataset itself and the program itself (only their fingerprints are public)

Identities are hashes of secrets that each participant keeps locally. No names,
no wallet addresses, no emails are on the ledger.

---

## Level 7: commitments, and how a regulator opens them

A **commitment** is like a sealed envelope. You put the counts and a random
number (the nonce) in, seal it, and publish the sealed envelope. Two properties:

- **Hiding**: nobody can tell what is inside. Even the same counts sealed twice
  with different nonces look completely different.
- **Binding**: you cannot later claim different contents. Opening the envelope
  with different counts does not match the seal.

Technically the seal is `persistentCommit([applicants, selected, included], nonce)`,
a hash function provided by Midnight.

When a regulator asks, the auditor gives them a small JSON file (the
**disclosure packet**) with the labelled counts and the nonce. The regulator's
tool recomputes the seal and compares it with the one on the ledger. Match means
these are exactly the numbers that were proven. In the project this is the
`verify disclosure` command and the Regulator tab of the website. A packet with
one number changed fails the check; this was tested on the live network.

---

## Level 8: the pieces of the project

```
contract/   the Compact contract, witnesses, audit arithmetic, 40 tests
cli/        command-line tools: deploy, admin, employer, auditor, verify
ui/         the website: Verify, Auditor, Employer, Regulator, Admin
docs/       this file, privacy boundary, threat model, engineering log, deck
```

**The contract** (`contract/src/fairgate.compact`) has seven operations that
change the ledger ("impure circuits"):

| Operation | Who | What |
|---|---|---|
| `setPolicy` | admin | set threshold, minimum group size, minimum applicants |
| `accreditAuditor` / `revokeAuditor` | admin | manage the list of trusted auditors |
| `rotateAdmin` | admin | hand the admin role to a new key |
| `registerTool` | employer | publish a program's fingerprint, get a tool id |
| `attestAudit` | auditor | the big one: prove the rule, write the verdict |
| `revokeAttestation` | issuing auditor or admin | withdraw a verdict |

And six helper functions that do not touch the ledger, so the website and the
command line can compute the same ids and seals as the contract.

**Witnesses** are how private data enters a circuit. The contract declares
`witness localSecretKey()` and `witness auditWorkbook()`; the TypeScript side
supplies them from the participant's machine. They are untrusted inputs, which
is why the circuit checks everything about them.

**The tests** (`contract/test/fairgate.test.ts`) run the compiled circuits in
memory. Forty cases, including twelve "lying witness" attacks: an auditor who
hides a failing group, fabricates a reference group, overstates the ratio,
reuses a period, and so on. Each one is refused by a specific line of the
contract.

**The command line** (`cli/`) does everything a judge or an operator needs
without a browser: deploy a registry, accredit an auditor, register a tool, run
an attestation from a counts file, verify a tool, verify a disclosure packet.

**The website** (`ui/`) does the same for people. The Verify and Regulator tabs
need no wallet at all; they read the ledger directly. The Auditor, Employer and
Admin tabs send transactions through the Lace wallet extension.

---

## Level 9: one attestation, step by step

What happens when the auditor clicks "Prove and attest" (or runs the CLI):

1. The auditor's machine evaluates the counts locally with the same arithmetic
   as the circuit. If the tool fails, it stops here. Nothing is sent anywhere.
2. It builds the private **workbook**: eight group slots (unused ones zeroed),
   the inclusion mask, the reference group, the claimed floor *p*, and a fresh
   random nonce.
3. It loads the workbook into the contract's private state and calls
   `attestAudit(toolId, period, datasetHash)`.
4. The circuit runs on the auditor's machine with the workbook as witness. If any
   check fails, no proof exists and the call throws.
5. A **proof server** (a local Docker container, because it sees private data)
   turns the circuit run into a zero-knowledge proof. About 60 seconds.
6. The wallet pays the fee (in DUST, Midnight's fee resource, generated from
   holding NIGHT tokens) and submits the transaction.
7. The network verifies the proof and writes the attestation to the ledger.
8. The auditor's tool writes the disclosure packet to disk and scrubs the
   workbook from private state.

On the public Preview network this took about 70 seconds end to end.

---

## Level 10: what an attacker could try, and what stops them

| Attacker tries | Stopped by |
|---|---|
| attest a tool that fails | the four-fifths inequality in the circuit |
| exclude a large group that fails | included ⇔ applicants ≥ minimum, checked per slot |
| invent a flattering reference group | reference must equal one of the included groups |
| pick a weak reference so ratios look high | reference must have the highest rate, checked against every group |
| publish a better *p* than the truth | two-sided bound on *p* |
| use a weaker threshold | threshold comes from ledger policy, not from the prover |
| attest without being accredited | membership check against the auditor set |
| get a second opinion after a bad audit in the same year | one attestation per (tool, period), spent by a nullifier |
| reuse an attestation for a new version of the program | tool id includes the program fingerprint; new program, new tool |
| revoke a competitor's attestation | only the issuing auditor or the admin can revoke |
| read the counts from the ledger | only a hiding commitment and the floor *p* are written |
| forge a disclosure packet | it must reproduce the on-chain commitment and the floor |

What the system does **not** prevent: an auditor who miscounts the dataset. That
is the same trust placed in any auditor today, with two improvements: the audit
is bound to a dataset fingerprint, and the auditor is named. Wave 3 plans to add
an employer co-signature of the dataset hash.

---

## Level 11: what is actually deployed

- **Local devnet**: the whole flow runs on a laptop in Docker in about two
  minutes.
- **Midnight Preview** (public test network): the registry is deployed at
  `170ed2cd17ff93d221465f39d7be1b54618df761622952f0df3f03af7edacca8`. One auditor
  is accredited, one tool is registered, and one attestation (period 2026, floor
  86%, 6 groups) is live. Every transaction hash is in `DEPLOYMENTS.md` with
  explorer links.
- **Website**: https://rifatsarwarcodes.github.io/Midnight_Buildathon/ reads that
  registry live. The Verify tab works for anyone with no wallet.
- **Preprod**: not yet; Midnight moved Preprod to a token-gated provider on
  9 October 2026, which needs a Blockfrost account.

---

## Level 12: why this was built this way (design decisions)

- **Eight fixed group slots.** Circuits need fixed sizes. NYC's law lists seven
  race/ethnicity categories and two sex categories, so eight slots cover one
  dimension; a second attestation covers the other.
- **Integer arithmetic only.** Division inside a circuit is expensive and
  error-prone; cross-multiplication is exact.
- **The exact floor, not just pass/fail.** A single percentage is far more
  informative for the public and leaks almost nothing about the counts.
- **Identities are hashes of local secrets.** Midnight offers `ownPublicKey()`,
  but it is a value the prover claims, not something cryptographically bound,
  so the contract never relies on it.
- **One attestation per tool per period, even across auditors.** Otherwise an
  employer could shop for a friendlier auditor after a failed audit.
- **Revoked stays spent.** A revocation is a serious event; letting the employer
  immediately re-attest would make revocation toothless.
- **Disclosure is off-chain.** The regulator relationship is private by nature;
  the ledger only needs to make the disclosure checkable.

---

## Level 13: what went wrong while building it

The engineering log (`docs/ENGINEERING-LOG.md`) records fourteen failures with
root causes and fixes. The ones that cost the most time:

- The first public-network wallet sync takes about two hours because the wallet
  scans the chain from the beginning, and the SDK's retry backs off without a
  cap after disconnects. Running one sync at a time and saving the state fixed
  it; later runs take seconds.
- A proof server one patch version behind the network returned "bad input". The
  version from the compatibility matrix fixed it.
- Midnight retired its Preprod endpoints on 9 October 2026, one day before the
  first attempt. Preview still works without a token.
- Two copies of the on-chain runtime library were installed, which made
  `instanceof` checks fail inside the SDK. A version override fixed it.

---

## Glossary

| Term | Meaning here |
|---|---|
| attestation | the public record that a tool passed an audit for a period |
| auditor | an independent party accredited by the registry admin |
| circuit | the fixed list of checks a zero-knowledge proof is made about |
| commitment | a sealed, hiding and binding fingerprint of private values |
| Compact | Midnight's contract language |
| disclosure packet | the counts plus nonce an auditor gives a regulator |
| DUST | Midnight's fee resource, generated by holding NIGHT |
| four-fifths rule | each group's selection rate ≥ 80% of the best group's |
| impact ratio | a group's selection rate divided by the best group's |
| indexer | a service that lets you read the ledger without running a node |
| Lace | the browser wallet used with Midnight |
| nullifier | a one-time marker that makes a repeat action impossible |
| Preview / Preprod | Midnight's public test networks |
| proof server | local service that produces zero-knowledge proofs |
| tool | a registered automated hiring program, identified by its fingerprint |
| witness | private input to a circuit, supplied by the participant's machine |
