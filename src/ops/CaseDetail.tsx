import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type Finding = {
  domain: string;
  summary: string;
  citations: { label: string; url?: string }[];
  requirement?: string;
};

type CaseRec = {
  id: string;
  assignee: string;
  pack: string;
  jobState: string;
  status: string;
  degraded: boolean;
  fingerprint: {
    address: string;
    city: string;
    utility: string;
    service_amps: number;
  };
  why: Finding[];
  plan: { id: string; worker: string; state: string }[];
};

export function CaseDetail() {
  const { userId, caseId } = useParams();
  const [rec, setRec] = useState<CaseRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/ops/cases/${caseId}`);
    const data = await res.json();
    setRec(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function planRun() {
    setPlanning(true);
    await fetch(`/api/ops/cases/${caseId}/plan`, { method: 'POST' });
    await load();
    setPlanning(false);
  }

  if (loading || !rec) return <div>Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link className="text-blue-600 hover:underline" to={`/ops/${userId}`}>← Back</Link>
        <h2 className="text-lg font-medium">Case {rec.id.slice(0, 6)}</h2>
        <span className="text-sm text-gray-500">Pack: {rec.pack}</span>
        <span className="text-sm">Job: {rec.jobState}</span>
        <span className="text-sm">Status: {rec.status.replace('_', ' ')}</span>
        {rec.degraded ? <span className="text-sm rounded bg-yellow-100 text-yellow-800 px-2 py-0.5">degraded</span> : null}
        <button
          className="ml-auto rounded bg-blue-600 text-white px-3 py-1 disabled:opacity-50"
          onClick={planRun}
          disabled={planning || rec.status === 'UNKNOWN'}
        >
          {planning ? 'Planning…' : 'Plan'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 border rounded p-3">
          <h3 className="font-medium mb-2">Plan</h3>
          <ul className="space-y-1">
            {rec.plan.map((n) => (
              <li key={n.id} className="flex items-center gap-2">
                <span className="w-36 text-xs uppercase tracking-wide text-gray-500">{n.worker.replace('_', ' ')}</span>
                <span className="text-sm">{n.state}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border rounded p-3">
          <h3 className="font-medium mb-2">Why?</h3>
          <div className="space-y-3">
            {rec.why.length === 0 ? (
              <div className="text-sm text-gray-500">No findings yet.</div>
            ) : (
              rec.why.map((f, idx) => (
                <div key={idx} className="text-sm">
                  <div className="font-medium">{f.domain}</div>
                  <div>{f.summary}</div>
                  {f.citations.length > 0 ? (
                    <ul className="list-disc pl-5 text-blue-700">
                      {f.citations.map((c, i) => (
                        <li key={i}>
                          {c.url ? <a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.label}</a> : c.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-xs text-gray-500">
            Findings encode only verified, citation-backed facts. No invented setbacks.
          </div>
        </div>
      </div>
    </div>
  );
}
