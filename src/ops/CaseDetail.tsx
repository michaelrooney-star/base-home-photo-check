import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PlanDAG } from './PlanDAG';
import type { PlanNodeVM } from './PlanDAG';

type Finding = {
  domain: string;
  summary: string;
  citations: { label: string; url?: string }[];
  requirement?: string;
};

type PlanNodeRaw = {
  id: string;
  worker: 'resolve_pack' | 'city' | 'electrical' | 'fire' | 'utility_rules' | 'reconcile';
  wave: 0 | 1 | 2;
  dependsOn: string[];
  state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  result?: {
    status: 'ok' | 'failed';
    attempts: number;
    error?: string;
    findings?: Finding[];
    degraded?: boolean;
  };
};

type CaseRec = {
  id: string;
  assignee: string;
  pack: string;
  jobState: string;
  status: string;
  degraded: boolean;
  fingerprint: {
    address: string;
    city: string;
    utility: string;
    service_amps: number;
  };
  why: Finding[];
  plan: PlanNodeRaw[];
};

export function CaseDetail() {
  const { userId, caseId } = useParams();
  const [rec, setRec] = useState<CaseRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  async function load() {
    const res = await fetch(`/api/ops/cases/${caseId}`);
    const data = await res.json();
    setRec(data);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    setSelectedNodeId(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function replan() {
    setPlanning(true);
    await fetch(`/api/ops/cases/${caseId}/plan`, { method: 'POST' });
    await load();
    setPlanning(false);
  }

  const vmNodes: PlanNodeVM[] = useMemo(() => {
    if (!rec) return [];
    return rec.plan.map((n) => {
      const conflict =
        n.worker === 'fire' &&
        n.result?.findings?.some((f) => f.domain === 'FIRE' && f.requirement === 'NO_REQUIREMENT');
      const failed = n.state === 'FAILED';
      const degraded = rec.degraded && n.worker === 'utility_rules';
      return {
        id: n.id,
        worker: n.worker,
        wave: n.wave,
        dependsOn: n.dependsOn,
        state: n.state,
        conflict,
        degraded,
        failed,
      };
    });
  }, [rec]);

  function onSelectNode(id: string) {
    setSelectedNodeId(id);
    setShowSheet(true);
  }

  const selectedNode = useMemo(
    () => rec?.plan.find((n) => n.id === selectedNodeId),
    [rec, selectedNodeId]
  );

  if (loading || !rec) return <div>Loading…</div>;

  const statusChip =
    rec.status === 'OPS_READY'
      ? 'bg-green-100 text-green-800'
      : rec.status === 'NEEDS_REVIEW'
      ? 'bg-amber-100 text-amber-800'
      : rec.status === 'BLOCKED'
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-800';

  return (
    <div className="space-y-4">
      {/* Sticky status bar */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="flex items-center gap-3 px-2 py-2 md:px-0">
          <Link className="text-blue-600 hover:underline" to={`/ops/${userId}`}>← Back</Link>
          <h2 className="text-base md:text-lg font-medium">Case {rec.id.slice(0, 6)}</h2>
          <span className="hidden md:inline text-sm text-gray-500">Pack: {rec.pack}</span>
          <span className={`text-xs md:text-sm rounded px-2 py-0.5 ${statusChip}`}>{rec.status.replace('_', ' ')}</span>
          {rec.degraded ? <span className="text-xs md:text-sm rounded bg-yellow-100 text-yellow-800 px-2 py-0.5">degraded</span> : null}
          <button
            className="ml-auto rounded bg-blue-600 text-white px-4 py-2 text-sm md:text-base disabled:opacity-50"
            onClick={replan}
            disabled={planning || rec.status === 'UNKNOWN'}
          >
            {planning ? 'Replanning…' : 'Replan'}
          </button>
        </div>
      </div>

      {/* Primary: DAG */}
      <div>
        <PlanDAG nodes={vmNodes} onSelectNode={onSelectNode} />
      </div>

      {/* Secondary: compact list for a11y */}
      <div className="border rounded p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Plan (List)</h3>
          <div className="text-xs text-gray-500">Compact accessibility list</div>
        </div>
        <ul className="mt-2 space-y-1">
          {rec.plan.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <button className="underline text-blue-600" onClick={() => onSelectNode(n.id)}>
                {n.worker.replace('_', ' ')}
              </button>
              <span className="text-xs uppercase tracking-wide text-gray-500">wave {n.wave}</span>
              <span className="text-sm">{n.state === 'PENDING' ? 'Queued' : n.state.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Node detail: right rail on desktop, bottom sheet on mobile */}
      {selectedNode ? (
        <>
          {/* Desktop rail */}
          <aside className="hidden md:block fixed right-0 top-16 bottom-0 w-full max-w-md border-l bg-white overflow-y-auto">
            <NodeDetail node={selectedNode} rec={rec} onClose={() => setSelectedNodeId(null)} />
          </aside>
          {/* Mobile bottom sheet */}
          <div className={`md:hidden fixed inset-0 ${showSheet ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div
              className={`absolute inset-0 bg-black/30 transition-opacity ${showSheet ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setSelectedNodeId(null)}
            />
            <div
              className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-lg border-t shadow-lg p-3 transition-transform ${showSheet ? 'translate-y-0' : 'translate-y-full'}`}
            >
              <div className="mx-auto h-1 w-12 rounded bg-gray-300 mb-2" />
              <NodeDetail node={selectedNode} rec={rec} onClose={() => setSelectedNodeId(null)} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function NodeDetail({ node, rec, onClose }: { node: PlanNodeRaw; rec: CaseRec; onClose: () => void }) {
  const title = node.worker.replace('_', ' ');
  const domain = workerToDomain(node.worker);
  const cites = rec.why.filter((f) => f.domain === domain);
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium capitalize">{title}</h3>
        <button className="rounded bg-gray-100 px-3 py-1" onClick={onClose}>Close</button>
      </div>
      <div className="text-sm">
        <div><span className="text-gray-500">State:</span> {node.state === 'PENDING' ? 'Queued' : node.state.toLowerCase()}</div>
        {node.result?.status === 'failed' ? (
          <div className="text-red-700">Error: {node.result.error}</div>
        ) : null}
        <div className="text-gray-500">Attempts: {node.result?.attempts ?? 0}</div>
      </div>
      <div>
        <h4 className="text-sm font-medium">Why?</h4>
        {cites.length === 0 ? (
          <div className="text-sm text-gray-500">No citations for this domain yet.</div>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {cites.map((f, i) => (
              <li key={i}>
                <div>{f.summary}</div>
                {f.citations.map((c, j) => (
                  <div key={j}>
                    {c.url ? <a className="underline text-blue-700" href={c.url} target="_blank" rel="noreferrer">{c.label}</a> : c.label}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function workerToDomain(worker: PlanNodeRaw['worker']): string {
  switch (worker) {
    case 'fire':
      return 'FIRE';
    case 'utility_rules':
      return 'UTILITY_INTERCONNECTION';
    case 'city':
      return 'PERMIT';
    case 'electrical':
      return 'ELECTRICAL';
    case 'resolve_pack':
    case 'reconcile':
    default:
      return 'PERMIT';
  }
}
