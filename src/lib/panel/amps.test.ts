import { describe, expect, it } from 'vitest';
import { pickAmps } from './amps';

const line = (text: string, mean = 0.95, h = 40) => ({ text, mean, box: [[0, 0], [60, 0], [60, h], [0, h]] });

describe('pickAmps', () => {
  it('reads a handle stamp', () => { expect(pickAmps([line('MAIN'), line('200')]).amps).toBe(200); });
  it('accepts "150A" and "125 AMP", and a misread O', () => {
    expect(pickAmps([line('150A')]).amps).toBe(150);
    expect(pickAmps([line('125 AMP')]).amps).toBe(125);
    expect(pickAmps([line('2O0')]).amps).toBe(200);
  });
  it('ignores voltages, part numbers and low-confidence reads', () => {
    expect(pickAmps([line('120/240V'), line('240'), line('QO2200'), line('200', 0.5)]).amps).toBeNull();
  });
  it('prefers the biggest number in the photo (the handle, not the label)', () => {
    expect(pickAmps([line('225', 0.99, 12), line('200', 0.9, 60)]).amps).toBe(200);
  });
});
