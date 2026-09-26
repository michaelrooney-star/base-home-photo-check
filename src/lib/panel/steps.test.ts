import { describe, expect, it } from 'vitest';
import { decideAdjacent, decideBreaker, decideFence, decideRating } from './steps';
import type { SubjectResult } from '../meter/acceptance';

const good = { luma: 120, sharpness: 80 };
const subject = (top: SubjectResult & { status: 'ok' } extends { top: infer T } ? T : never, p = 0.8): SubjectResult =>
  ({ status: 'ok', top, probs: { electric_meter: 0.05, gas_meter: 0.05, water_meter: 0.05, breaker_panel: 0.05, other: 0.05, [top]: p } });
const wall = { status: 'ok' as const, top: 'house_wall' as const, probs: { house_wall: 0.8, meter_closeup: 0.05, indoors: 0.1, other: 0.05 } };
const indoors = { status: 'ok' as const, top: 'indoors' as const, probs: { house_wall: 0.1, meter_closeup: 0.05, indoors: 0.8, other: 0.05 } };

describe('breaker box', () => {
  it('accepts a breaker panel', () => { expect(decideBreaker({ ...good, subject: subject('breaker_panel') })).toMatchObject({ accepted: true, line: 'Breaker box found.' }); });
  it('says when it is the meter instead', () => { expect(decideBreaker({ ...good, subject: subject('electric_meter') }).line).toMatch(/That’s your meter/); });
  it('does not block when recognition is unavailable, but says it wasn’t checked', () => {
    const r = decideBreaker({ ...good, subject: null });
    expect(r.accepted).toBe(true); expect(r.chips[0].state).toBe('info');
  });
  it('asks for light in a dark closet', () => { expect(decideBreaker({ luma: 20, sharpness: 80, subject: subject('breaker_panel') }).line).toMatch(/Too dark/); });
});

describe('main breaker rating', () => {
  it('reports the amps and saves them', () => { expect(decideRating({ ...good, amps: 200 })).toMatchObject({ accepted: true, line: 'Reads 200 A.', amps: 200 }); });
  it('asks to move closer when the number can’t be read', () => { expect(decideRating({ ...good, amps: null }).line).toMatch(/Move closer/); });
  it('blames the light or blur first when that’s the problem', () => { expect(decideRating({ luma: 20, sharpness: 80, amps: null }).line).toMatch(/Too dark/); });
});

describe('adjacent wall and fence', () => {
  it('accepts the adjacent wall and lists what is on it', () => {
    expect(decideAdjacent({ ...good, scene: wall, groundSeen: true, objects: ['a door or window'] })).toMatchObject({ accepted: true, line: 'On this wall: a door or window.' });
  });
  it('needs the ground and an outside wall', () => {
    expect(decideAdjacent({ ...good, scene: wall, groundSeen: false, objects: [] }).line).toMatch(/show the ground/);
    expect(decideAdjacent({ ...good, scene: indoors, groundSeen: true, objects: [] }).line).toMatch(/outside/);
  });
  it('fence: outside, with the ground', () => {
    expect(decideFence({ ...good, scene: wall, groundSeen: true }).accepted).toBe(true);
    expect(decideFence({ ...good, scene: indoors, groundSeen: true }).accepted).toBe(false);
  });
});
