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

export function pickMeterNumber(lines: OcrLine[], g: Gray, R = NUMBER_RULES): MeterObservation {
  const bright = Math.max(1, percentile(g, 0.97));
  const candidates = lines.flatMap(l => {
    const clean = normalise(l.text), digits = digitsOf(clean);
    if (!l.box || digits.length < R.minDigits || digits.length > R.maxDigits || digits.length / clean.length < R.minDigitShare) return [];
    const box = toBox(l.box), h = box.y1 - box.y0;
    const label = backgroundLuma(g, box) / bright;
    return [{ line: l, digits, box, h, label }];
  });
  const onLabel = candidates.filter(c => c.label >= R.minLabelBrightness);
  const best = onLabel.sort((a, b) => b.h * b.line.mean - a.h * a.line.mean)[0];
  const debug = { candidates: candidates.map(c => `${c.line.text} (${c.line.mean.toFixed(2)}, label ${c.label.toFixed(2)})`), lines: lines.map(l => l.text) };
  if (!best) return { meter_number_visible: false, meter_number: '', all_characters_certain: false, number_fully_in_frame: true, issues: [], number_height_ratio: 0, debug };

  const issues: MeterIssue[] = [];
  // Something dark right beside the number may be hiding digits.
  if (flankCoverage(g, best.box) > R.maxFlank) issues.push('obstructed');
  // Many nameplates repeat the number in a barcode caption. If another line holds a longer run of digits that
  // contains ours, we probably saw only part of the number.
  if (lines.some(l => l !== best.line && digitsOf(normalise(l.text)).length >= best.digits.length + 2 && digitsOf(normalise(l.text)).includes(best.digits))) issues.push('truncated');
  const m = R.edgeMargin, b = best.box;
  const inFrame = b.x0 > g.width * m && b.y0 > g.height * m && b.x1 < g.width * (1 - m) && b.y1 < g.height * (1 - m);
  const certain = best.line.mean >= R.minConfidence && !issues.length;
  return { meter_number_visible: true, meter_number: display(best.line.text), all_characters_certain: certain, number_fully_in_frame: inFrame, issues, number_height_ratio: best.h / g.height, debug: { ...debug, picked: best.line.text, confidence: best.line.mean } };
}
