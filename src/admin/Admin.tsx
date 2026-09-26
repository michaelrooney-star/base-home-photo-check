import { AlertTriangle, Database, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConsoleShell, StatusPill } from '../components/ConsoleShell';

type AdminState = { counts: { total: number; byStatus: Record<string, number> } };

export function Admin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [utilityKill, setUtilityKill] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() { const res = await fetch('/api/admin/state'); setState(await res.json()); }
  useEffect(() => { void load(); }, []);
  async function reset() { setBusy(true); await fetch('/api/admin/reset', { method: 'POST' }); await load(); setBusy(false); }
  async function applyToggles() { setBusy(true); await fetch('/api/admin/toggles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ killUtilityWorker: utilityKill }) }); await load(); setBusy(false); }
  async function injectFireConflict() {
    if (!caseId) return;
    setBusy(true);
    setFeedback('');
    const res = await fetch('/api/admin/toggles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ addFireConflictCaseId: caseId }) });
    const data = await res.json();
    if (res.ok) {
      const run = await fetch(`/api/ops/cases/${data.conflictCaseId}/plan`, { method: 'POST' });
      setFeedback(run.ok ? `Conflict applied to ${data.conflictCaseId.slice(0, 6)}. The case now requires review.` : `Conflict armed for ${data.conflictCaseId.slice(0, 6)}. Open the case and choose Replan to run it.`);
      setCaseId('');
    } else {
      setFeedback(data.error === 'case_id_ambiguous' ? 'That short ID matches more than one case.' : 'Case not found. Copy a case ID from the Cases page.');
    }
    setBusy(false);
  }
  const counts = state?.counts.byStatus ?? {};

  return <ConsoleShell><section className="console-page console-admin-page">
    <div className="console-page-heading"><div><p className="console-eyebrow"><span /> DEMO CONTROLS</p><h1>Shape the review scenarios<span>.</span></h1><p className="console-page-description">Reset the local Base Operations demo or introduce controlled outcomes to test permit review workflows.</p></div><StatusPill tone="review">Local only</StatusPill></div>
    <div className="console-summary-grid console-admin-summary"><div className="console-summary-card"><span><Database size={15} /> Demo store</span><strong>{state?.counts.total ?? '…'}</strong><small>Total seeded cases</small></div><div className="console-summary-card is-ready"><span>Ready for review</span><strong>{counts.OPS_READY ?? 0}</strong><small>Workflow complete</small></div><div className="console-summary-card is-muted"><span>Waiting to run</span><strong>{counts.QUEUED ?? 0}</strong><small>Not started</small></div><div className="console-summary-card is-review"><span>Review required</span><strong>{(counts.NEEDS_REVIEW ?? 0) + (counts.BLOCKED ?? 0) + (counts.UNKNOWN ?? 0)}</strong><small>Needs operator attention</small></div></div>
    <div className="console-admin-grid"><section className="console-control-card"><div className="console-control-card-heading"><span className="console-control-icon"><RefreshCw size={19} /></span><div><h2>Reset demo store</h2><p>Return the local store to its seeded starting state.</p></div></div><button className="console-secondary-button is-danger" onClick={reset} disabled={busy}><RefreshCw size={16} />{busy ? 'Working…' : 'Reset and reseed'}</button><small className="console-control-footnote">This only affects the local in-memory demo store.</small></section>
      <section className="console-control-card"><div className="console-control-card-heading"><span className="console-control-icon is-warning"><Zap size={19} /></span><div><h2>Simulate a fallback</h2><p>Test retries, cached rules, and a degraded review outcome.</p></div></div><label className="console-toggle-row"><span><strong>Fail the utility check</strong><small>Future plans will use the fallback path.</small></span><input type="checkbox" checked={utilityKill} onChange={(e) => setUtilityKill(e.target.checked)} /><span className="console-toggle" /></label><button className="console-primary-button" onClick={applyToggles} disabled={busy}><Zap size={16} /> Apply scenario</button></section>
      <section className="console-control-card console-control-card-wide"><div className="console-control-card-heading"><span className="console-control-icon is-danger"><ShieldAlert size={19} /></span><div><h2>Simulate a rule conflict</h2><p>Make a case require operator review when the Fire check disagrees with the verified rules.</p></div></div><div className="console-admin-form"><label><span>Case ID</span><input placeholder="Short or full case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} /></label><button className="console-secondary-button is-danger" onClick={injectFireConflict} disabled={!caseId || busy}><AlertTriangle size={16} /> Run conflict</button></div>{feedback && <p className="console-control-feedback" role="status">{feedback}</p>}<small className="console-control-footnote">Use a seeded case from the Cases page. This immediately reruns its workflow with conflicting Fire evidence.</small></section>
    </div>
  </section></ConsoleShell>;
}
