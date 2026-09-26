import { useEffect, useState } from 'react';
import { Banner } from '../ops/OpsLayout';

type AdminState = {
  counts: { total: number; byStatus: Record<string, number> };
};

export function Admin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [utilityKill, setUtilityKill] = useState(false);
  const [caseId, setCaseId] = useState('');

  async function load() {
    const res = await fetch('/api/admin/state');
    const data = await res.json();
    setState(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function reset() {
    await fetch('/api/admin/reset', { method: 'POST' });
    await load();
  }

  async function applyToggles() {
    await fetch('/api/admin/toggles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ killUtilityWorker: utilityKill }),
    });
    await load();
  }

  async function injectFireConflict() {
    if (!caseId) return;
    await fetch('/api/admin/toggles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addFireConflictCaseId: caseId }),
    });
    setCaseId('');
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Banner />
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <h1 className="font-semibold">PermitGraph — Admin</h1>
      </header>
      <main className="flex-1 p-4 space-y-6">
        <section className="space-y-2">
          <h2 className="font-medium">Demo store</h2>
          <button className="rounded bg-gray-800 text-white px-3 py-1" onClick={reset}>
            Reset and reseed
          </button>
          <div className="text-sm text-gray-600">
            Total cases: {state?.counts.total ?? '…'}; By status:{' '}
            {state ? Object.entries(state.counts.byStatus).map(([k, v]) => `${k}:${v}`).join(', ') : '…'}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Inject failure</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={utilityKill} onChange={e => setUtilityKill(e.target.checked)} />
            Kill utility worker (retry→fallback→degraded)
          </label>
          <button className="rounded bg-blue-600 text-white px-3 py-1" onClick={applyToggles}>
            Apply
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Fire conflict</h2>
          <div className="flex items-center gap-2">
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Case ID (short ok)"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            />
            <button className="rounded bg-orange-600 text-white px-3 py-1" onClick={injectFireConflict}>
              Mark conflict
            </button>
          </div>
          <div className="text-xs text-gray-600">
            When marked, the Fire worker returns NO_REQUIREMENT; reconcile flags conflict → Needs review.
          </div>
        </section>
      </main>
    </div>
  );
}
