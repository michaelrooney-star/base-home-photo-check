// Amp-rating reader in Node, same OCR and picking code as the browser: npm run eval:panel
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Ocr from '@gutenye/ocr-node';
import { ocrSize, resizeRgba } from '../src/lib/meter/image.ts';
import { readAmps } from '../src/lib/panel/amps.ts';
const { PNG } = createRequire(import.meta.url)('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const dir = 'eval/panel';
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { file: string; amps: number | null; note?: string }[];
const ocr = await Ocr.create();
let ok = 0;
for (const e of manifest) {
  const p = PNG.sync.read(readFileSync(`${dir}/${e.file}`));
  const size = ocrSize(p.width, p.height);
  const img = { data: resizeRgba(p.data, p.width, p.height, size.width, size.height), width: size.width, height: size.height };
  const r = await readAmps(img, async i => (await ocr.detect(i)).texts);
  const good = r.amps === e.amps; ok += Number(good);
  console.log(`${good ? '✓' : '✗'} ${e.file}: read ${r.amps ?? '—'}${r.turned ? ` (turned ${r.turned}°)` : ''}, expected ${e.amps ?? '—'}  ${e.note ?? ''}`);
}
console.log(`${ok}/${manifest.length} correct`);
