// Picks a wider back lens when the browser exposes one, for tight spaces where the customer can't step back. Pure; unit-tested.
export type LensDevice = { deviceId: string; label: string; kind: string };
export type WideLens = { kind: 'zoom'; zoom: number } | { kind: 'device'; deviceId: string };

const ULTRA_WIDE = /ultra.?wide|0[.,]5\s*x?\b|wide.?angle/i;
const FRONT = /front|user|facetime|selfie/i;

/**
 * 1. The current track can zoom out below 1× (some Android phones group their lenses behind one camera): use that.
 * 2. Otherwise a separate back camera labelled ultra-wide (iPhone Safari: "Back Ultra Wide Camera"): switch to it.
 * Labels are only filled in after camera permission is granted; with no labels there's nothing to offer.
 */
export function pickWideLens(devices: LensDevice[], zoom: { min?: number; max?: number } | undefined, currentId: string | undefined): WideLens | null {
  if (zoom?.min != null && zoom.min < 1) return { kind: 'zoom', zoom: zoom.min };
  const d = devices.find(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== currentId && ULTRA_WIDE.test(d.label) && !FRONT.test(d.label));
  return d ? { kind: 'device', deviceId: d.deviceId } : null;
}
