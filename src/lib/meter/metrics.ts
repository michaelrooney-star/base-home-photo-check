// Cheap per-frame measurements for live guidance (run ~8x a second on a small crop of the guide circle).
import { glare, meanLuma, sharpness, stretch, type Gray } from './image.ts';

/** `relSharpness` = this frame's sharpness ÷ the sharpest frame in the last few seconds (0–1). */
export type FastMetrics = { luma: number; sharpness: number; relSharpness: number; glare: number; motion: number };
export const FAST_SIZE = 256;

/** Box-averages a frame down by `f` (e.g. 256 px → 64 px). Averaging blurs away the pixel-level jitter of a hand-held phone. */
export function shrink(g: Gray, f = 4): Gray {
  const W = Math.floor(g.width / f), H = Math.floor(g.height / f), out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += g.data[(y * f + dy) * g.width + x * f + dx];
    out[y * W + x] = s / (f * f);
  }
  return { data: out, width: W, height: H };
}

/**
 * Mean absolute difference (0–255) between two frames, measured on 4×-shrunk copies: real movement (walking, swinging
 * the phone) still shows, but the 1–2 px tremor of a hand-held phone on fine print mostly averages out.
 */
export function motion(a: Gray, b?: Gray | null) {
  if (!b || b.width !== a.width || b.height !== a.height) return 0;
  const sa = shrink(a), sb = shrink(b);
  let s = 0; for (let i = 0; i < sa.data.length; i++) s += Math.abs(sa.data[i] - sb.data[i]);
  return s / sa.data.length;
}

/**
 * "Steady enough": counts good frames among the last `size`. Unlike a run of consecutive frames, one shaky or
 * refocusing frame doesn't send a hand-held user back to zero.
 */
export function createSteadyWindow(size = 6) {
  const recent: boolean[] = [];
  return (good: boolean) => { recent.push(good); if (recent.length > size) recent.shift(); return recent.filter(Boolean).length; };
}

export function fastMetrics(g: Gray, prev?: Gray | null): FastMetrics {
  const inner = { x0: g.width * 0.15, y0: g.height * 0.15, x1: g.width * 0.85, y1: g.height * 0.85 };
  return { luma: meanLuma(g, inner), glare: glare(g, inner), sharpness: sharpness(stretch(g), inner), relSharpness: 1, motion: motion(g, prev) };
}

/**
 * Focus relative to what this camera has recently managed, so the same rule works for a phone camera and a
 * soft laptop webcam: returns sharpness ÷ the peak over the last `windowMs`. A frame close to the recent best is
 * "in focus"; a big drop means shake or refocusing.
 */
export function createFocusTracker(windowMs = 4000) {
  const hist: { t: number; v: number }[] = [];
  return (t: number, v: number) => {
    hist.push({ t, v });
    while (hist.length && t - hist[0].t > windowMs) hist.shift();
    const peak = Math.max(...hist.map(h => h.v));
    return peak > 0 ? Math.min(1, v / peak) : 0;
  };
}
