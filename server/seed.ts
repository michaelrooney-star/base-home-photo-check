import { saveCase, store } from './store';
import {
  CaseFingerprint,
  CaseRecord,
  Finding,
  PackId,
  PlanNode,
  SitePhoto,
} from './types';
import { makeActivationState, type ActivationScenario } from './activation';

const uid = () => Math.random().toString(36).slice(2, 10);

export function deriveUtilityType(utility: string): 'mou' | 'tdu' {
  const u = utility.toLowerCase();
  if (u.includes('oncor') || u.includes('centerpoint')) return 'tdu';
  // Austin Energy, CPS, GUS assumed MOU
  return 'mou';
}

export function resolvePack(city: string, utility: string): PackId {
  const c = city.trim().toLowerCase();
  if (c === 'austin') return 'AUSTIN_RICH';
  if (c === 'round rock') return 'ROUNDROCK_ONCOR';
  if (c === 'dallas') return 'DALLAS_ONCOR';
  if (c === 'houston') return 'HOUSTON_STUB';
  if (c === 'san antonio') return 'SANANTONIO_STUB';
  // Fail closed for unknown
  return 'UNKNOWN_PACK';
}

// Minimal citations — do not invent numbers. Use high-level official sources only.
const packCitations: Record<PackId, Finding[]> = {
  AUSTIN_RICH: [
    {
      domain: 'PERMIT',
      summary:
        'City of Austin generally requires building/electrical permits for residential energy storage installs.',
      citations: [
        {
          label: 'City of Austin Development Services – Residential permits',
          url: 'https://www.austintexas.gov/department/development-services',
        },
      ],
      requirement: 'REQUIRES',
    },
    {
      domain: 'FIRE',
      summary:
        'Austin Fire Department publishes guidance for stationary storage safety; verify latest AFD materials.',
      citations: [
        {
          label: 'Austin Fire Department – Fire Codes and Permitting',
          url: 'https://www.austintexas.gov/department/fire',
        },
      ],
      requirement: 'REQUIRES',
    },
    {
      domain: 'UTILITY_INTERCONNECTION',
      summary:
        'Austin Energy (MOU) maintains its own interconnection processes separate from TDUs.',
      citations: [
        {
          label: 'Austin Energy – Distributed Generation/Interconnection',
          url: 'https://www.austinenergy.com/',
        },
        {
          label: 'Texas SB 1252 context: municipal utilities (MOUs) exceptions',
          url: 'https://capitol.texas.gov/',
        },
      ],
      requirement: 'REQUIRES',
    },
  ],
  ONCOR_SHARED: [
    {
      domain: 'UTILITY_INTERCONNECTION',
      summary:
        'Oncor (TDU) uses PUCT/TAC-aligned distributed generation interconnection; city permits are separate.',
      citations: [
        {
          label: 'Oncor – Distributed Generation Interconnection resources',
          url: 'https://www.oncor.com/',
        },
        {
          label: 'Texas SB 1202 / TAC references (local where applicable)',
          url: 'https://capitol.texas.gov/',
        },
      ],
      requirement: 'REQUIRES',
    },
  ],
  ROUNDROCK_ONCOR: [],
  DALLAS_ONCOR: [],
  HOUSTON_STUB: [],
  SANANTONIO_STUB: [],
  UNKNOWN_PACK: [
    {
      domain: 'PERMIT',
      summary:
        'Jurisdiction pack unknown; fail-closed until verified sources added.',
      citations: [],
      requirement: 'UNKNOWN',
    },
  ],
};

function makeFingerprint(overrides: Partial<CaseFingerprint>): CaseFingerprint {
  const base: CaseFingerprint = {
    address: '123 Main St',
    city: 'Austin',
    county: 'Travis',
    utility: 'Austin Energy',
    property_type: 'Single Family',
    equipment_type: 'ESS',
    capacity_kwh: 10,
    power_kw: 5,
    installation: 'Wall-mount garage',
    solar: true,
    service_amps: 200,
    utility_type: 'mou',
  };
  const next = { ...base, ...overrides };
  next.utility_type = deriveUtilityType(next.utility);
  return next;
}

function newCase(
  assignee: string,
  fp: CaseFingerprint,
  pack: PackId,
  photoSet: 'set-a' | 'set-b' | 'set-c' = 'set-a',
  stage: 'QUEUED' | 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'DEGRADED' | 'UNKNOWN' = 'QUEUED',
  activationRoute: CaseRecord['activationRoute'] = 'UNKNOWN',
  activationScenario?: ActivationScenario,
): CaseRecord {
  const id = uid();
  const unknown = pack === 'UNKNOWN_PACK' || stage === 'UNKNOWN';
  const status = unknown ? 'UNKNOWN' : stage === 'DEGRADED' ? 'OPS_READY' : stage;
  const activation = activationScenario
    ? makeActivationState(activationRoute, activationScenario)
    : { activationGates: [], externalEvents: [] };
  return {
    id,
    created_at: Date.now(),
    assignee,
    fingerprint: fp,
    pack,
    jobState: status,
    status,
    degraded: stage === 'DEGRADED',
    plan: stage === 'QUEUED' || unknown ? [] : stagedPlan(stage),
    why: packCitations[pack] ?? [],
    sitePhotos: mockSitePhotos(photoSet),
    activationRoute,
    ...activation,
  };
}

function stagedPlan(stage: 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'DEGRADED'): PlanNode[] {
  const ok = (findings: Finding[] = []) => ({ status: 'ok' as const, findings, attempts: 1 });
  const plan: PlanNode[] = [
    { id: 'n0_resolve_pack', wave: 0, worker: 'resolve_pack', dependsOn: [], state: 'DONE', result: ok() },
    { id: 'n1_city', wave: 1, worker: 'city', dependsOn: ['n0_resolve_pack'], state: 'DONE', result: ok() },
    { id: 'n1_electrical', wave: 1, worker: 'electrical', dependsOn: ['n0_resolve_pack'], state: 'DONE', result: ok() },
    { id: 'n1_fire', wave: 1, worker: 'fire', dependsOn: ['n0_resolve_pack'], state: 'DONE', result: ok() },
    { id: 'n1_utility_rules', wave: 1, worker: 'utility_rules', dependsOn: ['n0_resolve_pack'], state: 'DONE', result: ok() },
    { id: 'n2_reconcile', wave: 2, worker: 'reconcile', dependsOn: ['n1_city', 'n1_electrical', 'n1_fire', 'n1_utility_rules'], state: 'DONE', result: ok() },
  ];
  if (stage === 'NEEDS_REVIEW') plan[3].result = ok([{ domain: 'FIRE', summary: 'Worker result conflicts with the verified fire requirement.', citations: [], requirement: 'NO_REQUIREMENT' }]);
  if (stage === 'BLOCKED') {
    plan[1].state = 'FAILED';
    plan[1].result = { status: 'failed', error: 'City permit source could not be reconciled.', attempts: 2 };
  }
  if (stage === 'DEGRADED') {
    plan[4].state = 'FAILED';
    plan[4].result = { status: 'failed', error: 'Utility source timed out; cached verified rules used.', attempts: 2 };
  }
  return plan;
}

function mockSitePhotos(set: 'set-a' | 'set-b' | 'set-c'): SitePhoto[] {
  const path = (id: string) => `/images/cases/${set}/${id}.jpg`;
  return [
    { id: 'meter', title: 'Meter number', src: path('meter'), note: 'Customer photo · clear enough to review' },
    { id: 'wall', title: 'Whole meter wall', src: path('wall'), note: 'Customer photo · exterior context' },
    { id: 'left', title: 'Left side of meter', src: path('left'), note: 'Customer photo · side clearance' },
    { id: 'right', title: 'Right side of meter', src: path('right'), note: 'Customer photo · side clearance' },
    { id: 'breaker', title: 'Main breaker box', src: path('breaker'), note: 'Customer photo · service equipment' },
    { id: 'rating', title: 'Main disconnect rating', src: path('rating'), note: 'Customer photo · rating plate' },
    { id: 'adjacent', title: 'Adjacent wall', src: path('adjacent'), note: 'Customer photo · surrounding area' },
  ];
}

export function seedDemoCases() {
  if (store.seeded) return;
  const cases: CaseRecord[] = [];

  // Austin rich – several cases for Maya
  for (let i = 0; i < 7; i++) {
    const fp = makeFingerprint({
      address: `${100 + i} S Congress Ave`,
      city: 'Austin',
      utility: 'Austin Energy',
    });
    const activation = [
      ['AUSTIN_UTILITY_MANAGED', 'AUSTIN_WAIT'],
      ['ERCOT_ADER', 'ERCOT_CORRECTION'],
      ['ERCOT_ADER', 'TELEMETRY_PENDING'],
      ['ERCOT_ADER', 'DISPATCH_READY'],
    ][i] as [CaseRecord['activationRoute'], ActivationScenario] | undefined;
    const rec = newCase('ops_maya', fp, 'AUSTIN_RICH', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c', ['OPS_READY', 'QUEUED', 'NEEDS_REVIEW', 'BLOCKED', 'DEGRADED', 'QUEUED', 'OPS_READY'][i] as 'OPS_READY' | 'QUEUED' | 'NEEDS_REVIEW' | 'BLOCKED' | 'DEGRADED', activation?.[0], activation?.[1]);
    cases.push(rec);
  }

  // Round Rock (Oncor) – for Sam
  for (let i = 0; i < 4; i++) {
    const fp = makeFingerprint({
      address: `${200 + i} E Main St`,
      city: 'Round Rock',
      county: 'Williamson',
      utility: 'Oncor',
    });
    const rec = newCase('ops_sam', fp, 'ROUNDROCK_ONCOR', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c');
    cases.push(rec);
  }

  // Dallas (Oncor) – mix
  for (let i = 0; i < 3; i++) {
    const fp = makeFingerprint({
      address: `${300 + i} Elm St`,
      city: 'Dallas',
      county: 'Dallas',
      utility: 'Oncor',
    });
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'DALLAS_ONCOR', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c', i === 0 ? 'NEEDS_REVIEW' : 'QUEUED');
    cases.push(rec);
  }

  // San Antonio (CPS)
  for (let i = 0; i < 3; i++) {
    const fp = makeFingerprint({
      address: `${400 + i} Market St`,
      city: 'San Antonio',
      county: 'Bexar',
      utility: 'CPS Energy',
    });
    const rec = newCase('ops_sam', fp, 'SANANTONIO_STUB', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c');
    cases.push(rec);
  }

  // Houston (CenterPoint)
  for (let i = 0; i < 2; i++) {
    const fp = makeFingerprint({
      address: `${500 + i} Louisiana St`,
      city: 'Houston',
      county: 'Harris',
      utility: 'CenterPoint Energy',
    });
    const rec = newCase('ops_maya', fp, 'HOUSTON_STUB', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c', i === 0 ? 'BLOCKED' : 'QUEUED');
    cases.push(rec);
  }

  // Waco unknown – explicitly UNKNOWN_PACK
  for (let i = 0; i < 2; i++) {
    const fp = makeFingerprint({
      address: `${600 + i} Washington Ave`,
      city: 'Waco',
      county: 'McLennan',
      utility: '—',
    });
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'UNKNOWN_PACK', `set-${['a', 'b', 'c'][i % 3]}` as 'set-a' | 'set-b' | 'set-c');
    cases.push(rec);
  }

  for (const c of cases) saveCase(c);
  store.seeded = true;
}
