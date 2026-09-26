import { ArrowUpRight, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, statusLabel, statusTone } from '../components/ConsoleShell';

type CaseRow = {
  id: string;
  created_at: number;
  assignee: string;
  pack: string;
  status: 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'UNKNOWN' | 'QUEUED';
  jobState: string;
  fingerprint: { address: string; city: string; utility: string };
  degraded: boolean;
  activationSummary: { route: string; currentGate?: string; currentLabel?: string; source?: string; status?: string; owner?: string; overdue: boolean; correctionNeeded: boolean; awaitingExternal: boolean; telemetryPending: boolean; dispatchReady: boolean; latestResponse?: string; latestResponseSource?: string };
  followUpContact?: { organization: string; name: string; url?: string; email?: string; phone?: string };
};

const filters = ['ALL', 'OPS_READY', 'QUEUED', 'NEEDS_REVIEW', 'BLOCKED', 'UNKNOWN'] as const;
const activationFilters = ['ALL', 'AUSTIN_ENERGY', 'ERCOT', 'CORRECTION', 'TELEMETRY', 'DISPATCH_READY', 'OVERDUE'] as const;

export function Queue() {
  const { userId } = useParams();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const firstLoad = useRef(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL');
  const [activationFilter, setActivationFilter] = useState<(typeof activationFilters)[number]>('ALL');

  useEffect(() => {
    let ignore = false;
    async function load(initial = false) {
      if (!initial) setRefreshing(true);
      try {
        const res = await fetch(`/api/ops/queue/${userId}`);
        if (!res.ok) throw new Error(`Queue request failed (${res.status})`);
        const data = await res.json();
        if (!ignore) {
          setRows(data.cases ?? []);
          setLastUpdated(new Date());
          setStale(false);
          setErrorMessage('');
          if (firstLoad.current) {
            firstLoad.current = false;
            setLoading(false);
          }
        }
      } catch {
        if (!ignore) {
          setStale(true);
          setErrorMessage('The local API is unavailable. Your last queue state is being preserved.');
          if (firstLoad.current) {
            firstLoad.current = false;
            setLoading(false);
          }
        }
      } finally {
        if (!ignore) setRefreshing(false);
      }
    }
    void load(true);
    return () => { ignore = true; };
  }, [userId]);

  async function refreshQueue() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/ops/queue/${userId}`);
      if (!res.ok) throw new Error(`Queue request failed (${res.status})`);
      const data = await res.json();
      setRows(data.cases ?? []);
      setLastUpdated(new Date());
      setStale(false);
      setErrorMessage('');
    } catch {
      setStale(true);
      setErrorMessage('Refresh failed. The local API may need to be restarted.');
    } finally {
      setRefreshing(false);
    }
  }

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {}), [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter = filter === 'ALL' || row.status === filter;
      const activation = row.activationSummary;
      const matchesActivation = activationFilter === 'ALL' || activationFilter === activation.source || (activationFilter === 'CORRECTION' && activation.correctionNeeded) || (activationFilter === 'TELEMETRY' && activation.telemetryPending) || (activationFilter === 'DISPATCH_READY' && activation.dispatchReady) || (activationFilter === 'OVERDUE' && activation.overdue);
      const haystack = `${row.id} ${row.fingerprint.address} ${row.fingerprint.city} ${row.fingerprint.utility} ${row.pack}`.toLowerCase();
      return matchesFilter && matchesActivation && (!needle || haystack.includes(needle));
    }).sort((a, b) => Number(b.activationSummary.overdue || b.activationSummary.correctionNeeded) - Number(a.activationSummary.overdue || a.activationSummary.correctionNeeded));
  }, [activationFilter, filter, query, rows]);

  return <section className="console-page">
    <div className="console-page-heading"><div><p className="console-eyebrow"><span /> CLIENT CASES</p><h1>Client cases<span>.</span></h1><p className="console-page-description">Review site evidence, permit research, and rule conflicts as each client case moves toward a decision.</p></div><div className="console-heading-meta"><span className={`console-live-dot ${stale ? 'is-stale' : ''}`} />{stale ? 'Stale · refresh failed' : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for first update'}<button className="console-refresh-button" onClick={refreshQueue} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'console-spin' : ''} />{refreshing ? 'Refreshing' : 'Refresh'}</button></div></div>
    <div className="console-summary-grid" aria-label="Queue summary">
      <div className="console-summary-card"><span>Total cases</span><strong>{rows.length}</strong><small>Base Admin queue</small></div><div className="console-summary-card is-ready"><span>Ready for review</span><strong>{counts.OPS_READY ?? 0}</strong><small>Research workflow</small></div><div className="console-summary-card is-review"><span>Attention needed</span><strong>{(counts.NEEDS_REVIEW ?? 0) + (counts.BLOCKED ?? 0) + rows.filter((row) => row.degraded).length}</strong><small>Review, blocked, or fallback</small></div><div className="console-summary-card is-muted"><span>Waiting to run</span><strong>{counts.QUEUED ?? 0}</strong><small>Research not started</small></div><div className="console-summary-card is-review"><span>External response</span><strong>{rows.filter((row) => row.activationSummary.awaitingExternal).length}</strong><small>Waiting on utility or ERCOT</small></div><div className="console-summary-card is-review"><span>Correction needed</span><strong>{rows.filter((row) => row.activationSummary.correctionNeeded).length}</strong><small>Actionable feedback</small></div><div className="console-summary-card is-muted"><span>Telemetry pending</span><strong>{rows.filter((row) => row.activationSummary.telemetryPending).length}</strong><small>Validation not accepted</small></div><div className="console-summary-card is-ready"><span>Dispatch-ready</span><strong>{rows.filter((row) => row.activationSummary.dispatchReady).length}</strong><small>All gates accepted</small></div>
    </div>
    <div className="console-toolbar"><label className="console-search"><Search size={17} /><span className="sr-only">Search cases</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cases, addresses, or utilities" /></label><div className="console-filter-wrap"><SlidersHorizontal size={16} /><span>Research</span>{filters.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'All cases' : statusLabel(item)}</button>)}</div><div className="console-filter-wrap"><ZapIcon /><span>Activation</span>{activationFilters.map((item) => <button key={item} className={activationFilter === item ? 'is-active' : ''} onClick={() => setActivationFilter(item)}>{activationLabel(item)}</button>)}</div></div>
    {errorMessage && <p className="console-inline-error" role="alert">{errorMessage}</p>}
    <div className="console-status-legend" aria-label="Case status guide"><strong>Status guide</strong><span><StatusPill tone="ready">Ready for review</StatusPill> complete workflow</span><span><StatusPill tone="queued">Waiting to run</StatusPill> not started</span><span><StatusPill tone="review">Review required</StatusPill> operator decision</span><span><StatusPill tone="danger">Blocked</StatusPill> cannot continue</span><span><StatusPill tone="muted">Setup needed</StatusPill> no rules pack</span></div>
    <div className="console-section-heading"><div><p className="console-eyebrow"><span /> CLIENT CASE QUEUE</p><h2>{visibleRows.length} visible cases</h2></div><span className="console-section-note">Select a case to inspect its workflow</span></div>
    {loading ? <div className="console-empty-state">Loading cases…</div> : visibleRows.length === 0 ? <div className="console-empty-state">No cases match this view.</div> : <><div className="console-case-cards">{visibleRows.map((row) => <CaseCard key={row.id} row={row} userId={userId ?? ''} />)}</div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Case</th><th>Address</th><th>City</th><th>Utility</th><th>Rules pack</th><th>Blocked on</th><th>Contact</th><th>External response</th><th>Research</th><th>Status</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><span className="console-case-id">{row.id.slice(0, 6)}</span></td><td><strong>{row.fingerprint.address}</strong></td><td>{row.fingerprint.city}</td><td>{row.fingerprint.utility}</td><td><span className="console-pack">{row.pack}</span></td><td><span className="console-activation-cell"><b>{activationDisplay(row.activationSummary, row.status)}</b>{row.activationSummary.owner && <small>{row.activationSummary.owner}</small>}</span></td><td>{row.followUpContact ? <span className="console-follow-up-cell"><strong>{row.followUpContact.organization}</strong><small>{row.followUpContact.name}</small>{row.followUpContact.url && <a href={row.followUpContact.url} target="_blank" rel="noreferrer">Open contact</a>}</span> : <span className="console-muted-cell">No contact</span>}</td><td><span className="console-response-cell">{row.activationSummary.latestResponseSource && <strong>{activationLabel(row.activationSummary.latestResponseSource)}</strong>}<small>{row.activationSummary.latestResponse ?? 'No external response'}</small></span></td><td>{statusLabel(row.jobState)}</td><td><StatusPill tone={statusTone(row.status, row.degraded)}>{row.degraded ? 'Fallback used' : statusLabel(row.status)}</StatusPill></td><td><Link className="console-open-link" to={`/ops/${userId}/case/${row.id}`}>Open <ArrowUpRight size={14} /></Link></td></tr>)}</tbody></table></div></>}
  </section>;
}

function CaseCard({ row, userId }: { row: CaseRow; userId: string }) {
  return <Link to={`/ops/${userId}/case/${row.id}`} className="console-case-card"><div className="console-case-card-top"><span className="console-case-id">{row.id.slice(0, 6)}</span><StatusPill tone={statusTone(row.status, row.degraded)}>{row.degraded ? 'Fallback used' : statusLabel(row.status)}</StatusPill></div><strong>{row.fingerprint.address}</strong><span>{row.fingerprint.city} · {row.fingerprint.utility}</span><span className="console-case-activation">Blocked on: {activationDisplay(row.activationSummary, row.status)}</span>{row.followUpContact && <span className="console-follow-up-card">Contact: {row.followUpContact.organization} · {row.followUpContact.name}</span>}{row.activationSummary.latestResponse && <span className="console-response-card">Response: {row.activationSummary.latestResponse}</span>}<div className="console-case-card-bottom"><span>{row.pack}</span><ArrowUpRight size={15} /></div></Link>;
}

function activationLabel(value: string) { return ({ ALL: 'All activation', AUSTIN_ENERGY: 'Austin Energy', ERCOT: 'ERCOT', CORRECTION: 'Correction needed', TELEMETRY: 'Telemetry pending', DISPATCH_READY: 'Dispatch-ready', OVERDUE: 'Overdue', NOT_STARTED: 'Not started', SUBMITTED: 'Waiting externally', QUESTIONS: 'Questions', FAILED: 'Failed', ACCEPTED: 'Accepted' } as Record<string, string>)[value] ?? value.replaceAll('_', ' '); }
function activationDisplay(summary: CaseRow['activationSummary'], researchStatus: CaseRow['status']) { return summary.dispatchReady ? 'Dispatch-ready' : summary.currentLabel ?? (researchStatus === 'BLOCKED' ? 'Research workflow' : researchStatus === 'NEEDS_REVIEW' ? 'Research correction' : summary.route === 'UNKNOWN' ? 'Activation not started' : 'No activation gate'); }
function ZapIcon() { return <span aria-hidden="true">⚡</span>; }
