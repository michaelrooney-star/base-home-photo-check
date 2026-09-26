// Finds round shapes (candidate meter glass covers) with OpenCV's Hough circle transform. Works on any RGBA image,
// in the browser (OpenCV.js loaded on demand) and in tests (OpenCV via Node).
export type Circle = { x: number; y: number; r: number };
export type Rgba = { data: Uint8ClampedArray; width: number; height: number };
type Mat = { delete(): void; cols: number; data32F: Float32Array };
// Minimal slice of the OpenCV.js API used here.
export type CvCircles = {
  matFromImageData(img: Rgba): Mat; Mat: new () => Mat;
  cvtColor(src: Mat, dst: Mat, code: number): void; medianBlur(src: Mat, dst: Mat, k: number): void;
  HoughCircles(src: Mat, out: Mat, method: number, dp: number, minDist: number, p1: number, p2: number, minR: number, maxR: number): void;
  COLOR_RGBA2GRAY: number; HOUGH_GRADIENT_ALT?: number;
};

/**
 * Circles whose radius is between minR and maxR (shares of image height), best first.
 * HOUGH_GRADIENT_ALT with a high "perfectness" threshold ignores brick texture, which floods the classic detector.
 */
export function findCircles(cv: CvCircles, img: Rgba, opts: { minR?: number; maxR?: number; perfectness?: number } = {}): Circle[] {
  const { minR = 0.008, maxR = 0.15, perfectness = 0.85 } = opts;
  const src = cv.matFromImageData(img), gray = new cv.Mat(), out = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);
    const H = img.height;
    cv.HoughCircles(gray, out, cv.HOUGH_GRADIENT_ALT ?? 3, 1.5, H * 0.03, 300, perfectness, Math.max(3, Math.round(H * minR)), Math.round(H * maxR));
    const circles: Circle[] = [];
    for (let i = 0; i < out.cols; i++) circles.push({ x: out.data32F[i * 3], y: out.data32F[i * 3 + 1], r: out.data32F[i * 3 + 2] });
    return circles;
  } finally { src.delete(); gray.delete(); out.delete(); }
}

/**
 * Meter-cover candidates in a photo of any size, as shares of photo width/height (r as share of height).
 * Hough results are sensitive to scale, so search at two box-filtered sizes and merge; circles seen at both sizes rank first.
 */
export function findMeterCircles(cv: CvCircles, img: Rgba, resize: (src: Rgba, w: number, h: number) => Rgba): { x: number; y: number; r: number; hits: number }[] {
  const found: { x: number; y: number; r: number; hits: number }[] = [];
  for (const long of [1200, 900]) {
    const s = Math.min(1, long / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
    const small = s === 1 ? img : resize(img, w, h);
    let cs = findCircles(cv, small);
    if (!cs.length) cs = findCircles(cv, small, { perfectness: 0.75 });
    for (const c of cs.slice(0, 8)) {
      const n = { x: c.x / w, y: c.y / h, r: c.r / h };
      const same = found.find(f => Math.hypot((f.x - n.x) * img.width, (f.y - n.y) * img.height) < Math.max(f.r, n.r) * img.height);
      if (same) same.hits++; else found.push({ ...n, hits: 1 });
    }
    if (s === 1) break;
  }
  return found.sort((a, b) => b.hits - a.hits);
}

/** The circle nearest to a point the customer tapped, searching a window around it with a looser threshold. */
export function circleNear(cv: CvCircles, img: Rgba, px: number, py: number): Circle | null {
  const half = Math.round(img.height * 0.18);
  const x0 = Math.max(0, Math.round(px - half)), y0 = Math.max(0, Math.round(py - half));
  const x1 = Math.min(img.width, Math.round(px + half)), y1 = Math.min(img.height, Math.round(py + half));
  const w = x1 - x0, h = y1 - y0; if (w < 16 || h < 16) return null;
  const crop = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) crop.set(img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1) * 4), y * w * 4);
  // Radius limits stay relative to the full photo height.
  const s = img.height / h;
  const found = findCircles(cv, { data: crop, width: w, height: h }, { minR: 0.006 * s, maxR: Math.min(0.45, 0.15 * s), perfectness: 0.75 })
    .map(c => ({ x: c.x + x0, y: c.y + y0, r: c.r }))
    .filter(c => Math.hypot(c.x - px, c.y - py) <= Math.max(c.r * 1.8, img.height * 0.04));
  return found.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0] ?? null;
}

let cvPromise: Promise<CvCircles> | null = null;
/** Loads the self-hosted OpenCV.js (public/vendor/opencv.js) once, in the browser. */
export function loadCv(): Promise<CvCircles> {
  cvPromise ??= import('../estimate.ts').then(m => m.loadOpenCv() as unknown as CvCircles);
  cvPromise.catch(() => { cvPromise = null; });
  return cvPromise;
}
