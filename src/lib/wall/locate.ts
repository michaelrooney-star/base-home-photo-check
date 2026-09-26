// Browser pipeline for a captured / uploaded whole-wall photo: scene check, meter search, and final decision.
import { classifyImages, detectObjects, mockScene, onModelStatus, waitForSubject } from '../meter/analyzer.ts';
import { grab, grabExact } from '../meter/frames.ts';
import { meanLuma, resizeRgba, sharpness, stretch, toGray } from '../meter/image.ts';
import { decideWall, type MeterSpot, type SceneResult, type WallDecision } from './assess.ts';
import { circleNear, findMeterCircles, loadCv, type Circle, type Rgba } from './circles.ts';
import { WALL_CRITERIA, type CandidateClass, type SceneClass, type WallMode } from './criteria.ts';
import { decodeDetections, letterbox, type Detection } from './objects.ts';
import { checkGround, type GroundCheck } from './ground.ts';
import { checkRuler, findSpace, greenProfile, plantBand, type SpaceFinding } from './space.ts';

export type Candidate = { circle: Circle; p: number | null };
export type WallAnalysis = {
  img: HTMLImageElement;
  rgba: Rgba; // analysed copy (≤1200 px, box-filtered), same aspect as the photo
  scene: SceneResult;
  candidates: Candidate[];
  /** Our best guess at the meter, to confirm with the customer. `confident` = the classifier agreed it's a meter. */
  proposal: (MeterSpot & { confident: boolean }) | null;
  luma: number;
  sharpness: number;
  /** Boxes, cabinets, AC units, doors and windows; null if the detector is off or failed. */
  detections: Detection[] | null;
};

let subjectFailed = false;
onModelStatus(s => { subjectFailed = s.subject === 'failed'; });

const boxResize = (src: Rgba, w: number, h: number): Rgba => ({ data: resizeRgba(src.data, src.width, src.height, w, h), width: w, height: h });

export async function analyzeWallPhoto(url: string): Promise<WallAnalysis> {
  const img = new Image(); img.src = url; await img.decode();
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  // Pixels at (up to) full resolution; all downsizing is box-filtered so results don't depend on the browser's scaler.
  const src = grab(img, full, 4096);
  const s = Math.min(1, 1200 / Math.max(src.width, src.height));
  const rgba = s === 1 ? { data: src.data, width: src.width, height: src.height } : boxResize(src, Math.round(src.width * s), Math.round(src.height * s));
  const g = toGray(rgba.data, rgba.width, rgba.height, 4000), W = rgba.width, H = rgba.height;
  const inner = { x0: W * 0.1, y0: H * 0.1, x1: W * 0.9, y1: H * 0.9 };

  await waitForSubject(90_000); // first visit: the classifier may still be downloading
  const scene: SceneResult = mockScene()
    ?? (await classifyImages<SceneClass>([grab(img, full, 336)], 'scene'))?.[0]
    ?? { status: 'unavailable', error: subjectFailed ? 'photo recognition failed to load' : 'photo recognition not ready' };

  // Round shapes are meter candidates (the glass cover); CLIP says which, if any, looks like an electric meter.
  let found: { x: number; y: number; r: number }[] = [];
  try { found = findMeterCircles(await loadCv(), src, boxResize).slice(0, 6); } catch (e) { console.warn('[wall] circle search failed', e); }
  const circles: Circle[] = found.map(c => ({ x: c.x * W, y: c.y * H, r: c.r * H }));
  const crops = found.map(c => grab(img, { x: Math.max(0, (c.x - c.r * 2.5 * full.h / full.w) * full.w), y: Math.max(0, (c.y - c.r * 2.5) * full.h), w: c.r * 5 * full.h, h: c.r * 5 * full.h }, 224));
  const scored = await classifyImages<CandidateClass>(crops, 'candidate');
  const candidates: Candidate[] = circles.map((circle, i) => ({ circle, p: scored ? scored[i].probs.electric_meter : null }));
  // Objects on the wall: they help pick the meter and feed the clear-space check once the meter is confirmed.
  const lb = letterbox(full.w, full.h);
  const raw = await detectObjects(grabExact(img, full, lb.w, lb.h), lb).catch(() => null);
  const detections = raw ? decodeDetections(raw.output, raw.anchors, lb, full.w, full.h) : null;
  // A circle inside a detected meter, and the biggest one there (the glass cover, not a round digit), ranks first.
  const meterBoxes = (detections ?? []).filter(d => d.kind === 'meter' && d.score >= 0.3);
  const inMeter = (c: Candidate) => meterBoxes.some(d => c.circle.x / W >= d.x0 && c.circle.x / W <= d.x1 && c.circle.y / H >= d.y0 && c.circle.y / H <= d.y1);
  const ranked = [...candidates].sort((a, b) => Number(inMeter(b)) - Number(inMeter(a)) || (inMeter(a) && inMeter(b) ? b.circle.r - a.circle.r : 0));
  const best = scored
    ? ranked.filter(c => (c.p ?? 0) >= WALL_CRITERIA.minMeterCandidate).sort((a, b) => b.p! - a.p!)[0]
    : ranked[0]; // classifier unavailable: offer the most plausible circle, the customer confirms
  const proposal = best ? { x: best.circle.x / W, y: best.circle.y / H, r: best.circle.r / H, source: 'auto' as const, confident: !!scored } : null;
  return { img, rgba, scene, candidates, proposal, luma: meanLuma(g, inner), sharpness: sharpness(stretch(g), inner), detections };
}

/** Turns a tap (shares of photo width/height) into a meter spot, measuring the cover if a circle is there. */
export async function spotFromTap(a: WallAnalysis, x: number, y: number): Promise<MeterSpot> {
  let r: number | null = null;
  try { const c = circleNear(await loadCv(), a.rgba, x * a.rgba.width, y * a.rgba.height); if (c) { r = c.r / a.rgba.height; x = c.x / a.rgba.width; y = c.y / a.rgba.height; } } catch { /* keep the tap, no size */ }
  return { x, y, r, source: 'tap' };
}

export const decide = (a: WallAnalysis, meter: MeterSpot | null, mode: WallMode = 'wall', limitedSpace = false): WallDecision =>
  decideWall({ scene: a.scene, meter, width: a.img.naturalWidth, height: a.img.naturalHeight, luma: a.luma, sharpness: a.sharpness, limitedSpace, groundSeen: meter ? groundOf(a, meter).visible : undefined }, mode);

/** Is the ground in the photo (ground.ts)? */
export const groundOf = (a: WallAnalysis, meter: MeterSpot): GroundCheck =>
  checkGround({ rgba: a.rgba.data, width: a.rgba.width, height: a.rgba.height, meter, detections: a.detections ?? [] });

/** Clear wall beside the confirmed meter, or null without the detector. */
export function measureSpace(a: WallAnalysis, meter: MeterSpot, mode: WallMode): SpaceFinding | null {
  if (!a.detections) return null;
  const green = greenProfile(a.rgba.data, a.rgba.width, a.rgba.height, ...plantBand(meter));
  return findSpace({ meter, detections: a.detections, green, width: a.img.naturalWidth, height: a.img.naturalHeight, mode });
}

/** The confirmed meter with a sanity-checked ruler (see checkRuler). */
export const withRuler = (a: WallAnalysis, meter: MeterSpot | null): MeterSpot | null =>
  meter && a.detections ? checkRuler(meter, a.detections, a.img.naturalWidth, a.img.naturalHeight) : meter;
