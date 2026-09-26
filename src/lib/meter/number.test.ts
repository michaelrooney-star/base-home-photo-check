import { describe, expect, it } from 'vitest';
import type { Gray } from './image';
import { pickMeterNumber, type OcrLine } from './number';

// 400x300 light image; optional dark rectangle to simulate an LCD window or a finger.
function img(dark?: { x0: number; y0: number; x1: number; y1: number; v: number }): Gray {
  const W = 400, H = 300, data = new Uint8ClampedArray(W * H).fill(235);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (dark && x >= dark.x0 && x < dark.x1 && y >= dark.y0 && y < dark.y1) data[y * W + x] = dark.v;
    if (x > 330 && y > 250) data[y * W + x] = 10; // something dark in a corner for contrast
  }
  // draw "text" strokes inside each OCR box so the background measure has ink to ignore
  return { data, width: W, height: H };
}
const line = (text: string, x0: number, y0: number, x1: number, y1: number, mean = 0.99): OcrLine => ({ text, mean, box: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

describe('pickMeterNumber', () => {
  it('picks the digit line and ignores spec text and barcode captions', () => {
    const r = pickMeterNumber([line('FORM 2S CL200 240V 3W', 100, 100, 300, 115), line('*BF149214094LGFOCS*', 120, 130, 280, 140), line('149 214 094', 140, 160, 260, 180)], img());
    expect(r).toMatchObject({ meter_number_visible: true, meter_number: '149 214 094', all_characters_certain: true, number_fully_in_frame: true, issues: [] });
  });
  it('skips numbers on a darker display (LCD kWh reading)', () => {
    const r = pickMeterNumber([line('0048217', 110, 40, 290, 90), line('149214094', 140, 160, 260, 180)], img({ x0: 60, y0: 10, x1: 340, y1: 120, v: 150 }));
    expect(r.meter_number).toBe('149214094');
  });
  it('is not certain when recognition confidence is low', () => { expect(pickMeterNumber([line('149214094', 140, 160, 260, 180, 0.7)], img()).all_characters_certain).toBe(false); });
  it('flags a number that is only part of a longer run printed elsewhere', () => {
    const r = pickMeterNumber([line('*BF14921409-LGFOCS', 120, 130, 280, 140), line('1492140', 140, 160, 240, 180)], img());
    expect(r.issues).toContain('truncated'); expect(r.all_characters_certain).toBe(false);
  });
  it('flags something dark covering the side of the number', () => {
    const r = pickMeterNumber([line('214094', 180, 160, 260, 180)], img({ x0: 140, y0: 150, x1: 178, y1: 190, v: 40 }));
    expect(r.issues).toContain('obstructed');
  });
  it('flags a number touching the edge of the photo', () => { expect(pickMeterNumber([line('149214094', 0, 160, 120, 180)], img()).number_fully_in_frame).toBe(false); });
  it('prefers the full number over a partial duplicate reading of it (webcam capture)', () => {
    // The partial line has a taller box, which used to outrank the full number and then trip the truncation check.
    const r = pickMeterNumber([line('149214', 140, 150, 220, 185, 0.86), line('149214094', 140, 160, 260, 180, 1)], img());
    expect(r).toMatchObject({ meter_number: '149214094', all_characters_certain: true, issues: [] });
  });
  it('joins a spaced number the OCR split into separate boxes', () => {
    const r = pickMeterNumber([line('149', 140, 160, 175, 180), line('214', 185, 160, 220, 180), line('094', 230, 161, 265, 181)], img());
    expect(r).toMatchObject({ meter_number: '149 214 094', all_characters_certain: true });
  });
  it('does not join text on a different row', () => {
    expect(pickMeterNumber([line('149214', 140, 160, 220, 180), line('094', 230, 200, 265, 220)], img()).meter_number).toBe('149214');
  });
  it('reports nothing when there is no plausible number', () => { expect(pickMeterNumber([line('4094', 140, 160, 200, 180), line('CLS', 10, 10, 50, 30)], img()).meter_number_visible).toBe(false); });
});
