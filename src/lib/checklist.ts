// The photo checklist, grouped by what Base needs to know rather than as a fixed list of eight photos.
// Rows appear, disappear or become "not needed" as the photos come in (see wall/survey.ts). Pure; unit-tested.
import { STEPS, type Answer, type PhotoId, type Photos } from './photos.ts';
import { planWall, skippable } from './wall/survey.ts';

export type RowState = 'done' | 'todo' | 'skipped' | 'retake';
export type ChecklistRow = { id: PhotoId; title: string; state: RowState; note?: string; /** Counts toward progress. */ counts?: boolean };
export type ChecklistSection = { id: 'meter' | 'space' | 'panel'; title: string; short: string; finding?: string; rows: ChecklistRow[] };

const TITLES: Partial<Record<PhotoId, string>> = { wall: 'Whole meter wall', right: 'Along the wall — right', left: 'Along the wall — left', adjacent: 'Around the corner', fence: 'Behind the fence', breaker: 'Breaker box', rating: 'Main breaker rating', meter: 'Meter number' };

export function checklist(photos: Photos, fence: Answer, location: string) {
  const plan = planWall(photos), skip = skippable(photos) as PhotoId[];
  const row = (id: PhotoId): ChecklistRow => {
    const p = photos[id], title = TITLES[id] ?? STEPS.find(s => s.id === id)!.title;
    if (p?.status === 'retake') return { id, title, state: 'retake', note: 'Retake suggested' };
    if (p?.status === 'confirmed') {
      const c = p.check;
      const note = c?.meterNumber ? `Meter ${c.meterNumber}`
        : c?.amps ? `Reads ${c.amps} A`
        : id === 'breaker' && location ? `In the ${location === 'outside' ? 'outside wall' : location}`
        : c?.space?.spot ? `Open wall, about ${Math.round(c.space.spot.ft)}${c.space.spot.open ? '+' : ''} ft ${c.space.spot.side}`
        : c?.space && plan.spot && plan.spot.side === id ? 'Ground in front of the open wall'
        : c?.space ? 'No open wall here'
        : c?.override ? 'Sent for review' : undefined;
      return { id, title, state: 'done', note };
    }
    if (skip.includes(id)) return { id, title, state: 'skipped', note: 'Not needed' };
    if (id === 'fence' && fence !== 'yes') return { id, title, state: 'todo', note: 'Only if you have one' };
    if ((id === 'right' || id === 'left' || id === 'adjacent') && plan.hints[id]) return { id, title, state: 'todo', note: 'Look for open wall' };
    return { id, title, state: 'todo' };
  };
  // Sides in the order the survey takes them: done first, then the one it'll ask for next, then any skipped.
  const rank = (id: 'left' | 'right') => photos[id]?.status === 'confirmed' ? 0 : plan.todo.includes(id) ? 1 + plan.todo.indexOf(id) : 5;
  const sides = (['right', 'left'] as const).slice().sort((a, b) => rank(a) - rank(b));
  const space: PhotoId[] = ['wall', ...sides, 'adjacent', ...(fence === 'no' ? [] : ['fence'] as PhotoId[])];
  const sections: ChecklistSection[] = [
    { id: 'meter', title: 'Your meter', short: 'Meter', rows: [row('meter')] },
    { id: 'space', title: 'Space for the battery', short: 'Space', finding: plan.spot ? 'Open wall found' : plan.summary ? 'No open wall yet' : undefined, rows: space.map(row) },
    { id: 'panel', title: 'Your electrical panel', short: 'Panel', rows: [row('breaker'), row('rating')] },
  ];
  // Only photos still expected count: not the skipped ones, and not the fence until the customer says there is one.
  for (const r of sections.flatMap(s => s.rows)) r.counts = r.state !== 'skipped' && !(r.id === 'fence' && fence !== 'yes');
  const counted = sections.flatMap(s => s.rows).filter(r => r.counts);
  return { sections, needed: counted.length, done: counted.filter(r => r.state === 'done').length };
}
