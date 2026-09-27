import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ROLE_CONFIGS, VIEW_LINKS, type ConsoleRole } from '../ops/roleConfig';

type ConsoleShellProps = {
  children: ReactNode;
  role?: ConsoleRole;
};

export type StatusTone = 'ready' | 'queued' | 'review' | 'danger' | 'muted';

export function StatusPill({ children, tone = 'muted' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`console-status console-status-${tone}`}>{children}</span>;
}

export function statusTone(status: string, _degraded = false): StatusTone {
  if (status === 'NEEDS_REVIEW') return 'review';
  if (status === 'OPS_READY') return 'ready';
  if (status === 'BLOCKED') return 'danger';
  if (status === 'QUEUED') return 'queued';
  return 'muted';
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPS_READY: 'Review done',
    QUEUED: 'Review not done',
    NEEDS_REVIEW: 'Review required',
    BLOCKED: 'Blocked',
    UNKNOWN: 'Setup needed',
    PENDING: 'Review not done',
    RUNNING: 'Running',
    DONE: 'Complete',
    FAILED: 'Failed',
  };
  return labels[status] ?? status.replaceAll('_', ' ');
}

export function ConsoleShell({ children, role = 'admin' }: ConsoleShellProps) {
  const location = useLocation();
  const [railCollapsed, setRailCollapsed] = useState(false);
  const config = ROLE_CONFIGS[role];
  const items = config.nav;

  const active = (href: string) => {
    if (href === '/admin/knowledge') return location.pathname.startsWith('/admin/knowledge');
    if (href === '/ops/admin') return location.pathname.startsWith('/ops/admin');
    if (href === '/ops/permits') return location.pathname.startsWith('/ops/permits');
    return location.pathname.startsWith(href);
  };

  const viewActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <div className={`console-shell ${railCollapsed ? 'is-rail-collapsed' : ''}`}>
      <aside className="console-rail" aria-label="Console navigation">
        <div className="console-rail-top">
          <Link to="/" className="console-brand" aria-label="Base Power home">base<span>.</span></Link>
          <button className="console-rail-toggle" onClick={() => setRailCollapsed((v) => !v)} aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {railCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <div className="console-rail-product">{config.productTitle}<br /><span>{config.productSubtitle}</span></div>
        <p className="console-rail-blurb">{config.blurb}</p>
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
          <div className="console-topbar-title"><strong>{config.topbarTitle}</strong></div>
          <span className="console-env-badge">OPS DEMO · local store</span>
          <nav className="console-view-switcher" aria-label="Switch view">
            {VIEW_LINKS.map((link) => (
              <Link key={link.href} to={link.href} className={viewActive(link.href) ? 'is-active' : ''}>{link.label}</Link>
            ))}
          </nav>
        </header>

        <main className="console-main">{children}</main>

        <footer className="console-footer">
          <span>Good energy starts at home.</span>
          <span>Systems of record stay in Hubspot, ERP, and utilities — this view joins their events.</span>
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
