// Keeps the last few seconds of live frames that the number reader could read, so the saved photo is the best of
// them (sharpest, number read with every digit certain) rather than whatever frame is on screen when capture fires.
// Pure apart from holding references to the caller's frame objects; unit-tested.

export type ReadFrame<F> = { t: number; frame: F; number: string | null; sharpness: number };

export function createReadFrames<F>(windowMs = 3000, max = 8) {
  let frames: ReadFrame<F>[] = [];
  const digits = (s: string | null) => (s ?? '').replace(/\D/g, '');
  return {
    /** Remember a frame the reader just looked at. `number` is null unless every digit was certain. */
    add(f: ReadFrame<F>) {
      frames.push(f);
      frames = frames.filter(x => f.t - x.t <= windowMs).slice(-max);
    },
    /**
     * The sharpest recent frame whose number was read (and matches `number`, if given); newest wins a tie.
     * Null when no recent frame had a readable number.
     */
    best(now: number, number?: string | null): ReadFrame<F> | null {
      const want = number ? digits(number) : null;
      const ok = frames.filter(x => now - x.t <= windowMs && x.number && (!want || digits(x.number) === want));
      return ok.reduce<ReadFrame<F> | null>((a, b) => (!a || b.sharpness >= a.sharpness ? b : a), null);
    },
    /** When the reader last managed a certain read (for "move closer" / camera-app suggestions). */
    lastReadAt: () => frames.filter(x => x.number).at(-1)?.t ?? null,
    clear() { frames = []; },
    get size() { return frames.length; },
  };
}
