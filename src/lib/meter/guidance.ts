// Live guidance: turns the latest measurements into ONE instruction for the customer, plus a live checklist.
// Pure function of its inputs so it can be unit-tested; the component owns timing and state.
import { subjectCheck, type Check, type SubjectResult } from './acceptance.ts';
import { CHECK_LABELS, CRITERIA, MESSAGES } from './criteria.ts';
import type { FastMetrics } from './metrics.ts';
import type { MeterObservation } from './number.ts';

export type Tone = 'search' | 'adjust' | 'hold' | 'ready';
export type Guidance = { tone: Tone; message: string; checks: Check[]; capture: boolean };
export type LiveInput = {
  now: number;
  fast: FastMetrics | null;
  /** Consecutive recent frames with good light, no glare, sharp and steady. */
  goodFrames: number;
  subject: { result: SubjectResult; at: number } | null;
  reading: { obs: MeterObservation; at: number; regionHeightPx: number } | null;
};

/** Light, focus and steadiness. Glare is deliberately not here: bright white nameplates often clip, and glare only
 *  matters when it stops us reading the number (handled in guide()). */
export const frameIsGood = (m: FastMetrics) => m.luma >= CRITERIA.minLuma && m.sharpness >= CRITERIA.minLiveSharpness && m.motion <= CRITERIA.maxMotion;

export function guide(i: LiveInput): Guidance {
  const fresh = <T extends { at: number }>(x: T | null) => (x && i.now - x.at <= CRITERIA.freshMs ? x : null);
  const subject = fresh(i.subject)?.result ?? i.subject?.result ?? { status: 'loading' as const };
  const reading = fresh(i.reading);
  const m = i.fast;
  const c = (id: Check['id'], state: Check['state']): Check => ({ id, label: CHECK_LABELS[id], state });
  const obs = reading?.obs, readable = !!obs && obs.meter_number_visible && obs.all_characters_certain;
  const bigEnough = !!obs && obs.number_height_ratio * reading!.regionHeightPx >= CRITERIA.minDigitPx;
  const checks: Check[] = [
    { ...subjectCheck(subject), message: undefined },
    c('light', !m ? 'pending' : m.luma >= CRITERIA.minLuma ? 'pass' : 'fail'),
    c('glare', !m ? 'pending' : m.glare <= CRITERIA.maxGlare ? 'pass' : 'fail'),
    c('focus', !m ? 'pending' : m.sharpness >= CRITERIA.minLiveSharpness && m.motion <= CRITERIA.maxMotion ? 'pass' : 'fail'),
    c('number', !obs ? 'pending' : readable && bigEnough ? 'pass' : 'fail'),
  ];
  const out = (tone: Tone, message: string, capture = false): Guidance => ({ tone, message, checks, capture });

  if (!m) return out('search', MESSAGES.loading);
  if (m.luma < CRITERIA.minLuma) return out('adjust', MESSAGES.dark);
  if (subject.status === 'ok' && subject.probs.electric_meter < CRITERIA.minElectricMeter) return out('search', subjectCheck(subject).message ?? MESSAGES.point);
  // Glare only matters once we've tried and failed to read the number (white nameplates often clip anyway).
  if (m.glare > CRITERIA.maxGlare && obs && !readable) return out('adjust', MESSAGES.glare);
  if (m.motion > CRITERIA.maxMotion) return out('adjust', MESSAGES.steady);
  if (m.sharpness < CRITERIA.minLiveSharpness) return out('adjust', MESSAGES.blurry);
  if (!obs) return out('search', subject.status === 'ok' ? MESSAGES.hold : MESSAGES.point);
  if (!obs.meter_number_visible) return out('adjust', MESSAGES.notFound);
  if (obs.issues.includes('obstructed')) return out('adjust', MESSAGES.obstructed);
  if (!obs.number_fully_in_frame) return out('adjust', MESSAGES.cutOff);
  if (!obs.all_characters_certain) return out('hold', MESSAGES.uncertain);
  if (!bigEnough) return out('adjust', MESSAGES.small);
  // Number is readable. Capture once the subject is confirmed (or can't be checked — the final check will say so).
  if (subject.status === 'loading') return out('hold', MESSAGES.hold);
  return i.goodFrames >= CRITERIA.readyFrames ? out('ready', MESSAGES.ready, true) : out('hold', MESSAGES.hold);
}
