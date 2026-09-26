// Self-hosts large runtime assets under public/vendor (git-ignored) so the app never loads code from a CDN.
// Runs automatically after `npm install`.
import { copyFileSync, mkdirSync } from 'node:fs';
for (const d of ['public/vendor/ort', 'public/vendor/paddle']) mkdirSync(d, { recursive: true });
copyFileSync('node_modules/@techstark/opencv-js/dist/opencv.js', 'public/vendor/opencv.js');
// ONNX Runtime WebAssembly: runs both on-device models. Must be the version Transformers.js uses (pinned in package.json).
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
  copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/vendor/ort/${f}`);
// PaddleOCR PP-OCRv4 text detection + recognition models and character dictionary.
const models = 'node_modules/@gutenye/ocr-models/assets';
copyFileSync(`${models}/ch_PP-OCRv4_det_infer.onnx`, 'public/vendor/paddle/det.onnx');
copyFileSync(`${models}/ch_PP-OCRv4_rec_infer.onnx`, 'public/vendor/paddle/rec.onnx');
copyFileSync(`${models}/ppocr_keys_v1.txt`, 'public/vendor/paddle/keys.txt');
