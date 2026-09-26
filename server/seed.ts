import { saveCase, store, ensureRulesLoaded } from './store';
import {
  CaseFingerprint,
  CaseRecord,
  Finding,
  PackId,
  SitePhoto,
} from './types';
import { makePlan } from './runner';

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

function findingsForPack(pack: PackId): Finding[] {
  ensureRulesLoaded();
  const rids = store.packToRuleIds?.get(pack) ?? [];
  const out: Finding[] = [];
  for (const rid of rids) {
    const r = store.rulesById?.get(rid);
    if (!r) continue;
    out.push({
      domain: r.domain,
      summary: r.requires[0] ?? '',
      citations: r.source.url ? [{ label: r.source.document ?? r.source.authority, url: r.source.url }] : [],
      requirement: 'REQUIRES',
      ruleIds: [r.rule_id],
    });
  }
  if (out.length === 0) {
    out.push({
      domain: 'PERMIT',
      summary: 'Jurisdiction pack unknown; fail-closed until verified sources added.',
      citations: [],
      requirement: 'UNKNOWN',
    });
  }
  return out;
}

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
  demoStage: CaseRecord['demoStage'] = 'queued'
): CaseRecord {
  const id = uid();
  const initialStatus = demoStage === 'ready' || demoStage === 'degraded' ? 'OPS_READY' :
    demoStage === 'review' ? 'NEEDS_REVIEW' : demoStage === 'blocked' ? 'BLOCKED' :
    demoStage === 'unknown' ? 'UNKNOWN' : 'QUEUED';
  const initialJobState = demoStage === 'ready' || demoStage === 'degraded' ? 'OPS_READY' :
    demoStage === 'review' ? 'NEEDS_REVIEW' : demoStage === 'blocked' ? 'BLOCKED' :
    demoStage === 'unknown' ? 'UNKNOWN' : demoStage === 'running' ? 'RUNNING' : 'QUEUED';
  const rec: CaseRecord = {
    id,
    created_at: Date.now(),
    assignee,
    fingerprint: fp,
    pack,
    jobState: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : initialJobState,
    status: pack === 'UNKNOWN_PACK' ? 'UNKNOWN' : initialStatus,
    degraded: false,
    plan: [],
    why: findingsForPack(pack),
    demoStage,
    sitePhotos: sitePhotosForPack(pack),
  };
  return rec;
}

function sitePhotosForPack(pack: PackId): SitePhoto[] {
  const set = pickSet(pack);
  const base = `/demo/site-evidence/site-evidence-sets/${set}`;
  const photos = [
    { id: 'meter', title: 'Meter number', file: 'meter-number.webp' },
    { id: 'wall', title: 'Whole meter wall', file: 'whole-meter-wall.webp' },
    { id: 'left', title: 'Left side of meter', file: 'left-side.webp' },
    { id: 'right', title: 'Right side of meter', file: 'right-side.webp' },
    { id: 'breaker', title: 'Main breaker box', file: 'breaker-box.webp' },
    { id: 'rating', title: 'Main disconnect rating', file: 'disconnect-rating.webp' },
    { id: 'adjacent', title: 'Adjacent wall', file: 'adjacent-wall.webp' },
  ];
  return photos.map((p) => ({ id: p.id, title: p.title, src: `${base}/${p.file}`, note: 'Sample customer photo' }));
}

function pickSet(pack: PackId): 'set-a' | 'set-b' | 'set-c' {
  switch (pack) {
    case 'AUSTIN_RICH':
      return 'set-a';
    case 'ROUNDROCK_ONCOR':
    case 'DALLAS_ONCOR':
      return 'set-b';
    case 'HOUSTON_STUB':
    case 'SANANTONIO_STUB':
      return 'set-c';
    default:
      return Math.random() < 0.5 ? 'set-b' : 'set-c';
  }
}

export function seedDemoCases() {
  if (store.seeded) return;
  ensureRulesLoaded();
  const cases: CaseRecord[] = [];

  // A compact showcase set for Maya: each case intentionally demonstrates a different stage.
  const mayaStages: Array<{ address: string; stage: CaseRecord['demoStage'] }> = [
    { address: '105 S Congress Ave', stage: 'ready' },
    { address: '214 E 6th St', stage: 'running' },
    { address: '801 W 5th St', stage: 'review' },
    { address: '1201 E Riverside Dr', stage: 'degraded' },
    { address: '4401 Duval St', stage: 'queued' },
    { address: '2300 Barton Springs Rd', stage: 'blocked' },
    { address: '9100 Research Blvd', stage: 'unknown' },
  ];
  for (const item of mayaStages) {
    const fp = makeFingerprint({ address: item.address, city: 'Austin', utility: 'Austin Energy' });
    const rec = newCase('ops_maya', fp, item.stage === 'unknown' ? 'UNKNOWN_PACK' : 'AUSTIN_RICH', item.stage);
    if (item.stage === 'unknown') rec.plan = makePlan(rec.id);
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
    const rec = newCase('ops_sam', fp, 'ROUNDROCK_ONCOR', 'ready');
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
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'DALLAS_ONCOR', 'ready');
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
    const rec = newCase('ops_sam', fp, 'SANANTONIO_STUB', 'ready');
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
    const rec = newCase('ops_maya', fp, 'HOUSTON_STUB', 'ready');
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
    const rec = newCase(i % 2 === 0 ? 'ops_maya' : 'ops_sam', fp, 'UNKNOWN_PACK', 'unknown');
    cases.push(rec);
  }

  for (const c of cases) saveCase(c);
  store.seeded = true;
}
