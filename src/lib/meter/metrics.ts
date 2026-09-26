// Cheap per-frame measurements for live guidance (run ~8x a second on a small crop of the guide circle).
import { glare, meanLuma, sharpness, stretch, type Gray } from './image.ts';

export type FastMetrics = { luma: number; sharpness: number; glare: number; motion: number };
export const FAST_SIZE = 256;

/** Mean absolute difference between two same-sized frames (0–255): camera shake or a moving subject. */
export function motion(a: Gray, b?: Gray | null) {
  if (!b || b.width !== a.width || b.height !== a.height) return 0;
  let s = 0; for (let i = 0; i < a.data.length; i += 3) s += Math.abs(a.data[i] - b.data[i]);
  return s / Math.ceil(a.data.length / 3);
}

export function fastMetrics(g: Gray, prev?: Gray | null): FastMetrics {
  const inner = { x0: g.width * 0.15, y0: g.height * 0.15, x1: g.width * 0.85, y1: g.height * 0.85 };
  return { luma: meanLuma(g, inner), glare: glare(g, inner), sharpness: sharpness(stretch(g), inner), motion: motion(g, prev) };
}
