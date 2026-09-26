// Web Worker that runs both on-device models, so the camera preview never stutters:
//  • PaddleOCR (PP-OCRv4 text detection + recognition, ~16 MB, self-hosted) finds and reads text lines.
//  • CLIP (Transformers.js, ~150 MB from Hugging Face on first use, then browser-cached) answers
//    "is this an electric meter, a gas meter, a breaker panel…?" by comparing the image with text prompts.
//  • An object detector (YOLOE-11M, ~21 MB, self-hosted) finds boxes, cabinets, AC units, doors and windows on the meter wall.
// Photos never leave the device.
import Ocr, { ImageRawBase, registerBackend, type Line } from '@gutenye/ocr-common';
import { splitIntoLineImages } from '@gutenye/ocr-common/splitIntoLineImages';
import { RawImage } from '@huggingface/transformers';
import { env as ortEnv, InferenceSession, Tensor } from 'onnxruntime-web/webgpu';
import { DETECTOR_SIZE, toTensor, type Letterbox } from '../wall/objects.ts';
import { loadClip, type Clip } from './clip.ts';

/** PaddleOCR's image adapter, rebuilt on OffscreenCanvas so it works inside a worker. */
class WorkerImageRaw extends ImageRawBase {
  declare data: Uint8ClampedArray;
  constructor({ data, width, height }: { data: ArrayLike<number>; width: number; height: number }) {
    const pixels = Uint8ClampedArray.from(data as ArrayLike<number>);
    super({ data: pixels, width, height }); this.data = pixels;
  }
  static async open(url: string) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height); return new WorkerImageRaw(d);
  }
  async resize({ width, height }: { width?: number; height?: number }) {
    const W = width || Math.round((this.width / this.height) * height!), H = height || Math.round((this.height / this.width) * width!);
    const src = new OffscreenCanvas(this.width, this.height); src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.width, this.height), 0, 0);
    const dst = new OffscreenCanvas(W, H), ctx = dst.getContext('2d')!; ctx.drawImage(src, 0, 0, W, H);
    return new WorkerImageRaw(ctx.getImageData(0, 0, W, H));
  }
  async drawBox() { return this; }
  async write() {}
}
const FileUtils = { async read(url: string) { return (await fetch(url)).text(); } };

type InitMsg = { type: 'init'; ortBase: string; paddleBase: string; clipModel: string | null; prompts: string[] };
type ClassifyMsg = { type: 'classify'; id: number; images: { width: number; height: number; data: Uint8ClampedArray }[] };
type DetectMsg = { type: 'detect'; id: number; modelUrl: string; lb: Letterbox; data: Uint8ClampedArray } | { type: 'detect-init'; modelUrl: string };
type AnalyzeMsg = { type: 'analyze'; id: number; width: number; height: number; data: Uint8ClampedArray; subject?: { width: number; height: number; data: Uint8ClampedArray } };

let ocr: Promise<Ocr> | null = null;
let clip: Promise<Clip> | null = null;
let detector: Promise<InferenceSession> | null = null;
let queue: Promise<unknown> = Promise.resolve(); // one inference at a time

function init(m: InitMsg) {
  // Self-hosted ONNX Runtime WebAssembly (scripts/copy-vendor.mjs) instead of a CDN. Same variant choice as
  // Transformers.js: the asyncify build, except on Safari < 26 without WebGPU.
  const safari = /Version\/(\d+)[\d.]* .*Safari/.exec(navigator.userAgent);
  const variant = safari && Number(safari[1]) < 26 && !('gpu' in navigator) ? '' : '.asyncify';
  ortEnv.wasm.wasmPaths = { mjs: `${m.ortBase}ort-wasm-simd-threaded${variant}.mjs`, wasm: `${m.ortBase}ort-wasm-simd-threaded${variant}.wasm` };
  registerBackend({ FileUtils, ImageRaw: WorkerImageRaw, InferenceSession, splitIntoLineImages } as never);
  ocr ??= Ocr.create({ models: { detectionPath: m.paddleBase + 'det.onnx', recognitionPath: m.paddleBase + 'rec.onnx', dictionaryPath: m.paddleBase + 'keys.txt' } });
  ocr.then(() => self.postMessage({ type: 'ocr-ready' }), e => { ocr = null; self.postMessage({ type: 'ocr-error', error: String(e?.message ?? e) }); });
  if (m.clipModel) {
    // Load CLIP after OCR so the number reader is ready first.
    clip ??= ocr.catch(() => undefined).then(() => loadClip(m.clipModel!, m.prompts, 'wasm'));
    clip.then(() => self.postMessage({ type: 'subject-ready' }), e => { clip = null; self.postMessage({ type: 'subject-error', error: String(e?.message ?? e) }); });
  }
}

async function analyze(m: AnalyzeMsg) {
  const out: { type: 'result'; id: number; lines?: Line[]; ocrError?: string; logits?: number[]; subjectError?: string } = { type: 'result', id: m.id };
  try { out.lines = (await (await ocr!).detect({ data: m.data, width: m.width, height: m.height })).texts; }
  catch (e) { out.ocrError = String((e as Error)?.message ?? e); }
  if (m.subject) {
    try {
      if (!clip) throw new Error('Meter recognition is not loaded');
      out.logits = await (await clip).classify(new RawImage(m.subject.data, m.subject.width, m.subject.height, 4));
    } catch (e) { out.subjectError = String((e as Error)?.message ?? e); }
  }
  return out;
}

/** CLIP only, for a batch of crops (e.g. meter candidates in a wide wall photo). */
async function classify(m: ClassifyMsg) {
  try {
    if (!clip) throw new Error('Photo recognition is not loaded');
    const c = await clip, logits: number[][] = [];
    for (const im of m.images) logits.push(await c.classify(new RawImage(im.data, im.width, im.height, 4)));
    return { type: 'classified', id: m.id, logits };
  } catch (e) { return { type: 'classified', id: m.id, error: String((e as Error)?.message ?? e) }; }
}

const loadDetector = (url: string) => {
  detector ??= InferenceSession.create(url, { executionProviders: ['wasm'] });
  detector.catch(() => { detector = null; });
  return detector;
};

/** Object detection on a letterboxed photo; returns the raw output for decoding on the main thread (wall/objects.ts). */
async function detect(m: Extract<DetectMsg, { type: 'detect' }>) {
  try {
    const s = await loadDetector(m.modelUrl);
    const out = await s.run({ [s.inputNames[0]]: new Tensor('float32', toTensor(m.data, m.lb), [1, 3, DETECTOR_SIZE, DETECTOR_SIZE]) });
    const o = out[s.outputNames[0]];
    return { type: 'detected', id: m.id, output: o.data as Float32Array, anchors: o.dims[2] };
  } catch (e) { return { type: 'detected', id: m.id, error: String((e as Error)?.message ?? e) }; }
}

self.onmessage = (e: MessageEvent<InitMsg | AnalyzeMsg | ClassifyMsg | DetectMsg>) => {
  const m = e.data;
  if (m.type === 'init') { init(m); return; }
  if (m.type === 'detect-init') { void loadDetector(m.modelUrl).catch(err => console.warn('[wall] object detector failed to load', err)); return; }
  if (m.type === 'detect') { queue = queue.then(() => detect(m)).then(r => self.postMessage(r)); return; }
  if (m.type === 'classify') { queue = queue.then(() => classify(m)).then(r => self.postMessage(r)); return; }
  queue = queue.then(() => analyze(m)).then(r => self.postMessage(r), err => self.postMessage({ type: 'result', id: m.id, ocrError: String(err) }));
};
