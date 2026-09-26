import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type PackItem = {
  packId: string;
  name: string;
  counts: { total: number; byStatus: Record<string, number> };
};

export function KnowledgeHome() {
  const [packs, setPacks] = useState<PackItem[]>([]);
  useEffect(() => {
    fetch('/api/admin/knowledge/packs').then((r) => r.json()).then((d) => setPacks(d.packs ?? []));
  }, []);
  return (
    <div className="min-h-dvh p-4 space-y-4">
      <h1 className="text-lg font-semibold">PermitGraph — Knowledge</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {packs.map((p) => (
          <Link key={p.packId} to={`/admin/knowledge/packs/${p.packId}`} className="rounded border p-3 hover:bg-gray-50">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-gray-600">
              Rules: {p.counts.total} · verified {p.counts.byStatus?.verified ?? 0} · candidate {p.counts.byStatus?.candidate ?? 0}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
