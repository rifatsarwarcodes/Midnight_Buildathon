// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { buildWorkbook, evaluateAudit, pureCircuits, toHex, fromHex, type GroupCounts } from '../../../contract/src/index.ts';
import { Badge, Card, EvaluationTable, Hex, Notice, errorMessage } from '../components/common';
import type { RegistrySnapshot } from '../lib/registry';

interface Packet {
  attestationId: string;
  toolId: string;
  periodId: string;
  groups: { label: string; applicants: number; selected: number }[];
  nonce: string;
  dimension?: string | null;
}

export function RegulatorPage({ snapshot }: { snapshot: RegistrySnapshot | null }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<null | { ok: boolean; recomputed: string; onChain: string; onChainPct: string; packetPct: string; ev: ReturnType<typeof evaluateAudit>; packet: Packet }>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = () => {
    setError(null);
    setResult(null);
    try {
      if (!snapshot) throw new Error('Registry not loaded yet.');
      const packet = JSON.parse(text) as Packet;
      const row = snapshot.attestations.find((a) => a.id === packet.attestationId.toLowerCase());
      if (!row) throw new Error('The attestation in this packet is not on the registry.');
      const a = row.attestation;
      const policy = { ...snapshot.policy, thresholdPct: a.thresholdPct };
      const groups: GroupCounts[] = packet.groups.map((g) => ({ label: g.label, applicants: BigInt(g.applicants), selected: BigInt(g.selected) }));
      const ev = evaluateAudit(groups, policy);
      let recomputed = '';
      try {
        const wb = buildWorkbook(groups, policy, fromHex(packet.nonce));
        recomputed = toHex(pureCircuits.countsCommitment(wb.applicants, wb.selected, wb.included, fromHex(packet.nonce)));
      } catch {
        recomputed = '(these counts do not even pass the policy)';
      }
      const onChain = toHex(a.countsCommit);
      setResult({
        ok: recomputed === onChain && ev.minImpactRatioPct === a.minRatioPct,
        recomputed,
        onChain,
        onChainPct: a.minRatioPct.toString(),
        packetPct: ev.minImpactRatioPct?.toString() ?? '–',
        ev,
        packet,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (file) setText(await file.text());
  };

  return (
    <div className="grid two">
      <Card title="Open a disclosure packet" aside={<span className="muted">no wallet needed</span>}>
        <p className="lead">
          When a regulator asks, the auditor hands over the counts and the nonce. Opening the commitment here
          proves these are exactly the numbers that were proven on chain, without trusting the auditor or the employer.
        </p>
        <input type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
        <textarea className="mono" rows={12} placeholder='{"format":"fairgate-disclosure/v1", ...}' value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary" onClick={verify} disabled={!text.trim()}>Verify against the ledger</button>
        {error && <Notice kind="error">{error}</Notice>}
      </Card>

      <Card title="Verdict">
        {!result && <p className="muted">Load a packet to see the comparison.</p>}
        {result && (
          <>
            {result.ok
              ? <Notice kind="ok"><strong>Verified.</strong> These counts open the on-chain commitment and reproduce the attested minimum impact ratio.</Notice>
              : <Notice kind="error"><strong>Mismatch.</strong> This packet does not open the on-chain commitment. Someone edited the counts or the nonce.</Notice>}
            <div className="kv">
              <span>attestation</span><span><Hex value={result.packet.attestationId} full /></span>
              <span>tool</span><span><Hex value={result.packet.toolId} full /></span>
              <span>period</span><span>{result.packet.periodId}</span>
              <span>recomputed commitment</span><span><Hex value={result.recomputed} full /></span>
              <span>on-chain commitment</span><span><Hex value={result.onChain} full /></span>
              <span>min impact ratio</span><span>on chain {result.onChainPct}%, packet implies {result.packetPct}% {result.onChainPct === result.packetPct ? <Badge kind="ok">match</Badge> : <Badge kind="bad">differs</Badge>}</span>
            </div>
            <h4>Disclosed counts ({result.packet.dimension ?? 'dimension not named'})</h4>
            <EvaluationTable ev={result.ev} />
          </>
        )}
      </Card>
    </div>
  );
}
