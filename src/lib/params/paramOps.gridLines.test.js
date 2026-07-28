// #166 — the Grid Lines composite-options row.
//
// The Grid's two 0/1 line-family flags used to be ONE plot2d XY pad whose
// fourth corner (`drawHorizontal: 0, drawVertical: 0`) is a Grid that paints
// nothing, captures nothing and emits no anchors. This suite pins the pure-param
// half of making that corner unrepresentable: a composite `iconselect` def whose
// three options each carry a legal `patch`, plus the two paramOps branches that
// read and write it.
//
// Param SHAPE is deliberately unchanged — `drawHorizontal` / `drawVertical` are
// still two independent floats thresholded at `>= 0.5`. The toggle only makes
// the blank corner WRITE-unreachable; it stays READ-legal, so no saved document
// moves and every existing reader is byte-identical.

import { describe, it, expect, vi } from 'vitest';
import {
  randomPatchForDef,
  defaultPatchForDef,
  isRowDefault,
  optionIdForParams,
} from './paramOps';
import { PATTERN_PARAM_DEFS, DEFAULT_PARAMS } from '../../constants';
import { isEdgeHost, isSemanticHost, hostHasPathStructure } from '../motif/hostKinds';
import { rolesForHost } from '../motif/hostRoles';

const GRID_LINES_DEF = PATTERN_PARAM_DEFS.grid.find((d) => d.key === 'gridLines');
const AXIS_KEYS = ['drawHorizontal', 'drawVertical'];

// ─── the def's shape ─────────────────────────────────────────────────────────

describe('gridLines def — the row that replaced the plot pad', () => {
  it('is present in the grid param defs', () => {
    expect(GRID_LINES_DEF).toBeTruthy();
  });

  it('is an iconselect, not a plot2d, and carries no per-axis ranges', () => {
    expect(GRID_LINES_DEF.type).toBe('iconselect');
    expect(GRID_LINES_DEF.axes).toBeUndefined();
  });

  // The synthetic key is the row's identity EVERYWHERE else: the randomize
  // checkbox (`keys.includes(def.key)`), randomizeGroup's gate, the React key
  // and the `param-row-${def.key}` test id. Dropping it fails SILENTLY.
  it('retains the synthetic key `gridLines` and the two real keys', () => {
    expect(GRID_LINES_DEF.key).toBe('gridLines');
    expect(GRID_LINES_DEF.keys).toEqual(AXIS_KEYS);
  });

  it('offers exactly three options, each with an id, a label, a glyph and a patch', () => {
    expect(GRID_LINES_DEF.options).toHaveLength(3);
    for (const o of GRID_LINES_DEF.options) {
      expect(typeof o.id).toBe('string');
      expect(typeof o.label).toBe('string');
      expect(typeof o.glyph).toBe('string');
      expect(o.patch).toBeTypeOf('object');
    }
  });

  it('every option patch writes BOTH axis keys — never a partial patch', () => {
    for (const o of GRID_LINES_DEF.options) {
      expect(Object.keys(o.patch).sort()).toEqual([...AXIS_KEYS].sort());
    }
  });

  // The whole point of the ticket: the blank grid is unreachable BY
  // CONSTRUCTION, not by a guard. Assert it structurally rather than by
  // sampling Math.random().
  it('every option turns at least one axis ON, and none patches both to 0', () => {
    for (const o of GRID_LINES_DEF.options) {
      const on = AXIS_KEYS.filter((k) => o.patch[k] >= 0.5);
      expect(on.length).toBeGreaterThanOrEqual(1);
    }
    const blank = GRID_LINES_DEF.options.filter(
      (o) => o.patch.drawHorizontal < 0.5 && o.patch.drawVertical < 0.5,
    );
    expect(blank).toEqual([]);
  });

  it('covers the three legal states exactly once each', () => {
    const states = GRID_LINES_DEF.options
      .map((o) => `${o.patch.drawVertical >= 0.5 ? 'V' : '-'}${o.patch.drawHorizontal >= 0.5 ? 'H' : '-'}`)
      .sort();
    expect(states).toEqual(['V-', 'VH', '-H'].sort());
  });

  it('the tooltip no longer advertises a "neither" corner', () => {
    expect(GRID_LINES_DEF.tooltip).not.toMatch(/neither/i);
    expect(GRID_LINES_DEF.tooltip).not.toMatch(/corner/i);
  });
});

// ─── randomPatchForDef: the dice's back door ─────────────────────────────────

describe('randomPatchForDef — composite-options branch', () => {
  // Without a composite-options branch this def falls into `def.keys`, which
  // writes the SAME randomValueForDef(def) into both keys — an option id string
  // into drawHorizontal AND drawVertical.
  it("returns one of the def's own option patches, verbatim", () => {
    const legal = GRID_LINES_DEF.options.map((o) => o.patch);
    for (let i = 0; i < 200; i++) {
      const patch = randomPatchForDef(GRID_LINES_DEF);
      expect(legal).toContainEqual(patch);
    }
  });

  it('never writes a non-numeric value into either axis key', () => {
    for (let i = 0; i < 200; i++) {
      const patch = randomPatchForDef(GRID_LINES_DEF);
      for (const k of AXIS_KEYS) expect(typeof patch[k]).toBe('number');
    }
  });

  it('never produces the blank grid — the dice cannot reach it', () => {
    for (let i = 0; i < 500; i++) {
      const { drawHorizontal, drawVertical } = randomPatchForDef(GRID_LINES_DEF);
      expect(drawHorizontal >= 0.5 || drawVertical >= 0.5).toBe(true);
    }
  });

  it('returns a FRESH patch object — mutating it cannot corrupt the def', () => {
    const patch = randomPatchForDef(GRID_LINES_DEF);
    patch.drawHorizontal = 999;
    for (const o of GRID_LINES_DEF.options) {
      expect(o.patch.drawHorizontal).not.toBe(999);
    }
  });

  it('can reach every one of the three options', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const p = randomPatchForDef(GRID_LINES_DEF);
      seen.add(`${p.drawVertical}|${p.drawHorizontal}`);
    }
    expect(seen.size).toBe(3);
  });

  it('picks by index, so a stubbed Math.random selects the first option', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(randomPatchForDef(GRID_LINES_DEF)).toEqual(GRID_LINES_DEF.options[0].patch);
    } finally {
      spy.mockRestore();
    }
  });

  // The composite-options branch must not disturb the other composite shapes.
  it('leaves the plain `keys` (pad2d) branch alone', () => {
    const OFFSET_DEF = PATTERN_PARAM_DEFS.spirograph.find((d) => d.key === 'offset');
    const patch = randomPatchForDef(OFFSET_DEF);
    expect(Object.keys(patch).sort()).toEqual(['offsetX', 'offsetY']);
  });

  it('leaves the `axes` (plot2d) branch alone', () => {
    const SIZE_DEF = PATTERN_PARAM_DEFS.grid.find((d) => d.key === 'gridSize');
    const patch = randomPatchForDef(SIZE_DEF);
    expect(Object.keys(patch).sort()).toEqual(['cols', 'rows']);
  });

  it('leaves single-key option defs (iconselect shape) alone', () => {
    const SHAPE_DEF = PATTERN_PARAM_DEFS.phyllotaxis.find((d) => d.key === 'shape');
    const patch = randomPatchForDef(SHAPE_DEF);
    expect(Object.keys(patch)).toEqual(['shape']);
  });
});

// ─── optionIdForParams: reading the live params back to an option ────────────

describe('optionIdForParams', () => {
  const id = (params) => optionIdForParams(GRID_LINES_DEF, params);
  const vOnly = GRID_LINES_DEF?.options?.find(
    (o) => o.patch.drawVertical >= 0.5 && o.patch.drawHorizontal < 0.5,
  );
  const hOnly = GRID_LINES_DEF?.options?.find(
    (o) => o.patch.drawHorizontal >= 0.5 && o.patch.drawVertical < 0.5,
  );
  const both = GRID_LINES_DEF?.options?.find(
    (o) => o.patch.drawHorizontal >= 0.5 && o.patch.drawVertical >= 0.5,
  );

  it('reads both axes on as the "both" option', () => {
    expect(id({ drawHorizontal: 1, drawVertical: 1 })).toBe(both.id);
  });

  it('reads vertical-only and horizontal-only as their own options', () => {
    expect(id({ drawHorizontal: 0, drawVertical: 1 })).toBe(vOnly.id);
    expect(id({ drawHorizontal: 1, drawVertical: 0 })).toBe(hOnly.id);
  });

  // The legacy residual, accepted deliberately: a saved blank grid selects
  // NOTHING. It is not coerced on load and not coerced at render.
  it('a legacy blank grid matches no option', () => {
    expect(id({ drawHorizontal: 0, drawVertical: 0 })).toBeUndefined();
  });

  // Grid.js gates at `>= 0.5`, NOT at strict equality. 0.4 / 0.6 are legal
  // stored values with defined meaning (hostKinds.test.js:212-213 exercises
  // exactly that) and must keep reading as their thresholded option.
  it('thresholds at >= 0.5, matching Grid.js — the continuum stays read-legal', () => {
    expect(id({ drawHorizontal: 0.4, drawVertical: 0.6 })).toBe(vOnly.id);
    expect(id({ drawHorizontal: 0.6, drawVertical: 0.6 })).toBe(both.id);
    expect(id({ drawHorizontal: 0.4, drawVertical: 0.4 })).toBeUndefined();
    expect(id({ drawHorizontal: 0.5, drawVertical: 0.5 })).toBe(both.id);
  });

  it('treats a missing axis key as off (0), not as the def default', () => {
    expect(id({})).toBeUndefined();
    expect(id({ drawVertical: 1 })).toBe(vOnly.id);
  });

  it('returns undefined for a def with no options', () => {
    const OFFSET_DEF = PATTERN_PARAM_DEFS.spirograph.find((d) => d.key === 'offset');
    expect(optionIdForParams(OFFSET_DEF, { offsetX: 0, offsetY: 0 })).toBeUndefined();
  });

  it('every option patch round-trips to its own id', () => {
    for (const o of GRID_LINES_DEF.options) {
      expect(id(o.patch)).toBe(o.id);
    }
  });
});

// ─── reset / defaults: unchanged generic walkers ─────────────────────────────

describe('reset and defaults (verified, not modified)', () => {
  it('resetting the row returns drawHorizontal: 1, drawVertical: 1', () => {
    expect(defaultPatchForDef(GRID_LINES_DEF, DEFAULT_PARAMS.grid)).toEqual({
      drawHorizontal: 1,
      drawVertical: 1,
    });
  });

  it('at defaults the row reads as default', () => {
    expect(isRowDefault(GRID_LINES_DEF, DEFAULT_PARAMS.grid, DEFAULT_PARAMS.grid)).toBe(true);
  });

  it('a single-axis grid does NOT read as default', () => {
    const params = { ...DEFAULT_PARAMS.grid, drawHorizontal: 0, drawVertical: 1 };
    expect(isRowDefault(GRID_LINES_DEF, params, DEFAULT_PARAMS.grid)).toBe(false);
  });

  it('the reset patch is itself a legal (non-blank) state', () => {
    const patch = defaultPatchForDef(GRID_LINES_DEF, DEFAULT_PARAMS.grid);
    expect(patch.drawHorizontal >= 0.5 || patch.drawVertical >= 0.5).toBe(true);
  });
});

// ─── the def's own patches, fed to the real routing ──────────────────────────
//
// Every existing routing test constructs grid params LITERALLY, so none of them
// would catch a def whose patches were written positionally against the
// `keys: ['drawHorizontal','drawVertical']` / old `axes: [drawVertical, ...]`
// order mismatch. This suite closes that: it feeds the def's OWN patches in.

describe("the def's option patches drive the real host routing", () => {
  const withDefaults = (patch) => ({ ...DEFAULT_PARAMS.grid, ...patch });
  const optionFor = (v, h) =>
    GRID_LINES_DEF.options.find(
      (o) => (o.patch.drawVertical >= 0.5) === v && (o.patch.drawHorizontal >= 0.5) === h,
    );

  it('the Vertical option makes the grid an EDGE host with path structure', () => {
    const params = withDefaults(optionFor(true, false).patch);
    expect(isEdgeHost('grid', params)).toBe(true);
    expect(isSemanticHost('grid', params)).toBe(false);
    expect(hostHasPathStructure('grid', params)).toBe(true);
  });

  it('the Horizontal option makes the grid an EDGE host with path structure', () => {
    const params = withDefaults(optionFor(false, true).patch);
    expect(isEdgeHost('grid', params)).toBe(true);
    expect(isSemanticHost('grid', params)).toBe(false);
    expect(hostHasPathStructure('grid', params)).toBe(true);
  });

  it('the Both option makes the grid a SEMANTIC host offering all four roles', () => {
    const params = withDefaults(optionFor(true, true).patch);
    expect(isEdgeHost('grid', params)).toBe(false);
    expect(isSemanticHost('grid', params)).toBe(true);
    expect([...rolesForHost('grid', params)].sort()).toEqual(
      ['cell', 'crossing', 'edge', 'tip'].sort(),
    );
  });

  it('every option patch routes to a host that emits SOMETHING', () => {
    for (const o of GRID_LINES_DEF.options) {
      const params = withDefaults(o.patch);
      expect(isEdgeHost('grid', params) || isSemanticHost('grid', params)).toBe(true);
      expect(rolesForHost('grid', params).length).toBeGreaterThan(0);
    }
  });

  it('a randomized patch always routes to a drawing host', () => {
    for (let i = 0; i < 100; i++) {
      const params = withDefaults(randomPatchForDef(GRID_LINES_DEF));
      expect(rolesForHost('grid', params).length).toBeGreaterThan(0);
    }
  });
});
