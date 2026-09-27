// Is the ground in the photo? Base needs to see where the battery would stand. Meters sit anywhere from ~3 to 6 ft up,
// so the meter's height in the frame alone can't tell. Instead we compare the bottom of the photo with the wall beside
// the meter: grass, dirt, mulch and gravel look different from the wall; a photo that ends partway down the wall doesn't.
// Pure; unit-tested and checked on eval/wall (npm run eval:wall).
import type { Detection } from './objects.ts';

export type GroundCheck = {
  visible: boolean;
  /** Share of plant-green pixels in the bottom strip. */
  green: number;
  /** Share of warm, saturated (earth-coloured: dirt, mulch, gravel, dry grass) pixels in the bottom strip. */
  earth: number;
  /** Colour-histogram overlap (0–1) between the bottom strip and the bare wall beside the meter. */
  sameAsWall: number;
  /** Feet of photo below the meter centre, by the meter-cover ruler (null if unknown). */
  belowFt: number | null;
};

export const GROUND = {
  bottomStrip: 0.1,
  /** Meters are at most 6 ft up (Base's rule), so this much photo below the meter always reaches the ground. */
  alwaysFt: 6.5,
  green: 0.3,
  earth: 0.5,
  /** The bottom strip counts as "more wall" at or above this overlap with the wall beside the meter. */
  sameWall: 0.65,
  /** …and as clearly not wall below this. */
  differentWall: 0.3,
};

const BINS = 6;
function stats(rgba: ArrayLike<number>, width: number, rows: [number, number], cols: (x: number) => boolean) {
  const hist = new Float64Array(BINS ** 3);
  let n = 0, green = 0, earth = 0;
  for (let y = rows[0]; y < rows[1]; y += 2) for (let x = 0; x < width; x += 2) {
    if (!cols(x)) continue;
    const i = (y * width + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / (mx + 1);
    if (g > 50 && g > r * 1.08 && g > b * 1.15) green++;
    if (r > b * 1.12 && sat > 0.12) earth++;
    const bin = (v: number) => Math.min(BINS - 1, Math.floor((v / 256) * BINS));
    hist[(bin(r) * BINS + bin(g)) * BINS + bin(b)]++;
    n++;
  }
  if (n) for (let k = 0; k < hist.length; k++) hist[k] /= n;
  return { hist, n, green: n ? green / n : 0, earth: n ? earth / n : 0 };
}

export function checkGround(e: {
  rgba: ArrayLike<number>; width: number; height: number;
  meter: { x: number; y: number; r: number | null }; detections: Detection[];
}): GroundCheck {
  const { rgba, width: W, height: H, meter: m } = e;
  const bottom = stats(rgba, W, [Math.floor(H * (1 - GROUND.bottomStrip)), H], () => true);
  // Bare wall beside the meter: rows around meter height, skipping detected objects and the meter itself.
  const half = m.r ? (1.6 * m.r * H) / W : 0.05;
  const blocked = (x: number) => { const s = x / W; return Math.abs(s - m.x) < half || e.detections.some(d => s >= d.x0 && s <= d.x1 && d.y1 > m.y - 0.12 && d.y0 < m.y + 0.12); };
  const wall = stats(rgba, W, [Math.max(0, Math.floor(H * (m.y - 0.12))), Math.min(H, Math.ceil(H * (m.y + 0.12)))], x => !blocked(x));
  let sameAsWall = 0;
  if (wall.n > 50) for (let k = 0; k < bottom.hist.length; k++) sameAsWall += Math.min(bottom.hist[k], wall.hist[k]);
  const belowFt = m.r ? ((1 - m.y) * 7) / (24 * m.r) : null; // (1 − y)·H px ÷ (2r·H px per 7 in × 12)
  const visible = bottom.green >= GROUND.green
    || (bottom.earth >= GROUND.earth && sameAsWall < GROUND.sameWall)
    || (belowFt != null && belowFt >= GROUND.alwaysFt)
    || (wall.n > 50 && sameAsWall < GROUND.differentWall);
  return { visible, green: bottom.green, earth: bottom.earth, sameAsWall, belowFt };
}
