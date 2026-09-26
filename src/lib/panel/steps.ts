// Accept/reject for the photos after the meter wall: breaker box, main breaker rating, adjacent wall, behind the fence.
// Each returns the same short result the wall step shows: a verdict, one line to act on, and found / not-found chips.
// Pure; unit-tested. The browser pipeline that gathers the evidence is in ./analyze.ts.
import type { ClassResult } from '../meter/analyzer.ts';
import type { SubjectClass } from '../meter/criteria.ts';
import type { SceneClass } from '../wall/criteria.ts';
import { MAX_PART_OF_PANEL, type FramingClass } from './criteria.ts';

export type CheckedStep = 'breaker' | 'rating' | 'adjacent' | 'fence';
export type Chip = { label: string; state: 'pass' | 'fail' | 'warn' | 'info' };
export type StepResult = {
  accepted: boolean;
  /** One line to act on (rejected) or what we found (accepted). */
  line: string;
  chips: Chip[];
  /** Longer explanation, behind "Details". */
  details: string;
  /** Saved with the photo for Base's reviewers. */
  note?: string;
  amps?: number;
  /** Accepted, but a retake would help (shown as the main action). */
  improve?: string;
};

export const STEP_RULES = { minLuma: 45, minSharpness: 15, minBreaker: 0.4 };

type Quality = { luma: number; sharpness: number };
const quality = (q: Quality): { chip: Chip; fix: string | null } => {
  const fix = q.luma < STEP_RULES.minLuma ? 'Too dark — turn on a light or use your phone’s flashlight.' : q.sharpness < STEP_RULES.minSharpness ? 'Blurry — hold steady and retake.' : null;
  return { chip: { label: 'Clear photo', state: fix ? 'fail' : 'pass' }, fix };
};

/** Breaker box: is it a breaker panel (not the meter, not something else), and is the photo usable? */
export function decideBreaker(e: Quality & { subject: ClassResult<SubjectClass> | null; framing?: ClassResult<FramingClass> | null }): StepResult {
  const q = quality(e);
  const s = e.subject?.status === 'ok' ? e.subject : null;
  const isPanel = !s || s.top === 'breaker_panel' || s.probs.breaker_panel >= STEP_RULES.minBreaker;
  const fix = !isPanel
    ? s!.top === 'electric_meter' ? 'That’s your meter — now show the breaker box (the panel of switches).' : 'We can’t see a breaker box. Show the whole panel.'
    : q.fix;
  const partial = !fix && e.framing?.status === 'ok' && e.framing.probs.part_of_panel >= MAX_PART_OF_PANEL;
  return {
    accepted: !fix,
    improve: partial ? 'Step back so the whole box — top to bottom — and a bit of the wall around it fit.' : undefined,
    line: fix ?? (partial ? 'Breaker box found, but only part of it.' : s ? 'Breaker box found.' : 'Photo looks clear.'),
    chips: [{ label: 'Breaker box', state: !s ? 'info' : isPanel ? 'pass' : 'fail' }, ...(e.framing?.status === 'ok' ? [{ label: 'Whole box', state: partial ? 'warn' as const : 'pass' as const }] : []), q.chip],
    details: 'We look for your main breaker box — the whole panel, door open or closed — so Base can see its size and where it is.' + (s ? '' : ' Photo recognition wasn’t available, so we didn’t check what’s in the photo.'),
  };
}

/** Main breaker rating: can we read a standard amp number off the handle? */
export function decideRating(e: Quality & { amps: number | null }): StepResult {
  const q = quality(e);
  const fix = e.amps ? null : q.fix ?? 'We can’t read the number. Move closer so it fills the box.';
  return {
    accepted: !fix,
    line: fix ?? `Reads ${e.amps} A.`,
    chips: [{ label: 'Amp number', state: e.amps ? 'pass' : 'fail' }, e.amps ? { label: 'Clear photo', state: 'pass' } : q.chip], // a readable number proves it's clear enough
    details: 'The main breaker’s handle is stamped with its size — usually 100, 125, 150 or 200. Base needs it to know which battery setup your panel supports. Only open the panel lid if it’s safe; otherwise skip this photo and Base will help.',
    note: e.amps ? `Main breaker reads ${e.amps} A (read on device).` : undefined,
    amps: e.amps ?? undefined,
  };
}

const sceneFix = (s: ClassResult<SceneClass> | null) =>
  s?.status !== 'ok' ? null : s.top === 'indoors' ? 'This needs to be outside — show the outside wall.' : s.top === 'meter_closeup' ? 'Too close — step back to show the whole wall.' : s.probs.house_wall < 0.3 ? 'Point at the outside wall of your home.' : null;

/** Adjacent wall (around the corner from the meter): the wall, the ground in front of it, and what's on it. */
export function decideAdjacent(e: Quality & { scene: ClassResult<SceneClass> | null; groundSeen: boolean | null; objects: string[] }): StepResult {
  const q = quality(e), scene = sceneFix(e.scene);
  const fix = scene ?? (e.groundSeen === false ? 'Tilt down or step back to show the ground.' : null) ?? q.fix;
  return {
    accepted: !fix,
    line: fix ?? (e.objects.length ? `On this wall: ${e.objects.join(', ')}.` : 'No boxes or equipment on this wall — looks open.'),
    chips: [
      { label: 'Wall', state: scene ? 'fail' : e.scene?.status === 'ok' ? 'pass' : 'info' },
      { label: 'Ground', state: e.groundSeen === false ? 'fail' : e.groundSeen ? 'pass' : 'info' },
      q.chip,
    ],
    details: 'Around the corner from your meter, show the wall from corner to corner and the ground in front of it. Base looks for 3 ft of open wall within 20 ft of the meter.',
    note: e.objects.length ? `Adjacent wall: ${e.objects.join(', ')}.` : 'Adjacent wall: no equipment detected.',
  };
}

/** Behind the fence: outdoors, the ground visible, usable photo. */
export function decideFence(e: Quality & { scene: ClassResult<SceneClass> | null; groundSeen: boolean | null }): StepResult {
  const q = quality(e);
  const indoors = e.scene?.status === 'ok' && e.scene.top === 'indoors';
  const fix = (indoors ? 'This needs to be outside — show the area behind the fence.' : null) ?? (e.groundSeen === false ? 'Tilt down to show the ground behind the fence.' : null) ?? q.fix;
  return {
    accepted: !fix,
    line: fix ?? 'The area behind the fence is in view.',
    chips: [{ label: 'Outside', state: indoors ? 'fail' : e.scene?.status === 'ok' ? 'pass' : 'info' }, { label: 'Ground', state: e.groundSeen === false ? 'fail' : e.groundSeen ? 'pass' : 'info' }, q.chip],
    details: 'Show the whole area behind the fence, from corner to corner, including the ground. Only go where you can safely.',
  };
}
