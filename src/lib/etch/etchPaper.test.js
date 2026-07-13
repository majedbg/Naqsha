import { describe, it, expect } from 'vitest';
import {
  applyPaperField,
  paperNoiseAt,
  DEFAULT_PAPER_GRAIN,
  DEFAULT_PAPER_SCALE,
  PAPER_GRAIN_MAX,
} from './etchPaper.js';

// Build a { gray, alpha, width, height } field from gray + (optional) alpha rows.
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

// A mid-gray field big enough to hold several noise cells (grain is a spatial
// texture — a 1×1 field can't show feature-size behaviour).
function midField(w = 16, h = 16, v = 128) {
  return field(Array.from({ length: h }, () => Array.from({ length: w }, () => v)));
}

describe('paperNoiseAt — the seeded value-noise generator', () => {
  it('is a pure function of (x, y, scale, seed) — same inputs, same output', () => {
    const a = paperNoiseAt(3, 7, 4, 12345);
    const b = paperNoiseAt(3, 7, 4, 12345);
    expect(a).toBe(b);
  });

  it('stays in [0, 1)', () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const n = paperNoiseAt(x, y, 3, 99);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it('changing the seed changes the field (different grain per layer)', () => {
    const withA = paperNoiseAt(5, 5, 4, 1);
    const withB = paperNoiseAt(5, 5, 4, 2);
    expect(withA).not.toBe(withB);
  });

  it('is a frozen GOLDEN value — pins the exact grain across builds/reloads/worker', () => {
    // A literal golden (not a self-comparison): if the integer hash is ever
    // refactored or a Math.random/Math.sin sneaks in, this exact byte flips and the
    // determinism contract (identical grain across reloads and the worker boundary)
    // is caught. Recompute deliberately if the noise algorithm is intentionally changed.
    expect(paperNoiseAt(10, 20, 4, 777)).toBe(0.4548679143190384);
  });
});

describe('applyPaperField — gray→gray grain overlay', () => {
  it('grain 0 is an EXACT identity (same field object, no drift)', () => {
    const f = midField();
    expect(applyPaperField(f, { grain: 0, scale: 4, seed: 1 })).toBe(f);
  });

  it('a missing grain is identity (default-params guard)', () => {
    const f = midField();
    expect(applyPaperField(f, { scale: 4, seed: 1 })).toBe(f);
    expect(applyPaperField(f, {})).toBe(f);
  });

  it('string-typed "0" grain still short-circuits to identity (coerced)', () => {
    const f = midField();
    expect(applyPaperField(f, { grain: '0', scale: '4', seed: '1' })).toBe(f);
  });

  it('grain > 0 perturbs the field (tooth)', () => {
    const f = midField();
    const out = applyPaperField(f, { grain: 60, scale: 4, seed: 1 });
    expect(out).not.toBe(f);
    let changed = 0;
    for (let j = 0; j < f.gray.length; j++) if (out.gray[j] !== f.gray[j]) changed += 1;
    expect(changed).toBeGreaterThan(0);
  });

  it('is DETERMINISTIC — two independent runs are byte-identical', () => {
    const params = { grain: 75, scale: 5, seed: 424242 };
    const a = applyPaperField(midField(), params);
    const b = applyPaperField(midField(), params);
    expect(Array.from(b.gray)).toEqual(Array.from(a.gray));
  });

  it('survives a structured-clone of its params (seed travels as plain data)', () => {
    const params = { grain: 75, scale: 5, seed: 424242 };
    const a = applyPaperField(midField(), params);
    const b = applyPaperField(midField(), structuredClone(params));
    expect(Array.from(b.gray)).toEqual(Array.from(a.gray));
  });

  it('different seeds yield different grain (same source, same params)', () => {
    const a = applyPaperField(midField(), { grain: 75, scale: 4, seed: 1 });
    const b = applyPaperField(midField(), { grain: 75, scale: 4, seed: 2 });
    expect(Array.from(a.gray)).not.toEqual(Array.from(b.gray));
  });

  it('scale sets the grain feature size — a coarse scale differs from a fine one', () => {
    const fine = applyPaperField(midField(), { grain: 75, scale: 1, seed: 7 });
    const coarse = applyPaperField(midField(), { grain: 75, scale: 8, seed: 7 });
    expect(Array.from(fine.gray)).not.toEqual(Array.from(coarse.gray));
  });

  it('carries alpha and dimensions through untouched', () => {
    const f = field([[128, 128], [128, 128]], [[0, 255], [128, 12]]);
    const out = applyPaperField(f, { grain: 80, scale: 2, seed: 3 });
    expect(Array.from(out.alpha)).toEqual([0, 255, 128, 12]);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });

  it('clamps perturbed luma to 0..255', () => {
    // Extremes plus max grain must never leave the byte range.
    const f = field([[0, 255, 2, 253]]);
    const out = applyPaperField(f, { grain: 100, scale: 2, seed: 9 });
    for (let j = 0; j < out.gray.length; j++) {
      expect(out.gray[j]).toBeGreaterThanOrEqual(0);
      expect(out.gray[j]).toBeLessThanOrEqual(255);
    }
  });

  it('grain is zero-mean-ish — it perturbs, it does not just brighten', () => {
    // Signed perturbation: over a flat mid-field some pixels go darker, some lighter.
    const f = midField(24, 24, 128);
    const out = applyPaperField(f, { grain: 80, scale: 3, seed: 55 });
    let darker = 0;
    let lighter = 0;
    for (let j = 0; j < f.gray.length; j++) {
      if (out.gray[j] < 128) darker += 1;
      else if (out.gray[j] > 128) lighter += 1;
    }
    expect(darker).toBeGreaterThan(0);
    expect(lighter).toBeGreaterThan(0);
  });

  it('exposes sane defaults + a grain ceiling', () => {
    expect(DEFAULT_PAPER_GRAIN).toBe(0);
    expect(DEFAULT_PAPER_SCALE).toBeGreaterThanOrEqual(1);
    expect(PAPER_GRAIN_MAX).toBeGreaterThan(0);
  });
});
