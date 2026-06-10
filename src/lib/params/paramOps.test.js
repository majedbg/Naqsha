// @vitest-environment jsdom
//
// AR-1A: paramOps seam + randomize-drift fix
//
// Phase 1 (RED tracer): Drives the CURRENT useLayers randomizeLayerParams path
// with an iconselect def (shape) and asserts the value is a valid enum member.
// Today this FAILS because useLayers.randomValueForDef branches on
// `def.type === 'select'` (misses `iconselect`) and falls into the numeric path,
// producing NaN.
//
// Phase 2: After paramOps.js is created and useLayers imports from it, the
// tracer becomes the acceptance guard — it stays green.
//
// Phase 3: Characterization tests pin the canonical correct behaviour of every
// paramOps export.

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import useLayers from '../useLayers';
import { DEFAULT_PARAMS, PATTERN_PARAM_DEFS } from '../../constants';

// ─── helpers ────────────────────────────────────────────────────────────────

const PHYLLOTAXIS_SHAPE_OPTIONS = ['circle', 'square', 'triangle', 'hexagon', 'star'];
const PHYLLOTAXIS_FILL_OPTIONS  = ['outline', 'fill', 'both'];

/** Build a minimal layer object that useLayers.loadLayerSet will accept. */
function makePhyllotaxisLayer(id = 'l1') {
  return {
    id,
    name: 'Test Layer',
    color: '#00c9b1',
    opacity: 100,
    visible: true,
    bgColor: '#ffffff',
    bgOpacity: 0,
    patternType: 'phyllotaxis',
    params: { ...DEFAULT_PARAMS.phyllotaxis },
    seed: 12345,
    randomizeKeys: [],
    paramsCache: {},
    role: 'cut',
    penSlot: 1,
  };
}

// ─── RED tracer ─────────────────────────────────────────────────────────────

describe('randomizeLayerParams (useLayers) — iconselect drift bug (tracer)', () => {
  it('randomizing "shape" (iconselect) returns a valid option value, not NaN', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    const layer = { ...makePhyllotaxisLayer('l1'), randomizeKeys: ['shape'] };

    act(() => { result.current.loadLayerSet([layer]); });

    // Randomize params — drives useLayers.randomValueForDef on the shape def
    act(() => { result.current.randomizeLayerParams('l1'); });

    const shapeValue = result.current.layers[0].params.shape;
    // Before the fix: shapeValue is NaN (numeric path, no min/max → NaN).
    // After the fix: shapeValue is one of the valid option strings.
    expect(PHYLLOTAXIS_SHAPE_OPTIONS).toContain(shapeValue);
  });

  it('randomizing "fillMode" (iconselect) returns a valid option value, not NaN', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    const layer = { ...makePhyllotaxisLayer('l2'), randomizeKeys: ['fillMode'] };

    act(() => { result.current.loadLayerSet([layer]); });
    act(() => { result.current.randomizeLayerParams('l2'); });

    const fillValue = result.current.layers[0].params.fillMode;
    expect(PHYLLOTAXIS_FILL_OPTIONS).toContain(fillValue);
  });
});

// ─── paramOps unit tests ─────────────────────────────────────────────────────
// These tests import from paramOps.js directly. They are written here first
// (will ERROR until paramOps.js is created) — that's intentional; the RED
// tracer above is the only test run in isolation before paramOps.js exists.
// After paramOps.js is created, all tests below must pass.

import {
  randomValueForDef,
  randomPatchForDef,
  defaultPatchForDef,
  isRowDefault,
} from './paramOps';

// Canonical defs used across tests
const ICONSELECT_SHAPE_DEF = PATTERN_PARAM_DEFS.phyllotaxis.find(d => d.key === 'shape');
const ICONSELECT_FILL_DEF  = PATTERN_PARAM_DEFS.phyllotaxis.find(d => d.key === 'fillMode');
const SELECT_DEF            = PATTERN_PARAM_DEFS.voronoi.find(d => d.key === 'drawMode');
const NUMERIC_DEF           = PATTERN_PARAM_DEFS.spirograph.find(d => d.key === 'd');
const SYMMETRY_DEF          = PATTERN_PARAM_DEFS.spirograph.find(d => d.key === 'symmetry'); // iconselect but NUMERIC range, no options
const SCALE_FACTOR_DEF      = PATTERN_PARAM_DEFS.recursive.find(d => d.key === 'scaleFactor'); // randomMin/randomMax
const RADII_DEF             = PATTERN_PARAM_DEFS.spirograph.find(d => d.key === 'radii');  // axes composite
const OFFSET_DEF            = PATTERN_PARAM_DEFS.spirograph.find(d => d.key === 'offset'); // keys composite (pad2d)

// ─── randomValueForDef ───────────────────────────────────────────────────────

describe('randomValueForDef', () => {
  describe('iconselect / select: option-bearing defs', () => {
    it('returns a value from def.options for an iconselect def (shape)', () => {
      const val = randomValueForDef(ICONSELECT_SHAPE_DEF);
      expect(PHYLLOTAXIS_SHAPE_OPTIONS).toContain(val);
    });

    it('returns a value from def.options for an iconselect def (fillMode)', () => {
      const val = randomValueForDef(ICONSELECT_FILL_DEF);
      expect(PHYLLOTAXIS_FILL_OPTIONS).toContain(val);
    });

    it('returns a value from def.options for a select def (drawMode)', () => {
      const validDrawModes = SELECT_DEF.options.map(o => o.value);
      const val = randomValueForDef(SELECT_DEF);
      expect(validDrawModes).toContain(val);
    });

    it('uses randomOptions when present instead of def.options', () => {
      const defWithRandomOptions = {
        type: 'select',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ],
        randomOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      };
      // Spy on Math.random to always pick index 0
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        expect(randomValueForDef(defWithRandomOptions)).toBe('a');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('numeric defs', () => {
    it('returns a number within [min, max] for a numeric def', () => {
      const val = randomValueForDef(NUMERIC_DEF); // d: min 10, max 600, step 1
      expect(val).toBeGreaterThanOrEqual(NUMERIC_DEF.min);
      expect(val).toBeLessThanOrEqual(NUMERIC_DEF.max);
      expect(Number.isFinite(val)).toBe(true);
    });

    it('snaps to step for a decimal-step def', () => {
      const def = { min: 0, max: 1, step: 0.1, key: 'test' };
      // With random = 0.55: raw = 0 + 0.55 * 1 = 0.55
      // snapped = round(0.55 / 0.1) * 0.1 = round(5.5) * 0.1 = 6 * 0.1 = 0.6
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
      try {
        const val = randomValueForDef(def);
        expect(val).toBeCloseTo(0.6, 10);
      } finally {
        spy.mockRestore();
      }
    });

    it('respects randomMin/randomMax caps (scaleFactor)', () => {
      // scaleFactor: min 0.3, max 0.95, randomMin 0.4, randomMax 0.8
      for (let i = 0; i < 100; i++) {
        const val = randomValueForDef(SCALE_FACTOR_DEF);
        expect(val).toBeGreaterThanOrEqual(SCALE_FACTOR_DEF.randomMin);
        expect(val).toBeLessThanOrEqual(SCALE_FACTOR_DEF.randomMax);
      }
    });

    it('SYMMETRY_PARAM (iconselect type, numeric range, no options) stays numeric', () => {
      // symmetry has type:'iconselect' but carries min/max/step/randomMax, NO options
      // The canonical branch is on def.options presence, so it goes numeric
      for (let i = 0; i < 50; i++) {
        const val = randomValueForDef(SYMMETRY_DEF);
        expect(val).toBeGreaterThanOrEqual(SYMMETRY_DEF.min);
        expect(val).toBeLessThanOrEqual(SYMMETRY_DEF.randomMax ?? SYMMETRY_DEF.max);
        expect(Number.isInteger(val)).toBe(true); // step: 1
      }
    });

    it('deterministic: random=0 gives lo, random≈1 gives hi (clamped)', () => {
      const def = { min: 10, max: 20, step: 1, key: 'x' };
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        expect(randomValueForDef(def)).toBe(10);
      } finally { spy.mockRestore(); }

      const spy2 = vi.spyOn(Math, 'random').mockReturnValue(0.9999);
      try {
        expect(randomValueForDef(def)).toBe(20);
      } finally { spy2.mockRestore(); }
    });
  });
});

// ─── randomPatchForDef ───────────────────────────────────────────────────────

describe('randomPatchForDef', () => {
  it('returns { [def.key]: value } for a single-key numeric def', () => {
    const patch = randomPatchForDef(NUMERIC_DEF);
    expect(Object.keys(patch)).toEqual(['d']);
    expect(patch.d).toBeGreaterThanOrEqual(NUMERIC_DEF.min);
    expect(patch.d).toBeLessThanOrEqual(NUMERIC_DEF.max);
  });

  it('returns { [def.key]: value } for an iconselect def', () => {
    const patch = randomPatchForDef(ICONSELECT_SHAPE_DEF);
    expect(Object.keys(patch)).toEqual(['shape']);
    expect(PHYLLOTAXIS_SHAPE_OPTIONS).toContain(patch.shape);
  });

  it('expands def.keys with shared range (pad2d offset: keys=[offsetX, offsetY])', () => {
    const patch = randomPatchForDef(OFFSET_DEF);
    expect(Object.keys(patch).sort()).toEqual(['offsetX', 'offsetY'].sort());
    expect(patch.offsetX).toBeGreaterThanOrEqual(OFFSET_DEF.min);
    expect(patch.offsetX).toBeLessThanOrEqual(OFFSET_DEF.max);
    expect(patch.offsetY).toBeGreaterThanOrEqual(OFFSET_DEF.min);
    expect(patch.offsetY).toBeLessThanOrEqual(OFFSET_DEF.max);
  });

  it('expands def.axes with per-axis ranges (plot2d radii: keys=[R, r])', () => {
    const patch = randomPatchForDef(RADII_DEF);
    expect(Object.keys(patch).sort()).toEqual(['R', 'r'].sort());
    const [axR, axr] = RADII_DEF.axes;
    expect(patch.R).toBeGreaterThanOrEqual(axR.min);
    expect(patch.R).toBeLessThanOrEqual(axR.max);
    expect(patch.r).toBeGreaterThanOrEqual(axr.min);
    expect(patch.r).toBeLessThanOrEqual(axr.max);
  });
});

// ─── defaultPatchForDef ──────────────────────────────────────────────────────

describe('defaultPatchForDef', () => {
  it('returns { [def.key]: defaults[def.key] } for a single-key def', () => {
    const defaults = { d: 181, ...DEFAULT_PARAMS.spirograph };
    const patch = defaultPatchForDef(NUMERIC_DEF, defaults);
    expect(patch).toEqual({ d: 181 });
  });

  it('falls back to def.min when key not in defaults', () => {
    const patch = defaultPatchForDef(NUMERIC_DEF, {});
    expect(patch).toEqual({ d: NUMERIC_DEF.min });
  });

  it('expands def.keys for a composite def (pad2d offset)', () => {
    const defaults = { offsetX: 0, offsetY: 0 };
    const patch = defaultPatchForDef(OFFSET_DEF, defaults);
    expect(patch).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('falls back to def.min per key when composite key missing in defaults', () => {
    const patch = defaultPatchForDef(OFFSET_DEF, {});
    expect(patch).toEqual({ offsetX: OFFSET_DEF.min, offsetY: OFFSET_DEF.min });
  });
});

// ─── isRowDefault ────────────────────────────────────────────────────────────

describe('isRowDefault', () => {
  it('returns true when single-key def value equals default', () => {
    const def = { key: 'd', min: 10 };
    expect(isRowDefault(def, { d: 181 }, { d: 181 })).toBe(true);
  });

  it('returns false when single-key def value differs from default', () => {
    const def = { key: 'd', min: 10 };
    expect(isRowDefault(def, { d: 200 }, { d: 181 })).toBe(false);
  });

  it('returns true when composite keys all equal defaults (pad2d)', () => {
    expect(isRowDefault(OFFSET_DEF, { offsetX: 0, offsetY: 0 }, { offsetX: 0, offsetY: 0 })).toBe(true);
  });

  it('returns false when any composite key differs from default', () => {
    expect(isRowDefault(OFFSET_DEF, { offsetX: 50, offsetY: 0 }, { offsetX: 0, offsetY: 0 })).toBe(false);
  });

  it('uses def.min as fallback when key absent from defaults', () => {
    const def = { key: 'd', min: 10 };
    // No defaults provided; 10 === min → true
    expect(isRowDefault(def, { d: 10 }, {})).toBe(true);
    // 15 !== min → false
    expect(isRowDefault(def, { d: 15 }, {})).toBe(false);
  });
});
