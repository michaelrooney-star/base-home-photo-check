import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  Camera,
  Database,
  ExternalLink,
  Plug,
  Radio,
  Settings,
  Users,
  Webhook,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../components/ConsoleShell';

export type WorkflowNodeVM = {
  id: string;
  label: string;
  lane: 'INTAKE' | 'SITE' | 'PERMIT' | 'FIELD' | 'ACTIVATION';
  system: string;
  dependsOn: string[];
  state: 'PENDING' | 'RUNNING' | 'WAITING_EXTERNAL' | 'BLOCKED' | 'DONE';
  issue?: string;
  nextAction?: string;
  owner?: string;
  externalRef?: string;
  dueAt?: number;
  updatedAt: number;
  ruleIds?: string[];
};

export type SystemEventVM = {
  id: string;
  nodeId: string;
  system: string;
  receivedAt: number;
  summary: string;
  payload?: Record<string, string>;
};

const LANES: WorkflowNodeVM['lane'][] = ['INTAKE', 'SITE', 'PERMIT', 'FIELD', 'ACTIVATION'];
const LANE_LABELS: Record<WorkflowNodeVM['lane'], string> = {
  INTAKE: 'Intake',
  SITE: 'Site',
  PERMIT: 'Permits',
  FIELD: 'Field',
  ACTIVATION: 'Activation',
};

type SystemMeta = {
  label: string;
  tone: string;
  icon: ReactNode;
  integration: {
    channel: string;
    endpoint: string;
    auth: string;
    docs: string;
  };
};

const SYSTEM_META: Record<string, SystemMeta> = {
  HUBSPOT: {
    label: 'Hubspot',
    tone: 'hubspot',
    icon: <Users size={15} />,
    integration: {
      channel: 'Inbound webhook',
      endpoint: 'POST /api/webhooks/hubspot/deals',
      auth: 'Hubspot private app token',
      docs: 'Deal stage + contact updates',
    },
  },
  PHOTO_CHECK: {
    label: 'Photo check',
    tone: 'photo',
    icon: <Camera size={15} />,
    integration: {
      channel: 'App submission',
      endpoint: 'POST /api/webhooks/photo-check/submissions',
      auth: 'Signed device session',
      docs: 'Customer photo evidence package',
    },
  },
  PERMIT_KB: {
    label: 'Permit KB',
    tone: 'permit',
    icon: <BookOpen size={15} />,
    integration: {
      channel: 'Knowledge API',
      endpoint: 'GET /api/integrations/permit-kb/packs/:packId',
      auth: 'Service API key',
      docs: 'Jurisdiction rules + citations',
    },
  },
  ERP: {
    label: 'ERP',
    tone: 'erp',
    icon: <Database size={15} />,
    integration: {
      channel: 'Work-order sync',
      endpoint: 'GET /api/integrations/erp/work-orders/:ref',
      auth: 'OAuth 2.0 client',
      docs: 'Install scheduling + field completion',
    },
  },
  FIELD_APP: {
    label: 'Field app',
    tone: 'field',
    icon: <Wrench size={15} />,
    integration: {
      channel: 'Mobile webhook',
      endpoint: 'POST /api/webhooks/field-app/completions',
      auth: 'Crew device token',
      docs: 'Crew sign-off + site notes',
    },
  },
  AUSTIN_ENERGY: {
    label: 'Austin Energy',
    tone: 'utility',
    icon: <Plug size={15} />,
    integration: {
      channel: 'Utility portal feed',
      endpoint: 'POST /api/webhooks/austin-energy/gates',
      auth: 'Portal callback secret',
      docs: 'Inspection + interconnection status',
    },
  },
  ERCOT: {
    label: 'ERCOT',
    tone: 'ercot',
    icon: <Radio size={15} />,
    integration: {
      channel: 'Registration API',
      endpoint: 'POST /api/webhooks/ercot/registration',
      auth: 'QSE partner certificate',
      docs: 'Premise ID + ADER enrollment',
    },
  },
  QSE: {
    label: 'QSE',
    tone: 'qse',
    icon: <Activity size={15} />,
    integration: {
      channel: 'Telemetry feed',
      endpoint: 'POST /api/webhooks/qse/telemetry',
      auth: 'mTLS client cert',
      docs: 'Meter validation + dispatch signals',
    },
  },
  BASE_OPS: {
    label: 'Base Ops',
    tone: 'ops',
    icon: <Settings size={15} />,
    integration: {
      channel: 'Orchestrator API',
      endpoint: 'POST /api/ops/cases/:caseId/workflow/ingest',
      auth: 'Ops session',
      docs: 'Manual replay + demo event ingest',
    },
  },
};

function systemMeta(system: string): SystemMeta {
  return SYSTEM_META[system] ?? {
    label: system,
    tone: 'ops',
    icon: <Zap size={15} />,
    integration: {
      channel: 'Event feed',
      endpoint: 'POST /api/ops/cases/:caseId/workflow/ingest',
      auth: 'Service token',
      docs: 'Generic workflow event',
    },
  };
}

function SystemIcon({ system, size = 'md' }: { system: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = systemMeta(system);
  return (
    <span className={`console-system-icon is-${meta.tone} is-${size}`} aria-hidden="true">
      {size === 'lg' ? <span className="console-system-icon-graphic">{meta.icon}</span> : meta.icon}
    </span>
  );
}

function integrationStatus(state: WorkflowNodeVM['state']): { label: string; tone: 'ready' | 'queued' | 'danger' | 'muted' } {
  if (state === 'BLOCKED') return { label: 'Needs attention', tone: 'danger' };
  if (state === 'WAITING_EXTERNAL') return { label: 'Awaiting callback', tone: 'queued' };
  if (state === 'DONE') return { label: 'Connected', tone: 'ready' };
  if (state === 'RUNNING') return { label: 'Syncing', tone: 'queued' };
  return { label: 'Not started', tone: 'muted' };
}

function nodeTone(state: WorkflowNodeVM['state']): 'ready' | 'queued' | 'danger' | 'review' | 'muted' {
  if (state === 'DONE') return 'ready';
  if (state === 'BLOCKED') return 'danger';
  if (state === 'WAITING_EXTERNAL') return 'queued';
  if (state === 'RUNNING') return 'review';
  return 'muted';
}

function stateLabel(state: WorkflowNodeVM['state']) {
  return ({ PENDING: 'Pending', RUNNING: 'Running', WAITING_EXTERNAL: 'Waiting', BLOCKED: 'Blocked', DONE: 'Done' } as const)[state];
}

type Layout = {
  pos: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
};

function useLayout(nodes: WorkflowNodeVM[], containerWidth: number, isMobile: boolean): Layout {
  const laneGap = isMobile ? 0 : 48;
  const rowGap = 12;
  const nodeW = isMobile ? Math.max(220, containerWidth - 24) : 196;
  const nodeH = isMobile ? 56 : 64;
  const xBase = 12;
  const yBase = 28;
  const pos: Record<string, { x: number; y: number }> = {};
  const byLane = LANES.map((lane) => nodes.filter((n) => n.lane === lane));

  if (isMobile) {
    let y = yBase;
    for (const lane of LANES) {
      const list = nodes.filter((n) => n.lane === lane);
      if (!list.length) continue;
      y += 18;
      for (const n of list) {
        pos[n.id] = { x: xBase, y };
        y += nodeH + rowGap;
      }
      y += 8;
    }
    return { pos, width: nodeW + 24, height: y + 12, nodeW, nodeH };
  }

  let maxRows = 1;
  for (const list of byLane) maxRows = Math.max(maxRows, list.length);
  const height = yBase + maxRows * (nodeH + rowGap) + 18;
  let width = xBase;
  LANES.forEach((lane, laneIdx) => {
    const list = nodes.filter((n) => n.lane === lane);
    const x = xBase + laneIdx * (nodeW + laneGap);
    width = Math.max(width, x + nodeW + 12);
    list.forEach((n, i) => {
      pos[n.id] = { x, y: yBase + i * (nodeH + rowGap) };
    });
  });
  return { pos, width, height, nodeW, nodeH };
}

function useViewport(ref: React.RefObject<HTMLElement | null>): [number, boolean] {
  const [width, setWidth] = useState(360);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    function update() {
      setWidth(ref.current?.clientWidth ?? 360);
      setIsMobile(window.innerWidth < 768);
    }
    update();
    const obs = new ResizeObserver(update);
    if (ref.current) obs.observe(ref.current);
    window.addEventListener('resize', update);
    return () => { obs.disconnect(); window.removeEventListener('resize', update); };
  }, [ref]);
  return [width, isMobile];
}

function drawEdges(nodes: WorkflowNodeVM[], layout: Layout, isMobile: boolean) {
  const paths: { key: string; d: string; critical: boolean }[] = [];
  const nodeSize = { w: layout.nodeW, h: layout.nodeH };
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const from = layout.pos[dep];
      const to = layout.pos[node.id];
      if (!from || !to) continue;
      const fs = nodeSize;
      const ts = nodeSize;
      const critical = node.state === 'BLOCKED' || node.state === 'WAITING_EXTERNAL';
      if (isMobile) {
        const sx = from.x + fs.w / 2;
        const sy = from.y + fs.h;
        const tx = to.x + ts.w / 2;
        const ty = to.y;
        const mid = (sy + ty) / 2;
        paths.push({ key: `${dep}->${node.id}`, d: `M ${sx} ${sy} L ${sx} ${mid} L ${tx} ${mid} L ${tx} ${ty}`, critical });
      } else {
        const sx = from.x + fs.w;
        const sy = from.y + fs.h / 2;
        const tx = to.x;
        const ty = to.y + ts.h / 2;
        const mid = (sx + tx) / 2;
        paths.push({ key: `${dep}->${node.id}`, d: `M ${sx} ${sy} L ${mid} ${sy} L ${mid} ${ty} L ${tx} ${ty}`, critical });
      }
    }
  }
  return paths;
}

export function bottleneckId(nodes: WorkflowNodeVM[]): string | null {
  for (const state of ['BLOCKED', 'WAITING_EXTERNAL', 'RUNNING', 'PENDING'] as const) {
    const n = nodes.find((node) => node.state === state);
    if (n) return n.id;
  }
  return nodes.at(-1)?.id ?? null;
}

type InspectorProps = {
  node: WorkflowNodeVM;
  events: SystemEventVM[];
  onClose: () => void;
};

function NodeInspector({ node, events, onClose }: InspectorProps) {
  const nodeEvents = events.filter((e) => e.nodeId === node.id).sort((a, b) => b.receivedAt - a.receivedAt);
  const overdue = Boolean(node.dueAt && node.dueAt < Date.now() && node.state !== 'DONE');
  const meta = systemMeta(node.system);
  const api = integrationStatus(node.state);
  const lastEvent = nodeEvents[0];
  const content = (
    <div className="console-detail-content">
      <div className="console-detail-heading console-detail-heading-with-icon">
        <div className="console-detail-title-wrap">
          <SystemIcon system={node.system} size="lg" />
          <div>
            <p className="console-eyebrow"><span /> {meta.label}</p>
            <h2>{node.label}</h2>
          </div>
        </div>
        <button className="console-icon-button" onClick={onClose} aria-label="Close inspector"><X size={18} /></button>
      </div>
      <div className="console-api-integration">
        <div className="console-api-integration-head">
          <Webhook size={14} />
          <strong>System integration</strong>
          <StatusPill tone={api.tone}>{api.label}</StatusPill>
        </div>
        <div className="console-api-integration-grid">
          <div><span>Channel</span><strong>{meta.integration.channel}</strong></div>
          <div><span>Auth</span><strong>{meta.integration.auth}</strong></div>
          <div className="console-api-endpoint"><span>Endpoint</span><code>{meta.integration.endpoint}</code></div>
          <div><span>Last event</span><strong>{lastEvent ? new Date(lastEvent.receivedAt).toLocaleString() : 'No events yet'}</strong></div>
        </div>
        <p className="console-api-integration-note">{meta.integration.docs} · mock API surface for demo integrations</p>
      </div>
      <div className="console-detail-stats">
        <div><span>Status</span><StatusPill tone={nodeTone(node.state)}>{stateLabel(node.state)}</StatusPill></div>
        <div><span>Updated</span><strong>{new Date(node.updatedAt).toLocaleString()}</strong></div>
        {node.externalRef && <div><span>External ref</span><strong>{node.externalRef}</strong></div>}
        {node.owner && <div><span>Owner</span><strong>{node.owner}</strong></div>}
        {overdue && <div><span>Due</span><strong className="console-overdue">Overdue</strong></div>}
      </div>
      {node.issue && <p className="console-gate-issue">{node.issue}</p>}
      {node.nextAction && <p className="console-gate-action">Next: {node.nextAction}</p>}
      {node.ruleIds && node.ruleIds.length > 0 && (
        <div className="console-evidence">
          <h3>Knowledge rules</h3>
          <ul>
            {node.ruleIds.map((id) => (
              <li key={id}><Link to={`/admin/knowledge/rules/${id}`}>{id} <ExternalLink size={12} /></Link></li>
            ))}
          </ul>
        </div>
      )}
      <div className="console-evidence">
        <h3>Event history ({nodeEvents.length})</h3>
        <ul>
          {nodeEvents.map((e) => (
            <li key={e.id}>
              <div className="console-event-row">
                <SystemIcon system={e.system} size="sm" />
                <div>
                  <p>{e.summary}</p>
                  <span>{new Date(e.receivedAt).toLocaleString()} · {systemMeta(e.system).label}</span>
                  {e.payload && Object.entries(e.payload).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
  return (
    <aside className="console-workflow-inspector" role="dialog" aria-label="Workflow node inspector">
      {content}
    </aside>
  );
}

type GraphProps = {
  nodes: WorkflowNodeVM[];
  events: SystemEventVM[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
};

export function WorkflowGraph({ nodes, events, selectedId, onSelect }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [w, isMobile] = useViewport(containerRef);
  const layout = useLayout(nodes, w, isMobile);
  const edges = useMemo(() => drawEdges(nodes, layout, isMobile), [nodes, layout, isMobile]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="console-workflow-wrap">
      <div ref={containerRef} className="console-dag-canvas console-workflow-canvas">
        <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} className="absolute left-0 top-0" style={{ pointerEvents: 'none' }}>
            <defs>
              <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9985" />
              </marker>
              <marker id="wf-arrow-critical" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#c94a35" />
              </marker>
            </defs>
            {edges.map((e) => (
              <path key={e.key} d={e.d} stroke={e.critical ? '#c94a35' : '#aab5a4'} strokeWidth={e.critical ? 2 : 1.5} fill="none" markerEnd={e.critical ? 'url(#wf-arrow-critical)' : 'url(#wf-arrow)'} />
            ))}
          </svg>
          {!isMobile && LANES.map((lane, i) => {
            const list = nodes.filter((n) => n.lane === lane);
            if (!list.length) return null;
            const x = 12 + i * (layout.nodeW + 48) + layout.nodeW / 2;
            return (
              <div key={lane} className="console-dag-wave-label absolute" style={{ left: x, top: 2, transform: 'translateX(-50%)' }}>
                {LANE_LABELS[lane]}
              </div>
            );
          })}
          {nodes.map((n) => {
            const p = layout.pos[n.id];
            if (!p) return null;
            const tone = nodeTone(n.state);
            return (
              <button
                key={n.id}
                type="button"
                className={`console-dag-node console-workflow-node absolute text-left is-${tone === 'ready' ? 'done' : tone === 'danger' ? 'danger' : tone === 'queued' ? 'running' : tone === 'review' ? 'running' : 'queued'} ${selectedId === n.id ? 'is-selected' : ''}`}
                style={{ left: p.x, top: p.y, width: layout.nodeW, minHeight: layout.nodeH }}
                onClick={() => onSelect(n.id)}
                aria-pressed={selectedId === n.id}
                data-node-id={n.id}
              >
                <span className="console-dag-pill-icon"><SystemIcon system={n.system} size="sm" /></span>
                <span className="console-workflow-node-body">
                  <span className="console-dag-pill-name">{n.label}</span>
                  <span className="console-workflow-system">{systemMeta(n.system).label}</span>
                </span>
                <StatusPill tone={nodeTone(n.state)}>{stateLabel(n.state)}</StatusPill>
              </button>
            );
          })}
        </div>
      </div>
      {selected && <NodeInspector node={selected} events={events} onClose={() => onSelect('')} />}
    </div>
  );
}
