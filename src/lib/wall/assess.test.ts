import { describe, expect, it } from 'vitest';
import { decideWall, estimateFeet, guideWall, type SceneResult, type WallEvidence, type WallLive } from './assess';
import { WALL_MESSAGES as M } from './criteria';

const wall: SceneResult = { status: 'ok', top: 'house_wall', probs: { house_wall: 0.85, meter_closeup: 0.05, indoors: 0.05, other: 0.05 } };
const closeup: SceneResult = { status: 'ok', top: 'meter_closeup', probs: { house_wall: 0.2, meter_closeup: 0.75, indoors: 0.02, other: 0.03 } };
const indoors: SceneResult = { status: 'ok', top: 'indoors', probs: { house_wall: 0.1, meter_closeup: 0.05, indoors: 0.8, other: 0.05 } };
// Base's whole-wall sample: 1240×876, meter cover centre (606, 334), radius 28 px.
const good: WallEvidence = { scene: wall, meter: { x: 606 / 1240, y: 334 / 876, r: 28 / 876, source: 'auto' }, width: 1240, height: 876, luma: 150, sharpness: 300 };
const failed = (e: WallEvidence) => decideWall(e).checks.filter(c => c.state === 'fail').map(c => c.id);

describe('estimateFeet', () => {
  it('uses the 7-inch meter cover as a ruler', () => {
    const f = estimateFeet(good.meter!, good.width, good.height)!;
    expect(f.leftFt).toBeCloseTo(6.3, 0); expect(f.rightFt).toBeCloseTo(6.6, 0); expect(f.belowFt).toBeCloseTo(5.6, 0);
  });
  it('returns nothing when the cover size is unknown', () => { expect(estimateFeet({ ...good.meter!, r: null }, 100, 100)).toBeNull(); });
});

describe('decideWall', () => {
  it('accepts Base’s own whole-wall example', () => { expect(decideWall(good)).toMatchObject({ accepted: true, reasons: [] }); });
  it('rejects a photo without the meter', () => { expect(decideWall({ ...good, meter: null }).reasons[0]).toBe(M.noMeter); });
  it('rejects a close-up: meter too big in frame', () => { expect(failed({ ...good, meter: { ...good.meter!, r: 0.2 } })).toContain('distance'); });
  it('uses the scene classifier for distance too', () => {
    expect(failed({ ...good, scene: closeup, meter: { ...good.meter!, r: null } })).toEqual(['distance']);
    expect(failed({ ...good, scene: closeup })).toEqual(['distance']);
  });
  it('asks for more wall on the short side', () => {
    expect(decideWall({ ...good, meter: { ...good.meter!, x: 0.1 } }).reasons).toContain(M.moreLeft);
    expect(decideWall({ ...good, meter: { ...good.meter!, x: 0.92 } }).reasons).toContain(M.moreRight);
  });
  it('asks for the ground when the meter sits low in the frame', () => {
    expect(decideWall({ ...good, meter: { ...good.meter!, y: 0.9 } }).reasons).toContain(M.ground);
    expect(decideWall({ ...good, meter: { ...good.meter!, y: 0.9, r: null } }).reasons).toContain(M.ground);
  });
  it('rejects indoor photos, portrait photos, dark and blurry photos', () => {
    expect(failed({ ...good, scene: indoors })).toEqual(['scene']);
    expect(failed({ ...good, width: 700, height: 1000 })).toContain('orientation');
    expect(failed({ ...good, luma: 10 })).toEqual(['light']);
    expect(failed({ ...good, sharpness: 5 })).toEqual(['focus']);
  });
  it('does not block when the classifier is unavailable', () => {
    const d = decideWall({ ...good, scene: { status: 'unavailable' } });
    expect(d.accepted).toBe(true); expect(d.checks[0].state).toBe('skipped');
  });
});

describe('guideWall', () => {
  const base: WallLive = { now: 5000, fast: { luma: 150, sharpness: 3000, relSharpness: 1, glare: 0, motion: 1 }, goodFrames: 10, landscape: true, scene: { result: wall, at: 4500 } };
  it('says ready when steady, lit, landscape and a house wall', () => { expect(guideWall(base)).toMatchObject({ tone: 'ready', message: M.ready }); });
  it('prioritises one instruction', () => {
    expect(guideWall({ ...base, landscape: false }).message).toBe(M.landscape);
    expect(guideWall({ ...base, scene: { result: closeup, at: 4500 } }).message).toBe(M.closeup);
    expect(guideWall({ ...base, scene: { result: indoors, at: 4500 } }).message).toBe(M.indoors);
    expect(guideWall({ ...base, fast: { ...base.fast!, motion: 20 } }).message).toBe(M.steady);
  });
  it('judges focus relative to the camera’s recent best', () => {
    expect(guideWall({ ...base, fast: { ...base.fast!, sharpness: 300, relSharpness: 0.9 } }).tone).toBe('ready');
    expect(guideWall({ ...base, fast: { ...base.fast!, sharpness: 300, relSharpness: 0.4 } }).message).toBe(M.blurry);
  });
});
