// Reads the main breaker's amp rating (the number stamped on the handle: 100, 150, 200…) from OCR lines. Pure; unit-tested.
import type { OcrLine } from '../meter/number.ts';

/** Main breaker sizes found on US homes. Anything else (120, 240, 208 volts, catalogue numbers) is ignored. */
export const MAIN_BREAKER_AMPS = [60, 70, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 320, 400] as const;
export const AMPS_MIN_CONFIDENCE = 0.8;

export type AmpReading = { amps: number | null; text: string | null; confidence: number };

/**
 * The most likely rating: a line that is just a standard size ("200", "200A", "200 AMP"), with high OCR confidence.
 * Prefers the tallest such line (the handle stamp is the biggest number in a close-up).
 */
export function pickAmps(lines: OcrLine[]): AmpReading {
  const height = (l: OcrLine) => (l.box ? Math.abs(l.box[3][1] - l.box[0][1]) : 0);
  const cands = lines.flatMap(l => {
    const m = /^\s*(\d{2,3})\s*(A|AMP|AMPS)?\s*$/i.exec(l.text.replace(/[Oo]/g, '0'));
    const n = m ? Number(m[1]) : NaN;
    return (MAIN_BREAKER_AMPS as readonly number[]).includes(n) && l.mean >= AMPS_MIN_CONFIDENCE ? [{ n, l }] : [];
  });
  const best = cands.sort((a, b) => height(b.l) - height(a.l) || b.l.mean - a.l.mean)[0];
  return best ? { amps: best.n, text: best.l.text, confidence: best.l.mean } : { amps: null, text: null, confidence: 0 };
}

type Rgba = { data: Uint8ClampedArray; width: number; height: number };
/** Rotates RGBA pixels a quarter turn: 'cw' (clockwise) or 'ccw'. */
export function rotateRgba(img: Rgba, dir: 'cw' | 'ccw'): Rgba {
  const { width: W, height: H, data } = img, out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = dir === 'cw' ? H - 1 - y : y, ny = dir === 'cw' ? x : W - 1 - x;
    out.set(data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (ny * H + nx) * 4);
  }
  return { data: out, width: H, height: W };
}

/**
 * OCR the photo upright; if no rating is found, try it turned both ways (some handles are stamped sideways).
 * `detect` runs OCR on RGBA pixels whose sides are multiples of 32.
 */
export async function readAmps(img: Rgba, detect: (img: Rgba) => Promise<OcrLine[]>): Promise<AmpReading & { turned: 0 | 90 | 270 }> {
  for (const turn of [0, 270, 90] as const) {
    const src = turn === 0 ? img : rotateRgba(img, turn === 90 ? 'cw' : 'ccw');
    const r = pickAmps(await detect(src));
    if (r.amps) return { ...r, turned: turn };
  }
  return { amps: null, text: null, confidence: 0, turned: 0 };
}
