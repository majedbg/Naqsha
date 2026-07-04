import { describe, it, expect } from 'vitest';
import { resolveModulationForTarget } from './resolveModulationForTarget';

// The 'lattice' channel is DISCRETE placement, not a continuous field. A Grid
// guide with a lattice map supplies its intersection nodes; the resolved object
// carries { channel:'lattice', nodes, amount } and NONE of the field-transfer
// knobs (field/range/offset/shape/steps). A non-grid guide's lattice map falls
// through to null (it cannot produce a lattice).

const target = (over = {}) => ({ id: 't', patternType: 'extracted', ...over });

const gridGuide = (over = {}) => ({
  id: 'g',
  patternType: 'grid',
  seed: 42,
  params: { cols: 2, rows: 2, spacing: 40, symmetry: 1 },
  modulator: { maps: [{ targetLayerId: 't', channel: 'lattice', amount: 0.7 }] },
  ...over,
});

describe('resolveModulationForTarget — lattice channel', () => {
  it('resolves a grid guide + lattice map to a { channel:lattice, nodes } object', () => {
    const res = resolveModulationForTarget(target(), [gridGuide(), target()]);
    expect(res).toBeTruthy();
    expect(res.channel).toBe('lattice');
    expect(Array.isArray(res.nodes)).toBe(true);
    expect(res.nodes.length).toBe((2 + 1) * (2 + 1)); // 9 intersections
    expect(res.amount).toBe(0.7);
    // A lattice carries NONE of the continuous-field transfer knobs.
    expect(res.field).toBeUndefined();
    expect(res.range).toBeUndefined();
    expect(res.shape).toBeUndefined();
    expect(res.steps).toBeUndefined();
    expect(res.offset).toBeUndefined();
  });

  it('defaults amount to 1 when the map omits it', () => {
    const g = gridGuide({ modulator: { maps: [{ targetLayerId: 't', channel: 'lattice' }] } });
    const res = resolveModulationForTarget(target(), [g, target()]);
    expect(res.channel).toBe('lattice');
    expect(res.amount).toBe(1);
  });

  it('nodes each carry x, y and angle', () => {
    const res = resolveModulationForTarget(target(), [gridGuide(), target()]);
    for (const nd of res.nodes) {
      expect(typeof nd.x).toBe('number');
      expect(typeof nd.y).toBe('number');
      expect(typeof nd.angle).toBe('number');
    }
  });

  it('returns null when a NON-grid guide carries a lattice map (falls through)', () => {
    const spiralGuide = {
      id: 'g',
      patternType: 'spiral',
      seed: 1,
      params: {},
      modulator: { maps: [{ targetLayerId: 't', channel: 'lattice', amount: 1 }] },
    };
    expect(resolveModulationForTarget(target(), [spiralGuide, target()])).toBeNull();
  });
});

// Smoke test: field-channel resolution is UNAFFECTED — a continuous-field guide
// with a density map still resolves to a real field object (no lattice keys).
describe('resolveModulationForTarget — field channel unaffected (smoke)', () => {
  it('a chladni guide + density map still returns a resolved field', () => {
    const fieldGuide = {
      id: 'g',
      patternType: 'chladni',
      params: { m: 2, n: 1 },
      modulator: { maps: [{ targetLayerId: 't', channel: 'density', amount: 2 }] },
    };
    const res = resolveModulationForTarget(target(), [fieldGuide, target()]);
    expect(res).toBeTruthy();
    expect(res.channel).toBe('density');
    expect(typeof res.field.sampleSigned).toBe('function'); // a real ScalarField
    expect(res.nodes).toBeUndefined(); // not a lattice
  });
});
