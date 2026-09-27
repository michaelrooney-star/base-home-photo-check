import { saveCase, store } from './store';
import {
  CaseFingerprint,
  CaseNote,
  CaseRecord,
  Finding,
  PackId,
  PlanNode,
  SitePhoto,
} from './types';
import { makeActivationState, type ActivationScenario } from './activation';
import { attachWorkflow } from './workflow';

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
  stage: 'QUEUED' | 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'UNKNOWN' = 'QUEUED',
  activationRoute: CaseRecord['activationRoute'] = 'UNKNOWN',
  activationScenario?: ActivationScenario,
  caseId?: string,
  notes: CaseNote[] = [],
): CaseRecord {
  const id = caseId ?? uid();
  const unknown = pack === 'UNKNOWN_PACK' || stage === 'UNKNOWN';
  const status = unknown ? 'UNKNOWN' : stage;
  const activation = activationScenario
    ? makeActivationState(activationRoute, activationScenario)
    : { activationGates: [], externalEvents: [] };
  const followUpContact = activationScenario
    ? activationRoute === 'AUSTIN_UTILITY_MANAGED'
      ? { organization: 'Austin Energy', name: 'Interconnection desk', email: 'austin-energy-demo@example.com', phone: '(512) 555-0136', url: 'https://www.austinenergy.com/', note: 'Demo contact — use the Austin Energy portal or official support route for the latest case status.' }
      : { organization: 'ERCOT / QSE', name: 'ADER registration support', email: 'ercot-ader-demo@example.com', phone: '(512) 555-0148', url: 'https://www.ercot.com/', note: 'Demo contact — confirm the QSE contact and current ERCOT procedure before sending corrections.' }
    : stage === 'BLOCKED' || stage === 'NEEDS_REVIEW'
      ? { organization: fp.utility, name: 'Utility operations contact', email: 'utility-ops-demo@example.com', phone: '(512) 555-0152', url: fp.utility === 'Austin Energy' ? 'https://www.austinenergy.com/' : undefined, note: 'Demo contact — follow up on the blocked external requirement.' }
      : undefined;
  return attachWorkflow({
    id,
    created_at: Date.now(),
    assignee,
    fingerprint: fp,
    pack,
    jobState: status,
    status,
    plan: stage === 'QUEUED' || unknown ? [] : stagedPlan(stage),
    why: packCitations[pack] ?? [],
    sitePhotos: mockSitePhotos(photoSet),
    activationRoute,
    ...activation,
    followUpContact,
    workflow: { nodes: [], events: [] },
    notes,
  });
}

function stagedPlan(stage: 'OPS_READY' | 'NEEDS_REVIEW' | 'BLOCKED'): PlanNode[] {
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

  const dataset: Array<{
    address: string;
    city: string;
    county?: string;
    utility: string;
    pack: Parameters<typeof newCase>[2];
    photoSet: 'set-a' | 'set-b' | 'set-c';
    id?: string;
    route?: CaseRecord['activationRoute'];
    scenario?: ActivationScenario;
    notes?: CaseNote[];
  }> = [
    { id: 'qot686kp', address: '100 S Congress Ave', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-a', route: 'AUSTIN_UTILITY_MANAGED', scenario: 'AUSTIN_WAIT', notes: [{ id: 'note_qot1', author: 'Maya R.', body: 'Called Austin Energy interconnection desk — waiting on PTO confirmation.', createdAt: Date.now() - 86400000 * 2 }] },
    { id: 'lel1yrft', address: '101 S Congress Ave', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-b', route: 'ERCOT_ADER', scenario: 'ERCOT_CORRECTION', notes: [{ id: 'note_lel1', author: 'Jordan K.', body: 'Premise ID mismatch — customer sent corrected utility bill for resubmission.', createdAt: Date.now() - 86400000 }] },
    { id: '63kmuo28', address: '102 S Congress Ave', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-c', route: 'ERCOT_ADER', scenario: 'TELEMETRY_PENDING' },
    { id: '608fv0c6', address: '103 S Congress Ave', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-a', route: 'ERCOT_ADER', scenario: 'DISPATCH_READY' },
    { address: '104 Barton Springs Rd', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-b', route: 'AUSTIN_UTILITY_MANAGED', scenario: 'AUSTIN_WAIT' },
    { id: '4x8q6jzs', address: '105 E 6th St', city: 'Austin', utility: 'Austin Energy', pack: 'AUSTIN_RICH', photoSet: 'set-c', route: 'ERCOT_ADER', scenario: 'ERCOT_CORRECTION' },
    { address: '200 E Main St', city: 'Round Rock', county: 'Williamson', utility: 'Oncor', pack: 'ROUNDROCK_ONCOR', photoSet: 'set-a' },
    { address: '204 E Main St', city: 'Round Rock', county: 'Williamson', utility: 'Oncor', pack: 'ROUNDROCK_ONCOR', photoSet: 'set-b' },
    { address: '300 Elm St', city: 'Dallas', county: 'Dallas', utility: 'Oncor', pack: 'DALLAS_ONCOR', photoSet: 'set-c' },
    { address: '312 Ross Ave', city: 'Dallas', county: 'Dallas', utility: 'Oncor', pack: 'DALLAS_ONCOR', photoSet: 'set-a' },
    { address: '500 Louisiana St', city: 'Houston', county: 'Harris', utility: 'CenterPoint Energy', pack: 'HOUSTON_STUB', photoSet: 'set-b' },
    { address: '400 Market St', city: 'San Antonio', county: 'Bexar', utility: 'CPS Energy', pack: 'SANANTONIO_STUB', photoSet: 'set-c' },
  ];

  dataset.forEach((item) => {
    const fp = makeFingerprint({ address: item.address, city: item.city, county: item.county, utility: item.utility });
    saveCase(newCase('base_admin', fp, item.pack, item.photoSet, 'OPS_READY', item.route ?? 'UNKNOWN', item.scenario, item.id, item.notes ?? []));
  });

  const midFp = makeFingerprint({ address: '106 S Congress Ave', city: 'Austin', utility: 'Austin Energy' });
  const midCase = newCase('base_admin', midFp, 'AUSTIN_RICH', 'set-b', 'QUEUED', 'UNKNOWN', undefined, 'perm1mid');
  midCase.workflowOverrides = {
    pack: { state: 'DONE', nextAction: 'No action required' },
    city: { state: 'RUNNING', nextAction: 'City portal review in progress' },
    electrical: { state: 'WAITING_EXTERNAL', nextAction: 'Waiting on electrical engineer sign-off' },
    fire: { state: 'PENDING', nextAction: 'Not started — blocked on parallel checks' },
    field: { state: 'PENDING', nextAction: 'Waiting for permits before scheduling crew' },
  };
  saveCase(attachWorkflow(midCase));

  const activeFp = makeFingerprint({ address: '107 S Congress Ave', city: 'Austin', utility: 'Austin Energy' });
  const activeCase = newCase('base_admin', activeFp, 'AUSTIN_RICH', 'set-c', 'QUEUED', 'UNKNOWN', undefined, 'field2run');
  activeCase.workflowOverrides = {
    pack: { state: 'DONE' },
    city: { state: 'DONE' },
    electrical: { state: 'DONE' },
    fire: { state: 'DONE' },
    field: { state: 'RUNNING', nextAction: 'Crew on site — install in progress' },
  };
  saveCase(attachWorkflow(activeCase));

  store.seeded = true;
}
