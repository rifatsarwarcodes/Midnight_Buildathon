// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { Badge, Card, Hex, Notice, Redacted } from '../components/common';
import { isActive, type RegistrySnapshot, type ToolRow } from '../lib/registry';
import { explorerContractUrl } from '../config';

function ToolStatus({ row, snapshot }: { row: ToolRow; snapshot: RegistrySnapshot }) {
  if (!row.latest) return <Badge kind="warn">not attested</Badge>;
  const a = row.latest.attestation;
  if (!isActive(a)) return <Badge kind="bad">revoked</Badge>;
  const auditorOk = snapshot.auditors.includes(row.latest.attestation.auditor && Array.from(a.auditor, (b) => b.toString(16).padStart(2, '0')).join(''));
  return (
    <>
      <Badge kind="ok">passed {a.periodId.toString()}</Badge>
      {!auditorOk && <Badge kind="warn">auditor no longer accredited</Badge>}
    </>
  );
}

export function VerifyPage({ snapshot, error }: { snapshot: RegistrySnapshot | null; error: string | null }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = snapshot?.tools.find((t) => t.id === q) ?? null;
  const attestationMatch = snapshot?.attestations.find((a) => a.id === q) ?? null;
  const contractUrl = snapshot ? explorerContractUrl(snapshot.contractAddress) : null;

  return (
    <div className="grid">
      <Card title="Check a hiring tool" aside={<span className="muted">no wallet needed</span>}>
        <p className="lead">
          Paste the tool id an employer published (for example in a job posting or a candidate-facing notice)
          and read its bias-audit status straight from the Midnight ledger.
        </p>
        <input className="wide mono" placeholder="tool id or attestation id (64 hex characters)" value={query} onChange={(e) => setQuery(e.target.value)} />
        {q.length === 64 && !match && !attestationMatch && <Notice kind="error">Nothing with that id is on this registry.</Notice>}
        {match && snapshot && (
          <div className="detail">
            <div className="kv">
              <span>status</span><span><ToolStatus row={match} snapshot={snapshot} /></span>
              <span>tool id</span><span><Hex value={match.id} full /></span>
              <span>model hash</span><span><Hex value={hex(match.tool.modelHash)} full /></span>
              <span>employer</span><span><Hex value={hex(match.tool.employer)} /></span>
              {match.latest && (<>
                <span>attestation</span><span><Hex value={match.latest.id} full /></span>
                <span>period</span><span>{match.latest.attestation.periodId.toString()}</span>
                <span>threshold</span><span>{match.latest.attestation.thresholdPct.toString()}% (four-fifths rule is 80%)</span>
                <span>min impact ratio</span><span><strong>{match.latest.attestation.minRatioPct.toString()}%</strong> across {match.latest.attestation.groupsIncluded.toString()} groups</span>
                <span>auditor</span><span><Hex value={hex(match.latest.attestation.auditor)} /></span>
                <span>dataset commit</span><span><Hex value={hex(match.latest.attestation.datasetCommit)} /></span>
                <span>counts commit</span><span><Hex value={hex(match.latest.attestation.countsCommit)} /></span>
              </>)}
            </div>
            <h4>Not on the ledger, by design</h4>
            <div className="kv">
              <span>applicants</span><span><Redacted label="per group" size="w2" /></span>
              <span>selected</span><span><Redacted label="per group" size="w2" /></span>
              <span>groups excluded</span><span><Redacted label="which ones" /></span>
              <span>reference group</span><span><Redacted label="identity and counts" size="w3" /></span>
            </div>
            <p className="muted small">
              These are committed to, not published. A regulator can ask the auditor to open the commitment and check it
              against the counts commitment above.
            </p>
          </div>
        )}
        {attestationMatch && (
          <div className="detail">
            <div className="kv">
              <span>attestation</span><span><Hex value={attestationMatch.id} full /></span>
              <span>status</span><span>{isActive(attestationMatch.attestation) ? <Badge kind="ok">active</Badge> : <Badge kind="bad">revoked</Badge>}</span>
              <span>tool</span><span><Hex value={hex(attestationMatch.attestation.toolId)} full /></span>
              <span>period</span><span>{attestationMatch.attestation.periodId.toString()}</span>
              <span>min impact ratio</span><span>{attestationMatch.attestation.minRatioPct.toString()}% (threshold {attestationMatch.attestation.thresholdPct.toString()}%)</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="Registry" aside={snapshot && <span className="muted">updated {snapshot.fetchedAt.toLocaleTimeString()}</span>}>
        {error && <Notice kind="error">{error}</Notice>}
        {snapshot && (
          <>
            <div className="kv">
              <span>contract</span><span>{contractUrl ? <a href={contractUrl} target="_blank" rel="noreferrer">{snapshot.contractAddress}</a> : <Hex value={snapshot.contractAddress} full />}</span>
              <span>policy</span><span>impact ratio ≥ {snapshot.policy.thresholdPct.toString()}%, groups of ≥ {snapshot.policy.minGroupSize.toString()}, audits of ≥ {snapshot.policy.minTotalApplicants.toString()} applicants</span>
              <span>accredited auditors</span><span>{snapshot.auditors.length}</span>
              <span>tools / attestations</span><span>{snapshot.toolCount} / {snapshot.attestationCount}</span>
            </div>
            <table className="list">
              <thead><tr><th>Tool</th><th>Model</th><th>Status</th><th className="num">Min ratio</th></tr></thead>
              <tbody>
                {snapshot.tools.map((t) => (
                  <tr key={t.id} onClick={() => setQuery(t.id)} className="clickable">
                    <td><Hex value={t.id} /></td>
                    <td><Hex value={hex(t.tool.modelHash)} /></td>
                    <td><ToolStatus row={t} snapshot={snapshot} /></td>
                    <td className="num">{t.latest && isActive(t.latest.attestation) ? `${t.latest.attestation.minRatioPct}%` : '–'}</td>
                  </tr>
                ))}
                {snapshot.tools.length === 0 && <tr><td colSpan={4} className="muted">No tools registered yet.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
