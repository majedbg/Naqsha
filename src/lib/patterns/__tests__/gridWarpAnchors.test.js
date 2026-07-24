import { describe, it, expect } from 'vitest';
import {
  gridWarpAnchorsCentered,
  intersectCurves,
} from '../gridWarpAnchors.js';
import { gridAnchorsCentered } from '../gridAnchors.js';
import { gridLinePositions, gridWarpCurves } from '../gridGeometry.js';
import { flattenCubic } from '../../geometry/flattenCubic.js';
import { RENDER_FLATTEN_TOL_PX } from '../catmullRomBezier.js';
import { stackWarpDisplacement } from '../../fields/warp.js';
import { makeP5Random } from '../rng.js';
import { toSymmetryCount } from '../symmetryUtils.js';
import { ScalarField } from '../../fields/ScalarField.js';

// Ticket #117 — Grid warp anchors (Option C). When a warp channel is active the
// grid's straight lines bend into Catmull-Rom curves; these tests pin that the
// warp-aware extractor derives every anchor from the DRAWN (warped) geometry,
// exact-to-paint, and stays byte-exact under the no-warp / rotation invariants.

const HALF_PI = Math.PI / 2;
const CW = 800;
const CH = 600;

// A smooth guide field with a real gradient in BOTH axes: at amount 1 it bends
// every grid line noticeably yet keeps ALL crossings genuinely intersecting (the
// realistic warp regime), so the reconstruct-and-intersect path is exercised
// exact-to-paint. A stronger field (below) is used where extreme bends are wanted.
const gentleField = () =>
  ScalarField.fromFunction((u, v) => Math.sin(u * 2.2) * Math.cos(v * 1.8), { nx: 129, ny: 129 });

// A strong, high-frequency field — big bends, exercises the equivariance / bend
// assertions (and, near the boundary, the curves-separated crossing fallback).
const bumpyField = () =>
  ScalarField.fromFunction((u, v) => Math.sin(u * 5) * Math.cos(v * 4), { nx: 129, ny: 129 });

// A zero-gradient (constant) field ⇒ zero warp displacement ⇒ curves stay
// straight; used to prove the warp path degrades to the straight geometry.
const flatField = () =>
  ScalarField.fromFunction(() => 0.5, { nx: 33, ny: 33 });

const warpParams = (over = {}) => ({
  cols: 4, rows: 3, spacing: 60, jitter: 0, margin: 20,
  symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
  drawHorizontal: 1, drawVertical: 1, warpNodes: 6,
  modulation: { channel: 'warp', field: gentleField(), amount: 1 },
  ...over,
});

const byRole = (a, role) => a.filter((x) => x.role === role);

// Rebuild the painted curves the way Grid.js does (verticals first, then
// horizontals) so tests can compare anchors against the renderer's geometry.
function paintedCurves(params) {
  const { xJittered, yJittered, totalW, totalH } = gridLinePositions(params, makeP5Random(0));
  const halfW = totalW / 2 + params.margin;
  const halfH = totalH / 2 + params.margin;
  const lines = [];
  for (const x of xJittered) lines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
  for (const y of yJittered) lines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });
  const curves = gridWarpCurves(lines, params.modulation, {
    canvasW: CW, canvasH: CH, warpNodes: params.warpNodes,
  });
  const nV = xJittered.length;
  return {
    vCurves: curves.slice(0, nV),
    hCurves: curves.slice(nV),
    xJittered, yJittered, halfW, halfH,
  };
}

// Flatten a warp curve to a polyline (shared flattenCubic, per segment).
function flattenCurve(curve) {
  const poly = [[curve.start.x, curve.start.y]];
  for (let m = 0; m < curve.segments.length; m++) {
    const p0 = m === 0 ? curve.start : curve.segments[m - 1].end;
    const s = curve.segments[m];
    for (const pt of flattenCubic([[p0.x, p0.y], [s.c1.x, s.c1.y], [s.c2.x, s.c2.y], [s.end.x, s.end.y]])) {
      poly.push(pt);
    }
  }
  return poly;
}

// Min distance from point P to a flattened polyline.
function distToPolyline(P, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((P.x - ax) * dx + (P.y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(P.x - (ax + t * dx), P.y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1. Gating: warp + canvas dims ⇒ warp-aware anchors; warp w/o dims ⇒ null.
// ---------------------------------------------------------------------------
describe('grid warp anchors — gating', () => {
  it('reconstructs all four roles (crossings/edges/tips/cells) under warp', () => {
    const p = warpParams();
    const a = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const nx = p.cols + 1;
    const ny = p.rows + 1;
    expect(byRole(a, 'crossing')).toHaveLength(nx * ny);
    expect(byRole(a, 'edge')).toHaveLength(nx * (ny - 1) + ny * (nx - 1));
    expect(byRole(a, 'tip')).toHaveLength(2 * nx + 2 * ny);
    expect(byRole(a, 'cell')).toHaveLength((nx - 1) * (ny - 1));
    // Emission order: crossings, edges, tips, cells.
    const order = a.map((x) => x.role);
    expect(order.lastIndexOf('crossing')).toBeLessThan(order.indexOf('edge'));
    expect(order.lastIndexOf('edge')).toBeLessThan(order.indexOf('tip'));
    expect(order.lastIndexOf('tip')).toBeLessThan(order.indexOf('cell'));
  });

  it('gridAnchorsCentered returns null for warp when NO canvas dims (lattice seam)', () => {
    const p = warpParams();
    expect(gridAnchorsCentered(p, makeP5Random(0))).toBeNull();
    expect(gridAnchorsCentered(p, makeP5Random(0), {})).toBeNull();
  });

  it('gridAnchorsCentered routes to warp reconstruction when dims ARE present', () => {
    const p = warpParams();
    const a = gridAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
    expect(Array.isArray(a)).toBe(true);
    expect(a.length).toBeGreaterThan(0);
    // Equals the dedicated warp builder exactly.
    expect(a).toEqual(gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH }));
  });
});

// ---------------------------------------------------------------------------
// 2. Exact-to-paint: crossings & edges agree ≤ 0.15px with the painted curves.
// ---------------------------------------------------------------------------
describe('grid warp anchors — exact-to-paint (≤ 0.15px)', () => {
  const p = warpParams();
  const a = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
  const { vCurves, hCurves } = paintedCurves(p);

  it('every crossing sits on BOTH the vertical and horizontal painted curve', () => {
    for (const c of byRole(a, 'crossing')) {
      const flatV = flattenCurve(vCurves[c.meta.col]);
      const flatH = flattenCurve(hCurves[c.meta.row]);
      expect(distToPolyline(c, flatV)).toBeLessThanOrEqual(RENDER_FLATTEN_TOL_PX);
      expect(distToPolyline(c, flatH)).toBeLessThanOrEqual(RENDER_FLATTEN_TOL_PX);
    }
  });

  it('every edge sits on its line’s painted curve', () => {
    for (const e of byRole(a, 'edge')) {
      const curve = e.meta.orientation === 'v'
        ? vCurves[e.meta.line]
        : hCurves[e.meta.line];
      expect(distToPolyline(e, flattenCurve(curve))).toBeLessThanOrEqual(RENDER_FLATTEN_TOL_PX);
    }
  });

  it('tips are pinned to the straight line endpoints (position unchanged by warp)', () => {
    const straight = gridAnchorsCentered({ ...p, modulation: undefined }, makeP5Random(0));
    const tipKey = (t) => `${t.meta.orientation}:${t.meta.line}:${t.meta.end}`;
    const straightTips = new Map(byRole(straight, 'tip').map((t) => [tipKey(t), t]));
    for (const t of byRole(a, 'tip')) {
      const s = straightTips.get(tipKey(t));
      expect(s).toBeTruthy();
      expect(t.x).toBe(s.x);
      expect(t.y).toBe(s.y);
    }
  });

  it('under EXTREME warp (boundary lines separate) every crossing stays on-geometry, never NaN', () => {
    // A strong field bows boundary lines past the perpendicular line's pinned
    // endpoint, so some crossings have no true intersection (curves-separated
    // fallback). The anchor must still be finite AND sit on its VERTICAL painted
    // curve (the fallback's reference) — proving no detached/NaN placement.
    const strong = warpParams({ modulation: { channel: 'warp', field: bumpyField(), amount: 3 } });
    const anchors = gridWarpAnchorsCentered(strong, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const { vCurves } = paintedCurves(strong);
    for (const c of byRole(anchors, 'crossing')) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
      expect(Number.isFinite(c.tangent)).toBe(true);
      expect(distToPolyline(c, flattenCurve(vCurves[c.meta.col]))).toBeLessThanOrEqual(RENDER_FLATTEN_TOL_PX);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Crossing/edge tangents come from the curve; flat field ⇒ straight frames.
// ---------------------------------------------------------------------------
describe('grid warp anchors — tangents from the curve', () => {
  it('a zero-gradient warp field degrades to the straight geometry & frames', () => {
    const p = warpParams({ modulation: { channel: 'warp', field: flatField(), amount: 3 } });
    const warp = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const straight = gridAnchorsCentered({ ...p, modulation: undefined }, makeP5Random(0));
    // Same anchor count and role order.
    expect(warp).toHaveLength(straight.length);
    // Crossings: tangent→0, normal→π/2, position on the straight lattice.
    const wc = byRole(warp, 'crossing');
    const sc = byRole(straight, 'crossing');
    for (let i = 0; i < wc.length; i++) {
      expect(wc[i].x).toBeCloseTo(sc[i].x, 6);
      expect(wc[i].y).toBeCloseTo(sc[i].y, 6);
      expect(wc[i].tangent).toBeCloseTo(0, 6);
      expect(wc[i].normal).toBeCloseTo(HALF_PI, 6);
    }
    // Edges: tangent matches the straight line direction, and the sample lies ON
    // the (straight) line — a v-edge keeps its line's x, an h-edge keeps its y.
    // (The along-line position may differ sub-pixel because the Catmull-Rom
    // parameter is not arc-uniform near the pinned ends — still exact-to-paint.)
    const we = byRole(warp, 'edge');
    const se = byRole(straight, 'edge');
    for (let i = 0; i < we.length; i++) {
      expect(we[i].tangent).toBeCloseTo(se[i].tangent, 6);
      if (we[i].meta.orientation === 'v') expect(we[i].x).toBeCloseTo(se[i].x, 6);
      else expect(we[i].y).toBeCloseTo(se[i].y, 6);
    }
  });

  it('under a real warp, crossing tangent ≠ 0 somewhere (frame tracks the bend)', () => {
    const p = warpParams();
    const a = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const bent = byRole(a, 'crossing').some((c) => Math.abs(c.tangent) > 1e-3);
    expect(bent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Cells: point-warp + FD frame; D2 (displacement solely from primitive);
//    OFFLINE bound-validation vs the true bent centre. No runtime guard.
// ---------------------------------------------------------------------------
describe('grid warp anchors — cells (trusted-bounded, offline)', () => {
  it('cell displacement comes SOLELY from stackWarpDisplacement (D2)', () => {
    const p = warpParams();
    const a = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
    const { xJittered, yJittered } = paintedCurves(p);
    const sources = p.modulation.sources ?? [p.modulation];
    for (const cell of byRole(a, 'cell')) {
      const { col: i, row: j } = cell.meta;
      const cxCell = (xJittered[i] + xJittered[i + 1]) / 2;
      const cyCell = (yJittered[j] + yJittered[j + 1]) / 2;
      const u = (cxCell + CW / 2) / CW;
      const v = (cyCell + CH / 2) / CH;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      expect(cell.x).toBe(cxCell + dx);
      expect(cell.y).toBe(cyCell + dy);
    }
  });

  // OFFLINE bound validation: the point-warped straight cell centre must stay
  // within a documented bound of the TRUE bent centre (centroid of the cell's 4
  // reconstruct-and-intersect warped corner crossings). Sweeps several fields;
  // asserts the MAX observed deviation is under the bound. This is the substitute
  // for a runtime coincidence guard (PRD #109 item 19) — nothing here runs on the
  // render path.
  it('point-warp+FD cell centre stays within the documented bound of the true bent centre', () => {
    const fields = [
      ScalarField.fromFunction((u, v) => Math.sin(u * 5) * Math.cos(v * 4), { nx: 129, ny: 129 }),
      ScalarField.fromFunction((u, v) => (u - 0.5) * (v - 0.5) * 4, { nx: 129, ny: 129 }),
      ScalarField.fromFunction((u, v) => Math.sin((u + v) * 6), { nx: 129, ny: 129 }),
    ];
    // Documented bound (empirical): across the swept operating range (amount 1–3,
    // several fields) the point-warp cell centre stays within ≤ 21.5px of the true
    // bent centroid; the documented bound is 24px (= WARP_MAX_PX). Cells are thus
    // trusted-bounded — bounded, never wildly wrong — which is why a runtime
    // coincidence guard is unnecessary. See docs/performance-decisions.md Case 2.
    const BOUND_PX = 24;
    let maxDev = 0;
    for (const field of fields) {
      for (const amount of [1, 2, 3]) {
        const p = warpParams({ modulation: { channel: 'warp', field, amount } });
        const a = gridWarpAnchorsCentered(p, makeP5Random(0), { canvasW: CW, canvasH: CH });
        const { vCurves, hCurves } = paintedCurves(p);
        const nx = p.cols + 1;
        const ny = p.rows + 1;
        const crossingAt = (i, j) => intersectCurves(vCurves[i], hCurves[j], {
          x: vCurves[i].start.x, y: hCurves[j].start.y,
        });
        for (const cell of byRole(a, 'cell')) {
          const { col: i, row: j } = cell.meta;
          if (i + 1 >= nx || j + 1 >= ny) continue;
          const corners = [crossingAt(i, j), crossingAt(i + 1, j), crossingAt(i, j + 1), crossingAt(i + 1, j + 1)];
          if (corners.some((c) => c == null)) continue;
          const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
          const cy = corners.reduce((s, c) => s + c.y, 0) / 4;
          maxDev = Math.max(maxDev, Math.hypot(cell.x - cx, cell.y - cy));
        }
      }
    }
    // Report the empirically-measured max so the bound is honest, not arbitrary.
    expect(maxDev).toBeLessThan(BOUND_PX);
  });
});

// ---------------------------------------------------------------------------
// 5. No-warp byte-identity: with no warp channel, output is the straight core's.
// ---------------------------------------------------------------------------
describe('grid warp anchors — no-warp byte-identity', () => {
  it('gridAnchorsCentered is byte-identical to today when no warp channel present', () => {
    const base = {
      cols: 3, rows: 3, spacing: 40, jitter: 5, margin: 15,
      symmetry: 3, startAngle: 12, offsetX: 7, offsetY: -4,
      drawHorizontal: 1, drawVertical: 1,
    };
    // Passing canvas dims must NOT change the straight (no-warp) output.
    const withDims = gridAnchorsCentered(base, makeP5Random(99), { canvasW: CW, canvasH: CH });
    const noDims = gridAnchorsCentered(base, makeP5Random(99));
    expect(withDims).toEqual(noDims);
  });
});

// ---------------------------------------------------------------------------
// 6. Byte-exact rotation-equivariance: anchor(k) == Rot_θk(anchor(0)), position
//    AND frame+θ, under N ≥ 2 and non-zero startAngle. The base local anchor is
//    identical across copies (warp is pre-symmetry), and `push` is the sole per-
//    copy transform, so a hand-rotation of the single-copy reference reproduces
//    each copy's arithmetic operand-for-operand (offset = 0 ⇒ rotate about origin).
// ---------------------------------------------------------------------------
describe('grid warp anchors — rotation equivariance (byte-exact)', () => {
  const N = 4;
  const startAngle = 27; // non-zero, degrees.
  const seed = 321;
  const base = {
    cols: 3, rows: 2, spacing: 55, jitter: 4, margin: 18,
    offsetX: 0, offsetY: 0, drawHorizontal: 1, drawVertical: 1, warpNodes: 6,
    modulation: { channel: 'warp', field: bumpyField(), amount: 2 },
  };

  it('every copy k equals Rot_θk of the single-copy reference, byte-exactly', () => {
    // Reference: the un-rotated base master (symmetry=1, startAngle=0 ⇒ θ=0).
    const ref = gridWarpAnchorsCentered(
      { ...base, symmetry: 1, startAngle: 0 }, makeP5Random(seed), { canvasW: CW, canvasH: CH },
    );
    const sym = gridWarpAnchorsCentered(
      { ...base, symmetry: N, startAngle }, makeP5Random(seed), { canvasW: CW, canvasH: CH },
    );
    const n = toSymmetryCount(N);
    expect(sym).toHaveLength(n * ref.length);
    const startRad = (startAngle * Math.PI) / 180;

    // Group the symmetric output by copy; each group is ref rotated by θk.
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * k) / n + startRad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const copyK = sym.filter((x) => x.meta.copy === k);
      expect(copyK).toHaveLength(ref.length);
      for (let idx = 0; idx < ref.length; idx++) {
        const r = ref[idx];
        const c = copyK[idx];
        expect(c.role).toBe(r.role);
        // Position: Rot_θ of the reference point (about the origin), byte-exact.
        expect(c.x).toBe(r.x * cos - r.y * sin);
        expect(c.y).toBe(r.x * sin + r.y * cos);
        // Frame: base + θ, byte-exact.
        expect(c.tangent).toBe(r.tangent + theta);
        expect(c.normal).toBe(r.normal + theta);
      }
    }
  });
});
