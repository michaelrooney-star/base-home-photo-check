import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';
import { ROLE_CONFIGS } from './roleConfig';
import type { WorkflowNodeVM } from './WorkflowGraph';

type CaseRow = {
  id: string;
  operationalStatus: 'OPERATIONAL' | 'WAITING' | 'BLOCKED';
  operationalReason: string;
  fingerprint: { address: string; city: string; utility: string };
  workflow?: { nodes: WorkflowNodeVM[] };
};

type Buckets = { active: CaseRow[]; upcoming: CaseRow[]; completed: CaseRow[] };

const config = ROLE_CONFIGS.field;

export function FieldQueue() {
  const [buckets, setBuckets] = useState<Buckets>({ active: [], upcoming: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch(config.queueApi);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBuckets(data.buckets ?? { active: data.cases ?? [], upcoming: [], completed: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const total = buckets.active.length + buckets.upcoming.length + buckets.completed.length;

  return (
    <section className="console-page">
      <div className="console-page-heading">
        <div>
          <p className="console-eyebrow"><span /> {config.queueEyebrow}</p>
          <h1>{config.queueTitle}<span>.</span></h1>
          <p className="console-page-description">
            Active installs, jobs waiting on permits, and recently closed work orders — same cases Base Admin orchestrates.
          </p>
        </div>
        <button className="console-refresh-button" type="button" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'console-spin' : ''} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div className="console-summary-grid" aria-label="Field queue summary">
        <div className="console-summary-card is-review"><span>Active now</span><strong>{buckets.active.length}</strong><small>Crew on site or blocked</small></div>
        <div className="console-summary-card is-muted"><span>Up next</span><strong>{buckets.upcoming.length}</strong><small>Waiting on permits or scheduling</small></div>
        <div className="console-summary-card is-ready"><span>Completed</span><strong>{buckets.completed.length}</strong><small>Work orders closed</small></div>
        <div className="console-summary-card"><span>Total tracked</span><strong>{total}</strong><small>Field service view</small></div>
      </div>

      {loading ? (
        <div className="console-empty-state">Loading queue…</div>
      ) : (
        <>
          <QueueSection
            title="Active now"
            note="Crew assigned or site issue — act on these work orders."
            rows={buckets.active}
            empty="No active field work right now."
          />
          <QueueSection
            title="Up next"
            note="Installs queued once upstream permit and photo checks clear."
            rows={buckets.upcoming}
            empty="Nothing scheduled after current permits finish."
          />
          <QueueSection
            title="Completed"
            note="Closed work orders — activation may still be in progress in other systems."
            rows={buckets.completed}
            empty="No completed field installs yet."
            muted
          />
        </>
      )}
    </section>
  );
}

function QueueSection({
  title,
  note,
  rows,
  empty,
  muted = false,
}: {
  title: string;
  note: string;
  rows: CaseRow[];
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className={`console-field-queue-section ${muted ? 'is-muted' : ''}`}>
      <div className="console-section-heading">
        <div>
          <h2>{title} <span className="console-section-count">({rows.length})</span></h2>
          <span className="console-section-note">{note}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="console-empty-inline">{empty}</div>
      ) : (
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Address</th>
                <th>City</th>
                <th>Field status</th>
                <th>Case status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const field = row.workflow?.nodes.find((n) => n.id === 'field');
                return (
                  <tr key={row.id}>
                    <td><span className="console-case-id">{row.id.slice(0, 6)}</span></td>
                    <td><strong>{row.fingerprint.address}</strong></td>
                    <td>{row.fingerprint.city}</td>
                    <td className="console-step-cell">
                      {field ? (
                        <>
                          <strong>{fieldLabel(field.state)}</strong>
                          <small>{field.nextAction ?? field.issue ?? 'Field install'}</small>
                        </>
                      ) : (
                        <span className="console-muted-step">—</span>
                      )}
                    </td>
                    <td>
                      <StatusPill tone={caseTone(row.operationalStatus)}>{row.operationalStatus}</StatusPill>
                    </td>
                    <td>
                      <Link className="console-open-link" to={`${config.basePath}/case/${row.id}`}>
                        Open <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fieldLabel(state: WorkflowNodeVM['state']) {
  return ({
    PENDING: 'Scheduled',
    RUNNING: 'On site',
    WAITING_EXTERNAL: 'Waiting',
    BLOCKED: 'Blocked',
    DONE: 'Closed',
  } as const)[state];
}

function caseTone(v: string): 'ready' | 'queued' | 'danger' {
  return v === 'OPERATIONAL' ? 'ready' : v === 'BLOCKED' ? 'danger' : 'queued';
}
