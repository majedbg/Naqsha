import { describe, it, expect } from 'vitest';
import { capturePolylines, CLOSURE_TOLERANCE_RELATIVE, closureToleranceFor } from './capturePolylines.js';
import Grid from '../patterns/Grid.js';
import { RecordingContext, P5Adapter } from '../patterns/drawingContext.js';
import { mulberry32 } from '../patterns/rng.js';
import { sampleEdgeAnchors } from './anchors.js';

// Helper: assert a point is close to (x,y) (folded float math).
function near(pt, x, y) {
  expect(pt.x).toBeCloseTo(x, 9);
  expect(pt.y).toBeCloseTo(y, 9);
}

describe('capturePolylines', () => {
  it('turns a bare line into a 2-point open polyline in absolute coords', () => {
    const paths = capturePolylines([{ op: 'line', args: [1, 2, 3, 4] }]);
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(false);
    expect(paths[0].points).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('turns beginShape/vertex/endShape into one polyline; endShape arg ⇒ closed', () => {
    const open = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: [] },
    ]);
    expect(open).toHaveLength(1);
    expect(open[0].closed).toBe(false);
    expect(open[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);

    const closed = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: ['close'] }, // any non-null first arg (p5 CLOSE) ⇒ closed
    ]);
    expect(closed[0].closed).toBe(true);
  });

  it('folds translate → absolute coords', () => {
    const paths = capturePolylines([
      { op: 'translate', args: [100, 50] },
      { op: 'line', args: [0, 0, 5, 0] },
    ]);
    expect(paths[0].points).toEqual([
      { x: 100, y: 50 },
      { x: 105, y: 50 },
    ]);
  });

  it('folds translate THEN rotate in the correct order (the transpose/order trap)', () => {
    // translate(10,0); rotate(90°); vertex(5,0) must land at (10,5),
    // NOT (15,0) (order swapped) and NOT (10,-5) (rotation transposed).
    const paths = capturePolylines([
      { op: 'translate', args: [10, 0] },
      { op: 'rotate', args: [Math.PI / 2] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [5, 0] },
      { op: 'vertex', args: [0, 0] },
      { op: 'endShape', args: [] },
    ]);
    near(paths[0].points[0], 10, 5);
    near(paths[0].points[1], 10, 0);
  });

  it('folds scale (uniform and non-uniform)', () => {
    const uni = capturePolylines([
      { op: 'scale', args: [2] },
      { op: 'line', args: [1, 1, 3, 4] },
    ]);
    expect(uni[0].points).toEqual([
      { x: 2, y: 2 },
      { x: 6, y: 8 },
    ]);
    const non = capturePolylines([
      { op: 'scale', args: [2, 3] },
      { op: 'line', args: [1, 1, 0, 0] },
    ]);
    expect(non[0].points).toEqual([
      { x: 2, y: 3 },
      { x: 0, y: 0 },
    ]);
  });

  it('push/pop isolates transforms (nested); a full T·R·S fixture', () => {
    const paths = capturePolylines([
      { op: 'translate', args: [100, 100] },
      { op: 'push', args: [] },
      { op: 'rotate', args: [Math.PI / 2] }, // 90°
      { op: 'scale', args: [2] },
      { op: 'line', args: [1, 0, 0, 1] }, // inside push
      { op: 'pop', args: [] },
      // after pop, only translate(100,100) remains
      { op: 'line', args: [0, 0, 5, 0] },
    ]);
    // inside push: point (1,0) → scale2 → (2,0) → rot90 → (0,2) → +T(100,100) = (100,102)
    //             point (0,1) → scale2 → (0,2) → rot90 → (-2,0) → +T = (98,100)
    near(paths[0].points[0], 100, 102);
    near(paths[0].points[1], 98, 100);
    // after pop: translate-only
    expect(paths[1].points).toEqual([
      { x: 100, y: 100 },
      { x: 105, y: 100 },
    ]);
  });

  it('never pops below the identity base matrix (unbalanced pop is tolerated)', () => {
    const paths = capturePolylines([
      { op: 'pop', args: [] }, // stray pop — must not throw or corrupt the base
      { op: 'translate', args: [7, 0] },
      { op: 'line', args: [0, 0, 1, 0] },
    ]);
    expect(paths[0].points).toEqual([
      { x: 7, y: 0 },
      { x: 8, y: 0 },
    ]);
  });

  it('ignores unknown ops and shapes with fewer than 2 vertices', () => {
    const paths = capturePolylines([
      { op: 'stroke', args: ['red'] },
      { op: 'ellipse', args: [0, 0, 5, 5] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [1, 1] }, // lone vertex → dropped
      { op: 'endShape', args: [] },
      { op: 'strokeWeight', args: [2] },
    ]);
    expect(paths).toEqual([]);
  });

  it('flattens a bezierOrder(3)+bezierVertex cubic into on-curve polyline points', () => {
    // A single cubic from (0,0) with controls (0,100),(100,100) to (100,0).
    const paths = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'bezierOrder', args: [3] },
      { op: 'bezierVertex', args: [0, 100] },   // c1
      { op: 'bezierVertex', args: [100, 100] },  // c2
      { op: 'bezierVertex', args: [100, 0] },    // end (on-curve)
      { op: 'endShape', args: [] },
    ]);
    expect(paths).toHaveLength(1);
    const pts = paths[0].points;
    // Start anchor pinned, endpoint pinned exactly, control points never emitted.
    near(pts[0], 0, 0);
    near(pts[pts.length - 1], 100, 0);
    expect(pts.some((p) => p.x === 0 && p.y === 100)).toBe(false);
    expect(pts.some((p) => p.x === 100 && p.y === 100)).toBe(false);
    // Adaptive flattening emits several intermediate on-curve points; the true
    // B(0.5) = (50,75) must have a near neighbour.
    expect(pts.length).toBeGreaterThan(3);
    const nearestMid = Math.min(...pts.map((p) => Math.hypot(p.x - 50, p.y - 75)));
    expect(nearestMid).toBeLessThan(0.15);
  });

  it('folds bezier control points through the CTM before flattening', () => {
    // translate(10,20) then a cubic whose endpoint is local (5,0) → absolute (15,20).
    const paths = capturePolylines([
      { op: 'translate', args: [10, 20] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'bezierOrder', args: [3] },
      { op: 'bezierVertex', args: [0, 5] },
      { op: 'bezierVertex', args: [5, 5] },
      { op: 'bezierVertex', args: [5, 0] },
      { op: 'endShape', args: [] },
    ]);
    near(paths[0].points[0], 10, 20);
    near(paths[0].points[paths[0].points.length - 1], 15, 20);
  });

  it('ignores a bezierVertex with no preceding on-curve anchor', () => {
    const paths = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'bezierOrder', args: [3] },
      { op: 'bezierVertex', args: [0, 100] },
      { op: 'bezierVertex', args: [100, 100] },
      { op: 'bezierVertex', args: [100, 0] },
      { op: 'endShape', args: [] },
    ]);
    // No anchor to root the curve → nothing usable → dropped (<2 vertices).
    expect(paths).toEqual([]);
  });

  it('handles multiple symmetry copies (each push/translate/rotate emits its own path)', () => {
    // Mimics applySymmetryDraw with n=2: two translated+rotated copies.
    const calls = [];
    for (const rot of [0, Math.PI]) {
      calls.push({ op: 'push', args: [] });
      calls.push({ op: 'translate', args: [50, 50] });
      calls.push({ op: 'rotate', args: [rot] });
      calls.push({ op: 'line', args: [10, 0, 20, 0] });
      calls.push({ op: 'pop', args: [] });
    }
    const paths = capturePolylines(calls);
    expect(paths).toHaveLength(2);
    // copy 0: no rotation
    near(paths[0].points[0], 60, 50);
    near(paths[0].points[1], 70, 50);
    // copy 1: rotated 180° → (10,0)→(-10,0)→+T=(40,50); (20,0)→(-20,0)→(30,50)
    near(paths[1].points[0], 40, 50);
    near(paths[1].points[1], 30, 50);
  });
});

// INTEGRATION — the real feature seam the vine-along-a-column relies on: a
// single-axis Grid's generate() draws its lines with ctx.line INSIDE
// applySymmetryDraw's push/translate/rotate/pop wrapper, and capturePolylines
// must fold those through the CTM into non-empty, canvas-absolute hostPaths. Unit
// tests that inject hostPaths directly never exercise this; this drives a REAL
// Grid through the SAME record format the production P5Adapter emits (Recording
// context records identical {op,args}) and the REAL capturePolylines. Without
// this, an empty-capture regression would silently relocate the "nothing appears"
// bug one stage upstream.
describe('capturePolylines — real single-axis Grid host (vine seam)', () => {
  const W = 800;
  const H = 600;
  function captureGrid(params) {
    const ctx = new RecordingContext({ seed: 7 });
    new Grid().generateWithContext(ctx, 7, params, W, H, '#000000', 100);
    return capturePolylines(ctx.calls);
  }

  it('columns-only grid captures one polyline per vertical column', () => {
    const cols = 5;
    const paths = captureGrid({ cols, rows: 4, spacing: 60, drawHorizontal: 0 });
    // One straight line per drawn vertical (cols+1 line positions in a grid).
    expect(paths.length).toBeGreaterThanOrEqual(cols);
    // Each is a vertical segment (near-constant x, y spans a range) in absolute
    // canvas coords (centered lattice folded by applySymmetryDraw's translate).
    for (const p of paths) {
      expect(p.points.length).toBeGreaterThanOrEqual(2);
      const [a, b] = [p.points[0], p.points[p.points.length - 1]];
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6); // vertical: x constant
      expect(Math.abs(a.y - b.y)).toBeGreaterThan(50); // real vertical extent
      expect(a.x).toBeGreaterThan(0); // folded to absolute canvas space, not centered
      expect(a.x).toBeLessThan(W);
    }
  });

  it('rows-only grid captures horizontal polylines', () => {
    const paths = captureGrid({ cols: 4, rows: 5, spacing: 60, drawVertical: 0 });
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const [a, b] = [p.points[0], p.points[p.points.length - 1]];
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-6); // horizontal: y constant
      expect(Math.abs(a.x - b.x)).toBeGreaterThan(50);
    }
  });

  it('captured columns feed sampleEdgeAnchors — anchors distribute ALONG each line', () => {
    const paths = captureGrid({ cols: 3, rows: 4, spacing: 80, drawHorizontal: 0 });
    // This is what MotifPattern does in edge mode. Multiple samples per line means
    // leaves march UP the column — the whole point of the feature.
    const anchors = sampleEdgeAnchors(paths, { spacing: 40 });
    expect(anchors.length).toBeGreaterThan(paths.length); // >1 anchor per line
    expect(anchors.every((an) => an.role === 'edge')).toBe(true);
    // Anchors on a given path share x (vertical) but differ in y (distributed up).
    const byPath = new Map();
    for (const an of anchors) {
      const k = an.meta.pathIndex;
      if (!byPath.has(k)) byPath.set(k, []);
      byPath.get(k).push(an);
    }
    const someLineHasSpread = [...byPath.values()].some((group) => {
      const ys = group.map((g) => g.y);
      return Math.max(...ys) - Math.min(...ys) > 50;
    });
    expect(someLineHasSpread).toBe(true);
  });

  it('a two-axis grid captures BOTH families (baseline — still works)', () => {
    const paths = captureGrid({ cols: 4, rows: 4, spacing: 60 });
    expect(paths.length).toBeGreaterThan(0);
  });

  // A WARP-modulated single-axis grid draws its lines with bezierVertex (curved).
  // capturePolylines now flattens those Béziers (shared adaptive flattenCubic) so
  // the vine follows the warped edge — the Phase-2 unblock. The captured polyline
  // must be genuinely CURVED (its interior bows off the straight chord between its
  // endpoints), not a 2-point straight segment.
  it('a WARP-modulated single-axis grid captures CURVED polylines the vine can follow', () => {
    // Minimal constant-gradient warp field so Grid takes its warpMod branch.
    const field = { sampleGradient: () => ({ dx: 0.5, dy: 0.5 }) };
    const modulation = { channel: 'warp', field, amount: 1 };
    const paths = captureGrid({
      cols: 5,
      rows: 4,
      spacing: 60,
      drawHorizontal: 0,
      warpNodes: 6,
      modulation,
    });
    expect(paths.length).toBeGreaterThan(0);
    // At least one captured line bows off the straight chord between its endpoints
    // (proof the Bézier curvature survived flattening, not a straight fallback).
    const bows = paths.some((p) => {
      const pts = p.points;
      if (pts.length < 3) return false;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const mag = Math.hypot(dx, dy) || 1;
      let maxOff = 0;
      for (const pt of pts) {
        const off = Math.abs(dy * pt.x - dx * pt.y + b.x * a.y - b.y * a.x) / mag;
        maxOff = Math.max(maxOff, off);
      }
      return maxOff > 1; // more than a px of curvature
    });
    expect(bows).toBe(true);
    // And the flattened curve is dense enough for arc-length sampling to march
    // leaves ALONG it (not just 2 endpoints).
    expect(Math.max(...paths.map((p) => p.points.length))).toBeGreaterThan(3);
  });
});

// PRODUCTION PROBE PATH — the vine only works end-to-end if the record-mode
// P5Adapter (what useCanvas uses, NOT RecordingContext) actually records the
// bezierOrder/bezierVertex ops. This drives a REAL warped Grid through a
// draw:false, record:true P5Adapter (deterministic fake p5, RNG delegated) and
// asserts capturePolylines yields a non-empty CURVED polyline — guards against
// the capturePolylines change going green while the production probe stays broken.
describe('capturePolylines — warped Grid through the record-mode P5Adapter (production probe)', () => {
  function makeFakeP5() {
    let r = mulberry32(1);
    let n = mulberry32(0x9e3779b9);
    return {
      TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
      CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
      randomSeed(s) { r = mulberry32(s | 0); },
      noiseSeed(s) { n = mulberry32(((s | 0) ^ 0x1234567) >>> 0); },
      random(a, b) { const u = r(); if (a === undefined) return u; if (b === undefined) return u * a; return a + u * (b - a); },
      noise() { return n(); },
      color: () => ({ setAlpha() {} }),
      red: () => 0, green: () => 0, blue: () => 0, map: (v) => v,
    };
  }

  it('records + flattens bezierVertex ops into a non-empty curved capture', () => {
    const field = { sampleGradient: () => ({ dx: 0.5, dy: 0.5 }) };
    const modulation = { channel: 'warp', field, amount: 1 };
    const ctx = new P5Adapter(makeFakeP5(), { draw: false, record: true });
    new Grid().generateWithContext(ctx, 7, {
      cols: 5, rows: 4, spacing: 60, drawHorizontal: 0, warpNodes: 6, modulation,
    }, 800, 600, '#000000', 100);

    // The probe MUST have recorded the curve ops (not silently dropped them).
    expect(ctx.calls.some((c) => c.op === 'bezierVertex')).toBe(true);

    const paths = capturePolylines(ctx.calls);
    expect(paths.length).toBeGreaterThan(0);
    expect(Math.max(...paths.map((p) => p.points.length))).toBeGreaterThan(3);
  });
});

// ── #147 · closure inference from endpoint coincidence ───────────────────────
// The tolerance is a stated contract, not an implementation detail, so it is
// pinned on BOTH sides here with synthetic geometry whose bbox diagonal — and
// therefore whose exact threshold — is known to the test. Every case computes
// the threshold FROM the exported constant, so widening or narrowing the
// tolerance moves these tests rather than quietly passing them.
describe('capturePolylines — #147 closure inference', () => {
  // A square traced counter-clockwise, with the run ending `gap` px short of its
  // start. The tail point (0, gap) never moves the bounding box (x∈[0,S],
  // y∈[0,S] is fixed by the other three corners), so the diagonal — and hence
  // the tolerance — is exactly S·√2 whatever the gap.
  const S = 100;
  const DIAG = Math.hypot(S, S);
  const TOL = CLOSURE_TOLERANCE_RELATIVE * DIAG;

  const squareWithGap = (gap) => capturePolylines([
    { op: 'beginShape', args: [] },
    { op: 'vertex', args: [0, 0] },
    { op: 'vertex', args: [S, 0] },
    { op: 'vertex', args: [S, S] },
    { op: 'vertex', args: [0, S] },
    { op: 'vertex', args: [0, gap] },
    { op: 'endShape', args: [] },
  ])[0];

  it('states its tolerance: 1e-6 of the path bounding-box diagonal, floored at 1px', () => {
    expect(CLOSURE_TOLERANCE_RELATIVE).toBe(1e-6);
    expect(closureToleranceFor([{ x: 0, y: 0 }, { x: S, y: 0 }, { x: S, y: S }, { x: 0, y: S }]))
      .toBeCloseTo(TOL, 15);
    // Floor: a sub-pixel figure still gets an absolute 1e-6 px tolerance rather
    // than a threshold that shrinks to nothing with the shape.
    expect(closureToleranceFor([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }]))
      .toBe(CLOSURE_TOLERANCE_RELATIVE);
  });

  it('INSIDE the tolerance ⇒ closed', () => {
    expect(squareWithGap(TOL * 0.5).closed).toBe(true);
  });

  it('OUTSIDE the tolerance ⇒ open', () => {
    expect(squareWithGap(TOL * 2).closed).toBe(false);
  });

  it('exactly AT the tolerance ⇒ closed (the boundary is inclusive)', () => {
    expect(squareWithGap(TOL).closed).toBe(true);
  });

  it('is scale-invariant: the same figure at 10x reports the same closure', () => {
    const scaled = (gapFactor) => capturePolylines([
      { op: 'scale', args: [10] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [S, 0] },
      { op: 'vertex', args: [S, S] },
      { op: 'vertex', args: [0, S] },
      { op: 'vertex', args: [0, TOL * gapFactor] },
      { op: 'endShape', args: [] },
    ])[0];
    // The gap scales with the figure, so the RELATIVE gap — and the verdict —
    // is unchanged. An absolute epsilon would flip one of these two.
    expect(scaled(0.5).closed).toBe(true);
    expect(scaled(2).closed).toBe(false);
  });

  it('a genuinely open run is untouched', () => {
    const paths = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: [] },
    ]);
    expect(paths[0].closed).toBe(false);
  });

  it('an explicit endShape(CLOSE) still wins even when the ends are far apart', () => {
    const paths = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [0, 0] },
      { op: 'vertex', args: [10, 0] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: ['close'] },
    ]);
    expect(paths[0].closed).toBe(true);
  });

  it('a 2-point path is never inferred closed — a segment is not a loop', () => {
    // A zero-length ctx.line, and a 2-vertex shape that starts and ends in the
    // same place. Neither encloses anything; calling them loops would give the
    // Zone partitioner a path with no Apex and no interior.
    expect(capturePolylines([{ op: 'line', args: [7, 7, 7, 7] }])[0].closed).toBe(false);
    const shape = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [7, 7] },
      { op: 'vertex', args: [7, 7] },
      { op: 'endShape', args: [] },
    ]);
    expect(shape[0].closed).toBe(false);
  });

  it('a contour whose last vertex REPEATS the first is closed (the stitcher convention)', () => {
    // Chladni's and TopographicContours' marching-squares stitcher terminates a
    // ring by appending the start point again — gap exactly 0.
    const paths = capturePolylines([
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [10, 10] },
      { op: 'vertex', args: [30, 10] },
      { op: 'vertex', args: [30, 30] },
      { op: 'vertex', args: [10, 10] },
      { op: 'endShape', args: [] },
    ]);
    expect(paths[0].closed).toBe(true);
  });
});
