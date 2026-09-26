import { describe, expect, it } from 'vitest';
import { pickWideLens } from './lens';

const cam = (deviceId: string, label: string) => ({ deviceId, label, kind: 'videoinput' });

describe('pickWideLens', () => {
  it('uses zoom below 1× when the track supports it', () => {
    expect(pickWideLens([], { min: 0.5, max: 10 }, 'a')).toEqual({ kind: 'zoom', zoom: 0.5 });
  });
  it('ignores zoom that starts at 1×', () => {
    expect(pickWideLens([cam('a', 'Back Camera')], { min: 1, max: 10 }, 'a')).toBeNull();
  });
  it('finds the iPhone ultra-wide camera', () => {
    expect(pickWideLens([cam('a', 'Back Camera'), cam('b', 'Back Ultra Wide Camera'), cam('c', 'Front Camera')], undefined, 'a')).toEqual({ kind: 'device', deviceId: 'b' });
  });
  it('matches "0.5x" and "wide angle" labels, not front cameras', () => {
    expect(pickWideLens([cam('b', 'Rear camera 0.5x')], undefined, 'a')).toEqual({ kind: 'device', deviceId: 'b' });
    expect(pickWideLens([cam('b', 'Wide Angle Camera (back)')], undefined, 'a')).toEqual({ kind: 'device', deviceId: 'b' });
    expect(pickWideLens([cam('b', 'Front Ultra Wide Camera')], undefined, 'a')).toBeNull();
  });
  it('offers nothing without labels (permission not granted) or when already on that camera', () => {
    expect(pickWideLens([cam('b', '')], undefined, 'a')).toBeNull();
    expect(pickWideLens([cam('b', 'Back Ultra Wide Camera')], undefined, 'b')).toBeNull();
    expect(pickWideLens([{ deviceId: 'b', label: 'Back Ultra Wide Camera', kind: 'audioinput' }], undefined, 'a')).toBeNull();
  });
});
