import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type Rule = {
  rule_id: string;
  domain: string;
  requires: string[];
  source: { url?: string; document?: string; authority: string };
  status: string;
};

export function KnowledgePack() {
  const { packId } = useParams();
  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => {
    fetch(`/api/admin/knowledge/packs/${packId}`).then((r) => r.json()).then((d) => setRules(d.rules ?? []));
  }, [packId]);
  return (
    <div className="min-h-dvh p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Pack: {packId}</div>
        <Link className="text-blue-600 underline" to="/admin/knowledge">All packs</Link>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {rules.map((r) => (
          <Link key={r.rule_id} to={`/admin/knowledge/rules/${r.rule_id}`} className="rounded border p-3 hover:bg-gray-50">
            <div className="text-sm uppercase tracking-wide text-gray-500">{r.domain}</div>
            <div className="font-medium">{r.requires[0]}</div>
            <div className="text-xs text-gray-600 mt-1">
              {r.source.url ? <a className="underline" href={r.source.url} target="_blank" rel="noreferrer">{r.source.document ?? r.source.authority}</a> : r.source.authority}
            </div>
            <div className="mt-1 text-xs">{r.status}</div>
          </Link>
        ))}
      </div>
      {rules.length === 0 ? <div className="text-sm text-gray-600">No verified rules for this pack yet (UNKNOWN / gap).</div> : null}
    </div>
  );
}
