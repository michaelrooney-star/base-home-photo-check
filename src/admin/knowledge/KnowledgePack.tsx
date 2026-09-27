import { ArrowLeft, ArrowUpRight, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConsoleShell, StatusPill } from '../../components/ConsoleShell';

type Rule = { rule_id: string; domain: string; requires: string[]; source: { url?: string; document?: string; authority: string }; status: string };

export function KnowledgePack() {
  const { packId } = useParams();
  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => { fetch(`/api/admin/knowledge/packs/${packId}`).then((r) => r.json()).then((d) => setRules(d.rules ?? [])); }, [packId]);
  return <ConsoleShell role="permits"><section className="console-page console-knowledge-page"><Link className="console-back-link" to="/admin/knowledge"><ArrowLeft size={16} /> All packs</Link><div className="console-page-heading console-knowledge-heading"><div><p className="console-eyebrow"><span /> JURISDICTION PACK</p><h1>{packId}<span>.</span></h1><p className="console-page-description">Rules currently available for this jurisdiction pack.</p></div><StatusPill tone={rules.length ? 'ready' : 'muted'}><BookOpen size={14} /> {rules.length} rules</StatusPill></div><div className="console-rule-grid">{rules.map((r) => <Link key={r.rule_id} to={`/admin/knowledge/rules/${r.rule_id}`} className="console-rule-card"><div className="console-rule-card-top"><span>{r.domain}</span><StatusPill tone={r.status === 'verified' ? 'ready' : 'review'}>{r.status}</StatusPill></div><strong>{r.requires[0]}</strong><span>{r.source.url ? <><span>{r.source.document ?? r.source.authority}</span><ArrowUpRight size={13} /></> : r.source.authority}</span></Link>)}</div>{rules.length === 0 && <div className="console-empty-state">No verified rules for this pack yet.</div>}</section></ConsoleShell>;
}
