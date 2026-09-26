import { BookOpen, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConsoleShell, StatusPill } from '../../components/ConsoleShell';

type PackItem = { packId: string; name: string; counts: { total: number; byStatus: Record<string, number> } };

export function KnowledgeHome() {
  const [packs, setPacks] = useState<PackItem[]>([]);
  useEffect(() => { fetch('/api/admin/knowledge/packs').then((r) => r.json()).then((d) => setPacks(d.packs ?? [])); }, []);
  return <ConsoleShell><section className="console-page console-knowledge-page"><div className="console-page-heading"><div><p className="console-eyebrow"><span /> KNOWLEDGE BASE</p><h1>Jurisdiction packs<span>.</span></h1><p className="console-page-description">Review the verified rules that support permit research and explain each case decision.</p></div><StatusPill tone="ready"><BookOpen size={14} /> Rule library</StatusPill></div><div className="console-knowledge-grid">{packs.map((p) => <Link key={p.packId} to={`/admin/knowledge/packs/${p.packId}`} className="console-knowledge-card"><div className="console-knowledge-card-top"><span className="console-pack">{p.packId}</span><ArrowUpRight size={15} /></div><strong>{p.name}</strong><span>{p.counts.total} rules · {p.counts.byStatus?.verified ?? 0} verified · {p.counts.byStatus?.candidate ?? 0} candidate</span></Link>)}</div>{packs.length === 0 && <div className="console-empty-state">Loading knowledge packs…</div>}</section></ConsoleShell>;
}
