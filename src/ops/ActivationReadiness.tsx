import { AlertCircle, Check, Clock3, UserRound, Zap } from 'lucide-react';
import { useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';

export type ActivationGateVM = {
  key: string;
  label: string;
  source: string;
  status: 'NOT_STARTED' | 'SUBMITTED' | 'QUESTIONS' | 'FAILED' | 'ACCEPTED';
  owner?: string;
  dueAt?: number;
  externalRef?: string;
  issue?: string;
  nextAction?: string;
  updatedAt: number;
};

export type ExternalEventVM = {
  id: string;
  type: string;
  source: string;
  message: string;
  timestamp: number;
  gateKey?: string;
  acknowledged: boolean;
  assignedOwner?: string;
};

export function ActivationReadiness({ caseId, route, gates, events, onChange }: { caseId: string; route: string; gates: ActivationGateVM[]; events: ExternalEventVM[]; onChange: () => Promise<void> }) {
  const [working, setWorking] = useState<string | null>(null);
  const [owner, setOwner] = useState('ops_maya');

  async function mutate(url: string, body?: object) {
    setWorking(url);
    try { await fetch(url, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); await onChange(); }
    finally { setWorking(null); }
  }

  const accepted = gates.filter((g) => g.status === 'ACCEPTED').length;
  const ready = gates.length > 0 && accepted === gates.length;
  return <section className="console-activation-section">
    <div className="console-activation-heading"><div><p className="console-eyebrow"><span /> ACTIVATION READINESS</p><h2>{ready ? 'Dispatch-ready' : 'Installed battery gates'}</h2><p>External approvals and operating qualification are tracked separately from permit research.</p></div><span className="console-route-badge"><Zap size={13} /> {route.replaceAll('_', ' ')}</span></div>
    <div className="console-activation-progress"><span><strong>{accepted}</strong> of {gates.length} gates accepted</span><div><i style={{ width: `${gates.length ? (accepted / gates.length) * 100 : 0}%` }} /></div></div>
    <div className="console-gate-list">{gates.map((gate) => {
      const overdue = Boolean(gate.dueAt && gate.dueAt < Date.now() && gate.status !== 'ACCEPTED');
      const tone = gate.status === 'ACCEPTED' ? 'ready' : gate.status === 'QUESTIONS' || gate.status === 'FAILED' ? 'danger' : gate.status === 'SUBMITTED' ? 'queued' : 'muted';
      return <article className={`console-gate-card is-${tone}`} key={gate.key}>
        <div className="console-gate-icon">{gate.status === 'ACCEPTED' ? <Check size={16} /> : gate.status === 'QUESTIONS' || gate.status === 'FAILED' ? <AlertCircle size={16} /> : <Clock3 size={16} />}</div>
        <div className="console-gate-main"><div className="console-gate-title"><strong>{gate.label}</strong><StatusPill tone={tone}>{gate.status.replaceAll('_', ' ')}</StatusPill></div><div className="console-gate-meta"><span>{sourceLabel(gate.source)}</span>{gate.externalRef && <span>Ref {gate.externalRef}</span>}{gate.owner && <span><UserRound size={12} /> {gate.owner}</span>}{overdue && <b>Overdue</b>}</div>{gate.issue && <p className="console-gate-issue">{gate.issue}</p>}<p className="console-gate-action">Next: {gate.nextAction ?? (gate.status === 'ACCEPTED' ? 'No action required' : 'Start this gate')}</p></div>
        <div className="console-gate-actions">{gate.status !== 'ACCEPTED' && <><select aria-label={`Assign ${gate.label}`} value={gate.owner ?? owner} onChange={(e) => setOwner(e.target.value)}><option value="ops_maya">ops_maya</option><option value="ops_sam">ops_sam</option><option value="qse">QSE</option></select><button onClick={() => mutate(`/api/ops/cases/${caseId}/activation/gates/${gate.key}/assign`, { owner: gate.owner ?? owner })} disabled={working !== null}>Assign</button>{(gate.status === 'QUESTIONS' || gate.status === 'FAILED') && <button onClick={() => mutate(`/api/ops/cases/${caseId}/activation/gates/${gate.key}/task`)} disabled={working !== null}>Create task</button>}<button onClick={() => mutate(`/api/ops/cases/${caseId}/activation/gates/${gate.key}/advance`, { status: nextStatus(gate.status) })} disabled={working !== null}>{gate.status === 'NOT_STARTED' ? 'Submit' : gate.status === 'SUBMITTED' ? 'Accept' : 'Advance'}</button></>}</div>
      </article>;
    })}</div>
    <div className="console-feedback-heading"><div><p className="console-eyebrow"><span /> EXTERNAL FEEDBACK</p><h3>Response history</h3></div><span>{events.length} events</span></div>
    <div className="console-event-list">{events.length === 0 ? <p className="console-empty-inline">No external feedback has been recorded.</p> : events.slice().reverse().map((event) => <div className="console-event" key={event.id}><span className={`console-source-dot source-${event.source.toLowerCase()}`} /><div><div className="console-event-top"><strong>{sourceLabel(event.source)}</strong><small>{new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div><p>{event.message}</p><span className="console-event-type">{event.type.replaceAll('_', ' ')}{event.assignedOwner ? ` · ${event.assignedOwner}` : ''}</span></div>{event.type === 'FEEDBACK' && !event.acknowledged && <button onClick={() => mutate(`/api/ops/cases/${caseId}/activation/events/${event.id}/acknowledge`)} disabled={working !== null}>Acknowledge</button>}</div>)}</div>
  </section>;
}

function nextStatus(status: ActivationGateVM['status']): ActivationGateVM['status'] { return status === 'NOT_STARTED' ? 'SUBMITTED' : status === 'SUBMITTED' ? 'ACCEPTED' : 'SUBMITTED'; }
function sourceLabel(source: string) { return source.replaceAll('_', ' '); }
