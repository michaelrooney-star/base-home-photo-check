import { describe, expect, it } from 'vitest';
import { decodeDetections, letterbox, toTensor, WALL_OBJECT_CLASSES, type Detection } from './objects';
import { checkRuler, customerSpaceText, describeSpace, findSpace, greenProfile, plantBand } from './space';

describe('detector input and output', () => {
  it('letterboxes a landscape photo into 640×640 with grey bars top and bottom', () => {
    const lb = letterbox(2016, 1512);
    expect(lb).toMatchObject({ w: 640, h: 480, padX: 0, padY: 80 });
    const t = toTensor(new Uint8ClampedArray(640 * 480 * 4).fill(255), lb);
    expect(t.length).toBe(3 * 640 * 640);
    expect(t[0]).toBeCloseTo(114 / 255); // padding
    expect(t[80 * 640]).toBe(1); // first photo row
  });
  it('decodes boxes back to photo shares, groups labels, and drops overlapping duplicates', () => {
    const n = WALL_OBJECT_CLASSES.length, anchors = 3, rows = 4 + n + 32, out = new Float32Array(rows * anchors);
    const set = (a: number, cx: number, cy: number, w: number, h: number, cls: number, score: number) => {
      out[a] = cx; out[anchors + a] = cy; out[2 * anchors + a] = w; out[3 * anchors + a] = h; out[(4 + cls) * anchors + a] = score;
    };
    const lb = letterbox(2016, 1512);
    set(0, 320, 320, 64, 64, WALL_OBJECT_CLASSES.indexOf('gas meter'), 0.9); // centre of the photo
    set(1, 322, 321, 60, 62, WALL_OBJECT_CLASSES.indexOf('metal electrical box'), 0.6); // duplicate of 0
    set(2, 100, 500, 40, 40, WALL_OBJECT_CLASSES.indexOf('door'), 0.1); // below the door threshold
    const d = decodeDetections(out, anchors, lb, 2016, 1512);
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe('box'); // a "gas meter" is reported as an equipment box
    expect(d[0].x0).toBeCloseTo(0.45); expect(d[0].y1).toBeCloseTo(0.5 + 32 / 480);
  });
});

// Detections from the real model on eval/wall (see npm run eval:wall).
const det = (kind: Detection['kind'], x0: number, x1: number, y0: number, y1: number): Detection => ({ kind, label: 'metal electrical box', score: 0.8, x0, x1, y0, y1 });

describe('findSpace', () => {
  it('205 E Riverside: electrical box left, large cabinet right, no 3 ft stretch', () => {
    const f = findSpace({
      meter: { x: 0.46, y: 0.4, r: 0.043, source: 'auto' }, width: 2016, height: 1512, mode: 'wall', green: [],
      detections: [det('box', 0.08, 0.19, 0.54, 0.73), det('box', 0.67, 1, 0.32, 0.87), det('meter', 0.4, 0.51, 0.33, 0.57)],
    });
    expect(f.spot).toBeNull();
    expect(f.nearest.left?.name).toBe('electrical box');
    expect(f.nearest.right?.name).toBe('large cabinet');
    expect(describeSpace(f)).toBe('No clear 3 ft stretch of wall in this photo. In the way: electrical box left of the meter; large cabinet right of the meter.');
  });
  it('Base’s sample wall: clear brick wall to the left of the meter', () => {
    const f = findSpace({
      // The hedge on the right (x ≥ 0.8) shows up as plant-coloured columns.
      meter: { x: 0.489, y: 0.381, r: 0.032, source: 'auto' }, width: 1240, height: 876, mode: 'wall', green: [0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0.9],
      detections: [det('box', 0.45, 0.53, 0.31, 0.46), det('box', 0.33, 0.44, 0.18, 0.46), det('box', 0.56, 0.62, 0.45, 0.53)],
    });
    expect(f.spot).toMatchObject({ side: 'left', open: true });
    expect(f.spot!.ft).toBeGreaterThan(4);
  });
  it('talks to the customer in plain words, with the right article', () => {
    const f = findSpace({
      meter: { x: 0.46, y: 0.4, r: 0.043, source: 'auto' }, width: 2016, height: 1512, mode: 'wall', green: [],
      detections: [det('ac', 0.08, 0.19, 0.54, 0.73), det('box', 0.67, 1, 0.32, 0.87)],
    });
    expect(customerSpaceText(f)).toBe('There’s an AC unit on the left and a large cabinet on the right of your meter. Next, we’ll look along the wall for open space.');
  });
  it('re-sizes the ruler from the meter enclosure when a round digit was picked instead of the glass cover', () => {
    const box = det('meter', 0.4, 0.51, 0.33, 0.57);
    const digit = { x: 0.45, y: 0.5, r: 0.012, source: 'auto' as const };
    const fixed = checkRuler(digit, [box], 2016, 1512);
    expect(2 * fixed.r! * 1512).toBeCloseTo(0.6 * 0.11 * 2016, 0);
    expect(fixed.y).toBeLessThan(0.45);
    const cover = { x: 0.46, y: 0.4, r: 0.043, source: 'auto' as const }; // the real cover: left alone
    expect(checkRuler(cover, [box], 2016, 1512)).toBe(cover);
  });
  it('ignores things mounted above the meter and whole-scene detections', () => {
    const f = findSpace({
      meter: { x: 0.5, y: 0.5, r: 0.03, source: 'auto' }, width: 2000, height: 1500, mode: 'wall', green: [],
      detections: [det('box', 0.05, 0.3, 0.0, 0.2), det('opening', 0, 1, 0, 1)],
    });
    expect(f.blockers.map(b => b.kind)).toEqual(['meter']);
    expect(f.spot).not.toBeNull();
  });
  it('side photo: only the side being photographed counts', () => {
    const f = findSpace({ meter: { x: 0.1, y: 0.4, r: 0.04, source: 'auto' }, width: 2000, height: 1500, mode: 'right', green: [], detections: [] });
    expect(f.sides).toEqual(['right']);
    expect(f.stretches.every(s => s.side === 'right')).toBe(true);
  });
  it('tall plants at meter height block the wall; the lawn in front doesn’t', () => {
    const W = 64, H = 100, rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, plant = (x >= 40 && y >= 30) || y >= 80; // bush on the right, lawn along the bottom
      rgba.set(plant ? [60, 140, 50, 255] : [150, 150, 150, 255], i);
    }
    const meter = { x: 0.3, y: 0.4, r: 0.05, source: 'auto' as const };
    const green = greenProfile(rgba, W, H, ...plantBand(meter), 16);
    const f = findSpace({ meter, width: W, height: H, mode: 'wall', green, detections: [] });
    expect(f.nearest.right?.kind).toBe('plants');
    expect(f.nearest.left).toBeUndefined();
  });
});
