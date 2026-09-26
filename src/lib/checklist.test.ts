import { describe, expect, it } from 'vitest';
import { checklist } from './checklist';
import type { Photo } from './photos';
import type { SpaceSummary } from './wall/survey';

const photo = (check: Partial<NonNullable<Photo['check']>> = {}): Photo => ({ url: 'x', source: 'camera', status: 'confirmed', warnings: [], check: { accepted: true, meterNumber: null, reasons: [], ...check } });
const openLeft: SpaceSummary = { spot: { side: 'left', ft: 4.3, gapFt: 1.5, open: true }, nearest: {}, bestFt: { left: 4.3 }, sides: ['left', 'right'], text: '' };

describe('checklist', () => {
  it('groups photos into meter, space and panel, and counts only what is expected', () => {
    const c = checklist({}, null, '');
    expect(c.sections.map(s => s.id)).toEqual(['meter', 'space', 'panel']);
    expect(c.needed).toBe(7); // the fence isn't counted until the customer says there is one
    expect(checklist({}, 'yes', '').needed).toBe(8);
    expect(checklist({}, 'no', '').sections[1].rows.map(r => r.id)).not.toContain('fence');
  });
  it('shows what each photo found', () => {
    const c = checklist({ meter: photo({ meterNumber: '149 214 094' }), rating: photo({ amps: 200 }), wall: photo({ space: openLeft }) }, 'no', 'garage');
    const note = (id: string) => c.sections.flatMap(s => s.rows).find(r => r.id === id)?.note;
    expect(note('meter')).toBe('Meter 149 214 094');
    expect(note('rating')).toBe('Reads 200 A');
    expect(note('wall')).toBe('Open wall, about 4+ ft left');
    expect(c.sections[1].finding).toBe('Open wall found');
  });
  it('marks photos the survey no longer needs, and stops counting them', () => {
    const c = checklist({ wall: photo({ space: openLeft }), left: photo() }, 'no', '');
    const rows = c.sections[1].rows;
    expect(rows.map(r => r.id)).toEqual(['wall', 'left', 'right', 'adjacent']);
    expect(rows.filter(r => r.state === 'skipped').map(r => r.id)).toEqual(['right', 'adjacent']);
    expect(c).toMatchObject({ needed: 5, done: 2 });
  });
});
