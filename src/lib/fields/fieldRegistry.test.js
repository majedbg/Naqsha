import { describe, it, expect } from 'vitest';
import { fieldForLayer, canProduceField } from './fieldRegistry.js';
import { ScalarField } from './ScalarField.js';

describe('fieldRegistry.canProduceField', () => {
  it('is true for a chladni layer', () => {
    expect(canProduceField({ patternType: 'chladni' })).toBe(true);
  });

  it('is true for a topographic layer', () => {
    expect(canProduceField({ patternType: 'topographic' })).toBe(true);
  });

  it('is false for a non-source layer', () => {
    expect(canProduceField({ patternType: 'grainfield' })).toBe(false);
    expect(canProduceField({ patternType: 'voronoi' })).toBe(false);
  });

  it('is false for null / undefined / missing patternType', () => {
    expect(canProduceField(null)).toBe(false);
    expect(canProduceField(undefined)).toBe(false);
    expect(canProduceField({})).toBe(false);
  });
});

describe('fieldRegistry.fieldForLayer', () => {
  it('returns a ScalarField for a chladni layer', () => {
    const field = fieldForLayer({
      patternType: 'chladni',
      params: { m: 4, n: 3, blend: 0 },
    });
    expect(field).toBeInstanceOf(ScalarField);
    expect(typeof field.sample).toBe('function');
  });

  it('returns a ScalarField for a topographic layer', () => {
    const field = fieldForLayer({
      patternType: 'topographic',
      seed: 7,
      params: { noiseScale: 2.5, octaves: 3, warp: 0 },
    });
    expect(field).toBeInstanceOf(ScalarField);
    expect(typeof field.sample).toBe('function');
    expect(field.meta.producer).toBe('topographic');
  });

  it('flows the layer seed through to the topographic field', () => {
    const params = { noiseScale: 2.5, octaves: 3, warp: 0 };
    const a = fieldForLayer({ patternType: 'topographic', seed: 7, params });
    const b = fieldForLayer({ patternType: 'topographic', seed: 99, params });
    expect(a).not.toBe(b);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('returns null for a non-source layer (grainfield)', () => {
    expect(fieldForLayer({ patternType: 'grainfield', params: {} })).toBe(null);
  });

  it('returns null for null / undefined', () => {
    expect(fieldForLayer(null)).toBe(null);
    expect(fieldForLayer(undefined)).toBe(null);
  });

  it('returns the same cached field for identical params', () => {
    const a = fieldForLayer({ patternType: 'chladni', params: { m: 7, n: 2 } });
    const b = fieldForLayer({ patternType: 'chladni', params: { m: 7, n: 2 } });
    expect(a).toBe(b);
  });
});
