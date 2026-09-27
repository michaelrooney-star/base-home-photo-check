import { ExternalLink, RefreshCw, UserRound, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WorkflowGraph, bottleneckId, type SystemEventVM, type WorkflowNodeVM } from './WorkflowGraph';

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

type Props = {
  route: string;
  gates: ActivationGateVM[];
  events: ExternalEventVM[];
  followUpContact?: FollowUpContactVM;
  workflow?: { nodes: WorkflowNodeVM[]; events: SystemEventVM[] };
  caseId: string;
  onWorkflowChange?: () => void;
};

export function ActivationReadiness({ route, gates, workflow, followUpContact, caseId, onWorkflowChange }: Props) {
  const nodes = workflow?.nodes ?? [];
  const wfEvents = workflow?.events ?? [];
  const accepted = nodes.filter((g) => g.state === 'DONE').length;
  const ready = nodes.length > 0 && accepted === nodes.length;
  const blocked = nodes.find((g) => g.state === 'BLOCKED');
  const waiting = nodes.find((g) => g.state === 'WAITING_EXTERNAL');
  const focus = blocked ?? waiting;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState('');

  useEffect(() => {
    if (!selectedId && nodes.length) setSelectedId(bottleneckId(nodes));
  }, [nodes, selectedId]);

  async function simulateIngest() {
    setIngesting(true);
    setIngestMsg('');
    try {
      const res = await fetch(`/api/ops/cases/${caseId}/workflow/ingest`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setIngestMsg(data.message ?? 'Nothing to simulate.');
        return;
      }
      setIngestMsg(data.ingest?.message ?? 'Event ingested.');
      onWorkflowChange?.();
    } catch {
      setIngestMsg('Could not reach the API.');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <section className="console-activation-section">
      <div className="console-activation-heading">
        <div>
          <p className="console-eyebrow"><span /> OPS MANAGER</p>
          <h2>{ready ? 'All systems clear' : 'Workflow across systems'}</h2>
          <p>Events from Hubspot, ERP, permit research, field crews, and utilities — joined in one graph.</p>
        </div>
        <span className="console-route-badge"><Zap size={13} /> {route.replaceAll('_', ' ')}</span>
      </div>
      <div className="console-activation-progress">
        <span><strong>{accepted}</strong> of {nodes.length} steps complete</span>
        <div><i style={{ width: `${nodes.length ? (accepted / nodes.length) * 100 : 0}%` }} /></div>
      </div>
      {followUpContact && focus && (
        <div className="console-follow-up">
          <div className="console-follow-up-icon"><UserRound size={17} /></div>
          <div className="console-follow-up-main">
            <span><strong>{blocked ? 'Blocked on' : 'Waiting on'}:</strong> {focus.label}</span>
            <span><strong>Contact:</strong> {followUpContact.organization} · {followUpContact.name}</span>
            {followUpContact.note && <small>{followUpContact.note}</small>}
          </div>
          {followUpContact.url && (
            <a className="console-follow-up-link" href={followUpContact.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open contact
            </a>
          )}
        </div>
      )}
      <div className="console-workflow-toolbar">
        <button className="console-refresh-button" type="button" onClick={() => void simulateIngest()} disabled={ingesting}>
          <RefreshCw size={14} className={ingesting ? 'console-spin' : ''} />
          {ingesting ? 'Simulating…' : 'Simulate incoming event'}
        </button>
        {ingestMsg && <span className="console-control-feedback">{ingestMsg}</span>}
      </div>
      {nodes.length > 0 ? (
        <WorkflowGraph nodes={nodes} events={wfEvents} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <div className="console-empty-inline">No workflow configured for this case.</div>
      )}
      {gates.length > 0 && (
        <p className="console-workflow-legacy-note">
          {gates.filter((g) => g.status !== 'ACCEPTED').length} activation gate{gates.filter((g) => g.status !== 'ACCEPTED').length === 1 ? '' : 's'} still open in source systems.
        </p>
      )}
    </section>
  );
}
