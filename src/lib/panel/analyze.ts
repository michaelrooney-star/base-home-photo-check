// Browser pipeline for the breaker box, rating, adjacent-wall and fence photos: gathers evidence with the same on-device
// models as the meter and wall steps, then hands it to the pure decisions in ./steps.ts.
import { analyze, classifyImages, detectObjects, mockScene, mockSubject, waitForSubject } from '../meter/analyzer.ts';
import type { SubjectClass } from '../meter/criteria.ts';
import { grab, grabExact } from '../meter/frames.ts';
import { meanLuma, ocrSize, sharpness, stretch, toGray } from '../meter/image.ts';
import { checkGround } from '../wall/ground.ts';
import type { SceneClass } from '../wall/criteria.ts';
import { decodeDetections, letterbox, type Detection } from '../wall/objects.ts';
import { readAmps } from './amps.ts';
import { decideAdjacent, decideBreaker, decideFence, decideRating, type CheckedStep, type StepResult } from './steps.ts';

const NAMES: Record<Detection['kind'], string> = { meter: 'meter', box: 'electrical box', ac: 'AC unit', opening: 'door or window' };
/** "2 electrical boxes, a door or window" */
export function listObjects(dets: Detection[]): string[] {
  const counts = new Map<string, number>();
  for (const d of dets) if ((d.x1 - d.x0) * (d.y1 - d.y0) <= 0.5) counts.set(NAMES[d.kind], (counts.get(NAMES[d.kind]) ?? 0) + 1);
  return [...counts].map(([name, n]) => n === 1 ? `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}` : `${n} ${name === 'door or window' ? 'doors or windows' : `${name}${name.endsWith('x') ? 'es' : 's'}`}`);
}

export async function analyzeStep(step: CheckedStep, url: string): Promise<StepResult> {
  const img = new Image(); img.src = url; await img.decode();
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  const small = grab(img, full, 1200);
  const g = toGray(small.data, small.width, small.height, 4000);
  const inner = { x0: g.width * 0.1, y0: g.height * 0.1, x1: g.width * 0.9, y1: g.height * 0.9 };
  const q = { luma: meanLuma(g, inner), sharpness: sharpness(stretch(g), inner) };
  const scene = async () => {
    await waitForSubject(60_000);
    return mockScene() ?? (await classifyImages<SceneClass>([grab(img, full, 336)], 'scene'))?.[0] ?? null;
  };

  if (step === 'breaker') {
    await waitForSubject(60_000);
    const subject = mockSubject() ?? (await classifyImages<SubjectClass>([grab(img, full, 336)], 'subject'))?.[0] ?? null;
    return decideBreaker({ ...q, subject });
  }
  if (step === 'rating') {
    const size = ocrSize(full.w, full.h, 960);
    const rgba = grabExact(img, full, size.width, size.height);
    const r = await readAmps({ data: rgba.data, width: rgba.width, height: rgba.height }, async i => (await analyze(new ImageData(new Uint8ClampedArray(i.data), i.width, i.height))).lines ?? []);
    return decideRating({ ...q, amps: r.amps });
  }
  const lb = letterbox(full.w, full.h);
  const raw = await detectObjects(grabExact(img, full, lb.w, lb.h), lb).catch(() => null);
  const dets = raw ? decodeDetections(raw.output, raw.anchors, lb, full.w, full.h) : [];
  // No meter here: compare the bottom of the photo with the wall band across the middle.
  const ground = checkGround({ rgba: small.data, width: small.width, height: small.height, meter: { x: -1, y: 0.45, r: null }, detections: dets }).visible;
  const s = await scene();
  return step === 'adjacent' ? decideAdjacent({ ...q, scene: s, groundSeen: ground, objects: listObjects(dets) }) : decideFence({ ...q, scene: s, groundSeen: ground });
}
