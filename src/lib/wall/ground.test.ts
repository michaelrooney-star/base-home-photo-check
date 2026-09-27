import { describe, expect, it } from 'vitest';
import { checkGround } from './ground';

// A 200×150 photo: grey wall, with `bottom` filling the bottom `share` of the height.
function photo(bottom: [number, number, number], share: number, wall: [number, number, number] = [130, 128, 125]) {
  const W = 200, H = 150, rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y >= H * (1 - share) ? bottom : wall, n = ((x * 7 + y * 13) % 11) - 5; // a little texture
    rgba.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * W + x) * 4);
  }
  return { rgba, width: W, height: H, detections: [] };
}
const meter = { x: 0.5, y: 0.35, r: 0.05 };

describe('checkGround', () => {
  it('sees grass at the bottom of the photo', () => { expect(checkGround({ ...photo([70, 140, 50], 0.2), meter }).visible).toBe(true); });
  it('sees dirt or gravel', () => { expect(checkGround({ ...photo([150, 115, 85], 0.2), meter }).visible).toBe(true); });
  it('notices when the photo ends partway down the wall', () => {
    const g = checkGround({ ...photo([130, 128, 125], 0.2), meter });
    expect(g.visible).toBe(false);
    expect(g.sameAsWall).toBeGreaterThan(0.65);
  });
  it('trusts the geometry when there is more than 6.5 ft of photo below the meter', () => {
    // Grey pavement under a grey wall, but with a tiny meter cover the photo reaches far below it.
    expect(checkGround({ ...photo([130, 128, 125], 0.2), meter: { ...meter, r: 0.015 } }).visible).toBe(true);
  });
  it('a warm brick wall that runs to the bottom edge is still wall', () => {
    expect(checkGround({ ...photo([150, 70, 55], 0.2, [150, 70, 55]), meter }).visible).toBe(false);
  });
});
