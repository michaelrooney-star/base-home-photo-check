import { describe, expect, it } from 'vitest';
import { guideStep, whatWeSee, type Look } from './live';

const fast = { luma: 120, sharpness: 300, relSharpness: 1, glare: 0, motion: 2 };
const subject = (top: 'breaker_panel' | 'electric_meter' | 'other', p = 0.8) =>
  ({ status: 'ok' as const, top, probs: { electric_meter: 0.05, gas_meter: 0.05, water_meter: 0.05, breaker_panel: 0.05, other: 0.05, [top]: p } });
const framing = (part: number) => ({ status: 'ok' as const, top: part > 0.5 ? 'part_of_panel' as const : 'whole_panel' as const, probs: { whole_panel: 1 - part, part_of_panel: part } });
const scene = (top: 'house_wall' | 'indoors' | 'meter_closeup' | 'other') => ({ status: 'ok' as const, top, probs: { house_wall: 0.05, meter_closeup: 0.05, indoors: 0.05, other: 0.05, [top]: 0.85 } });
const at = (look: Omit<Look, 'at'>): Look => ({ at: 1000, ...look });
const base = { step: 'breaker' as const, fast, goodFrames: 6, streak: 3, recognition: 'ready' as const, now: 1500 };

describe('live guidance: breaker box', () => {
  it('a face (or anything else) is never "looks good", however sharp and steady', () => {
    const g = guideStep({ ...base, look: at({ subject: subject('other'), framing: framing(0.3) }) });
    expect(g).toMatchObject({ tone: 'search', text: 'Point at your breaker box.', capture: false });
  });
  it('asks her to aim while recognition is still loading', () => {
    expect(guideStep({ ...base, look: null, recognition: 'loading' }).text).toBe('Point at your breaker box.');
  });
  it('recognises the meter and points her to the breaker box', () => {
    expect(guideStep({ ...base, look: at({ subject: subject('electric_meter') }) }).text).toBe('That’s the meter — find the breaker box.');
  });
  it('only names the meter when the recognizer is sure; a close call gets the neutral message', () => {
    expect(guideStep({ ...base, look: at({ subject: subject('electric_meter', 0.45) }) }).text).toBe('Point at your breaker box.');
  });
  it('asks her to step back when only part of the box is in view', () => {
    expect(guideStep({ ...base, look: at({ subject: subject('breaker_panel'), framing: framing(0.8) }) }).text).toBe('Step back to fit the whole box.');
  });
  it('whole box, steady, seen twice in a row: "looks good" and auto-capture', () => {
    const look = at({ subject: subject('breaker_panel'), framing: framing(0.2) });
    expect(guideStep({ ...base, look })).toMatchObject({ tone: 'ready', capture: true });
    expect(guideStep({ ...base, look, streak: 1 })).toMatchObject({ tone: 'hold', text: 'Breaker box found — hold steady.', capture: false });
    expect(guideStep({ ...base, look, goodFrames: 1 }).capture).toBe(false);
  });
  it('ignores a stale recognizer result', () => {
    const look = at({ subject: subject('breaker_panel'), framing: framing(0.2) });
    expect(guideStep({ ...base, look, now: 5000 }).text).toBe('Point at your breaker box.');
  });
  it('without recognition, guides on steadiness only and never claims the photo is right', () => {
    const g = guideStep({ ...base, look: null, recognition: 'failed' });
    expect(g).toMatchObject({ tone: 'hold', text: 'Hold steady, then take the photo.', capture: false });
  });
});

describe('live guidance: other steps', () => {
  it('adjacent wall: needs the outside wall of the house', () => {
    expect(whatWeSee('adjacent', at({ scene: scene('indoors') }))).toBe('indoors');
    expect(whatWeSee('adjacent', at({ scene: scene('meter_closeup') }))).toBe('close');
    expect(guideStep({ ...base, step: 'adjacent', look: at({ scene: scene('house_wall') }) })).toMatchObject({ tone: 'ready', text: 'Looks good — take the photo.', capture: false });
    expect(guideStep({ ...base, step: 'adjacent', look: at({ scene: scene('other') }) }).text).toBe('Point at the wall around the corner.');
  });
  it('fence: anything outdoors will do', () => {
    expect(whatWeSee('fence', at({ scene: scene('other') }))).toBe('target');
    expect(whatWeSee('fence', at({ scene: scene('indoors') }))).toBe('indoors');
  });
  it('rating: never a green "ready"', () => {
    expect(guideStep({ ...base, step: 'rating', look: null }).tone).toBe('hold');
  });
});
