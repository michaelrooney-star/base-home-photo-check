import { describe, expect, it } from 'vitest';
import { createReadFrames } from './best';

describe('createReadFrames', () => {
  it('picks the sharpest frame where the number was read, not the sharpest overall', () => {
    const b = createReadFrames<string>();
    b.add({ t: 0, frame: 'sharp-but-unread', number: null, sharpness: 900 });
    b.add({ t: 100, frame: 'read-soft', number: '149 214 094', sharpness: 300 });
    b.add({ t: 200, frame: 'read-sharp', number: '149 214 094', sharpness: 500 });
    b.add({ t: 300, frame: 'shaky-now', number: null, sharpness: 80 });
    expect(b.best(300)?.frame).toBe('read-sharp');
  });
  it('only uses frames whose number matches the agreed one', () => {
    const b = createReadFrames<string>();
    b.add({ t: 0, frame: 'misread', number: '149 214 091', sharpness: 800 });
    b.add({ t: 50, frame: 'right', number: '149 214 094', sharpness: 400 });
    expect(b.best(60, '149214094')?.frame).toBe('right');
  });
  it('forgets frames older than the window, and returns null with nothing readable', () => {
    const b = createReadFrames<string>(3000);
    b.add({ t: 0, frame: 'old', number: '1', sharpness: 500 });
    expect(b.best(5000)).toBeNull();
    b.add({ t: 5000, frame: 'unread', number: null, sharpness: 500 });
    expect(b.best(5000)).toBeNull();
    expect(b.lastReadAt()).toBeNull();
  });
});
