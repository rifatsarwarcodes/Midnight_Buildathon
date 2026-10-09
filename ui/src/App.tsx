// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import './App.css';
import { config } from './config';
import { useRegistry } from './lib/useRegistry';
import { VerifyPage } from './pages/Verify';
import { AuditorPage } from './pages/Auditor';
import { EmployerPage } from './pages/Employer';
import { RegulatorPage } from './pages/Regulator';
import { AdminPage } from './pages/Admin';

type Tab = 'verify' | 'auditor' | 'employer' | 'regulator' | 'admin';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'verify', label: 'Verify', hint: 'candidates, journalists, anyone' },
  { id: 'auditor', label: 'Auditor', hint: 'prove the four-fifths rule' },
  { id: 'employer', label: 'Employer', hint: 'register a hiring tool' },
  { id: 'regulator', label: 'Regulator', hint: 'open a disclosure' },
  { id: 'admin', label: 'Admin', hint: 'accredit auditors' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('verify');
  const { snapshot, error } = useRegistry();

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span>
          <div>
            <h1>FairGate</h1>
            <p>Zero-knowledge bias-audit attestations for automated hiring tools</p>
          </div>
        </div>
        <div className="net">
          <span className={`pill net-${config.networkId}`}>{config.networkId}</span>
          {snapshot ? <span className="pill ok">registry online</span> : <span className="pill warn">{error ? 'registry unreachable' : 'loading…'}</span>}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span>{t.label}</span>
            <small>{t.hint}</small>
          </button>
        ))}
      </nav>

      <main>
        {tab === 'verify' && <VerifyPage snapshot={snapshot} error={error} />}
        {tab === 'auditor' && <AuditorPage snapshot={snapshot} />}
        {tab === 'employer' && <EmployerPage snapshot={snapshot} />}
        {tab === 'regulator' && <RegulatorPage snapshot={snapshot} />}
        {tab === 'admin' && <AdminPage snapshot={snapshot} />}
      </main>

      <footer>
        <p>
          Built on <a href="https://midnight.network" target="_blank" rel="noreferrer">Midnight</a> with Compact.
          The four-fifths rule is from the EEOC Uniform Guidelines (29 CFR 1607.4(D)), the standard used for
          NYC Local Law 144 bias audits. Source: <a href="https://github.com/rifatsarwarcodes/Midnight_Buildathon" target="_blank" rel="noreferrer">github.com/rifatsarwarcodes/Midnight_Buildathon</a>
        </p>
      </footer>
    </div>
  );
}
