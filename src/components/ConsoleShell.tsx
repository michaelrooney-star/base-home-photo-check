import { ArrowRight, BookOpen, LayoutList, Settings2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

type ConsoleShellProps = {
  children: ReactNode;
  userId?: string;
};

export type StatusTone = 'ready' | 'queued' | 'review' | 'danger' | 'muted';

export function StatusPill({ children, tone = 'muted' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`console-status console-status-${tone}`}>{children}</span>;
}

export function statusTone(status: string, degraded = false): StatusTone {
  if (degraded || status === 'NEEDS_REVIEW') return 'review';
  if (status === 'OPS_READY') return 'ready';
  if (status === 'BLOCKED') return 'danger';
  if (status === 'QUEUED') return 'queued';
  return 'muted';
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPS_READY: 'Ready for review',
    QUEUED: 'Waiting to run',
    NEEDS_REVIEW: 'Review required',
    BLOCKED: 'Blocked',
    UNKNOWN: 'Setup needed',
    PENDING: 'Waiting to run',
    RUNNING: 'Running',
    DONE: 'Complete',
    FAILED: 'Failed',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

function navItems(userId: string) {
  return [
    { href: `/ops/${userId}`, label: 'Cases', icon: LayoutList },
    { href: '/admin', label: 'Demo controls', icon: Settings2 },
    { href: '/admin/knowledge', label: 'Rules library', icon: BookOpen },
  ];
}

export function ConsoleShell({ children, userId = 'ops_maya' }: ConsoleShellProps) {
  const location = useLocation();
  const items = navItems(userId);
  const active = (href: string) => href === '/admin' ? location.pathname === '/admin' : href === '/admin/knowledge' ? location.pathname.startsWith('/admin/knowledge') : location.pathname.startsWith('/ops');

  return (
    <div className="console-shell">
      <aside className="console-rail" aria-label="Console navigation">
        <Link to="/" className="console-brand" aria-label="Base Power home">base<span>.</span></Link>
        <div className="console-rail-product">Base Operations<br /><span>Permit review console</span></div>
        <span className="console-demo-badge">INTERACTIVE DEMO</span>
        <nav className="console-nav">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} to={href} className={`console-nav-item ${active(href) ? 'is-active' : ''}`}>
              <Icon size={18} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="console-rail-note"><span className="console-live-dot" /> Demo store resets on cold start</div>
      </aside>

      <div className="console-surface">
        <header className="console-topbar">
          <Link to="/" className="console-mobile-brand" aria-label="Base Power home">base<span>.</span></Link>
          <div className="console-topbar-title"><strong>Base Operations</strong><span>Permit review console</span></div>
          <span className="console-env-badge">OPS DEMO · local store</span>
          <Link to="/" className="console-return-link">Photo check <ArrowRight size={15} /></Link>
        </header>

        <main className="console-main">{children}</main>

        <footer className="console-footer">
          <span>Good energy starts at home.</span>
          <span>Private by design. Nothing gets sent.</span>
          <span>BASE POWER © {new Date().getFullYear()}</span>
        </footer>

        <nav className="console-mobile-nav" aria-label="Mobile console navigation">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} to={href} className={`console-mobile-nav-item ${active(href) ? 'is-active' : ''}`}>
              <Icon size={19} /><span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
