import { Outlet, useParams } from 'react-router-dom';
import { ConsoleShell } from '../components/ConsoleShell';

export function OpsLayout() {
  const { userId } = useParams();
  return <ConsoleShell userId={userId}><Outlet /></ConsoleShell>;
}
