// Prints PaddleOCR lines for images (debug helper): node scripts/ocr-dump.ts a.png b.jpg
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jpeg from 'jpeg-js';
import Ocr from '@gutenye/ocr-node';
import { ocrSize, resizeRgba } from '../src/lib/meter/image.ts';
const { PNG } = createRequire(import.meta.url)('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const ocr = await Ocr.create();
for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f), img = f.endsWith('.png') ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true });
  const size = ocrSize(img.width, img.height);
  const { texts } = await ocr.detect({ data: resizeRgba(img.data, img.width, img.height, size.width, size.height), width: size.width, height: size.height });
  console.log(f, JSON.stringify(texts.map((l: { text: string; mean: number }) => [l.text, +l.mean.toFixed(2)])));
}
