import { describe, it, expect } from 'vitest';
import { latticeForLayer, canProduceLattice } from './latticeForLayer';
import { gridLinePositions } from '../patterns/gridGeometry';
import { makeP5Random } from '../patterns/rng';
import Grid from '../patterns/Grid.js';
import { RecordingContext } from '../patterns/drawingContext.js';

// latticeForLayer turns a Grid guide into a set of CANVAS-CENTRE-RELATIVE
// placement nodes (one per line intersection × symmetry copy), each carrying
// its copy's rotation. It reconstructs the grid's jitter offline via
// makeP5Random(seed), so nodes sit on the grid's REAL jittered crossings.

describe('canProduceLattice / latticeForLayer — guard', () => {
  it('canProduceLattice only for grid layers', () => {
    expect(canProduceLattice({ patternType: 'grid' })).toBe(true);
    expect(canProduceLattice({ patternType: 'spiral' })).toBe(false);
    expect(canProduceLattice(null)).toBe(false);
    expect(canProduceLattice(undefined)).toBe(false);
  });

  it('returns null for a non-grid guide', () => {
    expect(latticeForLayer({ patternType: 'spiral', seed: 1, params: {} })).toBeNull();
  });
});

describe('latticeForLayer — node set for symmetry:1', () => {
  const guide = { patternType: 'grid', seed: 42, params: { cols: 2, rows: 2, spacing: 40, symmetry: 1 } };

  it('produces (cols+1)*(rows+1) nodes, all angle 0, matching the direct formula', () => {
    const res = latticeForLayer(guide);
    expect(res).not.toBeNull();
    expect(res.nodes).toHaveLength((2 + 1) * (2 + 1)); // 9

    // Expected = raw origin-centred crossings (theta=0, offset=0 ⇒ x=lx, y=ly).
    const rng = makeP5Random(guide.seed);
    const { xJittered, yJittered } = gridLinePositions(guide.params, rng);
    const expected = [];
    for (const lx of xJittered) {
      for (const ly of yJittered) expected.push({ x: lx, y: ly, angle: 0 });
    }
    expect(res.nodes).toHaveLength(expected.length);
    res.nodes.forEach((nd, i) => {
      expect(nd.angle).toBe(0);
      expect(nd.x).toBeCloseTo(expected[i].x, 10);
      expect(nd.y).toBeCloseTo(expected[i].y, 10);
    });
  });
});

describe('latticeForLayer — radial symmetry', () => {
  it('replicates nodes per symmetry copy with the copy rotations', () => {
    const guide = { patternType: 'grid', seed: 42, params: { cols: 2, rows: 2, spacing: 40, symmetry: 4 } };
    const res = latticeForLayer(guide);
    expect(res.nodes).toHaveLength(4 * 9); // 36

    // The four copies each carry a constant angle: 0, π/2, π, 3π/2 — and each
    // copy spans 9 consecutive nodes (k-outer, then intersections).
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    for (let k = 0; k < 4; k++) {
      for (let idx = 0; idx < 9; idx++) {
        expect(res.nodes[k * 9 + idx].angle).toBeCloseTo(angles[k], 12);
      }
    }
  });

  it('rotates each intersection by its copy angle via the rotation formula', () => {
    const guide = { patternType: 'grid', seed: 7, params: { cols: 1, rows: 1, spacing: 50, symmetry: 4 } };
    const res = latticeForLayer(guide);
    const rng = makeP5Random(guide.seed);
    const { xJittered, yJittered } = gridLinePositions(guide.params, rng);

    const n = 4;
    let i = 0;
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * k) / n;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      for (const lx of xJittered) {
        for (const ly of yJittered) {
          expect(res.nodes[i].x).toBeCloseTo(lx * cos - ly * sin, 9);
          expect(res.nodes[i].y).toBeCloseTo(lx * sin + ly * cos, 9);
          i++;
        }
      }
    }
  });

  it('applies startAngle (deg) and offsetX/Y to the node centre', () => {
    const guide = {
      patternType: 'grid',
      seed: 3,
      params: { cols: 1, rows: 1, spacing: 20, symmetry: 1, startAngle: 90, offsetX: 15, offsetY: -8 },
    };
    const res = latticeForLayer(guide);
    const rng = makeP5Random(guide.seed);
    const { xJittered, yJittered } = gridLinePositions(guide.params, rng);
    const theta = (90 * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    let i = 0;
    for (const lx of xJittered) {
      for (const ly of yJittered) {
        expect(res.nodes[i].x).toBeCloseTo(15 + lx * cos - ly * sin, 9);
        expect(res.nodes[i].y).toBeCloseTo(-8 + lx * sin + ly * cos, 9);
        expect(res.nodes[i].angle).toBeCloseTo(theta, 12);
        i++;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// CRUCIAL PARITY TEST: lattice nodes sit EXACTLY on the grid's jittered
// crossings. We run the real Grid pattern through a context whose `random` IS
// makeP5Random(seed) — the same stream latticeForLayer reconstructs — capture
// the vertical/horizontal <line> coordinates Grid emits, and assert the raw
// lattice nodes (symmetry:1, offset 0 ⇒ centre-relative == origin-centred)
// coincide with the grid's actual drawn crossings, for a jitter>0 config.
// ---------------------------------------------------------------------------

/**
 * A DrawingContext whose randomness is p5's exact seeded LCG (makeP5Random),
 * so Grid's jitter draws match latticeForLayer's offline reconstruction. Grid
 * calls ctx.randomSeed(seed) first, which resets the stream to makeP5Random(seed)
 * — identical to latticeForLayer building a fresh makeP5Random(seed).
 */
class P5RandomContext extends RecordingContext {
  constructor(seed) {
    super({ seed });
    this._p5 = makeP5Random(seed);
  }
  randomSeed(s) { this._p5 = makeP5Random(s); }
  random(a, b) { return this._p5(a, b); }
}

describe('latticeForLayer — parity with the real Grid drawing (jittered crossings)', () => {
  it('nodes coincide with Grid’s actual jittered line crossings', () => {
    const SEED = 12345;
    const params = {
      cols: 3,
      rows: 4,
      spacing: 35,
      jitter: 6, // > 0 ⇒ real jitter draws
      drawHorizontal: 1,
      drawVertical: 1,
      margin: 10,
      strokeWeight: 0.8,
      symmetry: 1,
      startAngle: 0,
      offsetX: 0,
      offsetY: 0,
    };

    // Drive the real Grid through the p5-exact RNG context.
    const grid = new Grid();
    const ctx = new P5RandomContext(SEED);
    grid.generateWithContext(ctx, SEED, params, 800, 600, '#000000', 100);

    // Grid emits <line> for each vertical (x1===x2) and horizontal (y1===y2).
    const xsFromGrid = new Set();
    const ysFromGrid = new Set();
    for (const el of grid.svgElements) {
      const m = el.match(/x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/);
      if (!m) continue;
      const [, x1, y1, x2, y2] = m;
      if (x1 === x2) xsFromGrid.add(x1); // vertical: the shared x is a jittered col
      if (y1 === y2) ysFromGrid.add(y1); // horizontal: the shared y is a jittered row
    }
    expect(xsFromGrid.size).toBe(params.cols + 1);
    expect(ysFromGrid.size).toBe(params.rows + 1);

    // The grid's REAL crossings = cartesian product of its emitted x's × y's,
    // as the toFixed(2) strings Grid printed.
    const gridCrossings = new Set();
    for (const x of xsFromGrid) for (const y of ysFromGrid) gridCrossings.add(`${x},${y}`);

    // The lattice's raw nodes (symmetry:1, offset 0) — compared as the SAME
    // toFixed(2) strings (exact, no floating tolerance boundary).
    const guide = { patternType: 'grid', seed: SEED, params };
    const lattice = latticeForLayer(guide);
    expect(lattice.nodes).toHaveLength((params.cols + 1) * (params.rows + 1));

    const latticeKeys = new Set(
      lattice.nodes.map((nd) => `${nd.x.toFixed(2)},${nd.y.toFixed(2)}`)
    );

    // Set equality: every lattice node sits on a grid crossing and vice-versa.
    expect(latticeKeys).toEqual(gridCrossings);
    expect(latticeKeys.size).toBe(gridCrossings.size);
  });
});
