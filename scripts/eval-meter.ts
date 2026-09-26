// Accuracy harness for the meter photo check — same decision code as the browser, run in Node.
//   npm run eval:meter                       OCR + quality checks (subject assumed to be an electric meter)
//   npm run eval:meter -- --subject          also runs the CLIP "is this an electric meter?" classifier (downloads ~150 MB once)
//   npm run eval:meter -- --verbose [folder] per-image diagnostics; folder defaults to eval/meter
// The folder needs images plus manifest.json: { "file.jpg": { "expect": "pass" | "retake" | "not_meter", "number"?: "149 214 094" } }
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import Ocr from '@gutenye/ocr-node';
import { decide, type SubjectResult } from '../src/lib/meter/acceptance.ts';
import { glare, meanLuma, ocrSize, resizeRgba, sharpness, stretch, toGray } from '../src/lib/meter/image.ts';
import { pickMeterNumber } from '../src/lib/meter/number.ts';

const args = process.argv.slice(2), verbose = args.includes('--verbose'), withSubject = args.includes('--subject');
const dir = args.find(a => !a.startsWith('--')) ?? 'eval/meter';
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, { expect: string; number?: string }>;
const ocr = await Ocr.create();

let classify: ((file: string) => Promise<SubjectResult>) | null = null;
if (withSubject) {
  const { RawImage } = await import('@huggingface/transformers');
  const { loadClip } = await import('../src/lib/meter/clip.ts');
  const { aggregate, PROMPTS, DEFAULT_SUBJECT_MODEL } = await import('../src/lib/meter/analyzer.ts');
  const clip = await loadClip(process.env.SUBJECT_MODEL || DEFAULT_SUBJECT_MODEL, PROMPTS.map(p => p.p), 'cpu');
  classify = async file => aggregate(await clip.classify(await RawImage.read(file)));
}
const assumeMeter: SubjectResult = { status: 'ok', top: 'electric_meter', probs: { electric_meter: 1, gas_meter: 0, water_meter: 0, breaker_panel: 0, other: 0 } };

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
let correct = 0, falseAccept = 0, falseReject = 0, wrongNumber = 0, subjOk = 0, subjN = 0;
const files = readdirSync(dir).filter(f => manifest[f] && /\.jpe?g$/i.test(f)).sort();
for (const f of files) {
  const exp = manifest[f], t = Date.now();
  const img = jpeg.decode(readFileSync(join(dir, f)), { useTArray: true, maxMemoryUsageInMB: 1024 });
  const size = ocrSize(img.width, img.height);
  const rgba = resizeRgba(img.data, img.width, img.height, size.width, size.height);
  const g = toGray(rgba, size.width, size.height, 4000);
  const inner = { x0: g.width * 0.15, y0: g.height * 0.15, x1: g.width * 0.85, y1: g.height * 0.85 };
  const { texts } = await ocr.detect({ data: rgba, width: size.width, height: size.height });
  const reading = pickMeterNumber(texts, g);
  const subject = classify ? await classify(join(dir, f)) : assumeMeter;
  const d = decide({ subject, reading, luma: meanLuma(g, inner), glare: glare(g, inner), sharpness: sharpness(stretch(g), inner), regionHeightPx: img.height });
  const expectAccept = exp.expect === 'pass';
  const badNum = d.accepted && !!exp.number && digits(d.meterNumber) !== digits(exp.number);
  const ok = d.accepted === expectAccept && !badNum;
  if (ok) correct++; if (d.accepted && !expectAccept) falseAccept++; if (!d.accepted && expectAccept) falseReject++; if (badNum) wrongNumber++;
  let subj = '';
  if (classify && subject.status === 'ok' && (exp.expect === 'pass' || exp.expect === 'not_meter')) {
    const isMeter = subject.probs.electric_meter >= 0.5, right = isMeter === (exp.expect === 'pass'); subjN++; if (right) subjOk++;
    subj = ` subject=${subject.top}(${subject.probs.electric_meter.toFixed(2)})${right ? '' : ' ✗'}`;
  }
  console.log(`${ok ? '✓' : '✗'} ${f.padEnd(28)} expect=${exp.expect.padEnd(9)} ${d.accepted ? 'ACCEPT' : 'reject'} read="${reading.meter_number}"${subj} ${Date.now() - t}ms`);
  if (verbose || !ok) console.log(`    ${d.accepted ? '' : 'reason: ' + d.reasons.join(' / ')}  sharp=${sharpness(stretch(g), inner).toFixed(0)}${verbose ? `\n    ${JSON.stringify(reading.debug)}` : ''}`);
}
console.log(`\naccuracy ${correct}/${files.length} · false accepts ${falseAccept} (worst case) · false rejects ${falseReject} · wrong numbers ${wrongNumber}` + (classify ? ` · subject ${subjOk}/${subjN}` : ''));
