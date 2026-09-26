import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
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
};

const filters = ['ALL', 'OPS_READY', 'QUEUED', 'NEEDS_REVIEW', 'UNKNOWN'] as const;

export function Queue() {
  const { userId } = useParams();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL');

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/ops/queue/${userId}`);
      const data = await res.json();
      if (!ignore) { setRows(data.cases ?? []); setLoading(false); }
    }
    load();
    const t = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(t); };
  }, [userId]);

  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {}), [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter = filter === 'ALL' || row.status === filter;
      const haystack = `${row.id} ${row.fingerprint.address} ${row.fingerprint.city} ${row.fingerprint.utility} ${row.pack}`.toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [filter, query, rows]);

  return <section className="console-page">
    <div className="console-page-heading"><div><p className="console-eyebrow"><span /> OPERATIONS QUEUE</p><h1>Cases ready for review<span>.</span></h1><p className="console-page-description">Track permit research, conflicts, and jurisdiction packs as they move through the workflow.</p></div><div className="console-heading-meta"><span className="console-live-dot" /> Live · refreshes every 4 seconds</div></div>
    <div className="console-summary-grid" aria-label="Queue summary">
      <div className="console-summary-card"><span>Total cases</span><strong>{rows.length}</strong><small>Assigned to {userId}</small></div><div className="console-summary-card is-ready"><span>Ops ready</span><strong>{counts.OPS_READY ?? 0}</strong><small>Ready for the next step</small></div><div className="console-summary-card is-review"><span>Needs review</span><strong>{(counts.NEEDS_REVIEW ?? 0) + (counts.BLOCKED ?? 0)}</strong><small>Requires operator attention</small></div><div className="console-summary-card is-muted"><span>Queued</span><strong>{counts.QUEUED ?? 0}</strong><small>Waiting to run</small></div>
    </div>
    <div className="console-toolbar"><label className="console-search"><Search size={17} /><span className="sr-only">Search cases</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cases, addresses, or utilities" /></label><div className="console-filter-wrap"><SlidersHorizontal size={16} /><span>View</span>{filters.map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'All cases' : statusLabel(item)}</button>)}</div></div>
    <div className="console-section-heading"><div><p className="console-eyebrow"><span /> CASE QUEUE</p><h2>{visibleRows.length} visible cases</h2></div><span className="console-section-note">Select a case to inspect its plan</span></div>
    {loading ? <div className="console-empty-state">Loading the queue…</div> : visibleRows.length === 0 ? <div className="console-empty-state">No cases match this view.</div> : <><div className="console-case-cards">{visibleRows.map((row) => <CaseCard key={row.id} row={row} userId={userId ?? ''} />)}</div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Case</th><th>Address</th><th>City</th><th>Utility</th><th>Pack</th><th>Job</th><th>Status</th><th /></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><span className="console-case-id">{row.id.slice(0, 6)}</span></td><td><strong>{row.fingerprint.address}</strong></td><td>{row.fingerprint.city}</td><td>{row.fingerprint.utility}</td><td><span className="console-pack">{row.pack}</span></td><td>{row.jobState}</td><td><StatusPill tone={statusTone(row.status, row.degraded)}>{row.degraded ? 'Degraded' : statusLabel(row.status)}</StatusPill></td><td><Link className="console-open-link" to={`/ops/${userId}/case/${row.id}`}>Open <ArrowUpRight size={14} /></Link></td></tr>)}</tbody></table></div></>}
  </section>;
}

function CaseCard({ row, userId }: { row: CaseRow; userId: string }) {
  return <Link to={`/ops/${userId}/case/${row.id}`} className="console-case-card"><div className="console-case-card-top"><span className="console-case-id">{row.id.slice(0, 6)}</span><StatusPill tone={statusTone(row.status, row.degraded)}>{row.degraded ? 'Degraded' : statusLabel(row.status)}</StatusPill></div><strong>{row.fingerprint.address}</strong><span>{row.fingerprint.city} · {row.fingerprint.utility}</span><div className="console-case-card-bottom"><span>{row.pack}</span><ArrowUpRight size={15} /></div></Link>;
}
