import type { LucideIcon } from 'lucide-react';
import { BookOpen, LayoutList, Radio, ShieldCheck, Wrench } from 'lucide-react';

export type ConsoleRole = 'admin' | 'permits' | 'field' | 'activation';

export type RoleConfig = {
  role: ConsoleRole;
  productTitle: string;
  productSubtitle: string;
  blurb: string;
  topbarTitle: string;
  basePath: string;
  queueApi: string;
  caseApi: (id: string) => string;
  queueEyebrow: string;
  queueTitle: string;
  queueDescription: string;
  nav: { href: string; label: string; icon: LucideIcon }[];
};

export const ROLE_CONFIGS: Record<ConsoleRole, RoleConfig> = {
  admin: {
    role: 'admin',
    productTitle: 'Base Admin',
    productSubtitle: 'Ops Manager',
    blurb: 'Connects Hubspot, ERP, permits, field crews, and utility systems in one workflow.',
    topbarTitle: 'Ops Manager',
    basePath: '/ops/admin',
    queueApi: '/api/ops/queue/admin',
    caseApi: (id) => `/api/ops/cases/${id}`,
    queueEyebrow: 'CLIENT CASES',
    queueTitle: 'Client cases',
    queueDescription: 'Orchestrate installs across Hubspot, ERP, permits, field crews, and utility systems.',
    nav: [{ href: '/ops/admin', label: 'Cases', icon: LayoutList }],
  },
  permits: {
    role: 'permits',
    productTitle: 'Permits desk',
    productSubtitle: 'Permit KB service',
    blurb: 'Reviews jurisdiction packs and parallel city, electrical, and fire checks. Emits permit events to the orchestrator.',
    topbarTitle: 'Permits service',
    basePath: '/ops/permits',
    queueApi: '/api/permits/queue',
    caseApi: (id) => `/api/permits/cases/${id}`,
    queueEyebrow: 'PERMIT CHECKS',
    queueTitle: 'Open permit work',
    queueDescription: 'Cases waiting on pack resolution or parallel permit checks.',
    nav: [
      { href: '/ops/permits', label: 'Queue', icon: ShieldCheck },
      { href: '/admin/knowledge', label: 'Permits knowledge base', icon: BookOpen },
    ],
  },
  field: {
    role: 'field',
    productTitle: 'Field console',
    productSubtitle: 'ERP / field app',
    blurb: 'Schedules and closes install work orders. Field completion events unlock activation in Base Admin.',
    topbarTitle: 'Field service',
    basePath: '/ops/field',
    queueApi: '/api/field/queue',
    caseApi: (id) => `/api/field/cases/${id}`,
    queueEyebrow: 'WORK ORDERS',
    queueTitle: 'Field queue',
    queueDescription: 'Install crews and work orders waiting on site readiness or permit clearance.',
    nav: [{ href: '/ops/field', label: 'Queue', icon: Wrench }],
  },
  activation: {
    role: 'activation',
    productTitle: 'Activation desk',
    productSubtitle: 'Utility & ERCOT',
    blurb: 'Tracks inspection, interconnection, registration, telemetry, and dispatch gates from external systems.',
    topbarTitle: 'Activation service',
    basePath: '/ops/activation',
    queueApi: '/api/activation/queue',
    caseApi: (id) => `/api/activation/cases/${id}`,
    queueEyebrow: 'ACTIVATION GATES',
    queueTitle: 'Activation queue',
    queueDescription: 'Cases with open utility or ERCOT activation gates.',
    nav: [{ href: '/ops/activation', label: 'Queue', icon: Radio }],
  },
};

export const VIEW_LINKS = [
  { href: '/', label: 'User' },
  { href: '/ops/admin', label: 'Admin' },
  { href: '/ops/permits', label: 'Permits' },
  { href: '/ops/field', label: 'Field' },
  { href: '/ops/activation', label: 'Activation' },
] as const;
