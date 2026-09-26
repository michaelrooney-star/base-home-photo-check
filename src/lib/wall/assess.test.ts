import { describe, expect, it } from 'vitest';
import { decideWall, estimateFeet, guideWall, spaceLimitedOnly, type SceneResult, type WallEvidence, type WallLive } from './assess';
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
    // ...unless the meter cover, used as a ruler, shows plenty of wall and ground.
    expect(failed({ ...good, scene: closeup })).toEqual([]);
  });
  it('accepts a tight-space photo that still shows 3 ft each side and the ground, however big the meter looks', () => {
    // Like the 205 E Riverside photos: close enough that the cover fills 15 % of the height, but ~3.5 ft shows each side.
    const tight: WallEvidence = { ...good, scene: closeup, meter: { x: 0.5, y: 0.3, r: 0.075, source: 'auto' }, width: 1920, height: 1080 };
    const d = decideWall(tight);
    expect(d.estimate!.leftFt).toBeGreaterThan(3); expect(d.estimate!.belowFt).toBeGreaterThan(2.5);
    expect(d.accepted).toBe(true);
  });
  it('still calls it too close when the wall beside the meter is cut off', () => {
    expect(failed({ ...good, meter: { x: 0.5, y: 0.2, r: 0.08, source: 'auto' } })).toEqual(['distance', 'sides']);
  });
  it('needs 2.5 ft of ground below the meter', () => {
    const at = (belowFt: number) => { const r = 0.05, y = 1 - (belowFt * 12 * (2 * r)) / 7; return decideWall({ ...good, meter: { x: 0.5, y, r, source: 'auto' } }); };
    expect(at(2.7).accepted).toBe(true);
    expect(at(2.3).reasons).toEqual([M.ground]);
  });
  it('"I can’t step back any further" waives distance and side coverage only', () => {
    const cramped: WallEvidence = { ...good, meter: { x: 0.5, y: 0.2, r: 0.08, source: 'auto' } };
    const before = decideWall(cramped);
    expect(before.accepted).toBe(false); expect(spaceLimitedOnly(before)).toBe(true);
    const after = decideWall({ ...cramped, limitedSpace: true });
    expect(after).toMatchObject({ accepted: true, limitedSpace: true });
    expect(after.checks.find(c => c.id === 'distance')!.state).toBe('skipped');
    // Still needs the meter, the ground, light and focus.
    expect(spaceLimitedOnly(decideWall({ ...cramped, luma: 10 }))).toBe(false);
    expect(decideWall({ ...cramped, meter: { ...cramped.meter!, y: 0.9 }, limitedSpace: true }).reasons).toEqual([M.ground]);
    expect(spaceLimitedOnly(decideWall({ ...good, meter: null }))).toBe(false);
    expect(spaceLimitedOnly(decideWall(good))).toBe(false);
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

describe('decideWall — side photos', () => {
  // Base's side samples: right.png (1238×560) meter at (90, 216); left.png (1242×754) meter at (984, 258).
  const right: WallEvidence = { ...good, meter: { x: 90 / 1238, y: 216 / 560, r: 20 / 560, source: 'auto' }, width: 1238, height: 560 };
  const left: WallEvidence = { ...good, meter: { x: 984 / 1242, y: 258 / 754, r: 31 / 754, source: 'auto' }, width: 1242, height: 754 };
  it('accepts Base’s own right-side and left-side examples', () => {
    expect(decideWall(right, 'right')).toMatchObject({ accepted: true, estimate: null });
    expect(decideWall(left, 'left')).toMatchObject({ accepted: true, estimate: null });
  });
  it('spots a photo of the wrong side', () => {
    expect(decideWall(left, 'right').reasons).toEqual([M.wrongSide.right]);
    expect(decideWall(right, 'left').reasons).toEqual([M.wrongSide.left]);
  });
  it('asks to turn further when the meter is near the middle', () => {
    expect(decideWall({ ...right, meter: { ...right.meter!, x: 0.5 } }, 'right').reasons).toEqual([M.turnMore.right]);
  });
  it('needs the meter in the side photo, with side-specific wording', () => {
    expect(decideWall({ ...right, meter: null }, 'right').reasons).toEqual([M.sideNoMeter.right]);
  });
  it('labels the direction check for the side being photographed', () => {
    expect(decideWall(left, 'left').checks.find(c => c.id === 'direction')!.label).toMatch(/left of the meter/);
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
  it('uses side-specific wording for the side photos', () => {
    expect(guideWall({ ...base, mode: 'right' }).message).toBe(M.sideReady.right);
    expect(guideWall({ ...base, mode: 'left', scene: null }).message).toBe(M.sidePoint.left);
  });
  it('judges focus relative to the camera’s recent best', () => {
    expect(guideWall({ ...base, fast: { ...base.fast!, sharpness: 300, relSharpness: 0.9 } }).tone).toBe('ready');
    expect(guideWall({ ...base, fast: { ...base.fast!, sharpness: 300, relSharpness: 0.4 } }).message).toBe(M.blurry);
  });
});
