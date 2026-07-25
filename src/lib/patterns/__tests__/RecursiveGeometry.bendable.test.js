import { describe, it, expect } from 'vitest';
import RecursiveGeometry from '../RecursiveGeometry.js';
import { RecordingContext } from '../drawingContext.js';
import { ScalarField } from '../../fields/ScalarField.js';

// Behavioural spec for RecursiveGeometry's BENDABLE-EDGES warp mode (ticket #116).
// A `warpNodes` bend slider gives two modes mirroring grid:
//   K = 2 → vertices-only (corners warp, sides stay straight — today's behaviour)
//   K ≥ 3 → subdivide each side into K nodes, warp all nodes, Catmull-Rom curve.
// `K < 3` is the ONLY runtime gate. With no warp — or K collapsing to straight —
// output is byte-identical to today.

const SEED = 42;
const W = 400;
const H = 400;
const COLOR = '#3366aa';
const OPACITY = 100;
const BASE_PARAMS = {
  shape: 'hexagon',
  depth: 3,
  rotationPerLevel: 15,
  scaleFactor: 0.7,
  scaleNonLinearity: 0,
  startScale: 70,
  strokeWeight: 1,
  strokeDepthDecay: 0,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const fmt = (n) => n.toFixed(2);

function run(params) {
  const inst = new RecursiveGeometry();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

describe('RecursiveGeometry bendable-edges warp mode', () => {
  it('K = 2 keeps sides straight — SVG paths are pure M/L/Z (no curves)', () => {
    const { inst } = run({
      ...BASE_PARAMS,
      warpNodes: 2,
      modulation: { field: risingField(), channel: 'warp', amount: 2 },
    });
    for (const el of inst.svgElements) {
      expect(el.pathD).not.toContain('C');
      expect(el.pathD.startsWith('M')).toBe(true);
      expect(el.pathD.trim().endsWith('Z')).toBe(true);
    }
  });

  it('K = 2 warp is byte-identical to the default-warpNodes warp (both straight)', () => {
    const field = risingField();
    const explicitK2 = run({
      ...BASE_PARAMS,
      warpNodes: 2,
      modulation: { field, channel: 'warp', amount: 2 },
    }).inst.svgElements;
    // Default warpNodes must collapse to straight (K=2) to preserve byte-identity.
    const defaultK = run({
      ...BASE_PARAMS,
      modulation: { field, channel: 'warp', amount: 2 },
    }).inst.svgElements;
    expect(defaultK).toEqual(explicitK2);
  });

  it('K ≥ 3 bends the sides — SVG paths contain Catmull-Rom C curves', () => {
    const { inst } = run({
      ...BASE_PARAMS,
      warpNodes: 6,
      modulation: { field: risingField(), channel: 'warp', amount: 2 },
    });
    const anyCurved = inst.svgElements.some((el) => el.pathD.includes('C'));
    expect(anyCurved).toBe(true);
    for (const el of inst.svgElements) {
      expect(el.pathD.startsWith('M')).toBe(true);
      expect(el.pathD.trim().endsWith('Z')).toBe(true);
    }
  });

  it('K ≥ 3 keeps canvas draws and SVG byte-identical (both from one core)', () => {
    const { inst, ctx } = run({
      ...BASE_PARAMS,
      warpNodes: 5,
      modulation: { field: risingField(), channel: 'warp', amount: 2 },
    });

    // Canvas anchors: the start vertex + every bezierVertex control/anchor point.
    const canvasPts = ctx.calls
      .filter((c) => c.op === 'vertex' || c.op === 'bezierVertex')
      .map((c) => `${fmt(c.args[0])} ${fmt(c.args[1])}`);

    // SVG anchors: every coordinate pair after M and C commands, in order.
    const svgPts = [];
    for (const el of inst.svgElements) {
      for (const m of el.pathD.matchAll(/([-\d.]+) ([-\d.]+)/g)) {
        svgPts.push(`${m[1]} ${m[2]}`);
      }
    }
    expect(canvasPts).toEqual(svgPts);
  });

  it('K ≥ 3 shifts geometry rightward under a rising field (warp is applied)', () => {
    const field = risingField();
    // Mean of all numeric x-coordinates in the curved paths.
    const meanX = (els) => {
      let sum = 0;
      let n = 0;
      for (const el of els) {
        for (const m of el.pathD.matchAll(/([-\d.]+) [-\d.]+/g)) {
          sum += parseFloat(m[1]);
          n += 1;
        }
      }
      return sum / n;
    };
    const bent = run({
      ...BASE_PARAMS,
      warpNodes: 6,
      modulation: { field, channel: 'warp', amount: 3 },
    }).inst.svgElements;
    const unwarped = run({ ...BASE_PARAMS, warpNodes: 6 }).inst.svgElements;
    expect(meanX(bent)).toBeGreaterThan(meanX(unwarped) + 3);
  });

  it('no-warp output is byte-identical regardless of warpNodes value', () => {
    const a = run({ ...BASE_PARAMS, warpNodes: 2 }).inst.svgElements;
    const b = run({ ...BASE_PARAMS, warpNodes: 12 }).inst.svgElements;
    const none = run(BASE_PARAMS).inst.svgElements;
    expect(a).toEqual(none);
    expect(b).toEqual(none);
  });
});
