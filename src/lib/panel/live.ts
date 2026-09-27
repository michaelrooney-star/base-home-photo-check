// Live guidance for the breaker box, adjacent-wall and fence steps. The camera view is checked for quality ~8×/s, and
// about once a second the on-device recognizer says what the camera is pointed at. "Looks good" only once it has seen
// the right thing. Pure; unit-tested. The main breaker rating keeps its own quality-only guidance (it's an OCR step).
import type { ClassResult, ModelState } from '../meter/analyzer.ts';
import type { SubjectClass } from '../meter/criteria.ts';
import type { FastMetrics } from '../meter/metrics.ts';
import { WALL_CRITERIA as Q, type SceneClass } from '../wall/criteria.ts';
import { MAX_PART_OF_PANEL, type FramingClass } from './criteria.ts';
import { STEP_RULES, type CheckedStep } from './steps.ts';

export type Tone = 'search' | 'adjust' | 'hold' | 'ready';
/** One recognizer pass over a live frame. */
export type Look = { at: number; subject?: ClassResult<SubjectClass> | null; framing?: ClassResult<FramingClass> | null; scene?: ClassResult<SceneClass> | null };
export type Seen = 'target' | 'part' | 'meter' | 'wrong' | 'indoors' | 'close';
export type LiveGuide = { tone: Tone; text: string; /** Breaker box only: whole box recognised, steady and sharp — take it. */ capture: boolean };

export const LIVE = {
  /** A recognizer result older than this is ignored (she's probably moved the phone). */
  staleMs: 3000,
  /** Consecutive recognizer passes that must agree before we say "looks good". */
  streak: 2,
};

const TARGET: Record<CheckedStep, string> = {
  breaker: 'Point at your breaker box.',
  rating: 'Fill the box with the number, then take the photo.',
  adjacent: 'Point at the wall around the corner.',
  fence: 'Point at the area behind the fence.',
};

/** What the recognizer says the camera is pointed at, for this step. null = no usable result. */
export function whatWeSee(step: CheckedStep, look: Look | null): Seen | null {
  if (!look) return null;
  if (step === 'breaker') {
    const s = look.subject?.status === 'ok' ? look.subject : null;
    if (!s) return null;
    if (!(s.top === 'breaker_panel' || s.probs.breaker_panel >= STEP_RULES.minBreaker)) return s.top === 'electric_meter' && s.probs.electric_meter >= STEP_RULES.minMeter ? 'meter' : 'wrong';
    return look.framing?.status === 'ok' && look.framing.probs.part_of_panel >= MAX_PART_OF_PANEL ? 'part' : 'target';
  }
  const sc = look.scene?.status === 'ok' ? look.scene : null;
  if (!sc) return null;
  if (sc.top === 'indoors') return 'indoors';
  if (step === 'fence') return 'target';
  if (sc.top === 'meter_closeup') return 'close';
  return sc.probs.house_wall < 0.3 ? 'wrong' : 'target';
}

export function guideStep(i: { step: CheckedStep; fast: FastMetrics | null; goodFrames: number; look: Look | null; streak: number; recognition: ModelState; now: number }): LiveGuide {
  const { step, fast: m } = i;
  const say = (tone: Tone, text: string, capture = false): LiveGuide => ({ tone, text, capture });
  if (!m) return say('search', 'Getting ready…');
  if (m.luma < 45) return say('adjust', step === 'breaker' || step === 'rating' ? 'Too dark — turn on a light.' : 'Too dark — try in daylight.');
  const shaky = m.motion > Q.maxMotion, soft = m.relSharpness < Q.minRelativeSharpness || m.sharpness < Q.minLiveSharpness;
  const steady = i.goodFrames >= Q.readyFrames;

  // The rating photo is read after it's taken; we can't tell live whether the number is in the box. Never a green "ready".
  if (step === 'rating') return shaky ? say('adjust', 'Hold steady.') : soft ? say('adjust', 'Hold steady — let it focus.') : say('hold', steady ? TARGET.rating : 'Hold steady.');

  // Recognition didn't load: guide on quality only, and don't claim the photo is right.
  if (i.recognition === 'failed') return shaky || soft ? say('adjust', 'Hold steady.') : say('hold', steady ? 'Hold steady, then take the photo.' : 'Hold steady.');

  const fresh = i.look && i.now - i.look.at < LIVE.staleMs ? i.look : null;
  const seen = whatWeSee(step, fresh);
  switch (seen) {
    case null: case 'wrong': return say('search', TARGET[step]);
    case 'meter': return say('adjust', 'That’s the meter — find the breaker box.');
    case 'indoors': return say('adjust', 'This needs to be outside.');
    case 'close': return say('adjust', 'Step back to show the whole wall.');
    case 'part': return say('adjust', 'Step back to fit the whole box.');
  }
  if (shaky) return say('adjust', 'Hold steady.');
  if (soft) return say('adjust', 'Hold steady a moment.');
  if (!steady || i.streak < LIVE.streak) return say('hold', step === 'breaker' ? 'Breaker box found — hold steady.' : 'Hold steady.');
  return step === 'breaker' ? say('ready', 'Looks good — hold still.', true) : say('ready', 'Looks good — take the photo.');
}
