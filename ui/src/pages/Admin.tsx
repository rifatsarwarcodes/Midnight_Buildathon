// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { fromHex } from '../../../contract/src/index.ts';
import { Badge, Card, Hex, Notice, Receipt, Spinner, errorMessage } from '../components/common';
import type { RegistrySnapshot } from '../lib/registry';
import { adminPk, importSecret } from '../lib/identity';
import { openRegistry, receiptOf, type TxReceipt } from '../lib/wallet';

export function AdminPage({ snapshot }: { snapshot: RegistrySnapshot | null }) {
  const [auditor, setAuditor] = useState('');
  const [threshold, setThreshold] = useState('80');
  const [minGroup, setMinGroup] = useState('10');
  const [minTotal, setMinTotal] = useState('100');
  const [attestationId, setAttestationId] = useState('');
  const [secretImport, setSecretImport] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ receipt: TxReceipt; label: string } | null>(null);

  const me = adminPk();
  const isAdmin = snapshot?.admin === me;

  const run = async (label: string, fn: (c: any) => Promise<any>) => {
    setError(null);
    setReceipt(null);
    try {
      setBusy('Connecting to Lace…');
      const contract = await openRegistry('admin');
      setBusy('Proving and submitting…');
      const tx = await fn(contract);
      setReceipt({ receipt: receiptOf(tx), label });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid two">
      <Card title="Registry admin" aside={isAdmin ? <Badge kind="ok">you are the admin</Badge> : <Badge kind="warn">not the admin</Badge>}>
        <div className="kv">
          <span>this browser's admin id</span><span><Hex value={me} full /></span>
          <span>registry admin</span><span>{snapshot ? <Hex value={snapshot.admin} full /> : '…'}</span>
        </div>
        {!isAdmin && (
          <details>
            <summary>Import the deployer's admin secret (from cli/.fairgate-identities.json)</summary>
            <input className="wide mono" placeholder="64 hex characters" value={secretImport} onChange={(e) => setSecretImport(e.target.value)} />
            <button onClick={() => { try { importSecret('admin', secretImport.trim()); location.reload(); } catch (e) { setError(errorMessage(e)); } }}>Import</button>
          </details>
        )}
        <h4>Accredit an auditor</h4>
        <input className="wide mono" placeholder="auditor id (64 hex characters)" value={auditor} onChange={(e) => setAuditor(e.target.value)} />
        <div className="row">
          <button className="primary" disabled={!!busy || !isAdmin || !/^[0-9a-f]{64}$/i.test(auditor)} onClick={() => run('Auditor accredited', (c) => c.callTx.accreditAuditor(fromHex(auditor)))}>Accredit</button>
          <button disabled={!!busy || !isAdmin || !/^[0-9a-f]{64}$/i.test(auditor)} onClick={() => run('Auditor revoked', (c) => c.callTx.revokeAuditor(fromHex(auditor)))}>Revoke</button>
        </div>
        <h4>Policy</h4>
        <div className="row">
          <label>threshold %<input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
          <label>min group size<input inputMode="numeric" value={minGroup} onChange={(e) => setMinGroup(e.target.value)} /></label>
          <label>min applicants<input inputMode="numeric" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} /></label>
        </div>
        <button disabled={!!busy || !isAdmin} onClick={() => run('Policy updated', (c) => c.callTx.setPolicy({ thresholdPct: BigInt(threshold), minGroupSize: BigInt(minGroup), minTotalApplicants: BigInt(minTotal) }))}>Set policy</button>
        <h4>Revoke an attestation</h4>
        <input className="wide mono" placeholder="attestation id" value={attestationId} onChange={(e) => setAttestationId(e.target.value)} />
        <button disabled={!!busy || !isAdmin || !/^[0-9a-f]{64}$/i.test(attestationId)} onClick={() => run('Attestation revoked', (c) => c.callTx.revokeAttestation(fromHex(attestationId)))}>Revoke attestation</button>
        {busy && <Spinner label={busy} />}
        {error && <Notice kind="error">{error}</Notice>}
        {receipt && <Receipt receipt={receipt.receipt} label={receipt.label} />}
      </Card>
      <Card title="Accredited auditors">
        {snapshot?.auditors.length === 0 && <p className="muted">None yet.</p>}
        <ul className="plain">{snapshot?.auditors.map((a) => <li key={a}><Hex value={a} full /></li>)}</ul>
      </Card>
    </div>
  );
}
