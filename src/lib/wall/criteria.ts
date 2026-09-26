// Meter-wall photos (the whole wall, then the areas to its right and left): acceptance rules, prompts and every
// message the customer sees, in one place.
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
  /**
   * Meter cover diameter as a share of photo height above which the photo looks too close ("10 steps back").
   * A stand-in only: if the photo still shows the meter, enough wall beside it and the ground, it passes anyway.
   */
  maxMeterSize: 0.12,
  /** Meter centre must be at least this share of the photo width from each side edge. */
  minSideMargin: 0.2,
  /** Side photos: the meter should be on the near half of the frame (right-side photo: left ≤ 60 %; left-side: mirror)… */
  maxSideMeterX: 0.6,
  /** …and past this it's the wrong side altogether. */
  wrongSideMeterX: 0.75,
  /** When the scale is known: minimum wall visible on each side of the meter, feet. */
  minSideFeet: 3,
  /** When the scale is known: ground must be at least this far below the meter centre to be in frame, feet (meters sit ~4–5 ft up; this leaves margin for the estimate). */
  minBelowFeet: 2.5,
  /** When the scale isn't known: meter centre must be above this share of photo height (ground below it). */
  maxMeterY: 0.7,
  minLuma: 45,
  /** Laplacian variance of the contrast-stretched photo (≤1200px). Wide shots have no small text, so this is lenient. */
  minSharpness: 15,
  /** Live preview: consecutive steady, sharp, well-lit frames before we say "take the photo". */
  readyFrames: 4,
  readyWindow: 6,
  /** Live focus: relative to the sharpest recent frame, with a low absolute floor (see the meter criteria). */
  minRelativeSharpness: 0.5,
  minLiveSharpness: 150,
  maxMotion: 14,
  freshMs: 3000,
  rejectionsBeforeOverride: 2,
};

/** The three meter-wall photos Base asks for, taken one after another. */
export type WallMode = 'wall' | 'right' | 'left';
export const WALL_SEQUENCE: WallMode[] = ['wall', 'right', 'left'];

export type WallCheckId = 'scene' | 'meter' | 'distance' | 'sides' | 'direction' | 'ground' | 'orientation' | 'light' | 'focus';
export const WALL_CHECK_LABELS: Record<WallCheckId, string> = {
  scene: 'Outside wall of your home',
  meter: 'Meter in the photo',
  distance: 'Taken from far enough back',
  sides: 'Wall visible on both sides of the meter',
  direction: 'Shows the area beside the meter',
  ground: 'Ground in front of the wall',
  orientation: 'Phone held sideways',
  light: 'Enough light',
  focus: 'In focus',
};

export const WALL_MESSAGES = {
  loading: 'Getting ready…',
  point: 'Point at the wall with your meter.',
  closeup: 'Too close — step back so the whole wall fits.',
  indoors: 'Go outside to the wall with your meter.',
  other: 'Point at the outside wall with your meter.',
  landscape: 'Turn your phone sideways.',
  dark: 'Too dark — try in daylight.',
  steady: 'Hold steady.',
  blurry: 'Blurry — hold steady a moment.',
  ready: 'Looks good — take the photo.',
  // after capture
  noMeter: 'We need your electric meter in this photo. Step back and include the meter and the wall around it.',
  tooClose: 'You’re too close to the meter. Step back until the wall on both sides of the meter and the ground below it are in the photo.',
  moreLeft: 'Include more of the wall to the left of the meter — step back or move a little to the left.',
  moreRight: 'Include more of the wall to the right of the meter — step back or move a little to the right.',
  ground: 'We can’t see the ground. Tilt your phone down or step back until the ground in front of the wall is in the photo — that’s where the battery would stand.',
  sceneUnverified: 'We couldn’t check the scene because photo recognition didn’t load.',
  // side photos (right / left of the meter)
  sidePoint: { right: 'Face along the wall to the right of your meter.', left: 'Face along the wall to the left of your meter.' },
  sideReady: {
    right: 'Looks good — take the photo.',
    left: 'Looks good — take the photo.',
  },
  sideNoMeter: {
    right: 'Keep your meter in the photo, near the left edge, so we can see where the area to its right begins.',
    left: 'Keep your meter in the photo, near the right edge, so we can see where the area to its left begins.',
  },
  sideTooClose: {
    right: 'You’re too close. Step back so we can see more of the wall and ground to the right of your meter.',
    left: 'You’re too close. Step back so we can see more of the wall and ground to the left of your meter.',
  },
  wrongSide: {
    right: 'This shows the area to the LEFT of your meter. Turn to face the area on its right side.',
    left: 'This shows the area to the RIGHT of your meter. Turn to face the area on its left side.',
  },
  turnMore: {
    right: 'Turn a little to the right, so the meter is on the left side of the photo and we can see the area beside it.',
    left: 'Turn a little to the left, so the meter is on the right side of the photo and we can see the area beside it.',
  },
} as const;

/** The one-line fix on the result card, for someone holding a phone with their hands full. */
export type FixId = WallCheckId | 'wrongSide' | 'moreLeft' | 'moreRight';
export function shortFix(id: FixId, mode: WallMode): string {
  const side = mode === 'left' ? 'left' : 'right';
  switch (id) {
    case 'scene': return 'Point at the outside wall with your meter.';
    case 'meter': return 'Include your meter in the photo.';
    case 'orientation': return 'Turn your phone sideways.';
    case 'light': return 'Too dark — try in daylight.';
    case 'focus': return 'Blurry — hold steady and retake.';
    case 'wrongSide': return `Wrong side — face the wall to the ${side} of the meter.`;
    case 'distance': return 'Step back to show more wall.';
    case 'moreLeft': return 'Show more wall on the left.';
    case 'moreRight': return 'Show more wall on the right.';
    case 'sides': return 'Show more wall beside the meter.';
    case 'direction': return `Turn a little to the ${side}.`;
    case 'ground': return 'Tilt down or step back to show the ground.';
  }
}
