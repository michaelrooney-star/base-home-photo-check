import { describe, expect, it } from 'vitest';
import { decide, type PhotoEvidence, type SubjectResult } from './acceptance';
import { MESSAGES } from './criteria';
import { guide, type LiveInput } from './guidance';
import { aggregate, PROMPTS } from './analyzer';

const electric: SubjectResult = { status: 'ok', top: 'electric_meter', probs: { electric_meter: 0.9, gas_meter: 0.05, water_meter: 0, breaker_panel: 0, other: 0.05 } };
const gas: SubjectResult = { status: 'ok', top: 'gas_meter', probs: { electric_meter: 0.2, gas_meter: 0.7, water_meter: 0, breaker_panel: 0, other: 0.1 } };
const readable = { meter_number_visible: true, meter_number: '149 214 094', all_characters_certain: true, number_fully_in_frame: true, issues: [], number_height_ratio: 0.03 };
const good: PhotoEvidence = { subject: electric, reading: readable, luma: 180, glare: 0, sharpness: 500, regionHeightPx: 1000 };
const failed = (e: PhotoEvidence) => decide(e).checks.filter(c => c.state !== 'pass').map(c => c.id);

describe('decide (final accept/reject)', () => {
  it('accepts an electric meter with a readable number', () => { expect(decide(good)).toMatchObject({ accepted: true, meterNumber: '149 214 094', reasons: [] }); });
  it('rejects a gas meter and says so', () => { const d = decide({ ...good, subject: gas }); expect(d.accepted).toBe(false); expect(d.reasons[0]).toBe(MESSAGES.gas); });
  it('does not block a readable meter when recognition could not run (older phones), but marks it unchecked', () => {
    const d = decide({ ...good, subject: { status: 'unavailable' } });
    expect(d.accepted).toBe(true);
    expect(d.checks.find(c => c.id === 'subject')).toMatchObject({ state: 'skipped' });
    expect(decide({ ...good, subject: { status: 'loading' } }).accepted).toBe(true);
  });
  it('still needs recognition when the number could not be read', () => {
    expect(decide({ ...good, subject: { status: 'unavailable' }, reading: { ...readable, all_characters_certain: false } }).accepted).toBe(false);
  });
  it('rejects dark photos even if the number was read', () => { expect(failed({ ...good, luma: 20 })).toEqual(['light']); });
  it('ignores glare when the number is readable, but reports it when it is not', () => {
    expect(decide({ ...good, glare: 0.2 }).accepted).toBe(true);
    expect(failed({ ...good, glare: 0.2, reading: { ...readable, all_characters_certain: false } })).toEqual(['glare', 'number']);
  });
  it('lets a confident number read outweigh a soft photo, but rejects blur when the number is unreadable', () => {
    expect(decide({ ...good, sharpness: 5 }).accepted).toBe(true);
    expect(failed({ ...good, sharpness: 5, reading: { ...readable, all_characters_certain: false } })).toEqual(['focus', 'number']);
  });
  it('rejects numbers too small to read reliably in the saved photo', () => { expect(failed({ ...good, regionHeightPx: 300 })).toEqual(['number']); });
  it('explains a missing number', () => { const d = decide({ ...good, reading: { ...readable, meter_number_visible: false, meter_number: '', all_characters_certain: false } }); expect(d.reasons[0]).toBe(MESSAGES.notFoundFinal); });
  it('rejects cut-off and covered numbers', () => { expect(failed({ ...good, reading: { ...readable, number_fully_in_frame: false, issues: ['obstructed'] } })).toEqual(['framing', 'clear']);
    expect(failed({ ...good, reading: { ...readable, issues: ['truncated'] } })).toEqual(['clear']); });
});

describe('guide (live instructions)', () => {
  const base: LiveInput = { now: 10_000, fast: { luma: 180, sharpness: 4000, relSharpness: 1, glare: 0, motion: 1 }, goodFrames: 10, subject: { result: electric, at: 9_500 }, reading: { obs: readable, at: 9_500, regionHeightPx: 1000 } };
  it('captures when everything is good', () => { expect(guide(base)).toMatchObject({ tone: 'ready', capture: true }); });
  it('waits for enough steady frames', () => { expect(guide({ ...base, goodFrames: 2 })).toMatchObject({ tone: 'hold', capture: false }); });
  it('gives one instruction, most important first', () => {
    expect(guide({ ...base, fast: { ...base.fast!, luma: 10, motion: 20 } }).message).toBe(MESSAGES.dark);
    expect(guide({ ...base, subject: { result: gas, at: 9_500 } }).message).toBe(MESSAGES.gas);
    expect(guide({ ...base, fast: { ...base.fast!, motion: 20 } }).message).toBe(MESSAGES.steady);
    expect(guide({ ...base, reading: { ...base.reading!, obs: { ...readable, meter_number_visible: false } } }).message).toBe(MESSAGES.notFound);
    expect(guide({ ...base, reading: { ...base.reading!, regionHeightPx: 300 } }).message).toBe(MESSAGES.small);
  });
  it('judges focus relative to the camera’s recent best (soft webcams still get ready)', () => {
    expect(guide({ ...base, fast: { ...base.fast!, sharpness: 400, relSharpness: 0.95 } }).tone).toBe('ready');
    expect(guide({ ...base, fast: { ...base.fast!, sharpness: 400, relSharpness: 0.3 } }).message).toBe(MESSAGES.blurry);
    expect(guide({ ...base, fast: { ...base.fast!, sharpness: 60, relSharpness: 1 } }).message).toBe(MESSAGES.blurry);
  });
  it('does not capture on stale readings', () => { expect(guide({ ...base, now: 20_000 }).capture).toBe(false); });
  it('captures a readable number without waiting for meter recognition to load (checked again on the photo)', () => { expect(guide({ ...base, subject: null }).capture).toBe(true); });
  it('never shows “hold steady” while it is only reading the number', () => { expect(guide({ ...base, reading: null }).message).toBe(MESSAGES.hold); expect(MESSAGES.hold).not.toMatch(/steady|still/i); });
});

describe('aggregate', () => {
  it('scores each prompt set separately and sums prompts per class', () => {
    // Logits for every prompt in every set; gas-meter prompts score highest within the meter set.
    const logits = PROMPTS.map(p => (p.set === 'subject' && p.c === 'gas_meter' ? 30 : p.set === 'scene' ? 50 : 20));
    const r = aggregate(logits);
    expect(r.status === 'ok' && r.top).toBe('gas_meter');
    expect(r.status === 'ok' && Object.values(r.probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});
