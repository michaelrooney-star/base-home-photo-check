import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { circleNear, findCircles, findMeterCircles, type CvCircles, type Rgba } from './circles';
import { resizeRgba } from '../meter/image';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const load = (name: string): Rgba => { const p = PNG.sync.read(readFileSync(`eval/wall/${name}.png`)); return { data: new Uint8ClampedArray(p.data), width: p.width, height: p.height }; };
let cv: CvCircles;
beforeAll(async () => { cv = await (require('@techstark/opencv-js') as Promise<CvCircles>); }, 30000);

// Meter glass-cover positions measured by hand on Base's guide photos.
describe('findCircles on Base guide photos', () => {
  it('finds the meter on the whole-wall photo without drowning in brick texture', () => {
    const c = findCircles(cv, load('wall'));
    expect(c.length).toBeLessThan(10);
    expect(c.some(k => Math.hypot(k.x - 606, k.y - 334) < 20)).toBe(true);
  }, 30000);
  it('finds the meter on the left-side photo', () => {
    expect(findCircles(cv, load('left')).some(k => Math.hypot(k.x - 984, k.y - 258) < 25)).toBe(true);
  }, 30000);
  it('ranks the meter in the top two on the right-side photo, where it sits at the edge', () => {
    const img = load('right'), rs = (src: Rgba, w: number, h: number): Rgba => ({ data: resizeRgba(src.data, src.width, src.height, w, h), width: w, height: h });
    const c = findMeterCircles(cv, img, rs).slice(0, 2);
    expect(c.some(k => Math.hypot((k.x - 90 / 1238) * 1238, (k.y - 216 / 560) * 560) < 25)).toBe(true);
  }, 30000);
  it('recovers the meter from a tap near it', () => {
    const c = circleNear(cv, load('wall'), 600, 345);
    expect(c && Math.hypot(c.x - 606, c.y - 334)).toBeLessThan(20);
    expect(c!.r).toBeGreaterThan(15);
  }, 30000);
});
