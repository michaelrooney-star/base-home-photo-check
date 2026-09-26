import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type Relationship = { type: string; target_rule_id: string };
type Rule = {
  rule_id: string;
  jurisdiction: string;
  domain: string;
  applies_when: string[];
  requires: string[];
  relationships: Relationship[];
  source: { authority: string; document?: string; section?: string; url?: string };
  status: string;
};

export function KnowledgeRule() {
  const { ruleId } = useParams();
  const [rule, setRule] = useState<Rule | null>(null);
  useEffect(() => {
    fetch(`/api/admin/knowledge/rules/${ruleId}`).then((r) => r.json()).then((d) => setRule(d.error ? null : d));
  }, [ruleId]);
  if (!rule) return <div className="p-4">Loading…</div>;
  return (
    <div className="min-h-dvh p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Rule {rule.rule_id}</div>
        <Link className="text-blue-600 underline" to={`/admin/knowledge/packs/${rule.jurisdiction}`}>Back to pack</Link>
      </div>
      <div className="rounded border p-3 space-y-2">
        <div className="text-sm uppercase tracking-wide text-gray-500">{rule.domain}</div>
        <div>
          <div className="font-medium">Applies when</div>
          <ul className="list-disc pl-5 text-sm">{rule.applies_when.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
        <div>
          <div className="font-medium">Requires</div>
          <ul className="list-disc pl-5 text-sm">{rule.requires.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
        <div>
          <div className="font-medium">Relationships</div>
          {rule.relationships.length === 0 ? <div className="text-sm text-gray-600">None</div> : (
            <ul className="list-disc pl-5 text-sm">
              {rule.relationships.map((rel, i) => (
                <li key={i}><span className="uppercase text-gray-500">{rel.type}</span> → <Link className="underline" to={`/admin/knowledge/rules/${rel.target_rule_id}`}>{rel.target_rule_id}</Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-sm">
          Source: {rule.source.url ? <a className="underline text-blue-700" href={rule.source.url} target="_blank" rel="noreferrer">{rule.source.document ?? rule.source.authority}</a> : rule.source.authority}
        </div>
        <div className="text-xs text-gray-600">Status: {rule.status}</div>
      </div>
    </div>
  );
}
