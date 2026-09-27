import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { VIEW_LINKS } from '../ops/roleConfig';

function isViewActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

export function ViewSwitcher({ variant = 'console' }: { variant?: 'console' | 'member' }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = VIEW_LINKS.find((link) => isViewActive(location.pathname, link.href)) ?? VIEW_LINKS[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function reset() {
    if (!window.confirm('Reset the demo store? All case changes will be cleared and seed data restored.')) return;
    setResetting(true);
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      window.alert('Could not reset the demo store. Is the API running?');
      setResetting(false);
    }
  }

  return (
    <div className={`view-switcher view-switcher-${variant}`} ref={rootRef}>
      <button
        type="button"
        className="view-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current view: ${current.label}. Open demo menu`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="view-switcher-value">{current.label}</span>
        <ChevronDown size={14} className={open ? 'view-switcher-chevron is-open' : 'view-switcher-chevron'} />
      </button>
      {open && (
        <div className="view-switcher-menu" role="menu" aria-label="Demo menu">
          {VIEW_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              role="menuitem"
              aria-current={isViewActive(location.pathname, link.href) ? 'page' : undefined}
              className={isViewActive(location.pathname, link.href) ? 'is-active' : ''}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="view-switcher-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="view-switcher-reset"
            onClick={() => void reset()}
            disabled={resetting}
          >
            <RotateCcw size={13} className={resetting ? 'console-spin' : ''} />
            {resetting ? 'Resetting…' : 'Reset DB'}
          </button>
        </div>
      )}
    </div>
  );
}
