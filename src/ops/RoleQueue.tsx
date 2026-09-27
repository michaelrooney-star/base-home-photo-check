import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';
import type { RoleConfig } from './roleConfig';

type CaseRow = {
  id: string;
  pack: string;
  operationalStatus: 'OPERATIONAL' | 'WAITING' | 'BLOCKED';
  operationalReason: string;
  fingerprint: { address: string; city: string; utility: string };
  currentStep?: { label: string; system: string };
};

export function RoleQueue({ config }: { config: RoleConfig }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch(config.queueApi);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.cases ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(); }, [config.queueApi]);

  return (
    <section className="console-page">
      <div className="console-page-heading">
        <div>
          <p className="console-eyebrow"><span /> {config.queueEyebrow}</p>
          <h1>{config.queueTitle}<span>.</span></h1>
          <p className="console-page-description">{config.queueDescription}</p>
        </div>
        <button className="console-refresh-button" type="button" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'console-spin' : ''} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
      <div className="console-section-heading">
        <h2>{loading ? 'Loading…' : `${rows.length} open cases`}</h2>
        <span className="console-section-note">API: {config.queueApi}</span>
      </div>
      {loading ? (
        <div className="console-empty-state">Loading queue…</div>
      ) : rows.length === 0 ? (
        <div className="console-empty-state">No cases in this service queue.</div>
      ) : (
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Address</th>
                <th>City</th>
                <th>Current step</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><span className="console-case-id">{row.id.slice(0, 6)}</span></td>
                  <td><strong>{row.fingerprint.address}</strong></td>
                  <td>{row.fingerprint.city}</td>
                  <td className="console-step-cell">
                    {row.currentStep ? (
                      <>
                        <strong>{row.currentStep.label}</strong>
                        <small>{row.currentStep.system.replaceAll('_', ' ')}</small>
                      </>
                    ) : (
                      <span className="console-muted-step">—</span>
                    )}
                  </td>
                  <td>
                    <StatusPill tone={tone(row.operationalStatus)}>{label(row.operationalStatus)}</StatusPill>
                    <small className="console-status-reason">{row.operationalReason}</small>
                  </td>
                  <td>
                    <Link className="console-open-link" to={`${config.basePath}/case/${row.id}`}>
                      Open <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function label(v: string) {
  return ({ OPERATIONAL: 'Operational', WAITING: 'Waiting', BLOCKED: 'Blocked' } as Record<string, string>)[v] ?? v;
}
function tone(v: string): 'ready' | 'queued' | 'danger' {
  return v === 'OPERATIONAL' ? 'ready' : v === 'BLOCKED' ? 'danger' : 'queued';
}
