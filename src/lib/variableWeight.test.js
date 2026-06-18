// Unit tests for the variable line-weight band model (issue #4, A5).
// Headless model + export logic ONLY (no UI). Reserved spectrum colors are
// pinned as LITERALS (never captured from current output), and non-collision
// with the reserved cut/score/engrave colors is asserted per-color.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BAND_COUNT,
  quantizeWeights,
  bucketForWeight,
  weightRange,
  spectrumColors,
  hasVariableWeight,
  supportsVariableWeight,
  generateWeightBand,
  realizeVariableWeightElements,
} from './variableWeight.js';
import { MAX_PEN_SLOTS } from './fabrication.js';

const RESERVED = ['#FF0000', '#0000FF', '#000000'];

// Synthetic per-element elements (do NOT run a real pattern — pure model test).
const els = (weights) => weights.map((strokeWeight, i) => ({ pathD: `M0,${i} L1,${i}`, strokeWeight }));

describe('quantizer', () => {
  it('defaults N to 5', () => {
    expect(DEFAULT_BAND_COUNT).toBe(5);
  });

  it('splits a known range into N even buckets with stable boundaries', () => {
    // min=1, max=11, N=5 → bucket width 2, boundaries [1,3,5,7,9,11].
    const range = weightRange(els([1, 11]));
    expect(range).toEqual({ min: 1, max: 11 });
    expect(bucketForWeight(1, range, 5)).toBe(0);
    expect(bucketForWeight(2.99, range, 5)).toBe(0);
    expect(bucketForWeight(3, range, 5)).toBe(1);
    expect(bucketForWeight(5, range, 5)).toBe(2);
    expect(bucketForWeight(7, range, 5)).toBe(3);
    expect(bucketForWeight(9, range, 5)).toBe(4);
    // w == max clamps into the top bucket (not N).
    expect(bucketForWeight(11, range, 5)).toBe(4);
  });

  it('assigns each element to a bucket deterministically', () => {
    const assignment = quantizeWeights(els([1, 3, 5, 7, 9, 11]), 5);
    expect(assignment).toEqual([0, 1, 2, 3, 4, 4]);
    // re-running with same N is identical
    expect(quantizeWeights(els([1, 3, 5, 7, 9, 11]), 5)).toEqual(assignment);
  });

  it('re-buckets deterministically with a different N', () => {
    const data = els([1, 3, 5, 7, 9, 11]);
    expect(quantizeWeights(data, 2)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(quantizeWeights(data, 2)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('guards a degenerate (zero-width) range: all elements → bucket 0, no NaN', () => {
    const assignment = quantizeWeights(els([2, 2, 2]), 5);
    expect(assignment).toEqual([0, 0, 0]);
    expect(assignment.some(Number.isNaN)).toBe(false);
  });

  it('handles N=1 (single bucket)', () => {
    expect(quantizeWeights(els([1, 5, 11]), 1)).toEqual([0, 0, 0]);
  });
});

describe('spectrum colors', () => {
  it('produces N reserved red→yellow ramp colors, never the reserved RGB colors', () => {
    const colors = spectrumColors(5);
    expect(colors).toHaveLength(5);
    // Deterministic, pinned ramp: orange → yellow (R=FF, B=00, G floor 0x80 → FF).
    expect(colors).toEqual(['#FF8000', '#FFA000', '#FFC000', '#FFDF00', '#FFFF00']);
    for (const c of colors) {
      expect(RESERVED).not.toContain(c);
    }
  });

  it('N=1 yields a single non-reserved color (no divide-by-zero)', () => {
    const colors = spectrumColors(1);
    expect(colors).toHaveLength(1);
    expect(RESERVED).not.toContain(colors[0]);
  });

  it('every spectrum color is disjoint from reserved for a range of N', () => {
    for (let n = 1; n <= 12; n++) {
      for (const c of spectrumColors(n)) {
        expect(RESERVED).not.toContain(c);
      }
    }
  });
});

describe('capability flag', () => {
  it('is true for a weight-varying pattern (recursive)', () => {
    expect(hasVariableWeight('recursive')).toBe(true);
  });

  it('is false for a uniform-weight pattern (flowfield)', () => {
    expect(hasVariableWeight('flowfield')).toBe(false);
  });

  it('is false for an unknown / dynamic pattern id', () => {
    expect(hasVariableWeight('not-a-pattern')).toBe(false);
    expect(hasVariableWeight(undefined)).toBe(false);
  });
});

describe('band generation', () => {
  it('creates N linked operations with spectrum colors disjoint from reserved', () => {
    const band = generateWeightBand({ layerId: 'layer-1', profileId: 'laser', n: 5 });
    expect(band).toHaveLength(5);
    band.forEach((op, i) => {
      // linked: identifiable as a band for this layer
      expect(op.bandLayerId).toBe('layer-1');
      expect(op.bandIndex).toBe(i);
      expect(typeof op.bandId).toBe('string');
      expect(op.color).toBe(spectrumColors(5)[i]);
      expect(RESERVED).not.toContain(op.color);
      expect(op.order).toBe(i);
    });
    // all share ONE bandId
    expect(new Set(band.map((o) => o.bandId)).size).toBe(1);
  });

  it('defaults to N=5 when n omitted', () => {
    const band = generateWeightBand({ layerId: 'L', profileId: 'laser' });
    expect(band).toHaveLength(5);
  });

  it('re-generates deterministically (re-bucketing with a different N)', () => {
    const band = generateWeightBand({ layerId: 'L', profileId: 'laser', n: 3, bandId: 'fixed-band' });
    expect(band).toHaveLength(3);
    expect(band.map((o) => o.color)).toEqual(spectrumColors(3));
    expect(band.every((o) => o.bandId === 'fixed-band')).toBe(true);
  });

  it('plotter band maps bucket → pen slot (band 1 = slot 1) with a pressure/Z hint metadata', () => {
    const band = generateWeightBand({ layerId: 'L', profileId: 'plotter', n: 5 });
    expect(band).toHaveLength(5);
    band.forEach((op, i) => {
      expect(op.process).toBe('pen');
      expect(op.machineParams.penSlot).toBe(i + 1);
      // optional per-band pressure/Z hint stored as metadata (presence, not exact)
      expect(op.machineParams).toHaveProperty('pressure');
    });
  });

  it('plotter band caps pen slot at MAX_PEN_SLOTS', () => {
    const band = generateWeightBand({ layerId: 'L', profileId: 'plotter', n: MAX_PEN_SLOTS + 3 });
    const slots = band.map((o) => o.machineParams.penSlot);
    expect(Math.max(...slots)).toBe(MAX_PEN_SLOTS);
    expect(slots[0]).toBe(1);
  });

  it('drag cutter rejects variable-weight (no band)', () => {
    expect(supportsVariableWeight('dragCutter')).toBe(false);
    expect(supportsVariableWeight('laser')).toBe(true);
    expect(supportsVariableWeight('plotter')).toBe(true);
    expect(generateWeightBand({ layerId: 'L', profileId: 'dragCutter', n: 5 })).toEqual([]);
  });
});

describe('per-element export realization', () => {
  it('laser: colors each element <path> by its bucket from the reserved spectrum', () => {
    const elements = els([1, 6, 11]); // min 1, max 11 → buckets 0,2,4 for N=5
    const out = realizeVariableWeightElements(elements, { profileId: 'laser', n: 5 });
    const colors = spectrumColors(5);
    // element 0 → bucket 0, element 1 (w=6) → bucket 2, element 2 (w=11) → bucket 4
    expect(out).toContain(`stroke="${colors[0]}"`);
    expect(out).toContain(`stroke="${colors[2]}"`);
    expect(out).toContain(`stroke="${colors[4]}"`);
    // per-element stroke-width preserved
    expect(out).toContain('stroke-width="1"');
    expect(out).toContain('stroke-width="11"');
    // never the reserved colors
    for (const r of RESERVED) expect(out).not.toContain(`stroke="${r}"`);
  });

  it('drag cutter: returns null (caller falls back to the normal single-color path)', () => {
    expect(realizeVariableWeightElements(els([1, 11]), { profileId: 'dragCutter', n: 5 })).toBeNull();
  });
});
