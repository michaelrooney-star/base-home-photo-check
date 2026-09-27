// The meter photo acceptance spec: every threshold and every message the customer sees, in one place.
// Base's guide asks for: a close-up where "the meter number ... is legible", taken in daylight, sharp, unobstructed.

export const SUBJECT_CLASSES = ['electric_meter', 'gas_meter', 'water_meter', 'breaker_panel', 'other'] as const;
export type SubjectClass = (typeof SUBJECT_CLASSES)[number];

/** Zero-shot prompts for the image classifier. Probabilities are summed per class. */
export const SUBJECT_PROMPTS: Record<SubjectClass, string[]> = {
  electric_meter: [
    'a photo of an electric meter',
    'a photo of an electricity meter mounted on the outside wall of a house',
    'a photo of a smart electric meter with a digital display under a round glass cover',
    'a photo of an analog electric meter with dials under a glass dome',
  ],
  gas_meter: ['a photo of a gas meter', 'a photo of a residential natural gas meter with pipes and a regulator'],
  water_meter: ['a photo of a water meter'],
  // As many prompts as the electric meter: class probabilities are summed over prompts, so a class with fewer prompts
  // loses close calls (a grey panel box was being called a meter).
  breaker_panel: [
    'a photo of an electrical breaker panel',
    'a photo of a circuit breaker box',
    'a photo of an open electrical panel with rows of circuit breaker switches',
    'a photo of a gray metal breaker box with its door open',
  ],
  other: ['a photo of a wall of a house', 'a photo of a room', 'a photo of a person', 'a photo of a yard', 'a photo of an air conditioner unit', 'a photo of a window'],
};

/** Final check reads the photo at these long-edge sizes and lets the passes vote (text sizes vary from meter to meter). */
export const READ_SIZES = [960, 1600];

export const CRITERIA = {
  /** Electric-meter probability needed to count as "an electric meter is in view". */
  minElectricMeter: 0.5,
  /** Mean brightness (0–255) of the guide circle below which the photo is too dark for Base's reviewers. */
  minLuma: 45,
  /** Share of blown-out pixels in the circle that counts as glare. */
  maxGlare: 0.025,
  /** Live preview focus is judged relative to the sharpest recent frame (works for phones and webcams alike)… */
  minRelativeSharpness: 0.5,
  /** …with a low absolute floor (Laplacian variance, 256px crop) so a camera that never focuses isn't "sharp". */
  minLiveSharpness: 150,
  /** Laplacian variance of the saved photo (OCR-sized, ≤960px) below which it is too blurry for Base's reviewers.
   *  Only applied when the meter number could NOT be read: a confident read is the proof of legibility. */
  minSharpness: 40,
  /** Frame-to-frame change (0–255, measured on shrunk frames: see metrics.motion) above which we say "hold steady".
   *  Set for an older customer holding a phone at arm's length, not a webcam on a desk. */
  maxMotion: 14,
  /** Minimum height of the meter number's characters in the saved photo, in pixels. */
  minDigitPx: 16,
  /** Live guidance: good frames needed among the last `readyWindow` (~8 frames/s) before auto-capture: 4 of 6 ≈ ¾ s. */
  readyFrames: 4,
  readyWindow: 6,
  /** Live guidance: how long a slow result (classifier / OCR) stays valid, ms. */
  freshMs: 3000,
  /** Rejections before offering "send anyway". */
  rejectionsBeforeOverride: 2,
};

export type CheckId = 'subject' | 'light' | 'glare' | 'focus' | 'number' | 'framing' | 'clear';
export const CHECK_LABELS: Record<CheckId, string> = {
  subject: 'Electric meter in view',
  light: 'Enough light',
  glare: 'No glare',
  focus: 'In focus',
  number: 'Meter number readable',
  framing: 'Whole number in frame',
  clear: 'Nothing covering the number',
};

/** Short on purpose: the customer is holding a phone at a meter and can take in a few words at a glance. */
export const MESSAGES = {
  // subject
  point: 'Point at the electric meter.',
  gas: 'That’s a gas meter — find the electric one.',
  water: 'That’s a water meter — find the electric one.',
  panel: 'That’s a breaker box — find the electric meter.',
  other: 'Fit the meter in the circle.',
  subjectUnavailable: 'Couldn’t check it’s a meter — try again.',
  // quality
  dark: 'Too dark — more light needed.',
  glare: 'Glare — step to one side.',
  steady: 'Hold steady.',
  blurry: 'Blurry — hold steady.',
  // number
  notFound: 'Move closer.',
  notFoundFinal: 'Couldn’t find the number — move closer.',
  uncertain: 'Reading the number…',
  uncertainFinal: 'Couldn’t read every digit — move closer.',
  small: 'Move a little closer.',
  cutOff: 'Keep the whole meter in the circle.',
  obstructed: 'Something is covering the number.',
  // states
  loading: 'Getting ready…',
  hold: 'Reading the number…',
  ready: 'Got it — taking the photo…',
} as const;
