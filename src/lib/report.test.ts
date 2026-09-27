import { describe, expect, it } from 'vitest';
import { buildReport, reportText } from './report';
import type { Notes, Photo } from './photos';
import type { SpaceSummary } from './wall/survey';

const photo = (check: Partial<NonNullable<Photo['check']>> = {}, source: Photo['source'] = 'camera'): Photo => ({ url: 'x', source, status: 'confirmed', warnings: [], check: { accepted: true, meterNumber: null, reasons: [], ...check } });
const openLeft: SpaceSummary = { spot: { side: 'left', ft: 4.3, gapFt: 1.5, open: true }, nearest: {}, bestFt: { left: 4.3 }, sides: ['left', 'right'], text: '' };
const notes: Notes = { solar: 'no', obstructions: [], text: '' };
const all = { meter: photo({ meterNumber: '149 214 094' }), wall: photo({ space: openLeft }), left: photo(), breaker: photo(), rating: photo({ amps: 200 }) };

describe('buildReport', () => {
  it('summarises what the photos found and is ready when nothing is missing', () => {
    const r = buildReport(all, 'no', 'garage', notes);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(Object.fromEntries(r.findings.map(f => [f.label, f.value]))).toMatchObject({
      'Meter number': '149 214 094', 'Space for the battery': 'About 4+ ft of open wall left of the meter', 'Main breaker': '200 A', 'Breaker box location': 'Garage', 'Solar panels': 'No',
    });
    expect(r.reviewerNotes[0]).toMatch(/Possible battery spot/);
  });
  it('lists what is still needed, and needs the solar and fence answers', () => {
    const r = buildReport({ meter: all.meter }, null, '', { ...notes, solar: null });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('Whole meter wall');
    expect(r.findings.find(f => f.label === 'Solar panels')).toMatchObject({ value: 'Not answered', missing: true });
  });
  it('flags overrides, samples and customer notes for reviewers', () => {
    const r = buildReport({ ...all, breaker: photo({ override: true, accepted: false, reasons: ['Blurry'] }), rating: photo({ amps: 200 }, 'sample') }, 'no', 'garage', { ...notes, text: 'Gate code 1234' });
    expect(r.reviewerNotes).toEqual(expect.arrayContaining([expect.stringMatching(/Breaker box: sent without passing/), expect.stringMatching(/Base guide sample/), 'Customer note: Gate code 1234']));
    expect(reportText(r)).toMatch(/Main breaker: 200 A/);
  });
});
