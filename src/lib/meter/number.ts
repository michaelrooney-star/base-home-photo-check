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
  /** Per-character recognition confidence below which a read is never "certain". */
  minConfidence: 0.85,
  /** Background around the number vs. the brightest part of the photo: nameplates are white, LCDs are grey-green. */
  minLabelBrightness: 0.8,
  /** Share of dark pixels just beside the number that suggests something is covering part of it. */
  maxFlank: 0.45,
  edgeMargin: 0.01,
  /** The winner must beat the runner-up by this much score to count as certain. */
  minMargin: 0.75,
};

const toBox = (q: number[][]): Box => ({ x0: Math.min(...q.map(p => p[0])), y0: Math.min(...q.map(p => p[1])), x1: Math.max(...q.map(p => p[0])), y1: Math.max(...q.map(p => p[1])) });
const digitsOf = (t: string) => t.replace(/\D/g, '');
/** OCR reads 0 as O and 1 as I/l inside numbers; only fix them when they sit between digits. */
const fixDigits = (t: string) => t.replace(/(?<=\d)[Oo](?=\d)|(?<=\d)[Oo]$|^[Oo](?=\d)/g, '0').replace(/(?<=\d)[Il|](?=\d)/g, '1');
/** Letters and digits only, upper-case: how a barcode caption like "*BF149214094LGFOCS*" or "KZAAE61068922016" looks. */
const alnum = (t: string) => fixDigits(t).toUpperCase().replace(/[^A-Z0-9]/g, '');

function percentile(g: Gray, p: number) {
  const hist = new Uint32Array(256); for (let i = 0; i < g.data.length; i += 7) hist[g.data[i]]++;
  const total = hist.reduce((a, b) => a + b, 0); let c = 0;
  for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= total * p) return v; }
  return 255;
}

type Line = { text: string; mean: number; box: Box; src: OcrLine[] };

/**
 * One reading of one number in one OCR pass. Format-agnostic: any run of 6–14 digits (optionally in short printed
 * groups, "149 214 094") that isn't glued to other letters or digits, with an optional short letter prefix ("AE 6106892").
 */
export type NumberCandidate = {
  digits: string; display: string; prefix: string | null; mean: number; box: Box; h: number; label: number;
  /** The same number is printed again elsewhere (e.g. a barcode caption): strong evidence it's the meter number. */
  corroborated: boolean;
  /** Letters printed right before the number where it's repeated ("…AAE" in "KZAAE6106892…"), to check the prefix. */
  captionLetters: string | null;
  /** Printed elsewhere with 1–3 more digits: we probably see only part of it. */
  truncated: boolean;
  /** Follows "=" (a spec value like "K=0.15"), not an identifier. */
  afterEquals: boolean;
  src: OcrLine[];
};

const TOKEN = /(?:^|[^A-Za-z0-9])(?:([A-Za-z]{2,3})[\s-]?)?(\d{2,4}(?:[\s-]\d{2,4}){2,4}|\d{6,14})(?=$|[^A-Za-z0-9])/g;

/** Every plausible number in one OCR pass, with the evidence for and against it. */
export function numberCandidates(lines: OcrLine[], g: Gray, R = NUMBER_RULES): NumberCandidate[] {
  const bright = Math.max(1, percentile(g, 0.97));
  const all: Line[] = lines.filter(l => l.box).map(l => ({ text: fixDigits(l.text), mean: l.mean, box: toBox(l.box!), src: [l] }));
  // The OCR sometimes splits a spaced number ("149 214 094") into several boxes: join digit boxes on the same row.
  const digitBoxes = all.filter(l => /^\s*\d{2,}\s*$/.test(l.text)).sort((a, b) => a.box.x0 - b.box.x0);
  const rows: Line[] = [];
  for (const f of digitBoxes) {
    const h = f.box.y1 - f.box.y0;
    const row = rows.find(r => {
      const rh = r.box.y1 - r.box.y0, overlap = Math.min(r.box.y1, f.box.y1) - Math.max(r.box.y0, f.box.y0);
      return overlap >= 0.5 * Math.min(h, rh) && Math.abs(h - rh) <= 0.3 * Math.max(h, rh) && f.box.x0 - r.box.x1 < 1.5 * Math.max(h, rh) && f.box.x0 >= r.box.x1 - 0.3 * h;
    });
    if (row) Object.assign(row, { text: `${row.text} ${f.text.trim()}`, mean: Math.min(row.mean, f.mean), src: [...row.src, ...f.src],
      box: { x0: Math.min(row.box.x0, f.box.x0), y0: Math.min(row.box.y0, f.box.y0), x1: Math.max(row.box.x1, f.box.x1), y1: Math.max(row.box.y1, f.box.y1) } });
    else rows.push({ ...f, text: f.text.trim(), src: [...f.src] });
  }
  const sources = [...all, ...rows.filter(r => r.src.length > 1)];

  const out: NumberCandidate[] = [];
  for (const l of sources) {
    for (const m of l.text.matchAll(TOKEN)) {
      const digits = digitsOf(m[2]);
      if (digits.length < R.minDigits || digits.length > R.maxDigits) continue;
      const prefix = m[1] ? m[1].toUpperCase() : null;
      // Evidence from the other lines: the same number printed again (caption), or printed longer (we see only part).
      let corroborated = false, truncated = false, captionLetters: string | null = null;
      for (const o of all) {
        if (o.src.some(x => l.src.includes(x))) continue;
        const s = alnum(o.text);
        for (let i = s.indexOf(digits); i >= 0; i = s.indexOf(digits, i + 1)) {
          let k = 0; while (/\d/.test(s[i + digits.length + k] ?? '')) k++;
          const before = s[i - 1] ?? '';
          if (/\d/.test(before)) truncated = true; // digits missing at the front
          else if (k >= 1 && k <= 3) truncated = true; // digits missing at the end ("149214" vs "149214094")
          else { corroborated = true; captionLetters = /[A-Z]{1,3}$/.exec(s.slice(Math.max(0, i - 3), i))?.[0] ?? null; } // same number, or + a 4-digit year ("…AE61068922016")
        }
      }
      const at = (m.index ?? 0) + m[0].indexOf(m[2]);
      const afterEquals = /=\s*[\d.,]*\s*$/.test(l.text.slice(Math.max(0, at - 10), at)) || /=\s*$/.test(l.text.slice(0, at).trimEnd().split(/\s+/).slice(-2).join(' '));
      const box = l.box, h = box.y1 - box.y0;
      out.push({ digits, display: `${prefix ? prefix + ' ' : ''}${m[2].replace(/-/g, ' ').replace(/\s+/g, ' ')}`, prefix, mean: l.mean, box, h,
        label: backgroundLuma(g, box) / bright, corroborated, captionLetters, truncated, afterEquals, src: l.src });
    }
  }
  // A candidate whose digits are part of a longer candidate read at the same spot is a partial duplicate read of it.
  const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
  return out.filter(c => !out.some(o => o !== c && o.digits.length > c.digits.length && o.digits.includes(c.digits) && overlaps(o.box, c.box)));
}

const score = (c: NumberCandidate) => c.mean + (c.corroborated ? 2 : 0) + (c.prefix ? 1 : 0) - (c.label < NUMBER_RULES.minLabelBrightness ? 1.5 : 0) - (c.afterEquals ? 1.5 : 0) - (c.truncated ? 1 : 0);

/**
 * Picks the meter number from one or more OCR passes of the same photo (e.g. at two sizes). Candidates are grouped by
 * their digits and scored: seen in more passes, printed again elsewhere on the plate, with a letter prefix, on the white
 * label and not a spec value. Certain only when the winner clearly beats every other number and was read confidently.
 */
export function pickFromPasses(passes: { lines: OcrLine[]; g: Gray }[], R = NUMBER_RULES): MeterObservation {
  const per = passes.map(p => ({ g: p.g, cands: numberCandidates(p.lines, p.g, R) }));
  const groups = new Map<string, { digits: string; reads: (NumberCandidate & { g: Gray })[]; score: number }>();
  for (const p of per) for (const c of p.cands) {
    const gr = groups.get(c.digits) ?? { digits: c.digits, reads: [], score: 0 };
    gr.reads.push({ ...c, g: p.g }); groups.set(c.digits, gr);
  }
  for (const gr of groups.values()) {
    const passesSeen = new Set(gr.reads.map(r => r.g)).size;
    gr.score = Math.max(...gr.reads.map(score)) + (passesSeen - 1);
  }
  const ranked = [...groups.values()].sort((a, b) => b.score - a.score);
  const debug = { candidates: ranked.map(r => `${r.reads[0].display} (${r.score.toFixed(2)}${r.reads.some(x => x.corroborated) ? ', repeated' : ''})`), lines: passes.flatMap(p => p.lines.map(l => l.text)) };
  const best = ranked[0];
  if (!best) return { meter_number_visible: false, meter_number: '', all_characters_certain: false, number_fully_in_frame: true, issues: [], number_height_ratio: 0, debug };

  // Describe the winner from its best single read (prefer one with a prefix, then the most confident). The letters of a
  // prefix are easy to misread ("AE" as "BE"), so use the prefix most reads agree on.
  const votes = new Map<string, number>();
  for (const r of best.reads) if (r.prefix) votes.set(r.prefix, (votes.get(r.prefix) ?? 0) + r.mean);
  let prefix = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const caption = best.reads.find(r => r.captionLetters)?.captionLetters;
  if (prefix && caption && !caption.endsWith(prefix)) prefix = caption.slice(-prefix.length); // "BE" read, caption says "…AE"

  const read0 = [...best.reads].sort((a, b) => Number(!!b.prefix) - Number(!!a.prefix) || b.mean - a.mean)[0];
  const read = { ...read0, display: prefix ? `${prefix} ${read0.display.replace(/^[A-Z]{2,3}\s/, '')}` : read0.display };
  const g = read.g, b = read.box;
  const issues: MeterIssue[] = [];
  // Something dark right beside a short number may be hiding digits. Full-length IDs (7+ digits) often sit next to
  // dark meter parts, so only short reads are suspected.
  if (best.digits.length <= 6 && flankCoverage(g, b) > R.maxFlank && !best.reads.some(r => r.corroborated)) issues.push('obstructed');
  if (best.reads.every(r => r.truncated)) issues.push('truncated');
  const m = R.edgeMargin;
  const inFrame = b.x0 > g.width * m && b.y0 > g.height * m && b.x1 < g.width * (1 - m) && b.y1 < g.height * (1 - m);
  // A number differing by one digit is a competing read of the same text (a misread at one size), not a second number:
  // it doesn't count as the runner-up, but the winner must be read clearly more confidently than it.
  const oneOff = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;
  const misreads = ranked.slice(1).filter(r => oneOff(r.digits, best.digits));
  const others = ranked.slice(1).filter(r => !misreads.includes(r));
  const runnerUp = others[0]?.score ?? -Infinity;
  const clearOfMisreads = misreads.every(r => Math.max(...best.reads.map(x => x.mean)) >= Math.max(...r.reads.map(x => x.mean)) + 0.1);
  const certain = Math.max(...best.reads.map(r => r.mean)) >= R.minConfidence && best.score - runnerUp >= R.minMargin && clearOfMisreads && !issues.length
    && best.reads.some(r => r.label >= R.minLabelBrightness || r.corroborated);
  return { meter_number_visible: true, meter_number: read.display, all_characters_certain: certain, number_fully_in_frame: inFrame, issues, number_height_ratio: read.h / g.height,
    debug: { ...debug, picked: read.display, confidence: read.mean, margin: +(best.score - runnerUp).toFixed(2) } };
}

/** One OCR pass. */
export const pickMeterNumber = (lines: OcrLine[], g: Gray, R = NUMBER_RULES) => pickFromPasses([{ lines, g }], R);
