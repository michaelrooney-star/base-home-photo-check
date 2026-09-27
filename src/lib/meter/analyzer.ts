// Main-thread client for analyzer.worker.ts: reads text lines (PaddleOCR) and classifies images (CLIP zero-shot).
import { CANDIDATE_CLASSES, CANDIDATE_PROMPTS, SCENE_CLASSES, SCENE_PROMPTS } from '../wall/criteria.ts';
import { FRAMING_CLASSES, FRAMING_PROMPTS } from '../panel/criteria.ts';
import type { SubjectResult } from './acceptance.ts';
import { SUBJECT_CLASSES, SUBJECT_PROMPTS, type SubjectClass } from './criteria.ts';
import type { OcrLine } from './number.ts';

export const DEFAULT_SUBJECT_MODEL = 'Xenova/clip-vit-base-patch32';

/** Every CLIP question the app asks. Each set is scored separately (softmax over its own prompts). */
const SETS = {
  subject: { classes: SUBJECT_CLASSES, prompts: SUBJECT_PROMPTS },
  scene: { classes: SCENE_CLASSES, prompts: SCENE_PROMPTS },
  candidate: { classes: CANDIDATE_CLASSES, prompts: CANDIDATE_PROMPTS },
  framing: { classes: FRAMING_CLASSES, prompts: FRAMING_PROMPTS },
} as const;
export type PromptSet = keyof typeof SETS;
export const PROMPTS = (Object.keys(SETS) as PromptSet[]).flatMap(set => {
  const spec = SETS[set] as { classes: readonly string[]; prompts: Record<string, string[]> };
  return spec.classes.flatMap(c => spec.prompts[c].map(p => ({ set, c, p })));
});

export type ClassResult<C extends string> = { status: 'ok'; top: C; probs: Record<C, number> } | { status: 'loading' } | { status: 'unavailable'; error?: string };

/** Softmax over one set's prompts, then sums prompt probabilities into class probabilities. */
export function scoreSet<C extends string>(set: PromptSet, logits: number[]): { status: 'ok'; top: C; probs: Record<C, number> } {
  const idx = PROMPTS.flatMap((p, i) => (p.set === set ? [i] : []));
  const max = Math.max(...idx.map(i => logits[i])), exps = idx.map(i => Math.exp(logits[i] - max)), sum = exps.reduce((a, b) => a + b, 0);
  const classes = SETS[set].classes as unknown as readonly C[];
  const probs = Object.fromEntries(classes.map(c => [c, 0])) as Record<C, number>;
  idx.forEach((i, k) => { probs[PROMPTS[i].c as C] += exps[k] / sum; });
  const top = classes.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return { status: 'ok', top, probs };
}
/** Electric meter / gas meter / breaker panel … for the meter step. */
export const aggregate = (logits: number[]): SubjectResult => scoreSet<SubjectClass>('subject', logits);

const param = (k: string) => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(k));
/** ?subject=… (meter step) or ?scene=… (wall step) fake the classifier for offline demos and automated tests. CLIP isn't loaded then. */
const mocking = () => !!(param('subject') || param('scene'));
export function mockScene(): ClassResult<(typeof SCENE_CLASSES)[number]> | null {
  const q = param('scene'); if (!q) return null;
  if (q === 'off') return { status: 'unavailable', error: 'disabled by ?scene=off' };
  const c = ((SCENE_CLASSES as readonly string[]).includes(q) ? q : 'house_wall') as (typeof SCENE_CLASSES)[number];
  return { status: 'ok', top: c, probs: Object.fromEntries(SCENE_CLASSES.map(k => [k, k === c ? 0.9 : 0.1 / 3])) as Record<(typeof SCENE_CLASSES)[number], number> };
}
export function mockSubject(): SubjectResult | null {
  const q = param('subject');
  if (!q) return null;
  if (q === 'off') return { status: 'unavailable', error: 'disabled by ?subject=off' };
  const c = (SUBJECT_CLASSES as readonly string[]).includes(q) ? (q as SubjectClass) : 'electric_meter';
  return { status: 'ok', top: c, probs: Object.fromEntries(SUBJECT_CLASSES.map(k => [k, k === c ? 0.9 : 0.025])) as Record<SubjectClass, number> };
}

export type ModelState = 'loading' | 'ready' | 'failed';
type Status = { ocr: ModelState; subject: ModelState; error: string };
const status: Status = { ocr: 'loading', subject: mocking() ? 'ready' : 'loading', error: '' };
const listeners = new Set<(s: Status) => void>();
const emit = () => listeners.forEach(l => l({ ...status }));
export function onModelStatus(l: (s: Status) => void) { listeners.add(l); l({ ...status }); return () => { listeners.delete(l); }; }

let worker: Worker | null = null;
let ocrReady: Promise<void> | null = null;
let nextId = 0;
type WorkerResult = { lines?: OcrLine[]; ocrError?: string; logits?: number[] | number[][]; subjectError?: string; error?: string; output?: Float32Array; anchors?: number };
const pending = new Map<number, (r: WorkerResult) => void>();

export function prewarmAnalyzer(): Promise<void> {
  if (ocrReady) return ocrReady;
  ocrReady = new Promise<void>((resolve, reject) => {
    worker = new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'ocr-ready') { status.ocr = 'ready'; emit(); resolve(); }
      else if (m.type === 'ocr-error') { status.ocr = 'failed'; status.error = m.error; emit(); reject(new Error(m.error)); }
      else if (m.type === 'subject-ready') { status.subject = 'ready'; emit(); }
      else if (m.type === 'subject-error') { status.subject = 'failed'; status.error = m.error; emit(); console.warn('[meter] subject classifier failed to load:', m.error); }
      else if (m.type === 'result' || m.type === 'classified' || m.type === 'detected') { const done = pending.get(m.id); pending.delete(m.id); done?.(m); }
    };
    worker.onerror = e => { status.ocr = 'failed'; status.error = e.message || 'worker error'; emit(); reject(new Error(status.error)); };
    const params = new URLSearchParams(location.search);
    worker.postMessage({
      type: 'init',
      ortBase: new URL('/vendor/ort/', location.href).href,
      paddleBase: new URL('/vendor/paddle/', location.href).href,
      clipModel: mocking() ? null : params.get('subjectModel') || DEFAULT_SUBJECT_MODEL,
      prompts: PROMPTS.map(x => x.p),
    });
  });
  ocrReady.catch(() => { ocrReady = null; });
  return ocrReady;
}

/** Resolves once the subject classifier has finished loading (or failed), or after `ms`. */
export function waitForSubject(ms: number): Promise<void> {
  if (status.subject !== 'loading') return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    const off = onModelStatus(s => { if (s.subject !== 'loading') done(); });
    function done() { clearTimeout(timer); off?.(); resolve(); }
  });
}

export type Analysis = { lines: OcrLine[] | null; ocrError?: string; subject: SubjectResult | null };

/** OCR on `img` (sides multiple of 32, ≤960px) and, optionally, subject classification on `subjectImg`. */
export async function analyze(img: ImageData, subjectImg?: ImageData): Promise<Analysis> {
  await prewarmAnalyzer();
  const mock = mockSubject();
  const wantSubject = !!subjectImg && !mock && status.subject === 'ready';
  const id = nextId++, data = new Uint8ClampedArray(img.data);
  const subject = wantSubject ? { width: subjectImg!.width, height: subjectImg!.height, data: new Uint8ClampedArray(subjectImg!.data) } : undefined;
  const r = await new Promise<WorkerResult>(resolve => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'analyze', id, width: img.width, height: img.height, data, subject }, subject ? [data.buffer, subject.data.buffer] : [data.buffer]);
  });
  const subjectResult: SubjectResult | null = !subjectImg ? null
    : mock ? mock
    : r.logits ? aggregate(r.logits as number[])
    : status.subject === 'failed' ? { status: 'unavailable', error: status.error }
    : r.subjectError ? { status: 'unavailable', error: r.subjectError }
    : { status: 'loading' };
  return { lines: r.lines ?? null, ocrError: r.ocrError, subject: subjectResult };
}

/**
 * CLIP-only classification of several images against one prompt set (no OCR). Returns null when the classifier
 * isn't available (not loaded, failed, or mocked), so callers can fall back.
 */
export async function classifyImages<C extends string>(images: ImageData[], set: PromptSet): Promise<{ status: 'ok'; top: C; probs: Record<C, number> }[] | null> {
  await prewarmAnalyzer().catch(() => undefined);
  if (mocking() || status.subject !== 'ready' || !worker || !images.length) return null;
  const id = nextId++;
  const payload = images.map(im => ({ width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) }));
  const r = await new Promise<WorkerResult>(resolve => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'classify', id, images: payload }, payload.map(p => p.data.buffer));
  });
  if (!r.logits) return null;
  return (r.logits as number[][]).map(l => scoreSet<C>(set, l));
}

const DETECTOR_URL = () => new URL('/models/wall-objects.onnx', location.href).href;
const detectorOff = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('objects') === 'off';

/** Starts downloading the wall object detector (~21 MB, cached by the browser) before it's needed. */
export async function prewarmDetector() {
  if (detectorOff()) return;
  await prewarmAnalyzer().catch(() => undefined);
  worker?.postMessage({ type: 'detect-init', modelUrl: DETECTOR_URL() });
}

/**
 * Runs the wall object detector on `img` (already resized to the letterbox size). Returns the raw output, or null if
 * the detector is off or failed (callers then skip the clear-space check).
 */
export async function detectObjects(img: ImageData, lb: import('../wall/objects.ts').Letterbox): Promise<{ output: Float32Array; anchors: number } | null> {
  if (detectorOff()) return null;
  await prewarmAnalyzer().catch(() => undefined);
  if (!worker) return null;
  const id = nextId++, data = new Uint8ClampedArray(img.data);
  const r = await new Promise<WorkerResult>(resolve => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'detect', id, modelUrl: DETECTOR_URL(), lb, data }, [data.buffer]);
  });
  if (!r.output || !r.anchors) { console.warn('[wall] object detection failed:', r.error); return null; }
  return { output: r.output, anchors: r.anchors };
}

/** One CLIP pass over one image, scored against several prompt sets (e.g. what it is and how it's framed). */
export async function classifySets(image: ImageData, sets: PromptSet[]): Promise<Partial<Record<PromptSet, { status: 'ok'; top: string; probs: Record<string, number> }>> | null> {
  await prewarmAnalyzer().catch(() => undefined);
  if (mocking() || status.subject !== 'ready' || !worker) return null;
  const id = nextId++, payload = [{ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }];
  const r = await new Promise<WorkerResult>(resolve => { pending.set(id, resolve); worker!.postMessage({ type: 'classify', id, images: payload }, [payload[0].data.buffer]); });
  if (!r.logits) return null;
  const logits = (r.logits as number[][])[0];
  return Object.fromEntries(sets.map(set => [set, scoreSet<string>(set, logits)]));
}
