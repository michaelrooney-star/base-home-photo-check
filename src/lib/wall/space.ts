// Where on the meter wall could a battery go? Turns detected objects (and tall plants) into blocked stretches of wall,
// then measures the clear stretches beside the meter, using the meter's glass cover as a ruler. Pure; unit-tested.
//
// Base: the battery is 3 ft wide, within 20 ft of the meter, and not in front of windows, meters or panels.
// A photo is only a sample of the wall, so a stretch that runs off the edge of the photo may continue (`open`).
import type { MeterSpot } from './assess.ts';
import { WALL_CRITERIA as C, type WallMode } from './criteria.ts';
import type { Detection, ObjectKind } from './objects.ts';

export type Side = 'left' | 'right';
export type BlockerKind = ObjectKind | 'plants';
/** A stretch of wall (shares of photo width) the battery can't go in front of. */
/** x0/x1: the stretch of wall it blocks. y0/y1: where it is in the photo, for highlighting (shares of width/height). */
export type Blocker = { kind: BlockerKind; name: string; x0: number; x1: number; y0: number; y1: number };
export type Stretch = { side: Side; x0: number; x1: number; ft: number | null; gapFt: number | null; open: boolean };
export type SpaceFinding = {
  /** Feet can be measured (meter cover size known). On angled side photos feet are a lower bound: far wall looks smaller. */
  ruler: boolean;
  /** The best clear stretch that fits the battery, if any. */
  spot: Stretch | null;
  stretches: Stretch[];
  /** The first thing beside the meter on each side (what's "in the way"), if within the photo. */
  nearest: Partial<Record<Side, Blocker>>;
  blockers: Blocker[];
  /** Sides this photo looked at: both for the straight-on photo, one for a side photo. */
  sides: Side[];
};

export const SPACE = {
  batteryFt: 3,
  maxFromMeterFt: 20,
  /** Share of plant-coloured pixels in a column, at meter height, above which the column counts as blocked by plants. */
  plantColumn: 0.3,
  /** Detections bigger than this share of the photo are usually the whole scene, not an object. */
  maxObjectArea: 0.5,
  /** A box wider than this (feet) is called a cabinet. */
  cabinetFt: 2,
};

const NAME: Record<BlockerKind, string> = { meter: 'meter', box: 'electrical box', ac: 'AC unit', opening: 'door or window', plants: 'plants' };

/** Plant-coloured share of pixels per column, within rows [y0, y1) (shares of height). */
export function greenProfile(rgba: ArrayLike<number>, width: number, height: number, y0: number, y1: number, cols = 64): number[] {
  const out: number[] = [], r0 = Math.max(0, Math.floor(y0 * height)), r1 = Math.min(height, Math.ceil(y1 * height));
  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor((c / cols) * width), x1 = Math.floor(((c + 1) / cols) * width);
    let g = 0, n = 0;
    for (let y = r0; y < r1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4, R = rgba[i], G = rgba[i + 1], B = rgba[i + 2];
      if (G > 40 && G > R * 1.02 && G > B * 1.08) g++; // loose: shaded leaves are only faintly green
      n++;
    }
    out.push(n ? g / n : 0);
  }
  // Smooth over 5 columns: a bush is patchy (gaps, shadows, dry leaves) but reads as one mass.
  return out.map((_, i) => { const w = out.slice(Math.max(0, i - 2), i + 3); return w.reduce((a, b) => a + b, 0) / w.length; });
}

/** Rows (shares of height) where tall plants would block the wall: around meter height, not the lawn in front. */
export function plantBand(m: MeterSpot): [number, number] {
  const ftShare = m.r ? (2 * m.r * 12) / C.meterCoverInches : 0.07; // one foot, as a share of photo height
  return [Math.max(0, m.y - ftShare), Math.min(1, m.y + 1.5 * ftShare)];
}

/**
 * The meter's enclosure, if the detector found it: a detection around the meter centre.
 */
export const enclosureOf = (m: { x: number; y: number }, detections: Detection[]) =>
  detections.find(d => m.x >= d.x0 && m.x <= d.x1 && m.y >= d.y0 && m.y <= d.y1 && d.x1 - d.x0 < 0.5 && d.kind !== 'opening' && d.kind !== 'ac');

/** Typical glass-cover diameter as a share of the meter enclosure's width (7 in cover on an ~11–12 in socket box). */
export const COVER_PER_ENCLOSURE = 0.6;

/**
 * Sanity-checks the ruler. If the "cover" is much smaller or bigger than the enclosure around it would suggest
 * (e.g. the round "5" of a house number was picked instead of the glass), size it from the enclosure instead.
 */
export function checkRuler(m: MeterSpot, detections: Detection[], width: number, height: number): MeterSpot {
  const box = enclosureOf(m, detections);
  if (!box) return m;
  const boxPx = (box.x1 - box.x0) * width, expected = COVER_PER_ENCLOSURE * boxPx;
  const cover = m.r ? 2 * m.r * height : null;
  if (cover != null && cover >= 0.6 * expected && cover <= 1.5 * expected) return m;
  return { ...m, x: (box.x0 + box.x1) / 2, y: Math.min(m.y, box.y0 + (box.y1 - box.y0) * 0.35), r: expected / 2 / height };
}

export function findSpace(e: { meter: MeterSpot; detections: Detection[]; green: number[]; width: number; height: number; mode: WallMode }): SpaceFinding {
  const { meter: m, width: W, height: H } = e;
  const pxPerFt = m.r ? ((2 * m.r * H) / C.meterCoverInches) * 12 : null;
  const ft = (share: number) => (pxPerFt ? (share * W) / pxPerFt : null);

  // The meter's own enclosure: a detection around the meter centre, else a span from the cover size.
  const own = enclosureOf(m, e.detections);
  const half = m.r ? (1.6 * m.r * H) / W : 0.04;
  const meterSpan: Blocker = { kind: 'meter', name: NAME.meter, x0: Math.min(own?.x0 ?? 1, m.x - half), x1: Math.max(own?.x1 ?? 0, m.x + half), y0: own?.y0 ?? m.y - 0.05, y1: own?.y1 ?? m.y + 0.05 };

  const blockers: Blocker[] = [meterSpan];
  for (const d of e.detections) {
    if (d === own) continue;
    if ((d.x1 - d.x0) * (d.y1 - d.y0) > SPACE.maxObjectArea) continue;
    if (d.y1 < m.y) continue; // mounted above the meter: out of the battery's way
    const wFt = ft(d.x1 - d.x0);
    const name = d.kind === 'box' && wFt != null && wFt >= SPACE.cabinetFt ? 'large cabinet' : d.kind === 'meter' ? 'electrical box' : NAME[d.kind];
    blockers.push({ kind: d.kind === 'meter' ? 'box' : d.kind, name, x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 });
  }
  // Tall plants: runs of plant-coloured columns.
  const cols = e.green.length;
  for (let c = 0; c < cols; ) {
    if (e.green[c] < SPACE.plantColumn) { c++; continue; }
    let d = c; // a run of plant columns, bridging gaps of up to 3 columns (a bush has holes)
    while (d < cols && [0, 1, 2, 3].some(k => d + k < cols && e.green[d + k] >= SPACE.plantColumn)) d++;
    while (d > c && e.green[d - 1] < SPACE.plantColumn) d--; // don't end the run on a gap
    blockers.push({ kind: 'plants', name: NAME.plants, x0: c / cols, x1: d / cols, y0: plantBand(m)[0], y1: 1 });
    c = d;
  }

  // Clear stretches = the rest of the width, split at the meter.
  const spans = blockers.map(b => [Math.max(0, b.x0), Math.min(1, b.x1)] as const).sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let at = 0;
  for (const [a, b] of spans) { if (a > at) free.push([at, a]); at = Math.max(at, b); }
  if (at < 1) free.push([at, 1]);

  const sides: Side[] = e.mode === 'wall' ? ['left', 'right'] : [e.mode];
  const stretches: Stretch[] = [];
  for (const [a, b] of free) {
    const side: Side = b <= meterSpan.x0 + 1e-6 ? 'left' : 'right';
    if (!sides.includes(side) || b - a < 0.005) continue;
    const gap = side === 'left' ? meterSpan.x0 - b : a - meterSpan.x1;
    stretches.push({ side, x0: a, x1: b, ft: ft(b - a), gapFt: ft(gap), open: a <= 0.001 || b >= 0.999 });
  }
  const fits = (s: Stretch) => s.ft != null && s.ft >= SPACE.batteryFt && (s.gapFt ?? 0) + SPACE.batteryFt <= SPACE.maxFromMeterFt;
  const spot = stretches.filter(fits).sort((a, b) => (a.gapFt ?? 0) - (b.gapFt ?? 0))[0] ?? null;

  const nearest: Partial<Record<Side, Blocker>> = {};
  for (const side of sides) {
    const others = blockers.filter(b => b !== meterSpan && (side === 'left' ? b.x1 <= meterSpan.x0 + 0.02 : b.x0 >= meterSpan.x1 - 0.02));
    const n = others.sort((a, b) => (side === 'left' ? b.x1 - a.x1 : a.x0 - b.x0))[0];
    if (n) nearest[side] = n;
  }
  return { ruler: pxPerFt != null, spot, stretches, nearest, blockers, sides };
}

/** "an electrical box", "a large cabinet", "plants". */
export const withArticle = (name: string) => (name === 'plants' ? name : `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`);

const round = (n: number) => (n < 1 ? '<1' : String(Math.round(n)));

/** One line for the customer's result card and for Base's reviewers. */
export function describeSpace(f: SpaceFinding): string {
  if (f.spot) {
    const s = f.spot, where = s.gapFt != null && s.gapFt >= 1 ? `, about ${round(s.gapFt)} ft ${s.side} of the meter` : ` right ${s.side} of the meter`;
    return `Clear wall for the battery: about ${round(s.ft!)}${s.open ? '+' : ''} ft${where}.`;
  }
  const parts = f.sides.map(side => {
    const n = f.nearest[side];
    if (!n) return null;
    return `${n.name} ${side} of the meter`;
  }).filter(Boolean);
  if (!f.ruler) return parts.length ? `Next to the meter: ${parts.join('; ')}.` : 'We couldn’t measure the wall in this photo.';
  return parts.length ? `No clear 3 ft stretch of wall in this photo. In the way: ${parts.join('; ')}.` : 'No clear 3 ft stretch of wall in this photo.';
}

/** What the customer reads on the result card. */
/** "an AC unit on the left and a large cabinet on the right" — the nearest thing in the way on each side, or null. */
export function inTheWay(f: SpaceFinding): string | null {
  const things = f.sides.map(s => f.nearest[s] && `${withArticle(f.nearest[s]!.name)} on the ${s}`).filter(Boolean);
  return things.length ? things.join(' and ') : null;
}

/** One short line for the result card when there's no room by the meter: what's in the way, and what happens next. */
export function noRoomLine(f: SpaceFinding): string {
  const what = inTheWay(f);
  return what ? `No room by the meter: ${what}. We’ll check along the wall next.` : 'No open wall by the meter. We’ll check along the wall next.';
}

export function customerSpaceText(f: SpaceFinding): string {
  if (f.spot) return `Good news: about ${round(f.spot.ft!)}${f.spot.open ? '+' : ''} ft of open wall to the ${f.spot.side} of your meter.`;
  const things = f.sides.map(s => f.nearest[s] && `${withArticle(f.nearest[s]!.name)} on the ${s}`).filter(Boolean);
  if (f.sides.length === 2) return things.length ? `There’s ${things.join(' and ')} of your meter. Next, we’ll look along the wall for open space.` : 'The meter, the wall around it and the ground are in view.';
  return `No open wall to the ${f.sides[0]} of your meter in this photo${things.length ? ` (${things[0]})` : ''}.`;
}

/** Base: battery 38 in wide, 36.25 in tall; 3 ft of clearance on both sides (≈9 ft of wall in all). */
export const BATTERY = { widthIn: 38, heightIn: 36.25, clearanceFt: 3 };
export type Template = { x0: number; x1: number; bx0: number; bx1: number; top: number; ground: number; fits: boolean };

/**
 * A to-scale outline of a battery and its side clearances, drawn on the whole-wall photo using the meter cover as a
 * ruler: centred on the open stretch we found (or the widest one), standing on the ground about 4½ ft below the meter
 * centre (meters are mounted 4–6 ft up). Shares of photo width/height. `fits`: nothing detected inside the outline.
 */
export function batteryTemplate(f: SpaceFinding, m: MeterSpot, width: number, height: number): Template | null {
  if (!m.r) return null;
  const pxPerIn = (2 * m.r * height) / C.meterCoverInches;
  const w = (BATTERY.widthIn * pxPerIn) / width, clear = (BATTERY.clearanceFt * 12 * pxPerIn) / width;
  // Where to draw it: the nearest stretch the whole outline fits in, else the widest stretch (it'll show what's in the way).
  const need = w + 2 * clear;
  const fitting = f.stretches.filter(t => t.x1 - t.x0 >= need).sort((a, b) => (a.gapFt ?? 0) - (b.gapFt ?? 0));
  const target = fitting[0] ?? [...f.stretches].sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
  if (!target) return null;
  const cx = (target.x0 + target.x1) / 2;
  const ground = Math.min(1, m.y + (54 * pxPerIn) / height), top = ground - (BATTERY.heightIn * pxPerIn) / height;
  const x0 = cx - w / 2 - clear, x1 = cx + w / 2 + clear;
  const fits = !!fitting.length && x0 >= 0 && x1 <= 1 && !f.blockers.some(b => b.x1 > x0 && b.x0 < x1);
  return { x0, x1, bx0: cx - w / 2, bx1: cx + w / 2, top, ground, fits };
}
