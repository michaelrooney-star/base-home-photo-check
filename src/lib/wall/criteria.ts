// "Whole meter wall" photo: acceptance rules, prompts and every message the customer sees, in one place.
// Base's guide: "From as far back as possible (at least 10 steps), take a photo of the wall surrounding your meter."
// Base uses it to plan where a 3 ft × 3 ft battery can go: within 20 ft of the meter, against the wall, on the ground,
// not in front of windows / meters / breaker boxes, 3 ft from gas meters, with clear space in front of the meter.

/** Whole-frame scene classes (CLIP zero-shot). */
export const SCENE_CLASSES = ['house_wall', 'meter_closeup', 'indoors', 'other'] as const;
export type SceneClass = (typeof SCENE_CLASSES)[number];
export const SCENE_PROMPTS: Record<SceneClass, string[]> = {
  house_wall: [
    'a photo of the outside wall of a house',
    'a wide photo of the side of a house with an electric meter on the wall',
    'a photo of the exterior of a house with a lawn and a wall',
    'a photo of a brick wall of a house with utility boxes',
  ],
  meter_closeup: ['a close-up photo of an electric meter', 'a close-up photo of a utility meter with a glass cover'],
  indoors: ['a photo of a room inside a house', 'a photo of a garage interior', 'a photo of a closet'],
  other: ['a photo of a person', 'a photo of a car', 'a photo of the sky', 'a photo of a street', 'a blurry photo'],
};

/** Crops around circle candidates: is this the electric meter? */
export const CANDIDATE_CLASSES = ['electric_meter', 'not_meter'] as const;
export type CandidateClass = (typeof CANDIDATE_CLASSES)[number];
export const CANDIDATE_PROMPTS: Record<CandidateClass, string[]> = {
  electric_meter: ['a photo of an electric meter', 'a photo of an electricity meter on a wall', 'a photo of a round utility meter with a glass cover'],
  not_meter: [
    'a photo of a gas meter', 'a photo of an air conditioner', 'a photo of a window', 'a photo of an outdoor light',
    'a photo of a hose reel', 'a photo of a pipe', 'a photo of a brick wall', 'a photo of a vent', 'a photo of a security camera',
    'a photo of a grey electrical box', 'a photo of a bush', 'a photo of a wheel',
  ],
};

export const WALL_CRITERIA = {
  /** Scene probability needed to count as "outside wall of the house". */
  minHouseWall: 0.5,
  /** Scene probability above which we say "you're too close to the meter". */
  maxMeterCloseup: 0.5,
  /** Candidate crop probability needed to propose it as the meter. */
  minMeterCandidate: 0.5,
  /** Typical glass-cover diameter of a US socket meter, inches. Used only to estimate distances. */
  meterCoverInches: 7,
  /** Meter cover diameter as a share of photo height above which the photo is too close ("10 steps back"). */
  maxMeterSize: 0.12,
  /** Meter centre must be at least this share of the photo width from each side edge. */
  minSideMargin: 0.2,
  /** When the scale is known: minimum wall visible on each side of the meter, feet. */
  minSideFeet: 3,
  /** When the scale is known: ground must be at least this far below the meter centre to be in frame, feet. */
  minBelowFeet: 3.5,
  /** When the scale isn't known: meter centre must be above this share of photo height (ground below it). */
  maxMeterY: 0.7,
  minLuma: 45,
  /** Laplacian variance of the contrast-stretched photo (≤1200px). Wide shots have no small text, so this is lenient. */
  minSharpness: 15,
  /** Live preview: consecutive steady, sharp, well-lit frames before we say "take the photo". */
  readyFrames: 6,
  /** Live focus: relative to the sharpest recent frame, with a low absolute floor (see the meter criteria). */
  minRelativeSharpness: 0.6,
  minLiveSharpness: 150,
  maxMotion: 6,
  freshMs: 3000,
  rejectionsBeforeOverride: 2,
};

export type WallCheckId = 'scene' | 'meter' | 'distance' | 'sides' | 'ground' | 'orientation' | 'light' | 'focus';
export const WALL_CHECK_LABELS: Record<WallCheckId, string> = {
  scene: 'Outside wall of your home',
  meter: 'Meter in the photo',
  distance: 'Taken from far enough back',
  sides: 'Wall visible on both sides of the meter',
  ground: 'Ground visible below the meter',
  orientation: 'Phone held sideways',
  light: 'Enough light',
  focus: 'In focus',
};

export const WALL_MESSAGES = {
  loading: 'Getting ready…',
  point: 'Point your camera at the wall with your electric meter.',
  closeup: 'You’re too close. Step back at least 10 steps so the whole wall fits in the photo.',
  indoors: 'This photo needs to be taken outside, of the wall with your electric meter.',
  other: 'We can’t see the wall of your home. Point your camera at the wall with your electric meter.',
  landscape: 'Turn your phone sideways to fit more of the wall.',
  dark: 'It’s too dark. Try again in daylight.',
  steady: 'Hold steady.',
  blurry: 'The photo is blurry. Hold steady and give the camera a moment to focus.',
  ready: 'Looks good — take the photo when the whole wall, the meter and the ground are in view.',
  // after capture
  noMeter: 'We need your electric meter in this photo. Step back and include the meter and the wall around it.',
  tooClose: 'You’re too close to the meter. Step back at least 10 steps so we can see the wall around it.',
  moreLeft: 'Include more of the wall to the left of the meter — step back or move a little to the left.',
  moreRight: 'Include more of the wall to the right of the meter — step back or move a little to the right.',
  ground: 'Include the ground below the meter — tilt the phone down a little or step back.',
  sceneUnverified: 'We couldn’t check the scene because photo recognition didn’t load.',
} as const;
