// Picks the meter number out of OCR text lines and judges whether it is trustworthy. Pure; unit-tested.
import { backgroundLuma, flankCoverage, type Box, type Gray } from './image.ts';

/** One line from the OCR engine (PaddleOCR): text, mean character confidence 0–1, and its quadrilateral. */
export type OcrLine = { text: string; mean: number; box?: number[][] };

export const METER_ISSUES = ['blurry', 'glare', 'too_dark', 'cut_off', 'obstructed', 'truncated'] as const;
export type MeterIssue = (typeof METER_ISSUES)[number];

/** What we observed about the meter number. Decisions are made in acceptance.ts. */
export type MeterObservation = {
  meter_number_visible: boolean;
  meter_number: string;
  all_characters_certain: boolean;
  number_fully_in_frame: boolean;
  issues: MeterIssue[];
  /** Character height as a share of the analysed image height (turned into pixels for "move closer"). */
  number_height_ratio: number;
  debug?: Record<string, unknown>;
};

export const NUMBER_RULES = {
  minDigits: 6,
  maxDigits: 14,
  /** Share of the cleaned text that must be digits (rejects "FORM 2S CL200 240V", barcode captions). */
  minDigitShare: 0.85,
  /** Mean per-character recognition confidence required to trust every digit. */
  minConfidence: 0.9,
  /** Background around the number vs. the brightest part of the photo: nameplates are white, LCDs are grey-green. */
  minLabelBrightness: 0.8,
  /** Share of dark pixels just beside the number that suggests something is covering part of it. */
  maxFlank: 0.45,
  edgeMargin: 0.01,
};

const toBox = (q: number[][]): Box => ({ x0: Math.min(...q.map(p => p[0])), y0: Math.min(...q.map(p => p[1])), x1: Math.max(...q.map(p => p[0])), y1: Math.max(...q.map(p => p[1])) });
/** OCR sometimes reads 0 as O and 1 as I/l inside numbers. */
const normalise = (t: string) => t.replace(/[\s\-.·•*"'’]/g, '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
const digitsOf = (t: string) => t.replace(/\D/g, '');

function percentile(g: Gray, p: number) {
  const hist = new Uint32Array(256); for (let i = 0; i < g.data.length; i += 7) hist[g.data[i]]++;
  const total = hist.reduce((a, b) => a + b, 0); let c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= total * p) return v; }
  return 255;
}

/** Keeps the printed grouping ("149 214 094") when the OCR kept the spaces, otherwise returns the digits. */
function display(text: string) { const t = text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').replace(/[^\d ]/g, '').replace(/\s+/g, ' ').trim(); return t.replace(/\D/g, '').length >= 6 ? t : digitsOf(text); }

type Fragment = { text: string; mean: number; box: Box; digits: string; src: OcrLine[] };

export function pickMeterNumber(lines: OcrLine[], g: Gray, R = NUMBER_RULES): MeterObservation {
  const bright = Math.max(1, percentile(g, 0.97));
  // 1. Digit-dominant text boxes (rejects "FORM 2S CL200 240V", barcode captions, "FOCUS AXR-SD").
  const frags: Fragment[] = lines.flatMap(l => {
    const clean = normalise(l.text), digits = digitsOf(clean);
    if (!l.box || digits.length < 2 || digits.length / clean.length < R.minDigitShare) return [];
    return [{ text: l.text, mean: l.mean, box: toBox(l.box), digits, src: [l] }];
  });
  // 2. The OCR sometimes splits a spaced number ("149 214 094") into several boxes: join boxes on the same row.
  const rows: Fragment[] = [];
  for (const f of [...frags].sort((a, b) => a.box.x0 - b.box.x0)) {
    const h = f.box.y1 - f.box.y0;
    const row = rows.find(r => {
      const rh = r.box.y1 - r.box.y0, overlap = Math.min(r.box.y1, f.box.y1) - Math.max(r.box.y0, f.box.y0);
      // Same row, similar character height (so small print like the "-408" beside a barcode isn't glued on), small gap.
      return overlap >= 0.5 * Math.min(h, rh) && Math.abs(h - rh) <= 0.3 * Math.max(h, rh) && f.box.x0 - r.box.x1 < 1.5 * Math.max(h, rh) && f.box.x0 >= r.box.x1 - 0.3 * h;
    });
    if (row) Object.assign(row, { text: `${row.text} ${f.text}`, mean: Math.min(row.mean, f.mean), digits: row.digits + f.digits, src: [...row.src, f],
      box: { x0: Math.min(row.box.x0, f.box.x0), y0: Math.min(row.box.y0, f.box.y0), x1: Math.max(row.box.x1, f.box.x1), y1: Math.max(row.box.y1, f.box.y1) } });
    else rows.push({ ...f, src: [...f.src] });
  }
  // 3. Plausible meter numbers. A candidate whose digits are part of a longer candidate is a partial duplicate
  //    read of the same number (seen on webcam captures), so only the longest reading is kept.
  const plausible = rows.filter(r => r.digits.length >= R.minDigits && r.digits.length <= R.maxDigits);
  const candidates = plausible
    .filter(c => !plausible.some(o => o !== c && o.digits.length > c.digits.length && o.digits.includes(c.digits)))
    .map(c => ({ ...c, h: c.box.y1 - c.box.y0, label: backgroundLuma(g, c.box) / bright }));
  const onLabel = candidates.filter(c => c.label >= R.minLabelBrightness);
  const best = onLabel.sort((a, b) => b.h * b.mean - a.h * a.mean)[0];
  const debug = { candidates: candidates.map(c => `${c.text} (${c.mean.toFixed(2)}, label ${c.label.toFixed(2)})`), lines: lines.map(l => l.text) };
  if (!best) return { meter_number_visible: false, meter_number: '', all_characters_certain: false, number_fully_in_frame: true, issues: [], number_height_ratio: 0, debug };

  const issues: MeterIssue[] = [];
  // Something dark right beside the number may be hiding digits.
  if (flankCoverage(g, best.box) > R.maxFlank) issues.push('obstructed');
  // Many nameplates repeat the number in a barcode caption. If another line holds a longer run of digits that
  // contains ours, we probably saw only part of the number.
  if (lines.some(l => !best.src.includes(l) && digitsOf(normalise(l.text)).length >= best.digits.length + 2 && digitsOf(normalise(l.text)).includes(best.digits))) issues.push('truncated');
  const m = R.edgeMargin, b = best.box;
  const inFrame = b.x0 > g.width * m && b.y0 > g.height * m && b.x1 < g.width * (1 - m) && b.y1 < g.height * (1 - m);
  const certain = best.mean >= R.minConfidence && !issues.length;
  return { meter_number_visible: true, meter_number: display(best.text), all_characters_certain: certain, number_fully_in_frame: inFrame, issues, number_height_ratio: best.h / g.height, debug: { ...debug, picked: best.text, confidence: best.mean } };
}
