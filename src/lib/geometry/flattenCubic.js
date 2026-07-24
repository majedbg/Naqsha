// flattenCubic — the SINGLE shared cubic-Bézier flattener.
//
// A cubic Bézier is tessellated ADAPTIVELY to a flatness tolerance `tol` (px):
// recursive de Casteljau subdivision, splitting at t=0.5 until BOTH control
// points sit within `tol` of the P0→P3 chord. Adaptive (not fixed-step) because
// warp curvature varies wildly across one field — any single segment count is
// simultaneously too fine on a gentle bend and too coarse (visible facets, motifs
// drifting off the painted line) on a sharp one. See docs/performance-decisions.md
// Case 1.
//
// This is the one source of truth for cubic flattening: the plotter path-ops
// flattener (src/lib/plotter/pathOps.js) routes its private cubic case through
// here, and the motif capture pipeline (src/lib/motif/capturePolylines.js) reads
// warped-grid Bézier curves through here. The #105 reconstruction path is the
// third intended consumer.
//
// Emit contract (mirrors the historical pathOps sampler): P0 is NOT emitted (it
// is already the previous vertex); P3 IS emitted EXACTLY (its own coords, never a
// recomputed midpoint); the two control points never surface as vertices.
//
// Points are [x, y] arrays; the returned polyline is an array of [x, y].

import { RENDER_FLATTEN_TOL_PX } from '../patterns/catmullRomBezier.js';

// Recursion guard: 2^24 leaf segments is far more than any sane tol demands and
// stops pathological inputs looping forever.
const MAX_SUBDIV_DEPTH = 24;

// Perpendicular distance from point p to the infinite line through (a, b).
function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mag = Math.hypot(dx, dy);
  if (mag === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.hypot(ex, ey);
  }
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / mag;
}

function subdivide(p0, c1, c2, p3, tol, out, depth) {
  if (depth >= MAX_SUBDIV_DEPTH
      || (perpDist(c1, p0, p3) <= tol && perpDist(c2, p0, p3) <= tol)) {
    out.push([p3[0], p3[1]]);
    return;
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const l1 = mid(p0, c1);
  const m = mid(c1, c2);
  const r2 = mid(c2, p3);
  const l2 = mid(l1, m);
  const r1 = mid(m, r2);
  const mp = mid(l2, r1); // on-curve point at t=0.5
  subdivide(p0, l1, l2, mp, tol, out, depth + 1);
  subdivide(mp, r1, r2, p3, tol, out, depth + 1);
}

/**
 * Adaptively flatten a cubic Bézier into a polyline.
 *
 * @param {[[number,number],[number,number],[number,number],[number,number]]} bezier
 *        [p0, c1, c2, p3] — start anchor, two control points, end anchor.
 * @param {number} [tol]  flatness tolerance in px (default = the device-dot
 *        render budget RENDER_FLATTEN_TOL_PX). Non-finite / non-positive falls
 *        back to that default.
 * @returns {Array<[number,number]>} flattened points — EXCLUDES p0, INCLUDES p3
 *          exactly. Never emits the control points.
 */
export function flattenCubic(bezier, tol = RENDER_FLATTEN_TOL_PX) {
  const [p0, c1, c2, p3] = bezier;
  const t = Number.isFinite(tol) && tol > 0 ? tol : RENDER_FLATTEN_TOL_PX;
  const out = [];
  subdivide(p0, c1, c2, p3, t, out, 0);
  return out;
}
