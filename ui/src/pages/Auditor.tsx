// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from 'react';
import {
  buildWorkbook,
  evaluateAudit,
  randomBytes32,
  sha256,
  toHex,
  fromHex,
  pureCircuits,
  type GroupCounts,
} from '../../../contract/src/index.ts';
import { Badge, Card, EvaluationTable, Hex, Notice, Receipt, Spinner, Redacted, errorMessage } from '../components/common';
import type { RegistrySnapshot } from '../lib/registry';
import { userPk } from '../lib/identity';
import { openRegistry, receiptOf, type TxReceipt } from '../lib/wallet';
import { config } from '../config';

interface Row { label: string; applicants: string; selected: string }

const LL144_RACE: Row[] = [
  { label: 'Hispanic or Latino', applicants: '412', selected: '66' },
  { label: 'White', applicants: '1180', selected: '212' },
  { label: 'Black or African American', applicants: '538', selected: '84' },
  { label: 'Native Hawaiian or Pacific Islander', applicants: '7', selected: '1' },
  { label: 'Asian', applicants: '644', selected: '110' },
  { label: 'Native American or Alaska Native', applicants: '23', selected: '4' },
  { label: 'Two or more races', applicants: '96', selected: '15' },
];
const LL144_SEX: Row[] = [
  { label: 'Male', applicants: '1620', selected: '310' },
  { label: 'Female', applicants: '1280', selected: '178' },
];

export function AuditorPage({ snapshot }: { snapshot: RegistrySnapshot | null }) {
  const [rows, setRows] = useState<Row[]>(LL144_RACE);
  const [dimension, setDimension] = useState('race/ethnicity');
  const [toolId, setToolId] = useState('');
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [datasetHash, setDatasetHash] = useState<string>('');
  const [datasetName, setDatasetName] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ receipt: TxReceipt; attestationId: string; packet: string } | null>(null);

  const me = userPk('auditor');
  const accredited = snapshot?.auditors.includes(me) ?? false;
  const policy = snapshot?.policy;

  const counts: GroupCounts[] = useMemo(
    () => rows.filter((r) => r.label.trim() || r.applicants || r.selected).map((r) => ({
      label: r.label,
      applicants: BigInt(Math.max(0, Math.floor(Number(r.applicants) || 0))),
      selected: BigInt(Math.max(0, Math.floor(Number(r.selected) || 0))),
    })),
    [rows],
  );
  const ev = useMemo(() => {
    if (!policy) return null;
    try { return evaluateAudit(counts, policy); } catch (e) { return { error: errorMessage(e) } as const; }
  }, [counts, policy]);
  const evaluation = ev && 'groups' in ev ? ev : null;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => rows.length < 8 && setRows((rs) => [...rs, { label: '', applicants: '', selected: '' }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const onDataset = async (file: File | undefined) => {
    if (!file) return;
    const digest = await sha256(new Uint8Array(await file.arrayBuffer()));
    setDatasetHash(toHex(digest));
    setDatasetName(`${file.name} (${file.size.toLocaleString()} bytes)`);
  };

  const attest = async () => {
    setError(null);
    setReceipt(null);
    if (!policy || !evaluation) return;
    try {
      if (!/^[0-9a-f]{64}$/i.test(toolId)) throw new Error('Pick a registered tool.');
      if (!/^[0-9a-f]{64}$/i.test(datasetHash)) throw new Error('Choose the applicant-level dataset file so its hash can be committed.');
      const periodId = BigInt(period);
      const nonce = randomBytes32();
      const workbook = buildWorkbook(counts, policy, nonce);
      setBusy('Connecting to Lace…');
      const contract = await openRegistry('auditor', workbook);
      setBusy('Proving the four-fifths rule inside the circuit and submitting… (1-2 minutes)');
      const tx = await contract.callTx.attestAudit(fromHex(toolId), periodId, fromHex(datasetHash));
      const attestationId = toHex(tx.private.result as Uint8Array);
      const packet = {
        format: 'fairgate-disclosure/v1',
        network: config.networkId,
        contractAddress: config.contractAddress,
        attestationId,
        toolId: toolId.toLowerCase(),
        periodId: periodId.toString(),
        auditor: me,
        datasetCommit: datasetHash.toLowerCase(),
        txId: String(tx.public.txId),
        dimension,
        groups: counts.map((g) => ({ label: g.label, applicants: Number(g.applicants), selected: Number(g.selected) })),
        nonce: toHex(nonce),
      };
      setReceipt({ receipt: receiptOf(tx), attestationId, packet: JSON.stringify(packet, null, 2) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!receipt) return;
    const blob = new Blob([receipt.packet], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fairgate-disclosure-${receipt.attestationId.slice(0, 12)}.json`;
    a.click();
  };

  const expectedNullifierSpent = useMemo(() => {
    if (!snapshot || !/^[0-9a-f]{64}$/i.test(toolId) || !period) return false;
    try {
      const nul = toHex(pureCircuits.periodNullifierFor(fromHex(toolId), BigInt(period)));
      return snapshot.attestations.some((a) => toHex(pureCircuits.periodNullifierFor(a.attestation.toolId, a.attestation.periodId)) === nul);
    } catch { return false; }
  }, [snapshot, toolId, period]);

  return (
    <div className="grid two">
      <Card title="1. Audit workbook" aside={<span className="muted">stays in this browser</span>}>
        <div className="row">
          <label>Protected dimension<input value={dimension} onChange={(e) => setDimension(e.target.value)} /></label>
          <div className="presets">
            <button className="ghost" onClick={() => { setRows(LL144_RACE); setDimension('race/ethnicity'); }}>LL144 race/ethnicity sample</button>
            <button className="ghost" onClick={() => { setRows(LL144_SEX); setDimension('sex'); }}>LL144 sex sample (fails)</button>
          </div>
        </div>
        <table className="editor">
          <thead><tr><th>Group</th><th className="num">Applicants</th><th className="num">Selected</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input value={r.label} placeholder={`Group ${i + 1}`} onChange={(e) => update(i, { label: e.target.value })} /></td>
                <td><input className="num" inputMode="numeric" value={r.applicants} onChange={(e) => update(i, { applicants: e.target.value })} /></td>
                <td><input className="num" inputMode="numeric" value={r.selected} onChange={(e) => update(i, { selected: e.target.value })} /></td>
                <td><button className="ghost" onClick={() => removeRow(i)} title="remove">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="ghost" onClick={addRow} disabled={rows.length >= 8}>+ add group (max 8)</button>

        {policy && evaluation && (
          <>
            <h4>Evaluation under the registry policy</h4>
            <EvaluationTable ev={evaluation} />
            <div className="kv">
              <span>total applicants</span><span>{evaluation.totalApplicants.toString()} (policy minimum {policy.minTotalApplicants.toString()})</span>
              <span>groups included</span><span>{evaluation.groupsIncluded} (groups under {policy.minGroupSize.toString()} applicants are excluded)</span>
              <span>minimum impact ratio</span><span><strong>{evaluation.minImpactRatioPct?.toString() ?? '–'}%</strong> (threshold {policy.thresholdPct.toString()}%)</span>
              <span>verdict</span>
              <span>{evaluation.passes ? <Badge kind="ok">passes</Badge> : <Badge kind="bad">does not pass</Badge>}</span>
            </div>
            {!evaluation.passes && (
              <Notice kind="error">
                <strong>No proof can be built for this tool.</strong>
                <ul>{evaluation.failures.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </Notice>
            )}
          </>
        )}
        {ev && 'error' in ev && <Notice kind="error">{ev.error}</Notice>}
      </Card>

      <Card title="2. Attest on Midnight" aside={accredited ? <Badge kind="ok">accredited</Badge> : <Badge kind="warn">not accredited</Badge>}>
        <div className="kv">
          <span>your auditor id</span><span><Hex value={me} full /></span>
        </div>
        {!accredited && <Notice kind="info">Give this id to the registry admin. Only accredited auditors can attest.</Notice>}
        <label>Tool
          <select value={toolId} onChange={(e) => setToolId(e.target.value)}>
            <option value="">select a registered tool…</option>
            {snapshot?.tools.map((t) => <option key={t.id} value={t.id}>{t.id.slice(0, 16)}… (model {toHex(t.tool.modelHash).slice(0, 10)}…)</option>)}
          </select>
        </label>
        <label>Audit period<input inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        {expectedNullifierSpent && <Notice kind="error">This tool already has an attestation for period {period}. One per tool per period.</Notice>}
        <label>Applicant-level dataset (hashed locally, never uploaded)
          <input type="file" onChange={(e) => onDataset(e.target.files?.[0])} />
        </label>
        {datasetHash && <div className="kv"><span>dataset</span><span>{datasetName}</span><span>sha-256</span><span><Hex value={datasetHash} /></span></div>}

        <h4>What the chain will see</h4>
        <div className="split">
          <div className="pane private">
            <h5>Private (never leaves this browser)</h5>
            <ul>
              <li><Redacted label="applicants and selections per group" size="w2" /></li>
              <li><Redacted label="which groups were excluded as too small" size="w2" /></li>
              <li><Redacted label="the reference group" size="w2" /></li>
              <li><Redacted label="the commitment nonce" size="w3" /></li>
            </ul>
          </div>
          <div className="pane public">
            <h5>Public (ledger)</h5>
            <ul>
              <li>tool id, period, your auditor id</li>
              <li>threshold {policy?.thresholdPct.toString() ?? '80'}% and the exact minimum impact ratio {evaluation?.minImpactRatioPct?.toString() ?? '–'}%</li>
              <li>number of groups included: {evaluation?.groupsIncluded ?? '–'}</li>
              <li>sha-256 of the dataset and a commitment to the counts</li>
            </ul>
          </div>
        </div>

        <button className="primary" disabled={!!busy || !accredited || !evaluation?.passes || expectedNullifierSpent} onClick={attest}>
          Prove and attest with Lace
        </button>
        {busy && <Spinner label={busy} />}
        {error && <Notice kind="error">{error}</Notice>}
        {receipt && (
          <>
            <Receipt receipt={receipt.receipt} label={`Attestation ${receipt.attestationId.slice(0, 12)}… recorded`} />
            <button onClick={download}>Download disclosure packet for the regulator</button>
            <p className="muted small">The packet contains the counts and the nonce. Anyone holding it can open the commitment, so share it only with a regulator.</p>
          </>
        )}
      </Card>
    </div>
  );
}
