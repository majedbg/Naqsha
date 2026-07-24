/**
 * gridWarpAnchors — warp-aware reconstruction of the Grid's role-tagged anchors
 * (Option C, PRD #109 / ticket #117). When a warp channel is active, the grid's
 * straight lines bend into Catmull-Rom curves (see gridGeometry.gridWarpCurves);
 * a rosette placed "at a crossing" must move to the curve intersection, a vine
 * "along an edge" must sit on the bent line, a dot "per cell" must sit at the
 * bent centre. This module derives every anchor from the DRAWN (warped) geometry,
 * mode-matched, so it is exact-to-paint by construction:
 *
 *   • CROSSINGS — reconstruct-and-intersect the two K-node Catmull-Rom curves
 *     (the SAME curves the renderer paints, via the shared gridWarpCurves core).
 *     The intersection POINT comes from the shared `flattenCubic` polylines; the
 *     TANGENT is the analytic cubic-Bézier derivative of the curve at that point
 *     (horizontal curve → tangent, vertical curve → normal). Point-warping the
 *     straight crossing was measured to drift up to ~50px (#105) — rejected.
 *   • EDGES — sample ON the reconstructed curve at the straight-fraction of the
 *     edge midpoint; tangent is the exact cubic derivative there.
 *   • CELLS — point-warp the straight cell centre + finite-difference frame
 *     (computeWarpFrame, free-points-only). Trusted-bounded: an OFFLINE bound
 *     test proves this stays within a documented bound of the true bent centre;
 *     NO runtime coincidence guard is added (PRD #109 item 19).
 *   • TIPS — line endpoints are PINNED under warp (gridWarpCurves never displaces
 *     k=0 / k=K-1), so tip POSITION is already exact; the straight tip frame is
 *     kept verbatim (the ticket scopes warp reconstruction to the 3 interior
 *     roles — curve-end tangents for pinned tips are out of scope).
 *
 * ── warp-then-symmetry (#107) ────────────────────────────────────────────────
 * Base anchors are reconstructed ONCE in the pattern-local, un-rotated centred
 * frame (exactly as Grid.js builds warpPaths before applySymmetryDraw rotates
 * them). Symmetry is then the rigid post-rotation `anchorₖ = Rot_θk(anchor(0))`,
 * applied by the SAME `push` arithmetic the straight extractor uses — so byte-
 * exact rotation-equivariance falls out by construction (push is the sole per-
 * copy transform). The rotation expression is operand-for-operand identical to
 * gridAnchorsCentered / latticeForLayer (`ox + px·cosθ − py·sinθ`).
 *
 * ── D2 invariant ─────────────────────────────────────────────────────────────
 * Warp displacement comes ONLY from `stackWarpDisplacement` (via gridWarpCurves
 * for the curves and directly for the cell free points). No parallel warp math:
 * curves are reconstructed through the shared core, never re-derived here.
 *
 * Pure ESM — no p5/DOM/React/RNG-of-its-own (the caller injects the jitter rng
 * into gridLinePositions, consumed ONCE, matching the straight path).
 */

import { gridLinePositions, gridWarpCurves } from './gridGeometry.js';
import { toSymmetryCount } from './symmetryUtils.js';
import { flattenCubic } from '../geometry/flattenCubic.js';
import { computeWarpFrame } from '../fields/warpFrame.js';
import { stackWarpDisplacement } from '../fields/warp.js';
import { anchorId } from '../motif/anchors.js';

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

// ── Cubic-Bézier evaluation (position, 1st and 2nd derivative) ────────────────
// A curve from gridWarpCurves is { start, segments:[{c1,c2,end}] }; segment m's
// four control points are p0 = (m===0 ? start : segments[m-1].end), c1, c2, end.

/** Control points [p0,c1,c2,p3] of segment m of a warp curve. */
function segCtrl(curve, m) {
  const p0 = m === 0 ? curve.start : curve.segments[m - 1].end;
  const s = curve.segments[m];
  return [p0, s.c1, s.c2, s.end];
}

function cubicAt([p0, c1, c2, p3], t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

function cubicDeriv([p0, c1, c2, p3], t) {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (c1.x - p0.x) + b * (c2.x - c1.x) + c * (p3.x - c2.x),
    y: a * (c1.y - p0.y) + b * (c2.y - c1.y) + c * (p3.y - c2.y),
  };
}

function cubicDeriv2([p0, c1, c2, p3], t) {
  const mt = 1 - t;
  return {
    x: 6 * mt * (c2.x - 2 * c1.x + p0.x) + 6 * t * (p3.x - 2 * c2.x + c1.x),
    y: 6 * mt * (c2.y - 2 * c1.y + p0.y) + 6 * t * (p3.y - 2 * c2.y + c1.y),
  };
}

/**
 * Sample a warp curve at the GLOBAL straight-fraction `f` ∈ [0,1] — f maps
 * uniformly across the K-1 segments (node k sits at f = k/(K-1) along the
 * straight line, and gridWarpCurves places nodes uniformly), so f is exactly the
 * along-the-straight-line fraction of the point being sampled. Returns the point
 * ON the reconstructed curve and its exact tangent angle.
 * @returns {{x:number,y:number,tangent:number}}
 */
export function sampleCurveAt(curve, f) {
  const M = curve.segments.length; // K-1
  const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
  const scaled = clamped * M;
  let seg = Math.floor(scaled);
  if (seg >= M) seg = M - 1;
  const local = scaled - seg;
  const cp = segCtrl(curve, seg);
  const pt = cubicAt(cp, local);
  const d = cubicDeriv(cp, local);
  return { x: pt.x, y: pt.y, tangent: Math.atan2(d.y, d.x) };
}

/** Flatten a whole warp curve to a polyline of [x,y] via the shared flattenCubic. */
function flattenCurve(curve) {
  const poly = [[curve.start.x, curve.start.y]];
  for (let m = 0; m < curve.segments.length; m++) {
    const [p0, c1, c2, p3] = segCtrl(curve, m);
    const flat = flattenCubic([
      [p0.x, p0.y],
      [c1.x, c1.y],
      [c2.x, c2.y],
      [p3.x, p3.y],
    ]);
    for (const pt of flat) poly.push(pt);
  }
  return poly;
}

/** Intersection of two [x,y] segments, or null (parametric, endpoints inclusive). */
function segSegIntersect(a0, a1, b0, b1) {
  const dax = a1[0] - a0[0];
  const day = a1[1] - a0[1];
  const dbx = b1[0] - b0[0];
  const dby = b1[1] - b0[1];
  const denom = dax * dby - day * dbx;
  if (denom === 0) return null;
  const t = ((b0[0] - a0[0]) * dby - (b0[1] - a0[1]) * dbx) / denom;
  const u = ((b0[0] - a0[0]) * day - (b0[1] - a0[1]) * dax) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a0[0] + t * dax, y: a0[1] + t * day };
}

/**
 * Intersection of two flattened polylines nearest `near`, or null if they never
 * cross. Split from intersectCurves so the caller can flatten each curve ONCE
 * (O(nV+nH)) and reuse the polylines across all crossings (O(nV·nH) pairs),
 * rather than re-flattening per pair.
 * @returns {{x:number,y:number}|null}
 */
function intersectPolylines(A, B, near) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < A.length - 1; i++) {
    for (let j = 0; j < B.length - 1; j++) {
      const hit = segSegIntersect(A[i], A[i + 1], B[j], B[j + 1]);
      if (!hit) continue;
      const d = (hit.x - near.x) ** 2 + (hit.y - near.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = hit;
      }
    }
  }
  return best;
}

/**
 * Reconstruct-and-intersect two warp curves via their shared-flattenCubic
 * polylines, returning the intersection nearest `near` (the straight crossing).
 * @returns {{x:number,y:number}|null} null when the flattened curves do not meet.
 */
export function intersectCurves(curveA, curveB, near) {
  return intersectPolylines(flattenCurve(curveA), flattenCurve(curveB), near);
}

/**
 * Exact tangent ANGLE of a warp curve at (or nearest to) point P — the analytic
 * cubic-Bézier derivative, so crossings take their tangent EXACTLY from the
 * curve (not a flattened chord). Coarse-samples every segment to seed the
 * nearest parameter, then refines with a few Newton steps minimising |B(t)−P|.
 * Deterministic ⇒ rotation-equivariance stays byte-exact.
 */
export function curveTangentAtPoint(curve, P) {
  const M = curve.segments.length;
  let bestSeg = 0;
  let bestT = 0;
  let bestD = Infinity;
  const STEPS = 16;
  for (let m = 0; m < M; m++) {
    const cp = segCtrl(curve, m);
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const q = cubicAt(cp, t);
      const d = (q.x - P.x) ** 2 + (q.y - P.y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestSeg = m;
        bestT = t;
      }
    }
  }
  const cp = segCtrl(curve, bestSeg);
  let t = bestT;
  for (let it = 0; it < 4; it++) {
    const q = cubicAt(cp, t);
    const d1 = cubicDeriv(cp, t);
    const d2 = cubicDeriv2(cp, t);
    const ex = q.x - P.x;
    const ey = q.y - P.y;
    const fp = d1.x * d1.x + d1.y * d1.y + ex * d2.x + ey * d2.y; // f'(t)
    if (Math.abs(fp) < 1e-12) break;
    const f = ex * d1.x + ey * d1.y; // f(t) = (B(t)-P)·B'(t)
    t -= f / fp;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const d = cubicDeriv(cp, t);
  return Math.atan2(d.y, d.x);
}

/**
 * Warp-aware grid anchors in the centre-relative frame. Called ONLY when a warp
 * channel is active AND canvas dims are known (the motif seam); the lattice seam,
 * which has no canvas dims, keeps its pre-existing null behaviour (see
 * gridAnchorsCentered). Consumes the injected jitter rng ONCE via
 * gridLinePositions, exactly like the straight path.
 *
 * @param {object} params - grid params incl. warp `modulation`, `warpNodes`.
 * @param {(min:number,max:number)=>number} rng - fresh p5-compatible jitter rng.
 * @param {{canvasW:number, canvasH:number}} dims - canvas px for warp unit-domain.
 * @returns {Array<object>|[]}
 */
export function gridWarpAnchorsCentered(params, rng, { canvasW, canvasH }) {
  const {
    cols = 12,
    rows = 12,
    margin = 20,
    symmetry = 1,
    startAngle = 0,
    offsetX = 0,
    offsetY = 0,
    drawHorizontal = 1,
    drawVertical = 1,
    warpNodes = 6, // Grid.js default — MUST match for exact-to-paint.
  } = params || {};

  const hasV = drawVertical >= 0.5;
  const hasH = drawHorizontal >= 0.5;
  if (!hasV && !hasH) return []; // nothing drawn ⇒ no anchors.

  // Reconstruct the grid's exact jittered positions (origin-centred), consuming
  // the injected rng ONCE (identical to the straight path / latticeForLayer).
  const { xJittered, yJittered, totalW, totalH } = gridLinePositions(params, rng);
  const halfW = totalW / 2 + margin;
  const halfH = totalH / 2 + margin;

  // Build the SAME straight lines Grid.js builds — verticals first (all
  // xJittered), then horizontals (all yJittered) — so gridWarpCurves receives
  // byte-identical inputs and the extractor's curves ARE the painted curves.
  const lines = [];
  if (hasV) for (const x of xJittered) lines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
  if (hasH) for (const y of yJittered) lines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });

  const warpMod = params.modulation;
  const sources = warpMod.sources ?? [warpMod];
  const curves = gridWarpCurves(lines, warpMod, { canvasW, canvasH, warpNodes });
  const nV = hasV ? xJittered.length : 0;
  const vCurves = hasV ? curves.slice(0, nV) : [];
  const hCurves = hasH ? curves.slice(nV) : [];

  // ── Symmetry copies — IDENTICAL to gridAnchorsCentered (do NOT reorder). ─────
  const n = toSymmetryCount(symmetry);
  const suffixCopy = n > 1;
  const startRad = (startAngle * Math.PI) / 180;
  const copies = [];
  for (let k = 0; k < n; k++) {
    const theta = (TWO_PI * k) / n + startRad;
    copies.push({ k, theta, cos: Math.cos(theta), sin: Math.sin(theta) });
  }

  const anchors = [];

  /**
   * Push one anchor — rotation arithmetic operand-for-operand identical to
   * gridAnchorsCentered.push (the sole per-copy transform, so anchor(k) ==
   * Rot_θk(anchor(0)) byte-exactly). Base (px,py,baseTangent,baseNormal) is the
   * warp-reconstructed LOCAL value, computed once per anchor across all copies.
   */
  function push(role, idParts, px, py, baseTangent, baseNormal, s, meta, c) {
    anchors.push({
      id: suffixCopy ? anchorId(role, ...idParts, c.k) : anchorId(role, ...idParts),
      role,
      x: offsetX + px * c.cos - py * c.sin,
      y: offsetY + px * c.sin + py * c.cos,
      tangent: baseTangent + c.theta,
      normal: baseNormal + c.theta,
      s,
      meta: { ...meta, copy: c.k, theta: c.theta },
    });
  }

  // ── CROSSINGS: intersection of vertical curve i × horizontal curve j. Tangent
  //    from the horizontal curve, normal from the vertical curve (→ 0 / π/2 with
  //    no displacement). Reconstruct base ONCE (local frame), then copy-outer.
  if (hasV && hasH) {
    // Precompute base crossings (px,py,baseTangent,baseNormal) per (i,j) so the
    // costly intersect/derivative runs ONCE, not once per symmetry copy.
    // Flatten each curve ONCE and reuse across all crossings (avoids re-
    // flattening O(nV·nH) times). Same shared flattenCubic ⇒ same polylines.
    const flatV = vCurves.map(flattenCurve);
    const flatH = hCurves.map(flattenCurve);
    const baseCross = [];
    for (let i = 0; i < xJittered.length; i++) {
      for (let j = 0; j < yJittered.length; j++) {
        const near = { x: xJittered[i], y: yJittered[j] };
        const hit = intersectPolylines(flatV[i], flatH[j], near);
        const interior = i > 0 && i < cols && j > 0 && j < rows;
        let px;
        let py;
        let bt;
        let bn;
        if (hit) {
          px = hit.x;
          py = hit.y;
          bt = curveTangentAtPoint(hCurves[j], hit); // horizontal → tangent
          bn = curveTangentAtPoint(vCurves[i], hit); // vertical → normal
        } else {
          // Curves-separated fallback: under strong warp a BOUNDARY line can bow
          // outward past the perpendicular line's pinned endpoint, so the two
          // painted curves genuinely do not cross. Rather than emit NaN or a
          // detached lattice point, place the anchor ON the vertical curve at the
          // crossing's straight-fraction (for a boundary row this is the pinned
          // endpoint) — still exact-to-paint on that curve — and take the tangent
          // from the horizontal curve, the normal from the vertical, at the same
          // straight-fractions. Deterministic ⇒ equivariance stays byte-exact.
          const fV = (yJittered[j] + halfH) / (2 * halfH); // top→bottom fraction
          const fH = (xJittered[i] + halfW) / (2 * halfW); // left→right fraction
          const vs = sampleCurveAt(vCurves[i], fV);
          const hs = sampleCurveAt(hCurves[j], fH);
          px = vs.x;
          py = vs.y;
          bt = hs.tangent;
          bn = vs.tangent;
        }
        baseCross.push({ i, j, px, py, bt, bn, interior });
      }
    }
    for (const c of copies) {
      for (const b of baseCross) {
        push('crossing', [b.i, b.j], b.px, b.py, b.bt, b.bn, 0,
          { row: b.j, col: b.i, junction: b.interior }, c);
      }
    }
  }

  // ── EDGES: sample ON the reconstructed curve at the edge midpoint's straight-
  //    fraction. Tangent exact from the curve; normal = tangent + π/2 (matches
  //    the straight convention). s kept as the straight-line arc length from the
  //    line's start endpoint (untested field; a documented proxy under warp).
  if (hasV && hasH) {
    const baseEdge = [];
    // Vertical-line edges: curve i, segment between rows j and j+1.
    for (let i = 0; i < xJittered.length; i++) {
      for (let j = 0; j < yJittered.length - 1; j++) {
        const midCentered = (yJittered[j] + yJittered[j + 1]) / 2;
        const f = (midCentered + halfH) / (2 * halfH); // fraction top→bottom
        const smp = sampleCurveAt(vCurves[i], f);
        baseEdge.push({
          idParts: ['v', i, j], px: smp.x, py: smp.y,
          bt: smp.tangent, bn: smp.tangent + HALF_PI,
          s: midCentered + halfH, meta: { orientation: 'v', line: i, segment: j },
        });
      }
    }
    // Horizontal-line edges: curve j, segment between cols i and i+1.
    for (let j = 0; j < yJittered.length; j++) {
      for (let i = 0; i < xJittered.length - 1; i++) {
        const midCentered = (xJittered[i] + xJittered[i + 1]) / 2;
        const f = (midCentered + halfW) / (2 * halfW); // fraction left→right
        const smp = sampleCurveAt(hCurves[j], f);
        baseEdge.push({
          idParts: ['h', j, i], px: smp.x, py: smp.y,
          bt: smp.tangent, bn: smp.tangent + HALF_PI,
          s: midCentered + halfW, meta: { orientation: 'h', line: j, segment: i },
        });
      }
    }
    for (const c of copies) {
      for (const b of baseEdge) {
        push('edge', b.idParts, b.px, b.py, b.bt, b.bn, b.s, b.meta, c);
      }
    }
  }

  // ── TIPS: line endpoints — PINNED under warp (gridWarpCurves never displaces
  //    k=0 / k=K-1), so position == straight; the straight frame is kept verbatim
  //    (curve-end tangents for pinned tips are out of ticket scope).
  if (hasV) {
    for (const c of copies) {
      for (let i = 0; i < xJittered.length; i++) {
        push('tip', ['v', i, 0], xJittered[i], -halfH, HALF_PI, -HALF_PI, 0,
          { orientation: 'v', line: i, end: 0 }, c);
        push('tip', ['v', i, 1], xJittered[i], halfH, HALF_PI, HALF_PI, 2 * halfH,
          { orientation: 'v', line: i, end: 1 }, c);
      }
    }
  }
  if (hasH) {
    for (const c of copies) {
      for (let j = 0; j < yJittered.length; j++) {
        push('tip', ['h', j, 0], -halfW, yJittered[j], 0, Math.PI, 0,
          { orientation: 'h', line: j, end: 0 }, c);
        push('tip', ['h', j, 1], halfW, yJittered[j], 0, 0, 2 * halfW,
          { orientation: 'h', line: j, end: 1 }, c);
      }
    }
  }

  // ── CELLS: point-warp the straight cell centre + FD frame (free points). The
  //    warp displacement uses the SAME sources + stackWarpDisplacement + unit-
  //    domain mapping the curves use (D2); computeWarpFrame finite-differences
  //    the SAME primitive. Trusted-bounded — validated OFFLINE, no runtime guard.
  if (hasV && hasH) {
    const baseCell = [];
    for (let i = 0; i < xJittered.length - 1; i++) {
      const cxCell = (xJittered[i] + xJittered[i + 1]) / 2;
      for (let j = 0; j < yJittered.length - 1; j++) {
        const cyCell = (yJittered[j] + yJittered[j + 1]) / 2;
        // Unit-domain mapping IDENTICAL to gridWarpCurves (pre-offset, centred).
        const u = (cxCell + canvasW / 2) / canvasW;
        const v = (cyCell + canvasH / 2) / canvasH;
        const { dx, dy } = stackWarpDisplacement(sources, u, v);
        const frame = computeWarpFrame(sources, u, v, { W: canvasW, H: canvasH });
        baseCell.push({
          i, j, px: cxCell + dx, py: cyCell + dy,
          bt: frame.tangent, bn: frame.normal,
        });
      }
    }
    for (const c of copies) {
      for (const b of baseCell) {
        push('cell', [b.i, b.j], b.px, b.py, b.bt, b.bn, 0, { row: b.j, col: b.i }, c);
      }
    }
  }

  return anchors;
}

export default gridWarpAnchorsCentered;
