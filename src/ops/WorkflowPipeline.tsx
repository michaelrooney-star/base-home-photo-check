import { StatusPill } from '../components/ConsoleShell';
import type { WorkflowNodeVM } from './WorkflowGraph';

const NODE_ORDER = [
  'intake', 'photos', 'pack', 'city', 'electrical', 'fire', 'field',
  'inspection', 'pto', 'ercot', 'telemetry', 'dispatch', 'ancillary', 'activation_config',
];

const SYSTEM_LABELS: Record<string, string> = {
  HUBSPOT: 'Hubspot',
  PHOTO_CHECK: 'Photo check',
  PERMIT_KB: 'Permit KB',
  ERP: 'ERP',
  FIELD_APP: 'Field app',
  AUSTIN_ENERGY: 'Austin Energy',
  ERCOT: 'ERCOT',
  QSE: 'QSE',
  BASE_OPS: 'Base Ops',
};

const LANE_LABELS: Record<WorkflowNodeVM['lane'], string> = {
  INTAKE: 'Intake',
  SITE: 'Site',
  PERMIT: 'Permits',
  FIELD: 'Field',
  ACTIVATION: 'Activation',
};

function nodeTone(state: WorkflowNodeVM['state']): 'ready' | 'queued' | 'danger' | 'muted' | 'review' {
  if (state === 'DONE') return 'ready';
  if (state === 'BLOCKED') return 'danger';
  if (state === 'WAITING_EXTERNAL') return 'queued';
  if (state === 'RUNNING') return 'review';
  return 'muted';
}

function stateLabel(state: WorkflowNodeVM['state']) {
  return ({
    PENDING: 'Pending',
    RUNNING: 'In progress',
    WAITING_EXTERNAL: 'Waiting',
    BLOCKED: 'Blocked',
    DONE: 'Done',
  } as const)[state];
}

function sortNodes(nodes: WorkflowNodeVM[]) {
  const rank = Object.fromEntries(NODE_ORDER.map((id, i) => [id, i]));
  return [...nodes].sort((a, b) => (rank[a.id] ?? 99) - (rank[b.id] ?? 99));
}

export function WorkflowPipeline({
  nodes,
  highlightId,
  title = 'Install pipeline',
  description = 'Status across connected systems — upstream steps must complete before downstream work starts.',
}: {
  nodes: WorkflowNodeVM[];
  highlightId?: string;
  title?: string;
  description?: string;
}) {
  const sorted = sortNodes(nodes);
  const done = sorted.filter((n) => n.state === 'DONE');
  const inFlight = sorted.filter((n) => n.state === 'RUNNING' || n.state === 'WAITING_EXTERNAL');
  const blocked = sorted.filter((n) => n.state === 'BLOCKED');
  const pending = sorted.filter((n) => n.state === 'PENDING');

  return (
    <section className="console-pipeline-section">
      <div className="console-evidence-heading">
        <div>
          <p className="console-eyebrow"><span /> CROSS-SYSTEM STATUS</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="console-pipeline-summary">
          <strong>{done.length}</strong> done · <strong>{inFlight.length}</strong> active · <strong>{pending.length}</strong> pending
          {blocked.length > 0 && <> · <strong className="console-overdue">{blocked.length}</strong> blocked</>}
        </span>
      </div>

      {blocked.length > 0 && (
        <PipelineGroup label="Blocked" nodes={blocked} highlightId={highlightId} />
      )}
      {inFlight.length > 0 && (
        <PipelineGroup label="In pipeline" nodes={inFlight} highlightId={highlightId} />
      )}
      {pending.length > 0 && (
        <PipelineGroup label="Up next" nodes={pending} highlightId={highlightId} />
      )}
      {done.length > 0 && (
        <PipelineGroup label="Complete" nodes={done} highlightId={highlightId} muted />
      )}
    </section>
  );
}

function PipelineGroup({
  label,
  nodes,
  highlightId,
  muted = false,
}: {
  label: string;
  nodes: WorkflowNodeVM[];
  highlightId?: string;
  muted?: boolean;
}) {
  return (
    <div className={`console-pipeline-group ${muted ? 'is-muted' : ''}`}>
      <h3>{label} <span>({nodes.length})</span></h3>
      <ul className="console-pipeline-list">
        {nodes.map((node) => (
          <li
            key={node.id}
            className={`console-pipeline-row is-${node.state.toLowerCase()}${highlightId === node.id ? ' is-highlight' : ''}`}
          >
            <div className="console-pipeline-row-main">
              <strong>{node.label}</strong>
              <span className="console-pipeline-meta">
                {LANE_LABELS[node.lane]} · {SYSTEM_LABELS[node.system] ?? node.system}
              </span>
              {node.issue && <small className="console-overdue">{node.issue}</small>}
              {node.nextAction && node.state !== 'DONE' && <small>{node.nextAction}</small>}
            </div>
            <StatusPill tone={nodeTone(node.state)}>{stateLabel(node.state)}</StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}
