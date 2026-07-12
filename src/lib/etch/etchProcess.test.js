import { describe, it, expect } from 'vitest';
import { etchSourceToBitmap, ETCH_THRESHOLD } from './etchProcess.js';
import { toGrayField, globalMask } from '../extraction/preprocess.js';

// Build a tiny RGBA ImageData-like buffer from a 2D array of gray values.
function grayImage(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = rows[y][x];
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('etchSourceToBitmap — pure source→1-bit conversion', () => {
  it('thresholds dark→ink(1), light→paper(0) at the fixed cut', () => {
    const img = grayImage([
      [0, 255],
      [200, 100],
    ]);
    const { bits, width, height } = etchSourceToBitmap(img);
    expect(width).toBe(2);
    expect(height).toBe(2);
    // 0 and 100 are < 128 → ink; 255 and 200 are ≥ 128 → paper.
    expect(Array.from(bits)).toEqual([1, 0, 0, 1]);
  });

  it('bits ARE globalMask output — the single-source buffer, reused not recomputed', () => {
    const img = grayImage([[10, 250, 130, 120]]);
    const { bits } = etchSourceToBitmap(img);
    const expected = globalMask(toGrayField(img), ETCH_THRESHOLD, false);
    expect(Array.from(bits)).toEqual(Array.from(expected));
    // canonical polarity: dark = ink
    expect(bits instanceof Uint8Array).toBe(true);
  });

  it('honors an explicit threshold', () => {
    const img = grayImage([[120]]);
    expect(Array.from(etchSourceToBitmap(img, { threshold: 100 }).bits)).toEqual([0]); // 120 ≥ 100 → paper
    expect(Array.from(etchSourceToBitmap(img, { threshold: 130 }).bits)).toEqual([1]); // 120 < 130 → ink
  });

  it('ETCH_THRESHOLD is the extraction default of 128', () => {
    expect(ETCH_THRESHOLD).toBe(128);
  });
});
