import { Link, Outlet, useParams } from 'react-router-dom';

export function Banner() {
  return (
    <div className="w-full bg-yellow-100 text-yellow-900 text-sm px-4 py-2 border-b border-yellow-300">
      <strong>OPS DEMO:</strong> Demo store resets on cold start/redeploy.
    </div>
  );
}

export function OpsLayout() {
  const { userId } = useParams();
  return (
    <div className="min-h-dvh flex flex-col">
      <Banner />
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <h1 className="font-semibold">PermitGraph — Ops</h1>
        <nav className="flex items-center gap-4">
          <Link className="text-blue-600 hover:underline" to={`/ops/${userId}`}>Queue</Link>
          <Link className="text-blue-600 hover:underline" to="/admin">Admin</Link>
        </nav>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
