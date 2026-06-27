import { describe, it, expect } from 'vitest';
import { ScalarField } from '../fields/ScalarField.js';
import {
  resolveActiveTargets,
  warpDisplaceUV,
  buildWarpDrape,
  densityTickUs,
  buildDensityDrape,
  buildDrapeForTarget,
  WARP_GAIN,
  WARP_MAX_FRAC,
  DEFAULT_DRAPE_COLOR,
} from './drape.js';

// Fields. sampleGradient uses RAW values, so scaling the function scales the
// gradient — used to exercise the magnitude clamp.
const rampU = ScalarField.fromFunction((u) => u, { nx: 33, ny: 33 }); // ∂/∂u ≈ 1
const rampSteep = ScalarField.fromFunction((u) => 10 * u, { nx: 33, ny: 33 }); // ∂/∂u ≈ 10
const rampShallow = ScalarField.fromFunction((u) => 0.1 * u, { nx: 33, ny: 33 }); // ∂/∂u ≈ 0.1
const flat = ScalarField.fromFunction(() => 0.5, { nx: 9, ny: 9 });

// --- Active-target resolution (§3.4, "first incoming edge wins") -------------

// Guides must canProduceField (chladni|topographic). Targets carry a channel via
// patternType: grainfield→density, chladni/topographic/flowfield/recursive→warp.
const guideL = (over = {}) => ({ id: 'g', patternType: 'topographic', params: {}, seed: 1, ...over });
const targetL = (id, patternType, over = {}) => ({ id, patternType, ...over });
const mods = (maps) => ({ modulator: { maps } });

describe('resolveActiveTargets', () => {
  it('returns warp + density descriptors with amount, color, name from the target layer', () => {
    const g = guideL(mods([
      { targetLayerId: 't1', amount: 2 },
      { targetLayerId: 't2', amount: 0.5 },
    ]));
    const layers = [
      g,
      targetL('t1', 'chladni', { color: '#ff0000', name: 'Wavey' }),
      targetL('t2', 'grainfield', { color: '#00ff00', name: 'Grains' }),
    ];
    const got = resolveActiveTargets(g, layers);
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ targetId: 't1', channel: 'warp', amount: 2, color: '#ff0000', name: 'Wavey' });
    expect(got[1]).toMatchObject({ targetId: 't2', channel: 'density', amount: 0.5, color: '#00ff00', name: 'Grains' });
  });

  it('drops targets this guide LOSES (an earlier guide already maps them — first edge wins)', () => {
    const g1 = guideL({ id: 'g1', ...mods([{ targetLayerId: 't', amount: 1 }]) });
    const g2 = guideL({ id: 'g2', ...mods([{ targetLayerId: 't', amount: 1 }]) });
    const layers = [g1, g2, targetL('t', 'chladni')];
    expect(resolveActiveTargets(g1, layers)).toHaveLength(1); // g1 is first → active
    expect(resolveActiveTargets(g2, layers)).toHaveLength(0); // g2 loses → dropped
  });

  it('drops targets whose channel is not warp/density', () => {
    const g = guideL(mods([{ targetLayerId: 't', amount: 1 }]));
    const layers = [g, targetL('t', 'lissajous')]; // no modulation channel
    expect(resolveActiveTargets(g, layers)).toEqual([]);
  });

  it('falls back to the default color when the target has none', () => {
    const g = guideL(mods([{ targetLayerId: 't', amount: 1 }]));
    const layers = [g, targetL('t', 'chladni')];
    expect(resolveActiveTargets(g, layers)[0].color).toBe(DEFAULT_DRAPE_COLOR);
  });

  it('EMPTY STATE: guide with no maps / no modulator / bad inputs → []', () => {
    expect(resolveActiveTargets(guideL({ modulator: undefined }), [guideL()])).toEqual([]);
    expect(resolveActiveTargets(guideL(mods([])), [guideL()])).toEqual([]);
    expect(resolveActiveTargets(null, [])).toEqual([]);
    expect(resolveActiveTargets(guideL(), null)).toEqual([]);
  });
});

// --- Warp displacement transform (§3.4) --------------------------------------

describe('warpDisplaceUV', () => {
  it('points along +∇f (uphill): a ramp in u displaces in +u, not in v', () => {
    const { du, dv } = warpDisplaceUV(rampShallow, 0.5, 0.5, 1);
    expect(du).toBeGreaterThan(0);
    expect(Math.abs(dv)).toBeLessThan(1e-9);
  });

  it('scales linearly with amount', () => {
    const a1 = warpDisplaceUV(rampShallow, 0.5, 0.5, 1).du;
    const a2 = warpDisplaceUV(rampShallow, 0.5, 0.5, 2).du;
    expect(a2).toBeCloseTo(2 * a1, 10);
  });

  it('saturates at the magnitude clamp for steep fields (chladni-like)', () => {
    // Unit + steep ramps both exceed the clamp → identical (saturated) magnitude.
    const unit = warpDisplaceUV(rampU, 0.5, 0.5, 1).du;
    const steep = warpDisplaceUV(rampSteep, 0.5, 0.5, 1).du;
    expect(steep).toBeCloseTo(unit, 6);
    expect(unit).toBeCloseTo(WARP_MAX_FRAC, 4); // clamped to ≈4% of the domain
    // A shallow field stays BELOW the clamp → proportional to its gradient.
    const shallow = warpDisplaceUV(rampShallow, 0.5, 0.5, 1).du;
    expect(shallow).toBeLessThan(unit);
    expect(shallow).toBeCloseTo(0.1 * WARP_GAIN, 4);
  });

  it('no displacement on a flat (zero-gradient) field or a missing field', () => {
    expect(warpDisplaceUV(flat, 0.5, 0.5, 1)).toEqual({ du: 0, dv: 0 });
    expect(warpDisplaceUV(null, 0.5, 0.5, 1)).toEqual({ du: 0, dv: 0 });
  });
});

describe('buildWarpDrape', () => {
  it('emits a deformed-grid LineSegments buffer (xyz pairs) seated on the relief', () => {
    const grid = 4;
    const buf = buildWarpDrape({ field: rampU, amount: 1, exaggeration: 10, width: 100, height: 100, grid });
    // n rows × (n-1) horizontal + (n-1) × n vertical segments, 6 floats each.
    const segs = grid * (grid - 1) + (grid - 1) * grid;
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf).toHaveLength(segs * 6);
    expect(buf.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('returns an empty buffer for a missing field', () => {
    expect(buildWarpDrape({ field: null })).toHaveLength(0);
  });
});

// --- Density spacing transform (§3.4) ----------------------------------------

describe('densityTickUs', () => {
  it('places MORE ticks where the field drives density up (high half > low half)', () => {
    const us = densityTickUs(rampU, 0.5, { amount: 1 });
    const low = us.filter((u) => u < 0.5).length;
    const high = us.filter((u) => u >= 0.5).length;
    expect(high).toBeGreaterThan(low);
    expect(us.length).toBeGreaterThan(2);
  });

  it('is deterministic (no RNG): identical input → identical ticks', () => {
    expect(densityTickUs(rampU, 0.5)).toEqual(densityTickUs(rampU, 0.5));
  });

  it('empty for a missing field', () => {
    expect(densityTickUs(null, 0.5)).toEqual([]);
  });
});

describe('buildDensityDrape', () => {
  it('emits a stud LineSegments buffer; studs stand UP from the relief (b.y > a.y)', () => {
    const buf = buildDensityDrape({ field: rampU, amount: 1, exaggeration: 10, width: 100, height: 100, rows: 4 });
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.length % 6).toBe(0);
    // First stud: endpoint b (floats 3..5) sits above endpoint a in Y.
    expect(buf[4]).toBeGreaterThan(buf[1]);
    // x,z of both endpoints match (a vertical stud).
    expect(buf[3]).toBeCloseTo(buf[0], 10);
    expect(buf[5]).toBeCloseTo(buf[2], 10);
  });

  it('stud HEIGHT is constant — NOT a function of the field weight (density is in spacing, not Z)', () => {
    const buf = buildDensityDrape({ field: rampU, amount: 1, exaggeration: 0, width: 100, height: 100, rows: 1 });
    const heights = [];
    for (let i = 0; i < buf.length; i += 6) heights.push(buf[i + 4] - buf[i + 1]);
    const first = heights[0];
    expect(heights.every((h) => Math.abs(h - first) < 1e-6)).toBe(true);
  });

  it('empty buffer for a missing field', () => {
    expect(buildDensityDrape({ field: null })).toHaveLength(0);
  });
});

describe('buildDrapeForTarget', () => {
  it('routes by channel and threads the target amount', () => {
    const warp = buildDrapeForTarget(
      { channel: 'warp', amount: 1 },
      { field: rampU, exaggeration: 5, width: 100, height: 100 },
    );
    const density = buildDrapeForTarget(
      { channel: 'density', amount: 1 },
      { field: rampU, exaggeration: 5, width: 100, height: 100 },
    );
    expect(warp.length).toBeGreaterThan(0);
    expect(density.length).toBeGreaterThan(0);
    expect(buildDrapeForTarget({ channel: 'nope' }, { field: rampU })).toHaveLength(0);
    expect(buildDrapeForTarget(null, {})).toHaveLength(0);
  });
});
