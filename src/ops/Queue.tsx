import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

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

export function Queue() {
  const { userId } = useParams();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/ops/queue/${userId}`);
      const data = await res.json();
      if (!ignore) {
        setRows(data.cases ?? []);
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 4000);
    return () => {
      ignore = true;
      clearInterval(t);
    };
  }, [userId]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Queue — {userId}</h2>
        <Link className="text-blue-600 hover:underline" to="/admin">Admin</Link>
      </div>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1">Case</th>
                <th className="text-left px-2 py-1">Address</th>
                <th className="text-left px-2 py-1">City</th>
                <th className="text-left px-2 py-1">Utility</th>
                <th className="text-left px-2 py-1">Pack</th>
                <th className="text-left px-2 py-1">Job</th>
                <th className="text-left px-2 py-1">Status</th>
                <th className="text-left px-2 py-1">Badge</th>
                <th className="text-left px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1 font-mono">{r.id.slice(0, 6)}</td>
                  <td className="px-2 py-1">{r.fingerprint.address}</td>
                  <td className="px-2 py-1">{r.fingerprint.city}</td>
                  <td className="px-2 py-1">{r.fingerprint.utility}</td>
                  <td className="px-2 py-1">{r.pack}</td>
                  <td className="px-2 py-1">{r.jobState}</td>
                  <td className="px-2 py-1">
                    {r.status.replace('_', ' ')}
                  </td>
                  <td className="px-2 py-1">
                    {r.degraded ? <span className="inline-block rounded bg-yellow-100 text-yellow-800 px-2 py-0.5">degraded</span> : null}
                  </td>
                  <td className="px-2 py-1">
                    <Link className="text-blue-600 hover:underline" to={`/ops/${userId}/case/${r.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
