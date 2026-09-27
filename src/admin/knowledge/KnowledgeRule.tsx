import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConsoleShell, StatusPill } from '../../components/ConsoleShell';

type Relationship = { type: string; target_rule_id: string };
type Rule = { rule_id: string; jurisdiction: string; domain: string; applies_when: string[]; requires: string[]; relationships: Relationship[]; source: { authority: string; document?: string; section?: string; url?: string }; status: string };

export function KnowledgeRule() {
  const { ruleId } = useParams();
  const [rule, setRule] = useState<Rule | null>(null);
  useEffect(() => { fetch(`/api/admin/knowledge/rules/${ruleId}`).then((r) => r.json()).then((d) => setRule(d.error ? null : d)); }, [ruleId]);
  if (!rule) return <ConsoleShell role="permits"><div className="console-loading">Loading rule…</div></ConsoleShell>;
  return <ConsoleShell role="permits"><section className="console-page console-knowledge-page"><Link className="console-back-link" to={`/admin/knowledge/packs/${rule.jurisdiction}`}><ArrowLeft size={16} /> Back to pack</Link><div className="console-page-heading console-knowledge-heading"><div><p className="console-eyebrow"><span /> KNOWLEDGE RULE</p><h1>{rule.rule_id}<span>.</span></h1><p className="console-page-description">A verified rule used to explain and reconcile permit research outcomes.</p></div><StatusPill tone={rule.status === 'verified' ? 'ready' : 'review'}><ShieldCheck size={14} /> {rule.status}</StatusPill></div><div className="console-rule-detail"><div className="console-rule-detail-meta"><div><span>Jurisdiction</span><strong>{rule.jurisdiction}</strong></div><div><span>Domain</span><strong>{rule.domain}</strong></div><div><span>Status</span><StatusPill tone={rule.status === 'verified' ? 'ready' : 'review'}>{rule.status}</StatusPill></div></div><div className="console-rule-detail-section"><h2>Applies when</h2><ul>{rule.applies_when.map((a, i) => <li key={i}>{a}</li>)}</ul></div><div className="console-rule-detail-section"><h2>Requires</h2><ul>{rule.requires.map((a, i) => <li key={i}>{a}</li>)}</ul></div><div className="console-rule-detail-section"><h2>Relationships</h2>{rule.relationships.length === 0 ? <p>None</p> : <ul>{rule.relationships.map((rel, i) => <li key={i}><span className="console-pack">{rel.type}</span> <ArrowLeft size={13} className="console-relationship-arrow" /> <Link to={`/admin/knowledge/rules/${rel.target_rule_id}`}>{rel.target_rule_id}</Link></li>)}</ul>}</div><div className="console-rule-source"><span>Source</span>{rule.source.url ? <a href={rule.source.url} target="_blank" rel="noreferrer">{rule.source.document ?? rule.source.authority} <ExternalLink size={13} /></a> : <strong>{rule.source.authority}</strong>}{rule.source.section && <small>{rule.source.section}</small>}</div></div></section></ConsoleShell>;
}
