import { describe, expect, it } from 'vitest';
import { completion, nextStep, type Photo, type Photos } from '../photos';
import { planWall, type SpaceSummary } from './survey';

const photo = (space?: SpaceSummary): Photo => ({ url: 'x', source: 'camera', status: 'confirmed', warnings: [], check: { accepted: true, meterNumber: null, reasons: [], space } });
const crowded: SpaceSummary = { spot: null, nearest: { left: { kind: 'box', name: 'electrical box' }, right: { kind: 'box', name: 'large cabinet' } }, bestFt: { left: 2, right: 1.4 }, sides: ['left', 'right'], text: 'No clear 3 ft stretch of wall in this photo.' };
const openLeft: SpaceSummary = { spot: { side: 'left', ft: 4.3, gapFt: 1.5, open: true }, nearest: { right: { kind: 'box', name: 'electrical box' } }, bestFt: { left: 4.3, right: 2.6 }, sides: ['left', 'right'], text: '' };
const sideNone = (side: 'left' | 'right'): SpaceSummary => ({ spot: null, nearest: {}, bestFt: { [side]: 1 }, sides: [side], text: '' });
const sideSpot = (side: 'left' | 'right'): SpaceSummary => ({ spot: { side, ft: 6.5, gapFt: 7, open: true }, nearest: {}, bestFt: { [side]: 6.5 }, sides: [side], text: '' });

describe('planWall', () => {
  it('uses Base’s order when the whole-wall photo couldn’t be analysed', () => {
    expect(planWall({}).todo).toEqual(['right', 'left']);
    expect(planWall({ wall: photo() }).todo).toEqual(['right', 'left']);
  });
  it('open wall in the whole-wall photo: one side photo toward it, the other side is not needed', () => {
    const p = planWall({ wall: photo(openLeft) });
    expect(p.todo).toEqual(['left']);
    expect(p.notNeeded.right).toBeTruthy();
    expect(p.hints.left).toMatch(/Open wall to the left/);
    expect(p.summary).toMatch(/4\+ ft of clear wall left/);
  });
  it('crowded meter: looks along the side with more clear wall first, naming what is in the way', () => {
    const p = planWall({ wall: photo(crowded) });
    expect(p.todo).toEqual(['left', 'right']);
    expect(p.hints.left).toBe('Face along the wall to the left. Step back to see past the electrical box.');
  });
  it('stops as soon as a side photo shows open wall', () => {
    const p = planWall({ wall: photo(crowded), left: photo(sideSpot('left')) });
    expect(p.todo).toEqual([]);
    expect(p.notNeeded.right).toBeTruthy();
    expect(p.spot).toMatchObject({ side: 'left', photo: 'left' });
  });
  it('tries the other side, then points to the adjacent wall', () => {
    const one = planWall({ wall: photo(crowded), left: photo(sideNone('left')) });
    expect(one.todo).toEqual(['right']);
    expect(one.hints.right).toBe('Nothing open on the left. Try the right, past the large cabinet.');
    const both = planWall({ wall: photo(crowded), left: photo(sideNone('left')), right: photo(sideNone('right')) });
    expect(both.todo).toEqual([]);
    expect(both.hints.adjacent).toMatch(/around the corner/);
    expect(both.summary).toMatch(/No clear 3 ft stretch/);
  });
});

describe('nextStep and completion follow the plan', () => {
  it('goes from the wall to the promising side, and skips the other side once a spot is found', () => {
    const a: Photos = { wall: photo(openLeft) };
    expect(nextStep('wall', a, 'no')).toBe('left');
    expect(nextStep('left', { ...a, left: photo(sideNone('left')) }, 'no')).toBe('breaker'); // adjacent wall not needed either
    expect(nextStep('meter', a, 'no')).toBe('wall');
    expect(nextStep('adjacent', a, 'no')).toBe('breaker');
  });
  it('crowded wall: both sides, then the wall around the corner', () => {
    const p: Photos = { wall: photo(crowded), left: photo(sideNone('left')) };
    expect(nextStep('left', p, 'no')).toBe('right');
    expect(nextStep('right', { ...p, right: photo(sideNone('right')) }, 'no')).toBe('adjacent');
  });
  it('drops photos that aren’t needed from the total', () => {
    const p: Photos = { wall: photo(openLeft), left: photo(sideNone('left')) };
    expect(completion(p, 'no', 'garage')).toMatchObject({ complete: 2, total: 5 }); // right and adjacent not needed
  });
});
