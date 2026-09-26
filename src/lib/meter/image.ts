// Grayscale image helpers and cheap quality measurements. Pure TypeScript, no DOM, so they run in tests and Node.
export type Gray = { data: Uint8ClampedArray; width: number; height: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };

// ---------- image helpers ----------
/** RGBA -> grayscale, box-averaged down to maxEdge on the long side. */
export function toGray(rgba: ArrayLike<number>, width: number, height: number, maxEdge = 2000): Gray {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / maxEdge));
  const W = Math.floor(width / step), H = Math.floor(height / step), out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < step; dy++) for (let dx = 0; dx < step; dx++) { const i = ((y * step + dy) * width + x * step + dx) * 4; s += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]; }
    out[y * W + x] = s / (step * step);
  }
  return { data: out, width: W, height: H };
}

/** Contrast stretch between the 1st and 99th percentiles. */
export function stretch(g: Gray): Gray {
  const hist = new Uint32Array(256); for (const v of g.data) hist[v]++;
  const n = g.data.length; let lo = 0, hi = 255, c = 0;
  for (let i = 0; i < 256; i++) { c += hist[i]; if (c > n * 0.01) { lo = i; break; } }
  c = 0; for (let i = 255; i >= 0; i--) { c += hist[i]; if (c > n * 0.01) { hi = i; break; } }
  const r = Math.max(1, hi - lo);
  return { ...g, data: g.data.map(v => (v - lo) * 255 / r) };
}

/** Bilinear sample of `box` in g, rotated by `deg` about the box centre, scaled so the box height becomes targetH. */
export function sample(g: Gray, box: Box, deg = 0, targetH = box.y1 - box.y0): Gray {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, s = targetH / (box.y1 - box.y0);
  const W = Math.max(1, Math.round((box.x1 - box.x0) * s)), H = Math.max(1, Math.round(targetH));
  const out = new Uint8ClampedArray(W * H), a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), d = g.data, GW = g.width;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / s, dy = (y - H / 2) / s, sx = cx + dx * ca - dy * sa, sy = cy + dx * sa + dy * ca;
    const ix = Math.floor(sx), iy = Math.floor(sy);
    if (ix < 0 || iy < 0 || ix >= GW - 1 || iy >= g.height - 1) { out[y * W + x] = 255; continue; }
    const fx = sx - ix, fy = sy - iy, p = iy * GW + ix;
    out[y * W + x] = d[p] * (1 - fx) * (1 - fy) + d[p + 1] * fx * (1 - fy) + d[p + GW] * (1 - fx) * fy + d[p + GW + 1] * fx * fy;
  }
  return { data: out, width: W, height: H };
}
/** Resizes so the long edge is `longEdge`: box-averaging when shrinking (no aliasing), bilinear when enlarging. */
export function resize(g: Gray, longEdge: number): Gray {
  const s = longEdge / Math.max(g.width, g.height);
  if (Math.abs(s - 1) < 0.01) return g;
  if (s > 1) return sample(g, { x0: 0, y0: 0, x1: g.width, y1: g.height }, 0, Math.round(g.height * s));
  const W = Math.max(1, Math.round(g.width * s)), H = Math.max(1, Math.round(g.height * s)), out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y / s), y1 = Math.max(y0 + 1, Math.min(g.height, Math.floor((y + 1) / s)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x / s), x1 = Math.max(x0 + 1, Math.min(g.width, Math.floor((x + 1) / s)));
      let sum = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += g.data[yy * g.width + xx];
      out[y * W + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { data: out, width: W, height: H };
}
export const rotate = (g: Gray, deg: number) => sample(g, { x0: 0, y0: 0, x1: g.width, y1: g.height }, deg);

export function otsu(g: Gray): Gray {
  const hist = new Uint32Array(256); for (const v of g.data) hist[v]++;
  const n = g.data.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2; if (v > best) { best = v; t = i; } }
  return { ...g, data: g.data.map(v => (v > t ? 255 : 0)) };
}

// ---------- quality metrics (on the unstretched image) ----------
const clampBox = (g: Gray, b: Box): Box => ({ x0: Math.max(1, Math.floor(b.x0)), y0: Math.max(1, Math.floor(b.y0)), x1: Math.min(g.width - 1, Math.ceil(b.x1)), y1: Math.min(g.height - 1, Math.ceil(b.y1)) });
const centre = (g: Gray): Box => ({ x0: g.width * 0.2, y0: g.height * 0.2, x1: g.width * 0.8, y1: g.height * 0.8 });
export function meanLuma(g: Gray, box = centre(g)) { const b = clampBox(g, box); let s = 0, n = 0; for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { s += g.data[y * g.width + x]; n++; } return n ? s / n : 0; }
/** Variance of the Laplacian: low = blurry. Scale-dependent, so always measure on the same working resolution. */
export function sharpness(g: Gray, box = centre(g)) {
  const b = clampBox(g, box), d = g.data, W = g.width; let s = 0, s2 = 0, n = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const p = y * W + x, l = d[p - 1] + d[p + 1] + d[p - W] + d[p + W] - 4 * d[p]; s += l; s2 += l * l; n++; }
  return n ? s2 / n - (s / n) ** 2 : 0;
}
/** Share of blown-out pixels — specular glare on the meter cover. */
export function glare(g: Gray, box = centre(g)) { const b = clampBox(g, box); let hot = 0, n = 0; for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { if (g.data[y * g.width + x] >= 250) hot++; n++; } return n ? hot / n : 0; }

// ---------- local checks around a detected number ----------
/** Mean brightness of the background (pixels lighter than the Otsu threshold) around a row, on the stretched frame.
 *  Meter numbers are printed on a white nameplate; LCD kWh readings sit on a mid-grey/green display. */
export function backgroundLuma(g: Gray, r: Box) {
  const h = r.y1 - r.y0, b = clampBox(g, { x0: r.x0 - h * 0.3, y0: r.y0 - h * 0.3, x1: r.x1 + h * 0.3, y1: r.y1 + h * 0.3 });
  const vals: number[] = []; for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) vals.push(g.data[y * g.width + x]);
  if (!vals.length) return 0; const t = otsu({ data: Uint8ClampedArray.from(vals), width: vals.length, height: 1 }).data;
  let s = 0, n = 0; vals.forEach((v, i) => { if (t[i]) { s += v; n++; } }); return n ? s / n : 0;
}
/** Share of dark pixels in the strips just left and right of the number. A finger, leaf or sticker there
 *  suggests digits may be hidden, which would otherwise read as a valid-looking shorter number. */
export function flankCoverage(g: Gray, r: Box) {
  const h = r.y1 - r.y0, strip = (x0: number, x1: number) => { const b = clampBox(g, { x0, x1, y0: r.y0, y1: r.y1 }); let dark = 0, n = 0; for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { if (g.data[y * g.width + x] < 100) dark++; n++; } return n ? dark / n : 0; };
  return Math.max(strip(r.x0 - h * 1.5, r.x0 - h * 0.2), strip(r.x1 + h * 0.2, r.x1 + h * 1.5));
}


/** Area-averaging RGBA resize (used where no canvas is available: Node eval, tests). */
export function resizeRgba(src: ArrayLike<number>, w: number, h: number, W: number, H: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4), sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * sy)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
      const o = (y * W + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}
/** OCR input size: long edge ≤ maxEdge, both sides multiples of 32 (what the text detector expects). */
export function ocrSize(w: number, h: number, maxEdge = 960) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(32, Math.round((w * s) / 32) * 32), height: Math.max(32, Math.round((h * s) / 32) * 32) };
}
