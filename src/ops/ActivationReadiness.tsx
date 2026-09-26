import { AlertCircle, Check, Clock3, ExternalLink, UserRound, Zap } from 'lucide-react';
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

export type FollowUpContactVM = {
  organization: string;
  name: string;
  email?: string;
  phone?: string;
  url?: string;
  note?: string;
};

export function ActivationReadiness({ route, gates, events, followUpContact }: { route: string; gates: ActivationGateVM[]; events: ExternalEventVM[]; followUpContact?: FollowUpContactVM }) {

  const accepted = gates.filter((g) => g.status === 'ACCEPTED').length;
  const ready = gates.length > 0 && accepted === gates.length;
  const blockedGate = gates.find((g) => g.status !== 'ACCEPTED');
  const latestResponse = events.slice().reverse().find((event) => event.type === 'FEEDBACK' || event.type === 'STATUS_CHANGED');
  return <section className="console-activation-section">
    <div className="console-activation-heading"><div><p className="console-eyebrow"><span /> ACTIVATION READINESS</p><h2>{ready ? 'Dispatch-ready' : 'Installed battery gates'}</h2><p>External approvals and operating qualification are tracked separately from permit research.</p></div><span className="console-route-badge"><Zap size={13} /> {route.replaceAll('_', ' ')}</span></div>
    <div className="console-activation-progress"><span><strong>{accepted}</strong> of {gates.length} gates accepted</span><div><i style={{ width: `${gates.length ? (accepted / gates.length) * 100 : 0}%` }} /></div></div>
    {(followUpContact || latestResponse) && <div className="console-follow-up"><div className="console-follow-up-icon"><UserRound size={17} /></div><div className="console-follow-up-main"><span><strong>Blocked on:</strong> {blockedGate?.label ?? 'Research follow-up'}</span>{followUpContact && <span><strong>Contact:</strong> {followUpContact.organization} · {followUpContact.name}</span>}{latestResponse && <span><strong>Response:</strong> {latestResponse.message}</span>}{followUpContact?.note && <small>{followUpContact.note}</small>}</div>{followUpContact?.url && <a className="console-follow-up-link" href={followUpContact.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open contact</a>}</div>}
    <div className="console-gate-list">{gates.map((gate) => {
      const overdue = Boolean(gate.dueAt && gate.dueAt < Date.now() && gate.status !== 'ACCEPTED');
      const tone = gate.status === 'ACCEPTED' ? 'ready' : gate.status === 'QUESTIONS' || gate.status === 'FAILED' ? 'danger' : gate.status === 'SUBMITTED' ? 'queued' : 'muted';
      return <article className={`console-gate-card is-${tone}`} key={gate.key}>
        <div className="console-gate-icon">{gate.status === 'ACCEPTED' ? <Check size={16} /> : gate.status === 'QUESTIONS' || gate.status === 'FAILED' ? <AlertCircle size={16} /> : <Clock3 size={16} />}</div>
        <div className="console-gate-main"><div className="console-gate-title"><strong>{gate.label}</strong><StatusPill tone={tone}>{gate.status.replaceAll('_', ' ')}</StatusPill></div><div className="console-gate-meta"><span>{sourceLabel(gate.source)}</span>{gate.externalRef && <span>Ref {gate.externalRef}</span>}{gate.owner && <span><UserRound size={12} /> {gate.owner}</span>}{overdue && <b>Overdue</b>}</div>{gate.status !== 'ACCEPTED' && followUpContact && <p className="console-gate-contact"><strong>Contact:</strong> {followUpContact.organization} · {followUpContact.name} · {followUpContact.email} · {followUpContact.phone}</p>}{gate.issue && <p className="console-gate-issue">{gate.issue}</p>}<p className="console-gate-action">Next: {gate.nextAction ?? (gate.status === 'ACCEPTED' ? 'No action required' : 'Start this gate')}</p></div>
      </article>;
    })}</div>
    <div className="console-feedback-heading"><div><p className="console-eyebrow"><span /> EXTERNAL FEEDBACK</p><h3>External responses</h3></div><span>{events.length} events</span></div>
    <div className="console-event-list">{events.length === 0 ? <p className="console-empty-inline">No external response has been recorded.</p> : events.slice().reverse().map((event) => <div className="console-event" key={event.id}><span className={`console-source-dot source-${event.source.toLowerCase()}`} /><div><div className="console-event-top"><strong>{sourceLabel(event.source)}</strong><small>{new Date(event.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div><p>{event.message}</p><span className="console-event-type">{event.type.replaceAll('_', ' ')}{event.assignedOwner ? ` · ${event.assignedOwner}` : ''}</span></div></div>)}</div>
  </section>;
}
function sourceLabel(source: string) { return source.replaceAll('_', ' '); }
