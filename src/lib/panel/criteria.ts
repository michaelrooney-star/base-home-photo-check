// CLIP prompts for the breaker box photo: does it show the whole panel (and a bit of where it is), or only part of it?
export const FRAMING_CLASSES = ['whole_panel', 'part_of_panel'] as const;
export type FramingClass = (typeof FRAMING_CLASSES)[number];
export const FRAMING_PROMPTS: Record<FramingClass, string[]> = {
  whole_panel: ['a photo of a whole electrical breaker panel on a wall', 'a photo of an entire circuit breaker box and the wall around it'],
  part_of_panel: ['a close-up photo of some circuit breakers', 'a cropped photo of part of a breaker panel'],
};
/** Share above which we suggest stepping back. A suggestion only: the photo is still accepted. */
export const MAX_PART_OF_PANEL = 0.6;
