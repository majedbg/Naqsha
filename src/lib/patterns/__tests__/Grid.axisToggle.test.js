// #166 — what the three Grid Lines options actually PAINT.
//
// Deliberately a NEW file: `Grid.test.js` is one of the eight suites that must
// pass unchanged as the proof that the param shape did not move, so nothing is
// appended there.
//
// Each case feeds the def's OWN option patch (not a literal) into the real
// pattern, so a patch written positionally against the `keys` / old `axes`
// ordering mismatch would paint the wrong family and fail here.

import { describe, it, expect } from 'vitest';
import Grid from '../Grid.js';
import { RecordingContext } from '../drawingContext.js';
import { PATTERN_PARAM_DEFS, DEFAULT_PARAMS } from '../../../constants.js';
import { randomPatchForDef } from '../../params/paramOps.js';

const SEED = 7;
const COLOR = '#112233';
const OPACITY = 80;

// symmetry 1 / startAngle 0 keeps the drawn frame axis-aligned so "is this line
// vertical?" is a coordinate question, not a trigonometry one.
const BASE = {
  cols: 4, rows: 3, spacing: 30, nonLinear: 0, jitter: 0,
  margin: 10, strokeWeight: 0.8, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
};

const GRID_LINES_DEF = PATTERN_PARAM_DEFS.grid.find((d) => d.key === 'gridLines');
const optionByState = (v, h) =>
  GRID_LINES_DEF.options.find(
    (o) => (o.patch.drawVertical >= 0.5) === v && (o.patch.drawHorizontal >= 0.5) === h,
  );

const V_ONLY = optionByState(true, false);
const H_ONLY = optionByState(false, true);
const BOTH = optionByState(true, true);

function run(patch) {
  const inst = new Grid();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, { ...BASE, ...patch }, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

/** Every drawn segment as {x1,y1,x2,y2}, read off the emitted SVG. */
function segments(inst) {
  return inst.svgElements
    .map((s) => s.match(/x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/))
    .filter(Boolean)
    .map((m) => ({
      x1: parseFloat(m[1]), y1: parseFloat(m[2]),
      x2: parseFloat(m[3]), y2: parseFloat(m[4]),
    }));
}

const verticals = (segs) => segs.filter((s) => s.x1 === s.x2);
const horizontals = (segs) => segs.filter((s) => s.y1 === s.y2);

describe('Grid Lines options → what the canvas paints', () => {
  it('Vertical paints columns only', () => {
    const segs = segments(run(V_ONLY.patch).inst);
    expect(segs.length).toBeGreaterThan(0);
    expect(verticals(segs)).toHaveLength(segs.length);
    expect(horizontals(segs)).toHaveLength(0);
  });

  it('Horizontal paints rows only', () => {
    const segs = segments(run(H_ONLY.patch).inst);
    expect(segs.length).toBeGreaterThan(0);
    expect(horizontals(segs)).toHaveLength(segs.length);
    expect(verticals(segs)).toHaveLength(0);
  });

  it('Both paints the full lattice — every column AND every row', () => {
    const segs = segments(run(BOTH.patch).inst);
    const v = verticals(segs).length;
    const h = horizontals(segs).length;
    expect(v).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(v + h).toBe(segs.length);
    // Both is exactly the union of the two single-axis renders.
    expect(v).toBe(segments(run(V_ONLY.patch).inst).length);
    expect(h).toBe(segments(run(H_ONLY.patch).inst).length);
  });

  it('every option paints SOMETHING — the blank grid is off the menu', () => {
    for (const o of GRID_LINES_DEF.options) {
      expect(segments(run(o.patch).inst).length).toBeGreaterThan(0);
    }
  });

  it('every randomized patch paints something too', () => {
    for (let i = 0; i < 40; i++) {
      const patch = randomPatchForDef(GRID_LINES_DEF);
      expect(segments(run(patch).inst).length).toBeGreaterThan(0);
    }
  });

  it('the reset state (DEFAULT_PARAMS.grid) is the full lattice', () => {
    const { drawHorizontal, drawVertical } = DEFAULT_PARAMS.grid;
    const segs = segments(run({ drawHorizontal, drawVertical }).inst);
    expect(verticals(segs).length).toBeGreaterThan(0);
    expect(horizontals(segs).length).toBeGreaterThan(0);
  });
});

describe('the legacy blank grid is left exactly as it was', () => {
  const BLANK = { drawHorizontal: 0, drawVertical: 0 };

  it('renders without error and paints nothing — unchanged by this ticket', () => {
    const { inst, ctx } = run(BLANK);
    expect(segments(inst)).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'line')).toHaveLength(0);
  });

  it('its output is byte-identical across runs (no coercion crept in)', () => {
    expect(run(BLANK).inst.svgElements).toEqual(run(BLANK).inst.svgElements);
  });

  it('the stored continuum still reads at >= 0.5, not as booleans', () => {
    // 0.6 draws, 0.4 does not — the same answer as before the toggle.
    const segs = segments(run({ drawVertical: 0.6, drawHorizontal: 0.4 }).inst);
    expect(verticals(segs)).toHaveLength(segs.length);
    expect(horizontals(segs)).toHaveLength(0);
  });
});
