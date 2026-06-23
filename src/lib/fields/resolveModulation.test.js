import { describe, it, expect } from 'vitest';
import { resolveLayerModulation } from './resolveModulation.js';
import { ScalarField } from './ScalarField.js';

// A chladni source layer that produces a real field.
const chladni = (id, params = { m: 4, n: 3 }) => ({
  id,
  patternType: 'chladni',
  params,
});

// A consumer (grainfield) layer with a stored modulation spec pointing at src.
const consumer = (id, modulation) => ({
  id,
  patternType: 'grainfield',
  params: {},
  modulation,
});

describe('resolveLayerModulation — happy path', () => {
  it('resolves a valid spec into the runtime object with a live field', () => {
    const src = chladni('src');
    const layer = consumer('c', {
      sourceLayerId: 'src',
      channel: 'density',
      gain: 2,
      bias: 0.5,
      invert: true,
    });
    const layers = [layer, src];

    const m = resolveLayerModulation(layer, layers);
    expect(m).not.toBeNull();
    expect(m.field).toBeInstanceOf(ScalarField);
    expect(typeof m.field.sample).toBe('function');
    expect(m.channel).toBe('density');
    expect(m.gain).toBe(2);
    expect(m.bias).toBe(0.5);
    expect(m.invert).toBe(true);
  });

  it('applies defaults when the spec omits channel/gain/bias/invert', () => {
    const src = chladni('src');
    const layer = consumer('c', { sourceLayerId: 'src' });
    const m = resolveLayerModulation(layer, [layer, src]);
    expect(m).not.toBeNull();
    expect(m.channel).toBe('density');
    expect(m.gain).toBe(1);
    expect(m.bias).toBe(0);
    expect(m.invert).toBe(false);
  });

  it('does NOT serialize the field (spec stays field-free; field is resolved fresh)', () => {
    const src = chladni('src');
    const spec = { sourceLayerId: 'src', channel: 'density' };
    const layer = consumer('c', spec);
    resolveLayerModulation(layer, [layer, src]);
    // The stored spec must remain unmutated and field-free.
    expect(spec.field).toBeUndefined();
  });
});

describe('resolveLayerModulation — null cases', () => {
  it('returns null when layer has no modulation spec', () => {
    const layer = consumer('c', undefined);
    expect(resolveLayerModulation(layer, [layer])).toBeNull();
  });

  it('returns null when modulation is null', () => {
    const layer = consumer('c', null);
    expect(resolveLayerModulation(layer, [layer])).toBeNull();
  });

  it('returns null when sourceLayerId is missing', () => {
    const layer = consumer('c', { channel: 'density', gain: 2 });
    expect(resolveLayerModulation(layer, [layer])).toBeNull();
  });

  it('returns null when the source layer is not found', () => {
    const layer = consumer('c', { sourceLayerId: 'ghost' });
    expect(resolveLayerModulation(layer, [layer])).toBeNull();
  });

  it('returns null when the source produces no field (non-chladni)', () => {
    const src = { id: 'src', patternType: 'voronoi', params: {} };
    const layer = consumer('c', { sourceLayerId: 'src' });
    expect(resolveLayerModulation(layer, [layer, src])).toBeNull();
  });

  it('returns null when layers is missing / not an array', () => {
    const layer = consumer('c', { sourceLayerId: 'src' });
    expect(resolveLayerModulation(layer, undefined)).toBeNull();
    expect(resolveLayerModulation(layer, null)).toBeNull();
  });

  it('returns null for a null layer', () => {
    expect(resolveLayerModulation(null, [])).toBeNull();
  });
});

describe('resolveLayerModulation — self-modulation guard', () => {
  it('returns null when sourceLayerId === layer.id', () => {
    // A self-referencing spec is forbidden even if the layer itself could
    // produce a field.
    const layer = {
      id: 'self',
      patternType: 'chladni',
      params: { m: 4, n: 3 },
      modulation: { sourceLayerId: 'self', channel: 'density' },
    };
    expect(resolveLayerModulation(layer, [layer])).toBeNull();
  });
});
