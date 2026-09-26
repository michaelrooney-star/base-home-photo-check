import { saveCase, store } from './store';
import {
  CaseFingerprint,
  CaseRecord,
  Finding,
  PackId,
} from './types';

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
  pack: PackId
): CaseRecord {
  const id = uid();
  return {
    id,
    created_at: Date.now(),
    assignee,
    fingerprint: fp,
    pack,
    jobState: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : 'QUEUED',
    status: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : 'QUEUED',
    degraded: false,
    plan: [],
    why: packCitations[pack] ?? [],
  };
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
    const rec = newCase('ops_maya', fp, 'AUSTIN_RICH');
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
    const rec = newCase('ops_sam', fp, 'ROUNDROCK_ONCOR');
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
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'DALLAS_ONCOR');
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
    const rec = newCase('ops_sam', fp, 'SANANTONIO_STUB');
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
    const rec = newCase('ops_maya', fp, 'HOUSTON_STUB');
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
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'UNKNOWN_PACK');
    cases.push(rec);
  }

  for (const c of cases) saveCase(c);
  store.seeded = true;
}
