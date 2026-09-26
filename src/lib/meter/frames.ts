// Pixel plumbing between the camera/photo and the analysers.
import { decide, type Decision, type SubjectResult } from './acceptance.ts';
import { analyze, waitForSubject } from './analyzer.ts';
import { glare, meanLuma, ocrSize, sharpness, stretch, toGray, type Gray } from './image.ts';
import { pickMeterNumber, type MeterObservation } from './number.ts';

export type Region = { x: number; y: number; w: number; h: number };

/** Copies `region` of a source into an RGBA ImageData of exactly width × height. */
export function grabExact(src: CanvasImageSource, region: Region, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
/** Copies `region` of a source into an RGBA ImageData no larger than maxEdge on its long side. */
export function grab(src: CanvasImageSource, region: Region, maxEdge: number): ImageData {
  const s = Math.min(1, maxEdge / Math.max(region.w, region.h));
  return grabExact(src, region, Math.max(1, Math.round(region.w * s)), Math.max(1, Math.round(region.h * s)));
}
export const gray = (img: ImageData): Gray => toGray(img.data, img.width, img.height, Math.max(img.width, img.height));

/** The guide circle's bounding square, in video pixels, for a video shown with object-fit: cover. */
export function coverRegion(box: { w: number; h: number }, video: { w: number; h: number }, circle: { cx: number; cy: number; r: number }): Region {
  const scale = Math.max(box.w / video.w, box.h / video.h);
  const offX = (video.w * scale - box.w) / 2, offY = (video.h * scale - box.h) / 2;
  const x = (circle.cx - circle.r + offX) / scale, y = (circle.cy - circle.r + offY) / scale, size = (2 * circle.r) / scale;
  const cx = Math.max(0, x), cy = Math.max(0, y);
  return { x: cx, y: cy, w: Math.min(video.w - cx, size - (cx - x)), h: Math.min(video.h - cy, size - (cy - y)) };
}

export type RegionReading = { reading: MeterObservation; subject: SubjectResult | null; luma: number; glare: number; sharpness: number };

/** OCR (+ optional subject check) on one region of a video frame or image. */
export async function readRegion(src: CanvasImageSource, region: Region, opts: { maxEdge?: number; subject?: boolean } = {}): Promise<RegionReading> {
  const size = ocrSize(region.w, region.h, opts.maxEdge ?? 960);
  const rgba = grabExact(src, region, size.width, size.height);
  const g = gray(rgba);
  const a = await analyze(rgba, opts.subject ? grab(src, region, 336) : undefined);
  if (!a.lines) throw new Error(a.ocrError || 'OCR failed');
  const inner = { x0: g.width * 0.15, y0: g.height * 0.15, x1: g.width * 0.85, y1: g.height * 0.85 };
  return { reading: pickMeterNumber(a.lines, g), subject: a.subject, luma: meanLuma(g, inner), glare: glare(g, inner), sharpness: sharpness(stretch(g), inner) };
}

export type StillAnalysis = { decision: Decision; subject: SubjectResult; debug: Record<string, unknown> };

/**
 * Full check of a captured or uploaded photo. `region` (source pixels) is the guide circle; omit for the whole image.
 * `liveNumber` is the number live guidance already read twice; the photo must agree with it.
 */
export async function analyzeStill(url: string, region?: Region, liveNumber?: string | null): Promise<StillAnalysis> {
  const img = new Image(); img.src = url; await img.decode();
  const r = region ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  await waitForSubject(90_000); // first run: the classifier may still be downloading
  const rr = await readRegion(img, r, { subject: true });
  let reading = rr.reading;
  const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
  const disagrees = !!liveNumber && reading.all_characters_certain && digits(reading.meter_number) !== digits(liveNumber);
  if (disagrees) reading = { ...reading, all_characters_certain: false };
  const subject = rr.subject ?? { status: 'unavailable' as const };
  const decision = decide({ subject, reading, luma: rr.luma, glare: rr.glare, sharpness: rr.sharpness, regionHeightPx: r.h });
  return { decision, subject, debug: { ...reading.debug, number: reading.meter_number, certain: reading.all_characters_certain, liveNumber, disagrees, digitPx: Math.round(reading.number_height_ratio * r.h), luma: Math.round(rr.luma), sharpness: Math.round(rr.sharpness), glare: rr.glare.toFixed(3), subject } };
}
