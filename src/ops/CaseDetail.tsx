import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { StatusPill, statusLabel, statusTone } from '../components/ConsoleShell';
import { PlanDAG } from './PlanDAG';
import type { PlanNodeVM } from './PlanDAG';

type Finding = { domain: string; summary: string; citations: { label: string; url?: string }[]; requirement?: string; ruleIds?: string[] };
type PlanNodeRaw = { id: string; worker: 'resolve_pack' | 'city' | 'electrical' | 'fire' | 'utility_rules' | 'reconcile'; wave: 0 | 1 | 2; dependsOn: string[]; state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'; result?: { status: 'ok' | 'failed'; attempts: number; error?: string; findings?: Finding[]; degraded?: boolean } };
type CaseRec = { id: string; assignee: string; pack: string; jobState: string; status: string; degraded: boolean; fingerprint: { address: string; city: string; utility: string; service_amps: number }; why: Finding[]; plan: PlanNodeRaw[] };

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
    setRec(data); setLoading(false);
  }
  useEffect(() => { setLoading(true); setSelectedNodeId(null); void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [caseId]);
  async function replan() { setPlanning(true); await fetch(`/api/ops/cases/${caseId}/plan`, { method: 'POST' }); await load(); setPlanning(false); }

  const vmNodes: PlanNodeVM[] = useMemo(() => !rec ? [] : rec.plan.map((n) => ({
    id: n.id, worker: n.worker, wave: n.wave, dependsOn: n.dependsOn, state: n.state,
    conflict: n.worker === 'fire' && n.result?.findings?.some((f) => f.domain === 'FIRE' && f.requirement === 'NO_REQUIREMENT'),
    failed: n.state === 'FAILED', degraded: rec.degraded && n.worker === 'utility_rules', attempts: n.result?.attempts,
  })), [rec]);
  const selectedNode = useMemo(() => rec?.plan.find((n) => n.id === selectedNodeId), [rec, selectedNodeId]);
  function onSelectNode(id: string) { setSelectedNodeId(id); setShowSheet(true); }
  function closeNode() { setSelectedNodeId(null); setShowSheet(false); }

  if (loading || !rec) return <div className="console-loading">Loading case…</div>;

  return <section className={`console-page console-case-detail ${selectedNodeId ? 'has-detail-rail' : ''}`}>
    <div className="console-case-header"><Link className="console-back-link" to={`/ops/${userId}`}><ArrowLeft size={16} /> Back to queue</Link><div className="console-case-title"><p className="console-eyebrow"><span /> CASE DETAIL</p><h1>Case {rec.id.slice(0, 6)}<span>.</span></h1></div><div className="console-case-actions"><StatusPill tone={statusTone(rec.status, rec.degraded)}>{rec.degraded ? 'Degraded' : statusLabel(rec.status)}</StatusPill><button className="console-primary-button" onClick={replan} disabled={planning || rec.status === 'UNKNOWN'}><RefreshCw size={16} className={planning ? 'console-spin' : ''} />{planning ? 'Replanning…' : 'Replan'}</button></div></div>

    <div className="console-case-meta"><div><span>Address</span><strong>{rec.fingerprint.address}</strong></div><div><span>City</span><strong>{rec.fingerprint.city}</strong></div><div><span>Utility</span><strong>{rec.fingerprint.utility}</strong></div><div><span>Service</span><strong>{rec.fingerprint.service_amps} amp</strong></div><div><span>Jurisdiction pack</span><strong>{rec.pack}</strong></div></div>

    <div className="console-workflow-heading"><div><p className="console-eyebrow"><span /> WORKFLOW PLAN</p><h2>Research path</h2></div><span>Click a worker to inspect its evidence and run state.</span></div>
    <div className="console-workflow-card"><div className="console-dag"><PlanDAG nodes={vmNodes} onSelectNode={onSelectNode} selectedNodeId={selectedNodeId} /></div></div>

    <details className="console-plan-list" role="group"><summary><span><strong>Plan list</strong><small>Accessible workflow summary</small></span><span>{rec.plan.length} workers</span></summary><ul>{rec.plan.map((n) => <li key={n.id}><button onClick={() => onSelectNode(n.id)}>{n.worker.replaceAll('_', ' ')}</button><span>Wave {n.wave}</span><StatusPill tone={n.state === 'DONE' ? 'ready' : n.state === 'FAILED' ? 'danger' : n.state === 'RUNNING' ? 'queued' : 'muted'}>{n.state === 'PENDING' ? 'Queued' : statusLabel(n.state)}</StatusPill></li>)}</ul></details>

    {selectedNode && <><aside className="console-detail-rail"><NodeDetail node={selectedNode} rec={rec} onClose={closeNode} /></aside><div className={`console-sheet-backdrop ${showSheet ? 'is-open' : ''}`} onClick={closeNode}><aside className={`console-detail-sheet ${showSheet ? 'is-open' : ''}`} onClick={(e) => e.stopPropagation()}><div className="console-sheet-handle" /><NodeDetail node={selectedNode} rec={rec} onClose={closeNode} /></aside></div></>}
  </section>;
}

function NodeDetail({ node, rec, onClose }: { node: PlanNodeRaw; rec: CaseRec; onClose: () => void }) {
  const title = node.worker.replaceAll('_', ' ');
  const domain = workerToDomain(node.worker);
  const cites = rec.why.filter((f) => f.domain === domain);
  const tone = node.state === 'FAILED' ? 'danger' : node.state === 'DONE' ? 'ready' : node.state === 'RUNNING' ? 'queued' : 'muted';
  return <div className="console-detail-content"><div className="console-detail-heading"><div><p className="console-eyebrow"><span /> WORKER DETAIL</p><h2>{title}</h2></div><button className="console-icon-button" onClick={onClose} aria-label="Close detail"><X size={18} /></button></div><div className="console-detail-stats"><div><span>State</span><StatusPill tone={tone}>{node.state === 'PENDING' ? 'Queued' : statusLabel(node.state)}</StatusPill></div><div><span>Attempts</span><strong>{node.result?.attempts ?? 0}</strong></div></div>{node.result?.status === 'failed' && <div className="console-error-note">{node.result.error}</div>}<div className="console-evidence"><h3><CheckCircle2 size={16} /> Why this worker ran</h3>{cites.length === 0 ? <p>No citations for this domain yet.</p> : <ul>{cites.map((f, i) => <li key={i}><p>{f.summary}</p>{f.ruleIds && f.ruleIds.length > 0 && <div className="console-rule-tags">{f.ruleIds.map((rid) => <Link key={rid} to={`/admin/knowledge/rules/${rid}`}>{rid}</Link>)}</div>}{f.citations.map((c, j) => c.url ? <a key={j} href={c.url} target="_blank" rel="noreferrer">{c.label}<ExternalLink size={13} /></a> : <span key={j}>{c.label}</span>)}</li>)}</ul>}</div></div>;
}

function workerToDomain(worker: PlanNodeRaw['worker']): string {
  switch (worker) { case 'fire': return 'FIRE'; case 'utility_rules': return 'UTILITY_INTERCONNECTION'; case 'city': return 'PERMIT'; case 'electrical': return 'ELECTRICAL'; default: return 'PERMIT'; }
}
