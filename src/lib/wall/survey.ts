// The meter-wall photos as a short survey rather than a fixed list. Base needs to see: the meter and the wall around it,
// a clear 3 ft stretch of wall within 20 ft, and the ground in front of it (which the angled side photos show).
// Like a technician, we look along the wall on the more promising side first and stop once a spot is found.
// Never more photos than Base's list (whole wall, right, left); often fewer. Pure; unit-tested.
import type { Photos } from '../photos.ts';
import { describeSpace, withArticle, type BlockerKind, type Side, type SpaceFinding } from './space.ts';

/** What a wall photo's clear-space check found, saved with the photo (PhotoCheck.space). */
export type SpaceSummary = {
  spot: { side: Side; ft: number; gapFt: number | null; open: boolean } | null;
  nearest: Partial<Record<Side, { kind: BlockerKind; name: string }>>;
  /** Largest clear stretch per side, feet (null = couldn't measure). */
  bestFt: Partial<Record<Side, number | null>>;
  sides: Side[];
  text: string;
};

export type WallPlan = {
  /** Side photos still worth taking, in order. */
  todo: Side[];
  /** Side photos we can skip, with why. */
  notNeeded: Partial<Record<Side, string>>;
  /** Instruction for the next photo of each kind (replaces the generic one). */
  hints: Partial<Record<Side | 'adjacent', string>>;
  /** Where a spot was found, if anywhere. */
  spot: (SpaceSummary['spot'] & { photo: 'wall' | Side }) | null;
  /** One line for Base's reviewers. */
  summary: string | null;
};

const other = (s: Side): Side => (s === 'right' ? 'left' : 'right');
const done = (p: Photos, id: 'wall' | Side) => p[id]?.status === 'confirmed';
const space = (p: Photos, id: 'wall' | Side) => (done(p, id) ? p[id]?.check?.space ?? null : null);

export function planWall(photos: Photos): WallPlan {
  const wall = space(photos, 'wall');
  const plan: WallPlan = { todo: [], notNeeded: {}, hints: {}, spot: null, summary: null };
  // No whole-wall photo yet, or it couldn't be analysed: Base's default order.
  if (!wall) { plan.todo = (['right', 'left'] as Side[]).filter(s => !done(photos, s)); return plan; }

  const found = (['wall', 'right', 'left'] as const).map(id => ({ id, s: space(photos, id) })).find(x => x.s?.spot);
  if (found) plan.spot = { ...found.s!.spot!, photo: found.id };

  // Which side to look along first: where the spot is, else the side with more clear wall, else the right.
  const score = (s: Side) => (wall.bestFt[s] ?? 0) + (wall.nearest[s] ? 0 : 1.5) - (wall.nearest[s]?.kind === 'plants' ? 0.5 : 0);
  const first: Side = plan.spot ? plan.spot.side : score('left') > score('right') ? 'left' : 'right';
  const sidesTaken = (['right', 'left'] as Side[]).filter(s => done(photos, s));

  if (plan.spot) {
    const s = plan.spot.side;
    if (done(photos, s)) plan.notNeeded[other(s)] = `Open wall found to the ${s} of the meter`;
    else {
      plan.todo = [s];
      plan.hints[s] = `We spotted open wall to the ${s} of your meter. Stand back and face along the wall to the ${s}, so we can see the ground in front of it.`;
      plan.notNeeded[other(s)] = `Open wall found to the ${s} of the meter`;
    }
    plan.summary = `Possible battery spot: about ${Math.round(plan.spot.ft)}${plan.spot.open ? '+' : ''} ft of clear wall ${plan.spot.side} of the meter (${plan.spot.photo === 'wall' ? 'whole-wall photo' : `${plan.spot.photo}-side photo`}).`;
    return plan;
  }

  const crowd = (s: Side) => wall.nearest[s]?.name;
  const past = (s: Side) => (crowd(s) ? ` past the ${crowd(s)}` : '');
  const intro = crowd('left') || crowd('right')
    ? `Your meter has ${[crowd('left') && `${withArticle(crowd('left')!)} on the left`, crowd('right') && `${withArticle(crowd('right')!)} on the right`].filter(Boolean).join(' and ')}. `
    : '';
  const order: Side[] = [first, other(first)];
  plan.todo = order.filter(s => !done(photos, s));
  if (plan.todo.length === 2) plan.hints[first] = `${intro}Let’s look for open wall: face along the wall to the ${first} and step back so we can see${past(first) || ' the wall and ground beside it'}.`;
  if (plan.todo.length === 1) {
    const s = plan.todo[0];
    plan.hints[s] = `No open wall to the ${other(s)} so far. Now face along the wall to the ${s} and step back so we can see${past(s) || ' the wall and ground beside it'}.`;
  }
  if (sidesTaken.length === 2) {
    plan.hints.adjacent = 'Your meter wall looks crowded. The wall around the nearest corner may have room — show it from corner to corner.';
    plan.summary = `No clear 3 ft stretch of wall seen near the meter. ${wall.text}`;
  }
  return plan;
}

/** Side photos the customer can skip. */
export const skippable = (photos: Photos): Side[] => (Object.keys(planWall(photos).notNeeded) as Side[]).filter(s => !done(photos, s));

/** The part of a clear-space finding worth saving with the photo. */
export function summarizeSpace(f: SpaceFinding): SpaceSummary {
  const bestFt: SpaceSummary['bestFt'] = {}, nearest: SpaceSummary['nearest'] = {};
  for (const side of f.sides) {
    const ft = f.stretches.filter(s => s.side === side).map(s => s.ft);
    bestFt[side] = f.ruler ? Math.max(0, ...(ft as number[])) : null;
    const n = f.nearest[side]; if (n) nearest[side] = { kind: n.kind, name: n.name };
  }
  const spot = f.spot && f.spot.ft != null ? { side: f.spot.side, ft: f.spot.ft, gapFt: f.spot.gapFt, open: f.spot.open } : null;
  return { spot, nearest, bestFt, sides: f.sides, text: describeSpace(f) };
}

/**
 * Side photo with no open wall, where the photo ends before we can see past what's in the way: worth a gentle
 * "step back / use 0.5× if you can" (the photo is still accepted).
 */
export function cantSeePast(f: SpaceFinding): string | null {
  if (f.spot || f.sides.length !== 1 || !f.ruler) return null;
  const side = f.sides[0], n = f.nearest[side];
  const edge = f.stretches.find(s => s.open);
  if (edge && (edge.ft ?? 0) >= 3) return null;
  const what = n ? `the ${n.name}` : 'the meter';
  return `We can’t see open wall past ${what} yet. If you can, step back or use the 0.5× lens to show more of the wall to the ${side}.`;
}
