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
  breaker_panel: ['a photo of an electrical breaker panel', 'a photo of a circuit breaker box'],
  other: ['a photo of a wall of a house', 'a photo of a room', 'a photo of a person', 'a photo of a yard', 'a photo of an air conditioner unit', 'a photo of a window'],
};

export const CRITERIA = {
  /** Electric-meter probability needed to count as "an electric meter is in view". */
  minElectricMeter: 0.5,
  /** Mean brightness (0–255) of the guide circle below which the photo is too dark for Base's reviewers. */
  minLuma: 45,
  /** Share of blown-out pixels in the circle that counts as glare. */
  maxGlare: 0.025,
  /** Live preview focus is judged relative to the sharpest recent frame (works for phones and webcams alike)… */
  minRelativeSharpness: 0.6,
  /** …with a low absolute floor (Laplacian variance, 256px crop) so a camera that never focuses isn't "sharp". */
  minLiveSharpness: 150,
  /** Laplacian variance of the saved photo (OCR-sized, ≤960px) below which it is too blurry for Base's reviewers.
   *  Only applied when the meter number could NOT be read: a confident read is the proof of legibility. */
  minSharpness: 40,
  /** Mean frame-to-frame change (0–255) above which we ask the customer to hold steady. */
  maxMotion: 6,
  /** Minimum height of the meter number's characters in the saved photo, in pixels. */
  minDigitPx: 16,
  /** Live guidance: consecutive good frames (~8/s) required before auto-capture. */
  readyFrames: 6,
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

export const MESSAGES = {
  // subject
  point: 'Point your camera at the electric meter.',
  gas: 'That looks like a gas meter. Find the electric meter — it has a round glass cover and a display.',
  water: 'That looks like a water meter. Find the electric meter — it has a round glass cover and a display.',
  panel: 'That looks like a breaker panel. For this photo we need the electric meter outside your home.',
  other: 'We can’t see an electric meter. Fit the meter inside the circle.',
  subjectUnavailable: 'We couldn’t confirm this is an electric meter because meter recognition didn’t load. Check your connection and try again.',
  // quality
  dark: 'It’s too dark. Try again in daylight or with more light on the meter.',
  glare: 'Glare is covering part of the meter. Step a little to one side to move the reflection.',
  steady: 'Hold steady.',
  blurry: 'The photo is blurry. Hold steady and give the camera a moment to focus — or step back slightly if you’re very close.',
  // number
  notFound: 'We can’t find the meter number yet. Move closer so the meter fills the circle.',
  notFoundFinal: 'We couldn’t find the meter number. Move closer so the meter fills the circle, then try again.',
  uncertain: 'Almost there — hold steady so we can read every digit.',
  uncertainFinal: 'We found the meter number but couldn’t read every digit. Move a little closer and hold steady.',
  small: 'Move a little closer so the meter number is easier to read.',
  cutOff: 'Part of the meter number is outside the photo. Keep the whole meter inside the circle.',
  obstructed: 'Something may be covering the meter number. Clear the view and try again.',
  // states
  loading: 'Getting ready…',
  hold: 'Hold still — reading the meter number…',
  ready: 'Looks good! Taking the photo…',
} as const;
