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

const TABS: { id: Tab; n: string; label: string; hint: string }[] = [
  { id: 'verify', n: '01', label: 'Verify', hint: 'anyone, no wallet' },
  { id: 'auditor', n: '02', label: 'Auditor', hint: 'prove the four-fifths rule' },
  { id: 'employer', n: '03', label: 'Employer', hint: 'register a hiring tool' },
  { id: 'regulator', n: '04', label: 'Regulator', hint: 'open a disclosure' },
  { id: 'admin', n: '05', label: 'Admin', hint: 'accredit auditors' },
];

const tabFromUrl = (): Tab => {
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'verify';
};

export default function App() {
  const [tab, setTabState] = useState<Tab>(tabFromUrl);
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };
  const { snapshot, error } = useRegistry();

  return (
    <div className="app">
      <header className="masthead reveal" data-i="1">
        <div>
          <div className="kicker">Case file · Midnight {config.networkId} · bias-audit attestations</div>
          <h1>Fair<em>Gate</em></h1>
          <p className="sub">
            A hiring algorithm proves it passed the four-fifths rule. The verdict goes on the ledger.
            The applicants never do.
          </p>
        </div>
        <div className="ticker">
          <div className="row"><span className={`lamp ${snapshot ? 'on' : error ? 'off' : ''}`} /> <span className="net">{config.networkId}</span></div>
          <div className="row">{snapshot ? `registry online · ${snapshot.toolCount} tools · ${snapshot.attestationCount} attestations` : error ? 'registry unreachable' : 'reading the ledger…'}</div>
          {snapshot && <div className="row">policy ≥ {snapshot.policy.thresholdPct.toString()}% · groups ≥ {snapshot.policy.minGroupSize.toString()} · audits ≥ {snapshot.policy.minTotalApplicants.toString()}</div>}
        </div>
      </header>

      <div className="dossier">
        <nav className="index reveal" data-i="2" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="n">{t.n}</span>
              <span className="t">{t.label}</span>
              <span className="h">{t.hint}</span>
            </button>
          ))}
        </nav>

        <main className="reveal" data-i="3" key={tab}>
          {tab === 'verify' && <VerifyPage snapshot={snapshot} error={error} />}
          {tab === 'auditor' && <AuditorPage snapshot={snapshot} />}
          {tab === 'employer' && <EmployerPage snapshot={snapshot} />}
          {tab === 'regulator' && <RegulatorPage snapshot={snapshot} />}
          {tab === 'admin' && <AdminPage snapshot={snapshot} />}
        </main>
      </div>

      <footer className="reveal" data-i="4">
        <div className="motto">The proof is public. The people are private.</div>
        <p>
          Built on <a href="https://midnight.network" target="_blank" rel="noreferrer">Midnight</a> with Compact.
          The four-fifths rule is the EEOC Uniform Guidelines test (29 CFR 1607.4(D)) used for NYC Local Law 144 bias audits.
          Source and engineering log: <a href="https://github.com/rifatsarwarcodes/Midnight_Buildathon" target="_blank" rel="noreferrer">github.com/rifatsarwarcodes/Midnight_Buildathon</a>
        </p>
      </footer>
    </div>
  );
}
