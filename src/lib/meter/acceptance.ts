// Final accept/reject decision for a meter photo, from observations only. Pure, so it is unit-tested.
import { CHECK_LABELS, CRITERIA, MESSAGES, type CheckId, type SubjectClass } from './criteria.ts';
import type { MeterObservation } from './number.ts';

export type SubjectResult =
  | { status: 'ok'; top: SubjectClass; probs: Record<SubjectClass, number> }
  | { status: 'loading' }
  | { status: 'unavailable'; error?: string };

export type Check = { id: CheckId; label: string; state: 'pass' | 'fail' | 'pending' | 'skipped'; message?: string };
export type PhotoEvidence = {
  subject: SubjectResult;
  reading: MeterObservation;
  luma: number;
  glare: number;
  /** Laplacian variance of the contrast-stretched OCR-sized image (see CRITERIA.minSharpness). */
  sharpness: number;
  /** Pixel height of the analysed region in the saved photo (to turn number_height_ratio into pixels). */
  regionHeightPx: number;
};
export type Decision = { accepted: boolean; meterNumber: string | null; checks: Check[]; reasons: string[] };

export function subjectCheck(s: SubjectResult): Check {
  const c = (state: Check['state'], message?: string): Check => ({ id: 'subject', label: CHECK_LABELS.subject, state, message });
  if (s.status === 'loading') return c('pending');
  if (s.status === 'unavailable') return c('fail', MESSAGES.subjectUnavailable);
  if (s.probs.electric_meter >= CRITERIA.minElectricMeter) return c('pass');
  const top = s.top === 'electric_meter' ? 'other' : s.top;
  return c('fail', top === 'gas_meter' ? MESSAGES.gas : top === 'water_meter' ? MESSAGES.water : top === 'breaker_panel' ? MESSAGES.panel : MESSAGES.other);
}

export function decide(e: PhotoEvidence): Decision {
  const r = e.reading, readable = r.meter_number_visible && r.all_characters_certain;
  const digitPx = r.number_height_ratio * e.regionHeightPx;
  const check = (id: CheckId, ok: boolean, message: string): Check => ({ id, label: CHECK_LABELS[id], state: ok ? 'pass' : 'fail', message: ok ? undefined : message });
  const checks: Check[] = [
    e.subject.status === 'ok' || !readable ? subjectCheck(e.subject) : { id: 'subject', label: `${CHECK_LABELS.subject} (not checked)`, state: 'skipped' as const },
    check('light', e.luma >= CRITERIA.minLuma, MESSAGES.dark),
    // Glare and softness only matter if they stop us reading the number.
    check('glare', readable || e.glare <= CRITERIA.maxGlare, MESSAGES.glare),
    check('focus', readable || e.sharpness >= CRITERIA.minSharpness, MESSAGES.blurry),
    check('number', readable && digitPx >= CRITERIA.minDigitPx,
      !r.meter_number_visible ? MESSAGES.notFoundFinal : !r.all_characters_certain ? MESSAGES.uncertainFinal : MESSAGES.small),
    check('framing', r.number_fully_in_frame, MESSAGES.cutOff),
    check('clear', !r.issues.includes('obstructed') && !r.issues.includes('truncated'), MESSAGES.obstructed),
  ];
  // Recognition that couldn't run (e.g. the model didn't load on an older phone) doesn't block a photo whose meter number
  // we could read; the photo is marked for Base's reviewers instead.
  const failed = checks.filter(c => c.state === 'fail' || c.state === 'pending');
  return { accepted: failed.length === 0, meterNumber: readable ? r.meter_number : null, checks, reasons: [...new Set(failed.map(c => c.message ?? c.label))] };
}
