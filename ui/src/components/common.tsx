// SPDX-License-Identifier: Apache-2.0
import { useState, type ReactNode } from 'react';
import type { AuditEvaluation } from '../../../contract/src/index.ts';
import { shortHex } from '../lib/registry';
import { explorerTxUrl } from '../config';
import type { TxReceipt } from '../lib/wallet';

export function Hex({ value, full = false }: { value: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <span className="hex" title={value} onClick={copy}>
      {full ? value : shortHex(value)}
      <span className="copy">{copied ? 'copied' : 'copy'}</span>
    </span>
  );
}

/** A value that exists but is not on the ledger. Rendered as a redaction bar. */
export function Redacted({ label, size = '' }: { label: string; size?: '' | 'w2' | 'w3' }) {
  return (
    <span title="private: never written to the ledger">
      <span className={`redact ${size}`} aria-label={`${label} (redacted)`} /> <span className="muted small">{label}</span>
    </span>
  );
}

export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function Card({ title, children, aside }: { title?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      {(title || aside) && (
        <header className="card-head">
          <h3>{title}</h3>
          {aside && <div className="card-aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Notice({ kind, children }: { kind: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`}>{children}</div>;
}

export function Receipt({ receipt, label }: { receipt: TxReceipt; label: string }) {
  const url = explorerTxUrl(receipt.txId);
  return (
    <Notice kind="ok">
      <strong>{label}</strong>
      <div className="kv">
        <span>tx id</span>
        <span>{url ? <a href={url} target="_blank" rel="noreferrer">{receipt.txId}</a> : <Hex value={receipt.txId} full />}</span>
        {receipt.blockHeight !== undefined && (<><span>block</span><span>{receipt.blockHeight}</span></>)}
        <span>status</span>
        <span>{receipt.status}</span>
      </div>
    </Notice>
  );
}

const pct = (n: number | null) => (n === null ? '–' : `${(n * 100).toFixed(1)}%`);

export function EvaluationTable({ ev }: { ev: AuditEvaluation }) {
  return (
    <table className="eval">
      <thead>
        <tr>
          <th>Group</th>
          <th className="num">Applicants</th>
          <th className="num">Selected</th>
          <th className="num">Rate</th>
          <th className="num">Impact ratio</th>
        </tr>
      </thead>
      <tbody>
        {ev.groups.map((g, i) => (
          <tr key={i} className={g.included ? '' : 'excluded'}>
            <td>{g.label || `Group ${i + 1}`}{g.isReference && <Badge kind="muted">reference</Badge>}</td>
            <td className="num">{g.applicants.toString()}</td>
            <td className="num">{g.selected.toString()}</td>
            <td className="num">{pct(g.selectionRate)}</td>
            <td className="num">{g.included ? `${g.impactRatioPct}%` : 'excluded'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Spinner({ label }: { label: string }) {
  return <div className="spinner"><span className="dot" />{label}</div>;
}

export const errorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
};
