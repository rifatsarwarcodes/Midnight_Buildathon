// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { sha256, toHex, fromHex, pureCircuits } from '../../../contract/src/index.ts';
import { Card, Hex, Notice, Receipt, Spinner, errorMessage } from '../components/common';
import type { RegistrySnapshot } from '../lib/registry';
import { userPk, getSecret } from '../lib/identity';
import { openRegistry, receiptOf, type TxReceipt } from '../lib/wallet';

export function EmployerPage({ snapshot }: { snapshot: RegistrySnapshot | null }) {
  const [modelHash, setModelHash] = useState('');
  const [modelName, setModelName] = useState('');
  const [metaHash, setMetaHash] = useState('');
  const [metaName, setMetaName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ receipt: TxReceipt; toolId: string } | null>(null);

  const me = userPk('employer');
  const predicted = /^[0-9a-f]{64}$/i.test(modelHash)
    ? toHex(pureCircuits.toolIdFor(pureCircuits.deriveUserPk(getSecret('employer')), fromHex(modelHash)))
    : null;
  const alreadyRegistered = !!predicted && !!snapshot?.tools.some((t) => t.id === predicted);
  const mine = snapshot?.tools.filter((t) => toHex(t.tool.employer) === me) ?? [];

  const hashFile = async (file: File | undefined, set: (h: string) => void, setName: (n: string) => void) => {
    if (!file) return;
    set(toHex(await sha256(new Uint8Array(await file.arrayBuffer()))));
    setName(`${file.name} (${file.size.toLocaleString()} bytes)`);
  };

  const register = async () => {
    setError(null);
    setReceipt(null);
    try {
      if (!/^[0-9a-f]{64}$/i.test(modelHash)) throw new Error('Choose the model artifact first.');
      setBusy('Connecting to Lace…');
      const contract = await openRegistry('employer');
      setBusy('Proving and submitting… (30-90 seconds)');
      const tx = await contract.callTx.registerTool(fromHex(modelHash), metaHash ? fromHex(metaHash) : new Uint8Array(32));
      setReceipt({ receipt: receiptOf(tx), toolId: toHex(tx.private.result as Uint8Array) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid two">
      <Card title="Register an automated hiring tool">
        <p className="lead">
          The tool id binds your employer identity to the exact model artifact. An attestation can never be
          reused for a different model, and a new model version needs a new audit.
        </p>
        <div className="kv"><span>your employer id</span><span><Hex value={me} full /></span></div>
        <label>Model artifact (exported weights, container image, or release bundle; hashed locally)
          <input type="file" onChange={(e) => hashFile(e.target.files?.[0], setModelHash, setModelName)} />
        </label>
        {modelHash && <div className="kv"><span>file</span><span>{modelName}</span><span>sha-256</span><span><Hex value={modelHash} full /></span></div>}
        <label>Model card or metadata (optional)
          <input type="file" onChange={(e) => hashFile(e.target.files?.[0], setMetaHash, setMetaName)} />
        </label>
        {metaHash && <div className="kv"><span>file</span><span>{metaName}</span><span>sha-256</span><span><Hex value={metaHash} full /></span></div>}
        {predicted && <div className="kv"><span>tool id will be</span><span><Hex value={predicted} full /></span></div>}
        {alreadyRegistered && <Notice kind="info">This model is already registered under your identity.</Notice>}
        <button className="primary" disabled={!!busy || !predicted || alreadyRegistered} onClick={register}>Register with Lace</button>
        {busy && <Spinner label={busy} />}
        {error && <Notice kind="error">{error}</Notice>}
        {receipt && <Receipt receipt={receipt.receipt} label={`Tool ${receipt.toolId.slice(0, 12)}… registered`} />}
      </Card>

      <Card title="Your tools">
        {mine.length === 0 && <p className="muted">No tools registered from this browser's employer identity yet.</p>}
        <table className="list">
          <thead><tr><th>Tool id</th><th>Model</th><th>Latest attestation</th></tr></thead>
          <tbody>
            {mine.map((t) => (
              <tr key={t.id}>
                <td><Hex value={t.id} /></td>
                <td><Hex value={toHex(t.tool.modelHash)} /></td>
                <td>{t.latest ? `${t.latest.attestation.periodId}: ${t.latest.attestation.minRatioPct}%` : 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Hand an accredited auditor your tool id. They attest; you never see their workbook, and the public never sees your counts.</p>
      </Card>
    </div>
  );
}
