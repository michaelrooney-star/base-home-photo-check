// Main-thread client for analyzer.worker.ts: reads text lines (PaddleOCR) and classifies the subject (CLIP).
import type { SubjectResult } from './acceptance.ts';
import { SUBJECT_CLASSES, SUBJECT_PROMPTS, type SubjectClass } from './criteria.ts';
import type { OcrLine } from './number.ts';

export const DEFAULT_SUBJECT_MODEL = 'Xenova/clip-vit-base-patch32';
export const PROMPTS = SUBJECT_CLASSES.flatMap(c => SUBJECT_PROMPTS[c].map(p => ({ c, p })));

/** Sums per-prompt probabilities into per-class probabilities. */
export function aggregate(promptProbs: number[]): SubjectResult {
  const probs = Object.fromEntries(SUBJECT_CLASSES.map(c => [c, 0])) as Record<SubjectClass, number>;
  PROMPTS.forEach(({ c }, i) => { probs[c] += promptProbs[i] ?? 0; });
  const top = SUBJECT_CLASSES.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return { status: 'ok', top, probs };
}

/** ?subject=electric_meter|gas_meter|breaker_panel|other|off fakes the classifier (offline demos, automated tests). */
function mockSubject(): SubjectResult | null {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('subject');
  if (!q) return null;
  if (q === 'off') return { status: 'unavailable', error: 'disabled by ?subject=off' };
  const c = (SUBJECT_CLASSES as readonly string[]).includes(q) ? (q as SubjectClass) : 'electric_meter';
  return { status: 'ok', top: c, probs: Object.fromEntries(SUBJECT_CLASSES.map(k => [k, k === c ? 0.9 : 0.025])) as Record<SubjectClass, number> };
}

export type ModelState = 'loading' | 'ready' | 'failed';
type Status = { ocr: ModelState; subject: ModelState; error: string };
const status: Status = { ocr: 'loading', subject: mockSubject() ? 'ready' : 'loading', error: '' };
const listeners = new Set<(s: Status) => void>();
const emit = () => listeners.forEach(l => l({ ...status }));
export function onModelStatus(l: (s: Status) => void) { listeners.add(l); l({ ...status }); return () => { listeners.delete(l); }; }

let worker: Worker | null = null;
let ocrReady: Promise<void> | null = null;
let nextId = 0;
const pending = new Map<number, (r: { lines?: OcrLine[]; ocrError?: string; probs?: number[]; subjectError?: string }) => void>();

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
      else if (m.type === 'result') { const done = pending.get(m.id); pending.delete(m.id); done?.(m); }
    };
    worker.onerror = e => { status.ocr = 'failed'; status.error = e.message || 'worker error'; emit(); reject(new Error(status.error)); };
    const params = new URLSearchParams(location.search);
    worker.postMessage({
      type: 'init',
      ortBase: new URL('/vendor/ort/', location.href).href,
      paddleBase: new URL('/vendor/paddle/', location.href).href,
      clipModel: mockSubject() ? null : params.get('subjectModel') || DEFAULT_SUBJECT_MODEL,
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
  const r = await new Promise<Parameters<typeof pending.set>[1] extends (x: infer R) => void ? R : never>(resolve => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'analyze', id, width: img.width, height: img.height, data, subject }, subject ? [data.buffer, subject.data.buffer] : [data.buffer]);
  });
  const subjectResult: SubjectResult | null = !subjectImg ? null
    : mock ? mock
    : r.probs ? aggregate(r.probs)
    : status.subject === 'failed' ? { status: 'unavailable', error: status.error }
    : r.subjectError ? { status: 'unavailable', error: r.subjectError }
    : { status: 'loading' };
  return { lines: r.lines ?? null, ocrError: r.ocrError, subject: subjectResult };
}
