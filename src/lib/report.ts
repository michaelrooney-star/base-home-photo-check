// What Base's team would receive when the customer finishes: the photos plus what the app found in them.
// The same summary drives the Review page, the "What happens next" screen and the downloadable report. Pure; unit-tested.
import { checklist, type ChecklistSection } from './checklist.ts';
import type { Answer, Notes, Photos } from './photos.ts';
import { planWall } from './wall/survey.ts';

export type Finding = { label: string; value: string; missing?: boolean };
export type Report = {
  ready: boolean;
  /** Photos still expected (not taken, or flagged for a retake). */
  missing: string[];
  findings: Finding[];
  sections: ChecklistSection[];
  /** Everything a reviewer should know that the customer told us or the checks noted. */
  reviewerNotes: string[];
};

const answer = (a: Answer) => (a === 'yes' ? 'Yes' : a === 'no' ? 'No' : a === 'unsure' ? 'Not sure' : null);

export function buildReport(photos: Photos, fence: Answer, location: string, notes: Notes): Report {
  const c = checklist(photos, fence, location), plan = planWall(photos);
  const rows = c.sections.flatMap(s => s.rows);
  const missing = rows.filter(r => r.counts && r.state !== 'done').map(r => r.title);
  const meter = photos.meter?.status === 'confirmed' ? photos.meter.check?.meterNumber ?? 'Photo taken, number not read' : null;
  const amps = photos.rating?.status === 'confirmed' ? (photos.rating.check?.amps ? `${photos.rating.check.amps} A` : 'Photo taken, number not read') : null;
  const space = plan.spot
    ? `About ${Math.round(plan.spot.ft)}${plan.spot.open ? '+' : ''} ft of open wall ${plan.spot.side} of the meter`
    : photos.wall?.status === 'confirmed' ? (plan.summary ? 'No open 3 ft stretch seen near the meter' : 'Photos taken; not measured') : null;
  const findings: Finding[] = [
    { label: 'Meter number', value: meter ?? 'Missing', missing: !meter },
    { label: 'Space for the battery', value: space ?? 'Missing', missing: !space },
    { label: 'Main breaker', value: amps ?? 'Missing', missing: !amps },
    { label: 'Breaker box location', value: location ? (location === 'not sure' ? 'Not sure' : location[0].toUpperCase() + location.slice(1)) : 'Not answered', missing: !location },
    { label: 'Solar panels', value: answer(notes.solar) ?? 'Not answered', missing: !notes.solar },
    { label: 'Fence along the meter wall', value: answer(fence) ?? 'Not answered', missing: !fence },
  ];
  const reviewerNotes = [
    ...(plan.summary ? [plan.summary] : []),
    ...rows.flatMap(r => {
      const p = photos[r.id], ch = p?.check;
      if (!p || p.status !== 'confirmed') return [];
      return [
        ...(ch?.override ? [`${r.title}: sent without passing the on-device check (${ch.reasons[0] ?? 'see photo'}).`] : []),
        ...(ch?.details && !(plan.summary && ch.details.includes(plan.summary)) ? [`${r.title}: ${ch.details}`] : []),
        ...(p.source === 'sample' ? [`${r.title}: Base guide sample, not this home.`] : []),
      ];
    }),
    ...(notes.text.trim() ? [`Customer note: ${notes.text.trim()}`] : []),
  ];
  return { ready: missing.length === 0 && !!notes.solar && !!fence && fence !== 'unsure' && !!location, missing, findings, sections: c.sections, reviewerNotes };
}

/** Plain-text version (copy / email / the downloaded file's summary). */
export function reportText(r: Report): string {
  return [
    'Base Home Photo Check — summary',
    '',
    ...r.findings.map(f => `${f.label}: ${f.value}`),
    ...(r.missing.length ? ['', `Still needed: ${r.missing.join(', ')}`] : []),
    ...(r.reviewerNotes.length ? ['', 'Notes for reviewers:', ...r.reviewerNotes.map(n => `- ${n}`)] : []),
  ].join('\n');
}
