// Things on the meter wall that a battery can't go in front of: electrical boxes, cabinets, AC units, doors, windows.
// Found by an open-vocabulary detector (YOLOE-11M, text prompts baked in; scripts/export-wall-detector.py) that runs
// in the analyzer worker. This file holds the model-independent parts: input tensor, output decoding, NMS. Pure; unit-tested.

/** Must match CLASSES in scripts/export-wall-detector.py (same order). */
export const WALL_OBJECT_CLASSES = [
  'electric meter', 'electrical enclosure', 'metal electrical box', 'air conditioner condenser',
  'hvac unit', 'gas meter', 'window', 'door',
] as const;
export type WallObjectClass = (typeof WALL_OBJECT_CLASSES)[number];

/**
 * What we tell people. The detector's exact labels are shaky (a grey cabinet may score as "gas meter"), so they are
 * grouped. We never claim a gas meter from this model: a gas meter reads as an equipment box.
 */
export type ObjectKind = 'meter' | 'box' | 'ac' | 'opening';
const KIND: Record<WallObjectClass, ObjectKind> = {
  'electric meter': 'meter', 'electrical enclosure': 'box', 'metal electrical box': 'box', 'gas meter': 'box',
  'air conditioner condenser': 'ac', 'hvac unit': 'ac', window: 'opening', door: 'opening',
};
/** Minimum detector score per kind. */
export const MIN_SCORE: Record<ObjectKind, number> = { meter: 0.2, box: 0.2, ac: 0.2, opening: 0.25 };

/** Box as shares of photo width/height. */
export type Detection = { kind: ObjectKind; label: WallObjectClass; score: number; x0: number; y0: number; x1: number; y1: number };

export const DETECTOR_SIZE = 640;
export type Letterbox = { scale: number; padX: number; padY: number; w: number; h: number };
export function letterbox(width: number, height: number, size = DETECTOR_SIZE): Letterbox {
  const scale = size / Math.max(width, height), w = Math.round(width * scale), h = Math.round(height * scale);
  return { scale, padX: Math.floor((size - w) / 2), padY: Math.floor((size - h) / 2), w, h };
}

/**
 * RGBA pixels already resized to lb.w × lb.h → 1×3×size×size float tensor (RGB, 0–1, grey padding), as Ultralytics expects.
 */
export function toTensor(rgba: ArrayLike<number>, lb: Letterbox, size = DETECTOR_SIZE): Float32Array {
  const plane = size * size, out = new Float32Array(3 * plane).fill(114 / 255);
  for (let y = 0; y < lb.h; y++) for (let x = 0; x < lb.w; x++) {
    const i = (y * lb.w + x) * 4, o = (y + lb.padY) * size + x + lb.padX;
    out[o] = rgba[i] / 255; out[plane + o] = rgba[i + 1] / 255; out[2 * plane + o] = rgba[i + 2] / 255;
  }
  return out;
}

const iou = (a: Detection, b: Detection) => {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const i = w * h, u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
  return u > 0 ? i / u : 0;
};

/**
 * Decodes the detector output, shape [1, 4 + classes + extra, anchors] (cx, cy, w, h in letterbox pixels, then
 * per-class scores already through a sigmoid). Class-agnostic NMS, because the same box often scores for several labels.
 */
export function decodeDetections(out: ArrayLike<number>, anchors: number, lb: Letterbox, width: number, height: number, iouMax = 0.5): Detection[] {
  const n = WALL_OBJECT_CLASSES.length, cands: Detection[] = [];
  for (let a = 0; a < anchors; a++) {
    let best = 0, score = 0;
    for (let c = 0; c < n; c++) { const s = out[(4 + c) * anchors + a]; if (s > score) { score = s; best = c; } }
    const label = WALL_OBJECT_CLASSES[best], kind = KIND[label];
    if (score < MIN_SCORE[kind]) continue;
    const cx = out[a], cy = out[anchors + a], w = out[2 * anchors + a], h = out[3 * anchors + a];
    const px = (v: number) => Math.min(1, Math.max(0, (v - lb.padX) / lb.scale / width));
    const py = (v: number) => Math.min(1, Math.max(0, (v - lb.padY) / lb.scale / height));
    cands.push({ kind, label, score, x0: px(cx - w / 2), y0: py(cy - h / 2), x1: px(cx + w / 2), y1: py(cy + h / 2) });
  }
  cands.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of cands) if (kept.every(k => iou(k, d) < iouMax)) kept.push(d);
  return kept;
}
