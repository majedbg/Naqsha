import { describe, it, expect } from 'vitest';
import { topographicField } from './topographicField.js';
import { ScalarField } from './ScalarField.js';
import TopographicContours from '../patterns/TopographicContours.js';
import { RecordingContext } from '../patterns/drawingContext.js';

const SEED = 7;
const BASE = { noiseScale: 2.5, octaves: 3, warp: 0 };

function meanAbsOverGrid(field) {
  let sum = 0;
  let n = 0;
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      sum += field.signedAt(i, j);
      n++;
    }
  }
  return sum / n;
}

describe('topographicField (WI-3)', () => {
  it('returns a ScalarField', () => {
    const f = topographicField(BASE, { seed: SEED });
    expect(f).toBeInstanceOf(ScalarField);
    expect(typeof f.sample).toBe('function');
  });

  it('produces signed values in ~[-1,1] with mean ≈ 0', () => {
    const f = topographicField(BASE, { seed: SEED });
    // signed extent is [-1,1] by construction (s = 2*elev - 1, elev ∈ [0,1])
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < f.ny; j++) {
      for (let i = 0; i < f.nx; i++) {
        const s = f.signedAt(i, j);
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-1.0001);
    expect(hi).toBeLessThanOrEqual(1.0001);
    expect(lo).toBeLessThan(-0.5); // genuinely reaches the negative pole
    expect(hi).toBeGreaterThan(0.5); // and the positive pole
    expect(Math.abs(meanAbsOverGrid(f))).toBeLessThan(0.15);
  });

  it('carries provenance meta', () => {
    const f = topographicField(BASE, { seed: SEED, resolution: 64 });
    expect(f.meta.producer).toBe('topographic');
    expect(f.meta.seed).toBe(SEED);
    expect(f.meta.resolution).toBe(64);
    expect(f.meta.params).toMatchObject(BASE);
  });

  it('is deterministic for a fixed key (returns the cached instance)', () => {
    const a = topographicField(BASE, { seed: SEED });
    const b = topographicField(BASE, { seed: SEED });
    expect(a).toBe(b);
  });

  it('changes with seed', () => {
    const a = topographicField(BASE, { seed: 7 });
    const b = topographicField(BASE, { seed: 99 });
    expect(a).not.toBe(b);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('changes with noiseScale', () => {
    const a = topographicField({ ...BASE, noiseScale: 2.5 }, { seed: SEED });
    const b = topographicField({ ...BASE, noiseScale: 5.0 }, { seed: SEED });
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('changes with octaves', () => {
    const a = topographicField({ ...BASE, octaves: 2 }, { seed: SEED });
    const b = topographicField({ ...BASE, octaves: 5 }, { seed: SEED });
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('changes with warp', () => {
    const a = topographicField({ ...BASE, warp: 0 }, { seed: SEED });
    const b = topographicField({ ...BASE, warp: 0.6 }, { seed: SEED });
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('is INDEPENDENT of levels/levelBias/strokeWeight (same field)', () => {
    const a = topographicField(
      { ...BASE, levels: 8, levelBias: 0, strokeWeight: 0.6 },
      { seed: SEED }
    );
    const b = topographicField(
      { ...BASE, levels: 40, levelBias: 0.8, strokeWeight: 2.0 },
      { seed: SEED }
    );
    expect(a).toBe(b); // identical cache key → same instance
  });

  // --- Iso-line agreement (WI-3 robust variant) ----------------------------
  // Render TopographicContours on a SQUARE canvas with levels=1: the single
  // marching-squares threshold is iso = (0+0.5)/1 = 0.5 exactly, so EVERY
  // emitted polyline vertex lies on the iso-0.5 contour. Map those vertices to
  // unit (u,v), sample the signed field, and assert the mean |value| is small —
  // i.e. the drawn mid-contour sits near the field's zero set. warp=0 to avoid
  // the documented fbm warp bias.
  it('field zero set agrees with the iso-0.5 contour (square canvas)', () => {
    const SIZE = 512;
    const params = { ...BASE, warp: 0, levels: 1, resolution: 160 };

    const inst = new TopographicContours();
    const ctx = new RecordingContext({ seed: SEED });
    inst.generateWithContext(ctx, SEED, params, SIZE, SIZE, '#224488', 80);

    const field = topographicField(params, { seed: SEED });

    let sum = 0;
    let count = 0;
    for (const el of inst.svgElements) {
      const m = el.match(/points="([^"]*)"/);
      if (!m) continue;
      for (const tok of m[1].trim().split(/\s+/)) {
        const [xs, ys] = tok.split(',');
        const x = parseFloat(xs);
        const y = parseFloat(ys);
        const u = (x + SIZE / 2) / SIZE;
        const v = (y + SIZE / 2) / SIZE;
        sum += Math.abs(field.sampleSigned(u, v));
        count++;
      }
    }
    expect(count).toBeGreaterThan(50); // contour actually produced vertices
    expect(sum / count).toBeLessThan(0.25);
  });
});
