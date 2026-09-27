import { Outlet, useLocation } from 'react-router-dom';
import { ConsoleShell } from '../components/ConsoleShell';
import type { ConsoleRole } from './roleConfig';

function roleFromPath(pathname: string): ConsoleRole {
  if (pathname.startsWith('/ops/permits')) return 'permits';
  if (pathname.startsWith('/ops/field')) return 'field';
  if (pathname.startsWith('/ops/activation')) return 'activation';
  return 'admin';
}

export function OpsLayout() {
  const { pathname } = useLocation();
  const role = roleFromPath(pathname);
  return <ConsoleShell role={role}><Outlet /></ConsoleShell>;
}
