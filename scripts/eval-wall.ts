// Runs the meter-wall pipeline in Node on real photos: meter search (OpenCV), object detector (same ONNX model as the
// browser), clear-space measurement and the accept/reject decision. CLIP isn't used (the scene is assumed to be a wall).
//   npm run eval:wall                 eval/wall/real (manifest.json lists each photo's step and, optionally, the meter)
//   npm run eval:wall -- --verbose    every detection
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import * as ort from 'onnxruntime-node';
import { resizeRgba } from '../src/lib/meter/image.ts';
import { decideWall, type MeterSpot } from '../src/lib/wall/assess.ts';
import { findMeterCircles, type CvCircles, type Rgba } from '../src/lib/wall/circles.ts';
import type { WallMode } from '../src/lib/wall/criteria.ts';
import { decodeDetections, DETECTOR_SIZE, letterbox, toTensor } from '../src/lib/wall/objects.ts';
import { checkRuler, describeSpace, findSpace, greenProfile, plantBand } from '../src/lib/wall/space.ts';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const args = process.argv.slice(2), verbose = args.includes('--verbose');
const dir = args.find(a => !a.startsWith('--')) ?? 'eval/wall/real';
type Entry = { file: string; step: string; note?: string; meter?: [number, number] };
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Entry[];
const cv = (await require('@techstark/opencv-js')) as CvCircles;
const session = await ort.InferenceSession.create('public/models/wall-objects.onnx');

const load = (p: string): Rgba => {
  const buf = readFileSync(p);
  const im = p.endsWith('.png') ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { data: new Uint8ClampedArray(im.data), width: im.width, height: im.height };
};
const shrink = (src: Rgba, long: number): Rgba => {
  const s = Math.min(1, long / Math.max(src.width, src.height)), w = Math.round(src.width * s), h = Math.round(src.height * s);
  return s === 1 ? src : { data: resizeRgba(src.data, src.width, src.height, w, h), width: w, height: h };
};

for (const e of manifest) {
  const img = load(join(dir, e.file));
  if (e.step === 'meter' || e.step === 'not_meter') { if (verbose) console.log(`${e.file}: skipped (${e.step} step)`); continue; }
  const mode = e.step as WallMode;
  const small = shrink(img, 1200);
  const circles = findMeterCircles(cv, img, (s, w, h) => ({ data: resizeRgba(s.data, s.width, s.height, w, h), width: w, height: h }));
  const lb = letterbox(img.width, img.height);
  const t0 = performance.now();
  const input = toTensor(resizeRgba(img.data, img.width, img.height, lb.w, lb.h), lb);
  const out = await session.run({ images: new ort.Tensor('float32', input, [1, 3, DETECTOR_SIZE, DETECTOR_SIZE]) });
  const o = out[session.outputNames[0]];
  const dets = decodeDetections(o.data as Float32Array, o.dims[2], lb, img.width, img.height);
  const ms = performance.now() - t0;
  // Same meter pick as the browser without CLIP: circles inside a detected meter first, biggest first.
  const boxes = dets.filter(k => k.kind === 'meter' && k.score >= 0.3);
  const inside = (k: { x: number; y: number }) => boxes.some(b => k.x >= b.x0 && k.x <= b.x1 && k.y >= b.y0 && k.y <= b.y1);
  const ranked = [...circles].sort((a, b) => Number(inside(b)) - Number(inside(a)) || (inside(a) && inside(b) ? b.r - a.r : 0));
  const c = e.meter ? circles.find(k => Math.hypot(k.x - e.meter![0], k.y - e.meter![1]) < 0.05) : ranked[0];
  const picked: MeterSpot | null = c ? { x: c.x, y: c.y, r: c.r, source: 'auto' } : e.meter ? { x: e.meter[0], y: e.meter[1], r: null, source: 'tap' } : null;
  const meter = picked && checkRuler(picked, dets, img.width, img.height);

  const scene = { status: 'ok' as const, top: 'house_wall' as const, probs: { house_wall: 1, meter_closeup: 0, indoors: 0, other: 0 } };
  const d = decideWall({ scene, meter, width: img.width, height: img.height, luma: 120, sharpness: 100 }, mode);
  console.log(`\n${e.file} [${mode}] ${e.note ?? ''}`);
  console.log(`  meter: ${meter ? `x ${meter.x.toFixed(2)} y ${meter.y.toFixed(2)} r ${meter.r?.toFixed(3) ?? '—'} (${meter.source})` : 'not found'}   detector ${Math.round(ms)} ms`);
  if (verbose) for (const k of dets) console.log(`    ${k.kind.padEnd(7)} ${k.label.padEnd(26)} ${k.score.toFixed(2)}  x ${k.x0.toFixed(2)}–${k.x1.toFixed(2)} y ${k.y0.toFixed(2)}–${k.y1.toFixed(2)}`);
  console.log(`  decision: ${d.accepted ? 'ACCEPT' : 'REJECT'} ${d.reasons[0] ?? ''}`);
  if (meter) {
    const green = greenProfile(small.data, small.width, small.height, ...plantBand(meter));
    const f = findSpace({ meter, detections: dets, green, width: img.width, height: img.height, mode });
    console.log(`  space: ${describeSpace(f)}`);
    if (verbose) for (const s of f.stretches) console.log(`    clear ${s.side} ${s.x0.toFixed(2)}–${s.x1.toFixed(2)} ${s.ft?.toFixed(1) ?? '?'} ft, ${s.gapFt?.toFixed(1) ?? '?'} ft from meter${s.open ? ', runs off the photo' : ''}`);
  }
}
