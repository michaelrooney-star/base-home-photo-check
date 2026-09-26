import { AlertTriangle, Database, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConsoleShell, StatusPill } from '../components/ConsoleShell';

type AdminState = { counts: { total: number; byStatus: Record<string, number> } };

export function Admin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [utilityKill, setUtilityKill] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { const res = await fetch('/api/admin/state'); setState(await res.json()); }
  useEffect(() => { void load(); }, []);
  async function reset() { setBusy(true); await fetch('/api/admin/reset', { method: 'POST' }); await load(); setBusy(false); }
  async function applyToggles() { setBusy(true); await fetch('/api/admin/toggles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ killUtilityWorker: utilityKill }) }); await load(); setBusy(false); }
  async function injectFireConflict() { if (!caseId) return; setBusy(true); await fetch('/api/admin/toggles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ addFireConflictCaseId: caseId }) }); setCaseId(''); setBusy(false); }
  const counts = state?.counts.byStatus ?? {};

  return <ConsoleShell><section className="console-page console-admin-page">
    <div className="console-page-heading"><div><p className="console-eyebrow"><span /> ADMINISTRATION</p><h1>Control the demo environment<span>.</span></h1><p className="console-page-description">Manage the local store and introduce controlled worker outcomes for workflow review.</p></div><StatusPill tone="review">Privileged tools</StatusPill></div>
    <div className="console-summary-grid console-admin-summary"><div className="console-summary-card"><span><Database size={15} /> Demo store</span><strong>{state?.counts.total ?? '…'}</strong><small>Total seeded cases</small></div><div className="console-summary-card is-ready"><span>Ops ready</span><strong>{counts.OPS_READY ?? 0}</strong><small>Ready for review</small></div><div className="console-summary-card is-muted"><span>Queued</span><strong>{counts.QUEUED ?? 0}</strong><small>Waiting to run</small></div><div className="console-summary-card is-review"><span>Unknown</span><strong>{counts.UNKNOWN ?? 0}</strong><small>Fail-closed cases</small></div></div>
    <div className="console-admin-grid"><section className="console-control-card"><div className="console-control-card-heading"><span className="console-control-icon"><RefreshCw size={19} /></span><div><h2>Reset demo store</h2><p>Return the local store to its seeded starting state.</p></div></div><button className="console-secondary-button is-danger" onClick={reset} disabled={busy}><RefreshCw size={16} />{busy ? 'Working…' : 'Reset and reseed'}</button><small className="console-control-footnote">This only affects the local in-memory demo store.</small></section>
      <section className="console-control-card"><div className="console-control-card-heading"><span className="console-control-icon is-warning"><Zap size={19} /></span><div><h2>Inject utility failure</h2><p>Simulate retry, fallback, and degraded execution.</p></div></div><label className="console-toggle-row"><span><strong>Kill utility worker</strong><small>Future plans will use the fallback path.</small></span><input type="checkbox" checked={utilityKill} onChange={(e) => setUtilityKill(e.target.checked)} /><span className="console-toggle" /></label><button className="console-primary-button" onClick={applyToggles} disabled={busy}><Zap size={16} /> Apply setting</button></section>
      <section className="console-control-card console-control-card-wide"><div className="console-control-card-heading"><span className="console-control-icon is-danger"><ShieldAlert size={19} /></span><div><h2>Mark a fire conflict</h2><p>Force a case into the Needs review path when the Fire worker returns a conflicting requirement.</p></div></div><div className="console-admin-form"><label><span>Case ID</span><input placeholder="Short or full case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} /></label><button className="console-secondary-button is-danger" onClick={injectFireConflict} disabled={!caseId || busy}><AlertTriangle size={16} /> Mark conflict</button></div><small className="console-control-footnote">Use a seeded case from the Ops queue. The next plan run will expose the conflict.</small></section>
    </div>
  </section></ConsoleShell>;
}
