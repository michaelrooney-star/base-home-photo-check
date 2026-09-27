import { ArrowUpRight, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill } from '../components/ConsoleShell';

type CaseRow = {
  id: string;
  pack: string;
  operationalStatus: 'OPERATIONAL' | 'WAITING' | 'BLOCKED';
  operationalReason: string;
  fingerprint: { address: string; city: string; utility: string };
  activationSummary: { route: string; source?: string; overdue: boolean; correctionNeeded: boolean; awaitingExternal: boolean; telemetryPending: boolean; dispatchReady: boolean; latestResponse?: string; latestResponseSource?: string };
  followUpContact?: { organization: string; name: string; url?: string };
};

const filters = ['ALL', 'OPERATIONAL', 'WAITING', 'BLOCKED'] as const;

export function Queue() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const firstLoad = useRef(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL');

  async function load(initial = false) {
    if (!initial) setRefreshing(true);
    try {
      const res = await fetch('/api/ops/queue/admin');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.cases ?? []);
      setLastUpdated(new Date());
      setStale(false);
      setErrorMessage('');
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoading(false);
      }
    } catch {
      setStale(true);
      setErrorMessage('The local API is unavailable. Your last queue state is being preserved.');
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoading(false);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { void load(true); }, []);

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.operationalStatus] = (acc[row.operationalStatus] ?? 0) + 1;
    return acc;
  }, {}), [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = filter === 'ALL' || row.operationalStatus === filter;
      const haystack = [row.id, row.fingerprint.address, row.fingerprint.city, row.fingerprint.utility, row.pack].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    }).sort((a, b) => statusRank(b.operationalStatus) - statusRank(a.operationalStatus) || Number(b.activationSummary.overdue || b.activationSummary.correctionNeeded) - Number(a.activationSummary.overdue || a.activationSummary.correctionNeeded));
  }, [filter, query, rows]);

  return <section className="console-page">
    <div className="console-page-heading"><div><p className="console-eyebrow"><span /> CLIENT CASES</p><h1>Client cases<span>.</span></h1><p className="console-page-description">Track which battery cases are operational, waiting, or blocked.</p></div><div className="console-heading-meta"><span className={'console-live-dot ' + (stale ? 'is-stale' : '')} />{stale ? 'Stale · refresh failed' : lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Waiting for first update'}<button className="console-refresh-button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'console-spin' : ''} />{refreshing ? 'Refreshing' : 'Refresh'}</button></div></div>
    <div className="console-summary-grid" aria-label="Queue summary">
      <div className="console-summary-card"><span>Total cases</span><strong>{rows.length}</strong><small>Base Admin queue</small></div><div className="console-summary-card is-ready"><span>Operational</span><strong>{counts.OPERATIONAL ?? 0}</strong><small>Clear to proceed</small></div><div className="console-summary-card is-muted"><span>Waiting</span><strong>{counts.WAITING ?? 0}</strong><small>Pending response or information</small></div><div className="console-summary-card is-review"><span>Blocked</span><strong>{counts.BLOCKED ?? 0}</strong><small>Needs correction or attention</small></div>
    </div>
    <div className="console-toolbar"><label className="console-search"><Search size={17} /><span className="sr-only">Search cases</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cases, addresses, or utilities" /></label><div className="console-filter-wrap"><SlidersHorizontal size={16} /><span>Status</span>{filters.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{operationalLabel(item)}</button>)}</div></div>
    {errorMessage && <p className="console-inline-error" role="alert">{errorMessage}</p>}
    <div className="console-status-legend" aria-label="Operational status guide"><strong>Status guide</strong><span><StatusPill tone="ready">Operational</StatusPill> clear to proceed</span><span><StatusPill tone="queued">Waiting</StatusPill> pending response or information</span><span><StatusPill tone="danger">Blocked</StatusPill> failed or needs correction</span></div>
    <div className="console-section-heading"><div><p className="console-eyebrow"><span /> CLIENT CASE QUEUE</p><h2>{visibleRows.length} visible cases</h2></div><span className="console-section-note">Select a case to inspect its status</span></div>
    {loading ? <div className="console-empty-state">Loading cases…</div> : visibleRows.length === 0 ? <div className="console-empty-state">No cases match this view.</div> : <><div className="console-case-cards">{visibleRows.map((row) => <CaseCard key={row.id} row={row} />)}</div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Case</th><th>Address</th><th>City</th><th>Utility</th><th>Rules pack</th><th>Status</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><span className="console-case-id">{row.id.slice(0, 6)}</span></td><td><strong>{row.fingerprint.address}</strong></td><td>{row.fingerprint.city}</td><td>{row.fingerprint.utility}</td><td><span className="console-pack">{row.pack}</span></td><td><StatusPill tone={operationalTone(row.operationalStatus)}>{operationalLabel(row.operationalStatus)}</StatusPill><span className="console-status-meta">{row.followUpContact ? row.followUpContact.organization + ' · ' + row.followUpContact.name : 'No contact'}<small>{row.activationSummary.latestResponse ?? 'No external response'}</small></span><small className="console-status-reason">{row.operationalReason}</small></td><td><Link className="console-open-link" to={'/ops/admin/case/' + row.id}>Open <ArrowUpRight size={14} /></Link></td></tr>)}</tbody></table></div></>}
  </section>;
}

function CaseCard({ row }: { row: CaseRow }) {
  return <Link to={'/ops/admin/case/' + row.id} className="console-case-card"><div className="console-case-card-top"><span className="console-case-id">{row.id.slice(0, 6)}</span><StatusPill tone={operationalTone(row.operationalStatus)}>{operationalLabel(row.operationalStatus)}</StatusPill></div><span className="console-status-meta">{row.followUpContact ? row.followUpContact.organization + ' · ' + row.followUpContact.name : 'No contact'}<small>{row.activationSummary.latestResponse ?? 'No external response'}</small></span><small className="console-status-reason">{row.operationalReason}</small><strong>{row.fingerprint.address}</strong><span>{row.fingerprint.city} · {row.fingerprint.utility}</span><div className="console-case-card-bottom"><span>{row.pack}</span><ArrowUpRight size={15} /></div></Link>;
}

function operationalLabel(value: string) {
  return ({ ALL: 'All statuses', OPERATIONAL: 'Operational', WAITING: 'Waiting', BLOCKED: 'Blocked' } as Record<string, string>)[value] ?? value;
}
function operationalTone(value: string): 'ready' | 'queued' | 'danger' { return value === 'OPERATIONAL' ? 'ready' : value === 'BLOCKED' ? 'danger' : 'queued'; }
function statusRank(value: CaseRow['operationalStatus']) { return value === 'BLOCKED' ? 2 : value === 'WAITING' ? 1 : 0; }
