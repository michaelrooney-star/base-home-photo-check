import { describe, expect, it } from 'vitest';
import { createFocusTracker, createSteadyWindow, motion } from './metrics';

describe('createFocusTracker', () => {
  it('scores each frame against the sharpest frame in the recent window', () => {
    const f = createFocusTracker(1000);
    expect(f(0, 400)).toBe(1);        // a soft webcam's best is still "in focus"
    expect(f(100, 380)).toBeCloseTo(0.95);
    expect(f(200, 120)).toBeCloseTo(0.3); // shake / refocus
    expect(f(1500, 120)).toBe(1);     // the old peak has aged out of the window
  });
});

describe('steadiness for a hand-held phone', () => {
  // A 256×256 frame of fine print (alternating 2-px stripes), and the same frame shifted by 1–2 px: normal hand tremor.
  const stripes = (shift: number) => { const d = new Uint8ClampedArray(256 * 256); for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) d[y * 256 + x] = ((x + shift) >> 1) % 2 ? 230 : 30; return { data: d, width: 256, height: 256 }; };
  it('ignores 1–2 px of tremor on fine print', () => {
    expect(motion(stripes(0), stripes(1))).toBeLessThan(14);
    expect(motion(stripes(0), stripes(2))).toBeLessThan(14);
  });
  it('still notices real movement', () => {
    const blank = { data: new Uint8ClampedArray(256 * 256).fill(30), width: 256, height: 256 };
    const half = { data: new Uint8ClampedArray(256 * 256).map((_, i) => (i % 256 < 128 ? 30 : 230)), width: 256, height: 256 };
    expect(motion(blank, half)).toBeGreaterThan(14);
  });
  it('counts good frames in the last few, so one shaky frame doesn’t reset', () => {
    const w = createSteadyWindow(6);
    const seq = [true, true, false, true, true].map(w);
    expect(seq.at(-1)).toBe(4);
    expect([false, false, false, false, false, false].map(w).at(-1)).toBe(0); // the window slides
  });
});
