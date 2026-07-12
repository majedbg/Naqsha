import { describe, it, expect } from 'vitest';
import { adjustField } from '../extraction/preprocess.js';
import {
  applyExposure,
  applyLevels,
  applyToneField,
  lumaHistogram,
  NEUTRAL_LEVELS,
} from './etchTone.js';

// Build a { gray, alpha, width, height } field straight from gray + alpha rows.
function field(grayRows, alphaRows) {
  const height = grayRows.length;
  const width = grayRows[0].length;
  const gray = new Float64Array(width * height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      gray[j] = grayRows[y][x];
      alpha[j] = alphaRows ? alphaRows[y][x] : 255;
    }
  }
  return { gray, alpha, width, height };
}

describe('applyExposure — multiplicative luma gain', () => {
  it('exposure 0 is an EXACT identity (same field object, no float drift)', () => {
    const f = field([[10, 128, 250]]);
    expect(applyExposure(f, 0)).toBe(f); // referential identity ⇒ pixel-exact
  });

  it('exposure +50 doubles luma, clamped to 255', () => {
    const out = applyExposure(field([[10, 100, 200]]), 50);
    expect(Array.from(out.gray)).toEqual([20, 200, 255]);
  });

  it('exposure -50 halves luma', () => {
    const out = applyExposure(field([[10, 100, 200]]), -50);
    expect(Array.from(out.gray)).toEqual([5, 50, 100]);
  });

  it('carries alpha through untouched', () => {
    const out = applyExposure(field([[10, 100]], [[0, 255]]), 50);
    expect(Array.from(out.alpha)).toEqual([0, 255]);
  });
});

describe('applyLevels — black/white/gamma remap', () => {
  it('neutral levels are an EXACT identity (same field object)', () => {
    const f = field([[0, 77, 128, 255]]);
    expect(applyLevels(f, NEUTRAL_LEVELS)).toBe(f);
    expect(applyLevels(f, { blackPoint: 0, whitePoint: 255, gamma: 1 })).toBe(f);
  });

  it('black/white points stretch the input range to 0..255', () => {
    const out = applyLevels(field([[50, 125, 200]]), { blackPoint: 50, whitePoint: 200, gamma: 1 });
    // 50→0, 200→255, 125→(75/150)*255 = 127.5
    expect(out.gray[0]).toBeCloseTo(0, 6);
    expect(out.gray[2]).toBeCloseTo(255, 6);
    expect(out.gray[1]).toBeCloseTo(127.5, 6);
  });

  it('clamps values below black / above white', () => {
    const out = applyLevels(field([[10, 240]]), { blackPoint: 50, whitePoint: 200, gamma: 1 });
    expect(out.gray[0]).toBe(0);
    expect(out.gray[1]).toBe(255);
  });

  it('gamma > 1 lifts the midtones (linearize exponential darkness)', () => {
    const out = applyLevels(field([[128]]), { blackPoint: 0, whitePoint: 255, gamma: 2 });
    // normalized 128/255 = 0.50196; ^(1/2) = 0.7085 → 180.6, brighter than input
    expect(out.gray[0]).toBeGreaterThan(128);
    expect(out.gray[0]).toBeCloseTo(Math.pow(128 / 255, 1 / 2) * 255, 4);
  });

  it('gamma < 1 deepens the midtones', () => {
    const out = applyLevels(field([[128]]), { blackPoint: 0, whitePoint: 255, gamma: 0.5 });
    expect(out.gray[0]).toBeLessThan(128);
  });

  it('degenerate white<=black does not divide-by-zero', () => {
    const out = applyLevels(field([[100, 200]]), { blackPoint: 150, whitePoint: 150, gamma: 1 });
    expect(Number.isFinite(out.gray[0])).toBe(true);
    expect(Number.isFinite(out.gray[1])).toBe(true);
  });

  it('string-typed neutral levels stay an EXACT identity (coerced short-circuit)', () => {
    // A persisted/hand-edited doc can carry number-as-string params; a logically
    // neutral stack must still be a pixel-exact no-op, not a full remap.
    const f = field([[0, 77, 128, 255]]);
    expect(applyLevels(f, { blackPoint: '0', whitePoint: '255', gamma: '1' })).toBe(f);
  });
});

describe('applyToneField — exposure → brightness/contrast → levels', () => {
  it('fully-neutral params are an EXACT identity (same field object)', () => {
    const f = field([[0, 90, 180, 255]]);
    const neutral = { exposure: 0, brightness: 0, contrast: 0, levels: NEUTRAL_LEVELS };
    expect(applyToneField(f, neutral)).toBe(f);
  });

  it('brightness/contrast route through preprocess.adjustField (decision 1)', () => {
    const f = field([[40, 120, 200]]);
    const params = { exposure: 0, brightness: 20, contrast: 15, levels: NEUTRAL_LEVELS };
    const out = applyToneField(f, params);
    const expected = adjustField(f, 20, 15);
    expect(Array.from(out.gray)).toEqual(Array.from(expected.gray));
  });

  it('string-typed fully-neutral tone params stay an EXACT identity (coerced short-circuit)', () => {
    const f = field([[0, 90, 180, 255]]);
    const neutral = { exposure: '0', brightness: '0', contrast: '0', levels: { blackPoint: '0', whitePoint: '255', gamma: '1' } };
    expect(applyToneField(f, neutral)).toBe(f);
  });

  it('composes exposure then brightness/contrast then levels in order', () => {
    const f = field([[100]]);
    const params = { exposure: 50, brightness: 0, contrast: 0, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } };
    // exposure ×2 → 200; adjustField neutral → 200; levels neutral → 200
    expect(applyToneField(f, params).gray[0]).toBeCloseTo(200, 6);
  });
});

describe('lumaHistogram — display-only handle-placement aid', () => {
  it('bins luma into 256 buckets', () => {
    const h = lumaHistogram(field([[0, 0, 128, 255]]));
    expect(h.length).toBe(256);
    expect(h[0]).toBe(2);
    expect(h[128]).toBe(1);
    expect(h[255]).toBe(1);
  });

  it('rounds fractional luma to the nearest bucket and clamps to 0..255', () => {
    const h = lumaHistogram(field([[127.4, 127.6, 300, -5]]));
    expect(h[127]).toBe(1);
    expect(h[128]).toBe(1);
    expect(h[255]).toBe(1); // 300 clamps
    expect(h[0]).toBe(1); // -5 clamps
  });
});
