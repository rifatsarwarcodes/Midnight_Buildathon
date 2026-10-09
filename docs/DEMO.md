# Demo video script (target 3 minutes)

Record at 1080p, browser on the left, terminal on the right. Keep the cursor slow.
Every claim below is something the viewer sees happen, not a slide.

## 0:00 – 0:25 The problem (slide 2 on screen)

"Hiring algorithms have to pass bias audits: New York's Local Law 144, the EU AI
Act. The test is the four-fifths rule: no group's selection rate may fall below
80% of the best group's. Today the audit is a PDF. Publish the numbers and small
groups become identifiable and hiring volumes leak. Keep them secret and nobody
can verify. FairGate puts the audit on Midnight: the proof is public, the counts
stay private."

## 0:25 – 0:50 Verify page, no wallet

Open the Verify tab. Point at the registry card: contract address, policy
(80%, groups of 10, audits of 100), one accredited auditor.

Click the registered tool. Read out: "passed 2026, minimum impact ratio 86% across
6 groups, auditor id, dataset commitment, counts commitment."

"What you cannot see is how many people applied or how many were selected. Those
are committed to, not published."

## 0:50 – 1:40 Auditor workbench

Open the Auditor tab. The LL144 race/ethnicity sample is loaded.

Point at the table: "Seven categories. The Pacific Islander group has 7 applicants,
below the policy minimum of 10, so it is excluded, and the circuit will check that
the exclusion is honest." Point at the minimum impact ratio: 86%.

Click "LL144 sex sample (fails)". The verdict flips to "does not pass, 72%". The
attest button is disabled. "No proof can be built for a failing tool, so nothing
reaches the chain."

Switch back to the passing sample. Choose the tool, choose the dataset file (any
CSV), point at the private/public split: "Left column never leaves this browser.
Right column is everything the ledger will hold."

Click "Prove and attest with Lace". Approve in Lace. While it proves (60–120 s),
cut to the terminal.

## 1:40 – 2:20 Terminal: the same flow, and the attacks

Run `npm run cli -- auditor attest ... failing-audit.json`. Show
"Refusing to attest: the tool does not pass. No transaction was sent."

Run `npm test`. Scroll to the "lying witnesses" block: twelve tests, each a
hand-crafted workbook: excluding a large failing group, fabricating the reference
group, overstating the ratio. All rejected by the circuit.

## 2:20 – 2:50 Regulator

Back in the browser, the attestation has landed. Download the disclosure packet.
Open the Regulator tab, load the packet: "Verified. These counts open the on-chain
commitment and reproduce the attested 86%."

Edit one number in the packet in a text editor, reload it: "Mismatch."

## 2:50 – 3:00 Close (slide 8)

"Seven circuits, forty tests, deployed on Preprod, CLI and browser, Apache-2.0.
Wave 3: intersectional audits, employer co-signed datasets, hosted proving.
FairGate: the proof is public, the people are private."
