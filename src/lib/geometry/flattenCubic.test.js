import { describe, it, expect } from 'vitest';
import { flattenCubic } from './flattenCubic.js';
import { catmullRomToBezier, RENDER_FLATTEN_TOL_PX } from '../patterns/catmullRomBezier.js';
import { stackWarpDisplacement } from '../fields/warp.js';

// --- analytic evaluators (independent of the flattener) ---------------------
function cubicAt(p0, c1, c2, p3, u) {
  const mt = 1 - u;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * u;
  const c = 3 * mt * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}

// Distance from a point to a segment [a,b].
function pointSegDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Max deviation of the TRUE cubic from the flattened POLYLINE (one-sided
// Hausdorff): densely sample B(t), take each sample's distance to the nearest
// polyline segment, return the worst. `poly` INCLUDES p0 as its first vertex.
function maxCurveToPolyDeviation(p0, c1, c2, p3, poly, samples = 2000) {
  let worst = 0;
  for (let s = 0; s <= samples; s++) {
    const truePt = cubicAt(p0, c1, c2, p3, s / samples);
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
      best = Math.min(best, pointSegDist(truePt, poly[i - 1], poly[i]));
      if (best <= 0) break;
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('flattenCubic (shared geometry util)', () => {
  it('EXCLUDES p0 and INCLUDES p3 exactly', () => {
    const p0 = [3.5, 7.25];
    const p3 = [42.5, -13.75];
    const out = flattenCubic([p0, [10, 20], [-5, 40], p3], 0.25);
    // p0 is never emitted (it is the previous vertex upstream).
    expect(out[0]).not.toEqual(p0);
    // p3 is pinned EXACTLY (its own coords, not a recomputed midpoint).
    expect(out[out.length - 1]).toEqual(p3);
  });

  it('never emits the control points as vertices (colinear cubic stays flat)', () => {
    const out = flattenCubic([[0, 0], [10, 0], [20, 0], [30, 0]], 0.25);
    expect(out.some((p) => p[0] === 10 && p[1] === 0)).toBe(false);
    expect(out.some((p) => p[0] === 20 && p[1] === 0)).toBe(false);
    for (const [, y] of out) expect(Math.abs(y)).toBeLessThan(0.25);
  });

  it('is ADAPTIVE: strictly more vertices as tol shrinks on a genuinely curved cubic', () => {
    const bez = [[0, 0], [0, 100], [100, 100], [100, 0]];
    const coarse = flattenCubic(bez, 4).length;
    const mid = flattenCubic(bez, 0.5).length;
    const fine = flattenCubic(bez, 0.05).length;
    expect(mid).toBeGreaterThanOrEqual(coarse);
    expect(fine).toBeGreaterThanOrEqual(mid);
    expect(fine).toBeGreaterThan(coarse);
  });

  it('samples a vertex near the analytic B(0.5)', () => {
    const bez = [[0, 0], [0, 100], [100, 100], [100, 0]];
    const mid = cubicAt(...bez, 0.5); // (50, 75)
    const out = flattenCubic(bez, 0.25);
    const nearest = Math.min(...out.map((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1])));
    expect(nearest).toBeLessThan(0.25);
  });

  it('defaults tol to the device-dot render budget when omitted / invalid', () => {
    const bez = [[0, 0], [0, 100], [100, 100], [100, 0]];
    expect(flattenCubic(bez)).toEqual(flattenCubic(bez, RENDER_FLATTEN_TOL_PX));
    expect(flattenCubic(bez, 0)).toEqual(flattenCubic(bez, RENDER_FLATTEN_TOL_PX));
    expect(flattenCubic(bez, -1)).toEqual(flattenCubic(bez, RENDER_FLATTEN_TOL_PX));
    expect(flattenCubic(bez, NaN)).toEqual(flattenCubic(bez, RENDER_FLATTEN_TOL_PX));
  });

  // ------------------------------------------------------------------------
  // HARD RULE (deferred from #106): validate MEASURED deviation ≤ ~0.15px on a
  // WARPED line — not the flatness proxy, the true curve-to-polyline distance.
  // Build the SAME warped Catmull-Rom cubic Grid.js paints (warp nodes →
  // catmullRomToBezier), flatten at the device-dot budget, and assert the true
  // cubic never strays more than one device dot from the flattened polyline.
  // ------------------------------------------------------------------------
  it('a WARPED grid line flattens to ≤0.15px deviation from the true curve (deferred #106 check)', () => {
    const canvasW = 800;
    const canvasH = 600;
    // A single straight grid line, subdivided into K warp nodes displaced along a
    // real warp field (constant gradient => a smooth, non-trivial bend).
    const line = { x1: -300, y1: -100, x2: 300, y2: 220 };
    const field = { sampleGradient: () => ({ dx: 0.6, dy: -0.45 }) };
    const source = { channel: 'warp', field, amount: 1 };
    const K = 8;
    const nodes = [];
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1);
      const node = { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t };
      if (k > 0 && k < K - 1) {
        const u = (node.x + canvasW / 2) / canvasW;
        const v = (node.y + canvasH / 2) / canvasH;
        const { dx, dy } = stackWarpDisplacement([source], u, v);
        node.x += dx;
        node.y += dy;
      }
      nodes.push(node);
    }
    const { start, segments } = catmullRomToBezier(nodes);
    expect(segments.length).toBeGreaterThan(0);

    // Flatten each cubic segment and measure the true-curve deviation per segment.
    let prev = [start.x, start.y];
    let worstOverall = 0;
    for (const s of segments) {
      const p0 = prev;
      const c1 = [s.c1.x, s.c1.y];
      const c2 = [s.c2.x, s.c2.y];
      const p3 = [s.end.x, s.end.y];
      const flat = flattenCubic([p0, c1, c2, p3]); // device-dot default tol
      const poly = [p0, ...flat];
      worstOverall = Math.max(worstOverall, maxCurveToPolyDeviation(p0, c1, c2, p3, poly));
      prev = p3;
    }
    expect(worstOverall).toBeLessThanOrEqual(0.15);
  });
});
