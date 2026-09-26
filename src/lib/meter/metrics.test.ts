import { describe, expect, it } from 'vitest';
import { createFocusTracker } from './metrics';

describe('createFocusTracker', () => {
  it('scores each frame against the sharpest frame in the recent window', () => {
    const f = createFocusTracker(1000);
    expect(f(0, 400)).toBe(1);        // a soft webcam's best is still "in focus"
    expect(f(100, 380)).toBeCloseTo(0.95);
    expect(f(200, 120)).toBeCloseTo(0.3); // shake / refocus
    expect(f(1500, 120)).toBe(1);     // the old peak has aged out of the window
  });
});
