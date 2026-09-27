import { ArrowLeft, ArrowUpRight, Check, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';
import { PhotoLightbox } from './PhotoLightbox';
import { SiteEvidence } from './SiteEvidence';
import type { RoleConfig } from './roleConfig';
import { WorkflowPipeline } from './WorkflowPipeline';
import type { WorkflowNodeVM } from './WorkflowGraph';

type CaseRec = {
  id: string;
  fingerprint: { address: string; city: string; utility: string };
  operationalStatus: string;
  operationalReason: string;
  sitePhotos?: { id: string; title: string; src: string; note: string }[];
  activationGates: { key: string; label: string; status: string; issue?: string; nextAction?: string }[];
  workflow?: { nodes: WorkflowNodeVM[] };
};

const PERMIT_IDS = new Set(['pack', 'city', 'electrical', 'fire']);

export function RoleCaseDetail({ config }: { config: RoleConfig }) {
  const { caseId } = useParams();
  const [rec, setRec] = useState<CaseRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [acting, setActing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ title: string; src: string; note: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(config.caseApi(caseId!));
      const data = await res.json();
      if (!res.ok) {
        setRec(null);
        return;
      }
      setRec(data);
    } finally {
      setLoading(false);
    }
  }, [caseId, config]);

  useEffect(() => { void load(); }, [load]);

  async function post(url: string, body: object) {
    setActing(true);
    setMsg('');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.message ?? 'Action failed.');
        return;
      }
      setMsg(data.serviceResult?.message ?? 'Event emitted.');
      setRec(data);
    } catch {
      setMsg('Could not reach the API.');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="console-loading">Loading case…</div>;
  if (!rec) {
    return (
      <section className="console-page">
        <Link className="console-back-link" to={config.basePath}><ArrowLeft size={16} /> Back to queue</Link>
        <div className="console-empty-state">Case not found.</div>
      </section>
    );
  }

  const nodes = rec.workflow?.nodes ?? [];
  const permitNodes = nodes.filter((n) => PERMIT_IDS.has(n.id));
  const fieldNode = nodes.find((n) => n.id === 'field');
  const openGates = rec.activationGates.filter((g) => g.status !== 'ACCEPTED');

  return (
    <section className="console-page console-case-detail">
      <div className="console-case-header">
        <Link className="console-back-link" to={config.basePath}><ArrowLeft size={16} /> Back to queue</Link>
        <div className="console-case-title">
          <p className="console-eyebrow"><span /> {config.topbarTitle.toUpperCase()}</p>
          <h1>Case {rec.id.slice(0, 6)}<span>.</span></h1>
        </div>
        <StatusPill tone={rec.operationalStatus === 'BLOCKED' ? 'danger' : rec.operationalStatus === 'OPERATIONAL' ? 'ready' : 'queued'}>
          {rec.operationalStatus}
        </StatusPill>
      </div>

      <div className="console-case-meta">
        <div><span>Address</span><strong>{rec.fingerprint.address}</strong></div>
        <div><span>City</span><strong>{rec.fingerprint.city}</strong></div>
        <div><span>Utility</span><strong>{rec.fingerprint.utility}</strong></div>
      </div>

      {config.role === 'permits' && (
        <section className="console-role-panel">
          <h2>Permit checks</h2>
          <p className="console-role-api">POST /api/permits/cases/:id/checks/:nodeId</p>
          <div className="console-role-nodes">
            {permitNodes.map((node) => (
              <div key={node.id} className="console-role-node">
                <div>
                  <strong>{node.label}</strong>
                  <StatusPill tone={nodeTone(node.state)}>{node.state.replaceAll('_', ' ')}</StatusPill>
                  {node.nextAction && <small>{node.nextAction}</small>}
                  {node.issue && <small className="console-overdue">{node.issue}</small>}
                </div>
                {node.state !== 'DONE' && (
                  <div className="console-role-actions">
                    <button type="button" disabled={acting} onClick={() => void post(`/api/permits/cases/${rec.id}/checks/${node.id}`, { action: 'complete' })}>
                      <Check size={14} /> Complete
                    </button>
                    <button type="button" className="is-danger" disabled={acting} onClick={() => void post(`/api/permits/cases/${rec.id}/checks/${node.id}`, { action: 'reject' })}>
                      <X size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {config.role === 'field' && (
        <>
          <SiteEvidence
            photos={rec.sitePhotos ?? []}
            address={rec.fingerprint.address}
            onOpen={setSelectedPhoto}
            subtitle="Review customer photos before closing the work order — same evidence Base Ops sees from Photo Check."
          />
          {nodes.length > 0 && (
            <WorkflowPipeline
              nodes={nodes}
              highlightId="field"
              title="Install pipeline"
              description="What is done, in progress, blocked, or still waiting — field install depends on permits and photos upstream."
            />
          )}
        </>
      )}

      {config.role === 'field' && fieldNode && (
        <section className="console-role-panel">
          <h2>Work order {fieldNode.externalRef ?? 'WO-8842'}</h2>
          <p className="console-role-api">POST /api/field/cases/:id/work-order</p>
          <div className="console-role-node">
            <div>
              <strong>{fieldNode.label}</strong>
              <StatusPill tone={nodeTone(fieldNode.state)}>{fieldNode.state.replaceAll('_', ' ')}</StatusPill>
              {fieldNode.nextAction && <small>{fieldNode.nextAction}</small>}
            </div>
            {fieldNode.state !== 'DONE' && (
              <div className="console-role-actions">
                <button type="button" disabled={acting} onClick={() => void post(`/api/field/cases/${rec.id}/work-order`, { action: 'complete' })}>
                  <Check size={14} /> Close work order
                </button>
                <button type="button" className="is-danger" disabled={acting} onClick={() => void post(`/api/field/cases/${rec.id}/work-order`, { action: 'block' })}>
                  <X size={14} /> Site not ready
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {config.role === 'activation' && (
        <section className="console-role-panel">
          <h2>Activation gates</h2>
          <p className="console-role-api">POST /api/activation/cases/:id/gates/:gateKey</p>
          <div className="console-role-nodes">
            {openGates.map((gate) => (
              <div key={gate.key} className="console-role-node">
                <div>
                  <strong>{gate.label}</strong>
                  <StatusPill tone={gate.status === 'FAILED' || gate.status === 'QUESTIONS' ? 'danger' : 'queued'}>{gate.status.replaceAll('_', ' ')}</StatusPill>
                  {gate.issue && <small className="console-overdue">{gate.issue}</small>}
                  {gate.nextAction && <small>{gate.nextAction}</small>}
                </div>
                <div className="console-role-actions">
                  <button type="button" disabled={acting} onClick={() => void post(`/api/activation/cases/${rec.id}/gates/${gate.key}`, { action: 'accept' })}>
                    <Check size={14} /> Accept
                  </button>
                  <button type="button" className="is-danger" disabled={acting} onClick={() => void post(`/api/activation/cases/${rec.id}/gates/${gate.key}`, { action: 'fail' })}>
                    <X size={14} /> Fail
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {msg && <p className="console-control-feedback">{msg}</p>}
      <p className="console-role-admin-link">
        <Link to={`/ops/admin/case/${rec.id}`}>View full graph in Base Admin <ArrowUpRight size={14} /></Link>
      </p>

      {selectedPhoto && (
        <PhotoLightbox
          photo={selectedPhoto}
          address={rec.fingerprint.address}
          city={rec.fingerprint.city}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </section>
  );
}

function nodeTone(state: string): 'ready' | 'queued' | 'danger' | 'muted' | 'review' {
  if (state === 'DONE') return 'ready';
  if (state === 'BLOCKED') return 'danger';
  if (state === 'WAITING_EXTERNAL') return 'queued';
  if (state === 'RUNNING') return 'review';
  return 'muted';
}
