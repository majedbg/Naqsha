// Parse / transform / serialize SVG path-d polylines.
//
// The pattern classes in this codebase emit `d` attributes in a
// strictly-controlled subset: uppercase M / L with signed floats, optional
// trailing Z. That's all we handle here — if a future pattern uses curves we
// will need to extend these parsers.
//
// All functions operate in the pre-transform coordinate space of the inner
// <g transform="translate(..) rotate(..)"> group. The wrapping transform is
// preserved by the higher-level pipeline, so optimizations apply identically
// to every symmetry copy.

import { PX_PER_MM as _PX_PER_MM, DRAW_SPEED, TRAVEL_SPEED } from './constants.js';

// Re-export PX_PER_MM so existing importers (e.g. PlotPreviewSection) continue
// to resolve it from this module without breakage.
export const PX_PER_MM = _PX_PER_MM;

export function mmToPx(mm) { return mm * PX_PER_MM; }
export function pxToMm(px) { return px / PX_PER_MM; }

// Number of straight sub-segments used to flatten a single cubic Bézier.
// This is the plotter "slicer" segmentation — higher = smoother curve but more
// points to plot / travel between. 16 is plenty for typical print-scale curves.
const FLATTEN_STEPS = 16;

// Sample a cubic Bézier B(t) (Bernstein basis, plain JS — no DOM APIs, which
// jsdom does not implement) for t in (0, 1] at FLATTEN_STEPS equal sub-steps,
// pushing each sampled point into `out`. t=0 is EXCLUDED (P0 is already the
// last emitted point); t=1 is INCLUDED and evaluates EXACTLY to p3. The two
// control points c1/c2 are never emitted as vertices.
function sampleCubic(p0, c1, c2, p3, out) {
  for (let s = 1; s <= FLATTEN_STEPS; s++) {
    const t = s / FLATTEN_STEPS;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
      a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
    ]);
  }
}

// Tokenize a path-d string. Returns array of tokens: either a command letter
// (M/L/Z/C/S) or a numeric string. Curve commands (C cubic, S smooth-cubic)
// are flattened to polylines by parsePathD; lowercase variants are accepted
// but — matching the historical M/L/Z handling — treated as absolute.
function tokenize(d) {
  return d.match(/[MLZCSmlzcs]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
}

export function parsePathD(d) {
  if (!d || typeof d !== 'string') return { points: [], closed: false };
  const tokens = tokenize(d);
  const points = [];
  let closed = false;
  let cmd = null;        // current command letter (uppercased)
  let cur = [0, 0];      // current on-curve point (start anchor for next cmd)
  let prevC2 = null;     // previous C/S second control point (for S reflection)
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[Zz]$/.test(t)) { closed = true; cmd = null; prevC2 = null; i++; continue; }
    if (/^[MLCSmlcs]$/.test(t)) { cmd = t.toUpperCase(); i++; continue; }
    // Numeric token: dispatch on the current command. Implicit repeats reuse
    // the same command (SVG polyline / polybezier semantics).
    const c = cmd || 'L';
    if (c === 'M' || c === 'L') {
      const x = parseFloat(tokens[i]);
      const y = parseFloat(tokens[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) { points.push([x, y]); cur = [x, y]; }
      prevC2 = null;
      if (c === 'M') cmd = 'L'; // extra coordinate sets after M are implicit L
      i += 2;
    } else if (c === 'C') {
      const c1x = parseFloat(tokens[i]);
      const c1y = parseFloat(tokens[i + 1]);
      const c2x = parseFloat(tokens[i + 2]);
      const c2y = parseFloat(tokens[i + 3]);
      const ex = parseFloat(tokens[i + 4]);
      const ey = parseFloat(tokens[i + 5]);
      if ([c1x, c1y, c2x, c2y, ex, ey].every(Number.isFinite)) {
        sampleCubic(cur, [c1x, c1y], [c2x, c2y], [ex, ey], points);
        cur = [ex, ey];
        prevC2 = [c2x, c2y];
      }
      i += 6;
    } else if (c === 'S') {
      const c2x = parseFloat(tokens[i]);
      const c2y = parseFloat(tokens[i + 1]);
      const ex = parseFloat(tokens[i + 2]);
      const ey = parseFloat(tokens[i + 3]);
      if ([c2x, c2y, ex, ey].every(Number.isFinite)) {
        // First control point is the reflection of the previous C/S second
        // control point about the current point; if the previous command was
        // not C/S (prevC2 === null) it coincides with the current point.
        const c1 = prevC2
          ? [2 * cur[0] - prevC2[0], 2 * cur[1] - prevC2[1]]
          : [cur[0], cur[1]];
        sampleCubic(cur, c1, [c2x, c2y], [ex, ey], points);
        cur = [ex, ey];
        prevC2 = [c2x, c2y];
      }
      i += 4;
    } else {
      i++;
    }
  }
  return { points, closed };
}

// ---------------------------------------------------------------------------
// flattenPathD — curve-aware path flattener
//
// Same contract as parsePathD ({ points, closed }), but it UNDERSTANDS the
// curve commands parsePathD samples at a fixed step count (C/S) plus the ones
// it ignores entirely (Q/T quadratics, A elliptical arcs). Every curve is
// tessellated ADAPTIVELY to a flatness tolerance `tol` (px): recursive
// de Casteljau subdivision for béziers, sagitta-bounded sampling for arcs.
// Smaller tol => smoother polyline / more vertices.
//
// SAFETY RAIL: for any `d` containing only M / L / Z commands, this returns
// vertices IDENTICAL to parsePathD(d) — the M/L/Z branches below are copied
// verbatim from parsePathD (same tokenizer number regex, same implicit-L
// after M, same lowercase-as-absolute quirk, same Number.isFinite guard).
// The built-in motif glyphs are all M/L/Z, so a later consumer swap is a
// byte-for-byte no-op on them.
//
// Not supported (documented, deliberate): true RELATIVE commands — lowercase
// c/s/q/t/a are read as absolute, mirroring the historical M/L/Z handling; and
// packed arc-flag digits (e.g. "a5 5 0 0113 13") — keep flags space-separated.

// Default flatness tolerance in px. 0.25px is well below a plotter pen width
// and sub-pixel at typical print scale, so the polyline reads as a smooth
// curve while keeping the vertex count modest.
const FLATTEN_TOL = 0.25;

// Recursion guard for adaptive subdivision — 2^24 leaf segments is far more
// than any sane tol demands, and stops pathological inputs looping forever.
const MAX_SUBDIV_DEPTH = 24;

// Tokenizer for flattenPathD ONLY (parsePathD keeps its own, narrower one so
// its behaviour is untouched). Recognises the full curve command set.
function tokenizeFlat(d) {
  return d.match(/[MLZCSQTAmlzcsqta]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
}

// Adaptively flatten a cubic Bézier into `out`. Mirrors sampleCubic's contract:
// p0 is NOT emitted (already the last vertex), p3 IS emitted EXACTLY (its own
// coords, not a recomputed midpoint), control points never surface. Subdivides
// at t=0.5 (de Casteljau) until both control points sit within `tol` of the
// P0→P3 chord.
function flattenCubic(p0, c1, c2, p3, tol, out, depth = 0) {
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
  flattenCubic(p0, l1, l2, mp, tol, out, depth + 1);
  flattenCubic(mp, r1, r2, p3, tol, out, depth + 1);
}

// Adaptively flatten a quadratic Bézier into `out`. Same emit contract as
// flattenCubic (p0 excluded, p2 exact). Flatness = control point's distance to
// the P0→P2 chord.
function flattenQuad(p0, c, p2, tol, out, depth = 0) {
  if (depth >= MAX_SUBDIV_DEPTH || perpDist(c, p0, p2) <= tol) {
    out.push([p2[0], p2[1]]);
    return;
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const l = mid(p0, c);
  const r = mid(c, p2);
  const mp = mid(l, r); // on-curve point at t=0.5
  flattenQuad(p0, l, mp, tol, out, depth + 1);
  flattenQuad(mp, r, p2, tol, out, depth + 1);
}

// Flatten an SVG elliptical-arc command into `out`, following the endpoint→
// centre parameterization of the SVG spec (F.6.5) with the radii out-of-range
// correction (F.6.6). p0 is the current point; (rx,ry,phiDeg,largeArc,sweep)
// are the arc params; p is the endpoint. p0 is NOT emitted; the endpoint IS
// emitted exactly. Degenerate cases collapse to a straight line (endpoint only).
function flattenArc(p0, rx, ry, phiDeg, largeArc, sweep, p, tol, out) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  // Coincident endpoints => nothing to draw; zero radius => straight line.
  if (p0[0] === p[0] && p0[1] === p[1]) return;
  if (rx === 0 || ry === 0) { out.push([p[0], p[1]]); return; }

  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // Step 1: midpoint delta rotated into the ellipse's local frame.
  const dx = (p0[0] - p[0]) / 2;
  const dy = (p0[1] - p[1]) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;
  // Step 2 (F.6.6): scale radii up if they cannot span the endpoints.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  // Step 2: centre in the local frame.
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const num = rxSq * rySq - rxSq * y1 * y1 - rySq * x1 * x1;
  const den = rxSq * y1 * y1 + rySq * x1 * x1;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  // Step 3: centre back in absolute coordinates.
  const cx = cosP * cxp - sinP * cyp + (p0[0] + p[0]) / 2;
  const cy = sinP * cxp + cosP * cyp + (p0[1] + p[1]) / 2;
  // Step 4: start angle and sweep angle.
  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dTheta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  // Segment count from the sagitta bound: for a step dθ the chord error of a
  // circle of radius r is r(1 - cos(dθ/2)) ≈ r·dθ²/8, so dθ ≤ sqrt(8·tol/r).
  // Use the larger radius as the conservative worst case for the ellipse.
  const rMax = Math.max(rx, ry);
  const maxStep = Math.sqrt(Math.max(1e-9, (8 * tol) / rMax));
  const segs = Math.max(1, Math.ceil(Math.abs(dTheta) / maxStep));
  for (let s = 1; s <= segs; s++) {
    // Emit the exact endpoint on the final step to pin it precisely.
    if (s === segs) { out.push([p[0], p[1]]); break; }
    const th = theta1 + (dTheta * s) / segs;
    const ex = Math.cos(th) * rx;
    const ey = Math.sin(th) * ry;
    out.push([cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy]);
  }
}

export function flattenPathD(d, tol = FLATTEN_TOL) {
  if (!d || typeof d !== 'string') return { points: [], closed: false };
  const t = Number.isFinite(tol) && tol > 0 ? tol : FLATTEN_TOL;
  const tokens = tokenizeFlat(d);
  const points = [];
  let closed = false;
  let cmd = null;          // current command letter (uppercased)
  let cur = [0, 0];        // current on-curve point (start anchor for next cmd)
  let prevCubicC2 = null;  // previous C/S 2nd control point (for S reflection)
  let prevQuadC = null;    // previous Q/T control point (for T reflection)
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[Zz]$/.test(tok)) { closed = true; cmd = null; prevCubicC2 = null; prevQuadC = null; i++; continue; }
    if (/^[MLCSQTAmlcsqta]$/.test(tok)) { cmd = tok.toUpperCase(); i++; continue; }
    // Numeric token: dispatch on the current command. Implicit repeats reuse
    // the same command (SVG polyline / polybezier semantics).
    const c = cmd || 'L';
    if (c === 'M' || c === 'L') {
      // --- copied verbatim from parsePathD (byte-identity rail) ---
      const x = parseFloat(tokens[i]);
      const y = parseFloat(tokens[i + 1]);
      if (Number.isFinite(x) && Number.isFinite(y)) { points.push([x, y]); cur = [x, y]; }
      prevCubicC2 = null; prevQuadC = null;
      if (c === 'M') cmd = 'L'; // extra coordinate sets after M are implicit L
      i += 2;
    } else if (c === 'C') {
      const c1x = parseFloat(tokens[i]);
      const c1y = parseFloat(tokens[i + 1]);
      const c2x = parseFloat(tokens[i + 2]);
      const c2y = parseFloat(tokens[i + 3]);
      const ex = parseFloat(tokens[i + 4]);
      const ey = parseFloat(tokens[i + 5]);
      if ([c1x, c1y, c2x, c2y, ex, ey].every(Number.isFinite)) {
        flattenCubic(cur, [c1x, c1y], [c2x, c2y], [ex, ey], t, points);
        cur = [ex, ey];
        prevCubicC2 = [c2x, c2y];
        prevQuadC = null;
      }
      i += 6;
    } else if (c === 'S') {
      const c2x = parseFloat(tokens[i]);
      const c2y = parseFloat(tokens[i + 1]);
      const ex = parseFloat(tokens[i + 2]);
      const ey = parseFloat(tokens[i + 3]);
      if ([c2x, c2y, ex, ey].every(Number.isFinite)) {
        // First control = reflection of the previous cubic 2nd control about
        // the current point; if the previous command was not C/S it coincides
        // with the current point.
        const c1 = prevCubicC2
          ? [2 * cur[0] - prevCubicC2[0], 2 * cur[1] - prevCubicC2[1]]
          : [cur[0], cur[1]];
        flattenCubic(cur, c1, [c2x, c2y], [ex, ey], t, points);
        cur = [ex, ey];
        prevCubicC2 = [c2x, c2y];
        prevQuadC = null;
      }
      i += 4;
    } else if (c === 'Q') {
      const cxp = parseFloat(tokens[i]);
      const cyp = parseFloat(tokens[i + 1]);
      const ex = parseFloat(tokens[i + 2]);
      const ey = parseFloat(tokens[i + 3]);
      if ([cxp, cyp, ex, ey].every(Number.isFinite)) {
        flattenQuad(cur, [cxp, cyp], [ex, ey], t, points);
        cur = [ex, ey];
        prevQuadC = [cxp, cyp];
        prevCubicC2 = null;
      }
      i += 4;
    } else if (c === 'T') {
      const ex = parseFloat(tokens[i]);
      const ey = parseFloat(tokens[i + 1]);
      if ([ex, ey].every(Number.isFinite)) {
        // Control = reflection of the previous quadratic control about the
        // current point; if the previous command was not Q/T it coincides
        // with the current point.
        const ctrl = prevQuadC
          ? [2 * cur[0] - prevQuadC[0], 2 * cur[1] - prevQuadC[1]]
          : [cur[0], cur[1]];
        flattenQuad(cur, ctrl, [ex, ey], t, points);
        cur = [ex, ey];
        prevQuadC = ctrl;
        prevCubicC2 = null;
      }
      i += 2;
    } else if (c === 'A') {
      const rx = parseFloat(tokens[i]);
      const ry = parseFloat(tokens[i + 1]);
      const rot = parseFloat(tokens[i + 2]);
      const laf = parseFloat(tokens[i + 3]);
      const sf = parseFloat(tokens[i + 4]);
      const ex = parseFloat(tokens[i + 5]);
      const ey = parseFloat(tokens[i + 6]);
      if ([rx, ry, rot, laf, sf, ex, ey].every(Number.isFinite)) {
        flattenArc(cur, rx, ry, rot, laf !== 0, sf !== 0, [ex, ey], t, points);
        cur = [ex, ey];
        prevCubicC2 = null;
        prevQuadC = null;
      }
      i += 7;
    } else {
      i++;
    }
  }
  return { points, closed };
}

export function pathDFromPoints(points, closed = false) {
  if (!points.length) return '';
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${points[i][0].toFixed(2)},${points[i][1].toFixed(2)}`;
  }
  if (closed) d += ' Z';
  return d;
}

// Perpendicular distance from point p to infinite line defined by (a, b).
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

// Ramer–Douglas–Peucker polyline simplification.
// Iterative (not recursive) to survive long inputs. Epsilon is in px.
export function rdp(points, epsilonPx) {
  if (!points || points.length < 3 || epsilonPx <= 0) return points ? points.slice() : [];
  const n = points.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    let maxD = 0;
    let idx = lo;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(points[i], points[lo], points[hi]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsilonPx) {
      keep[idx] = 1;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

export function simplifyPaths(paths, toleranceMm) {
  const eps = mmToPx(toleranceMm);
  return paths.map((p) => ({ ...p, points: rdp(p.points, eps) }));
}

// Merge polylines whose endpoints meet within `toleranceMm`.
// Greedy single-pass extension; never re-examines a path once used. O(N^2).
// Closed paths are passed through untouched.
export function mergeLines(paths, toleranceMm) {
  const eps = mmToPx(toleranceMm);
  const eps2 = eps * eps;
  const dist2 = (a, b) => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
  };
  const used = new Array(paths.length).fill(false);
  const output = [];
  for (let i = 0; i < paths.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const src = paths[i];
    if (src.closed || src.points.length < 2) {
      output.push({ ...src, points: src.points.slice() });
      continue;
    }
    const current = { ...src, points: src.points.slice() };
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < paths.length; j++) {
        if (used[j]) continue;
        const b = paths[j];
        if (b.closed || b.points.length < 2) continue;
        const aStart = current.points[0];
        const aEnd = current.points[current.points.length - 1];
        const bStart = b.points[0];
        const bEnd = b.points[b.points.length - 1];
        if (dist2(aEnd, bStart) <= eps2) {
          current.points = current.points.concat(b.points.slice(1));
          used[j] = true; extended = true; break;
        }
        if (dist2(aEnd, bEnd) <= eps2) {
          const rev = b.points.slice(0, -1).reverse();
          current.points = current.points.concat(rev);
          used[j] = true; extended = true; break;
        }
        if (dist2(aStart, bEnd) <= eps2) {
          current.points = b.points.slice(0, -1).concat(current.points);
          used[j] = true; extended = true; break;
        }
        if (dist2(aStart, bStart) <= eps2) {
          const rev = b.points.slice(1).reverse();
          current.points = rev.concat(current.points);
          used[j] = true; extended = true; break;
        }
      }
    }
    output.push(current);
  }
  return output;
}

// Greedy nearest-neighbor path reorder to minimize pen-up travel.
// Starts near (0,0) since the pattern classes draw relative to canvas origin.
// Each non-closed path may be flipped to further reduce its entry distance.
export function reorderPaths(paths) {
  if (paths.length < 2) return paths.slice();
  const pool = paths.map((p) => ({ ...p, points: p.points.slice() }));
  const ordered = [];
  let currentEnd = [0, 0];
  while (pool.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let reverse = false;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.points.length < 1) {
        if (bestDist === Infinity) { bestIdx = i; bestDist = 0; reverse = false; }
        continue;
      }
      const start = p.points[0];
      const dxS = currentEnd[0] - start[0];
      const dyS = currentEnd[1] - start[1];
      const dS = dxS * dxS + dyS * dyS;
      if (dS < bestDist) { bestDist = dS; bestIdx = i; reverse = false; }
      if (!p.closed && p.points.length >= 2) {
        const end = p.points[p.points.length - 1];
        const dxE = currentEnd[0] - end[0];
        const dyE = currentEnd[1] - end[1];
        const dE = dxE * dxE + dyE * dyE;
        if (dE < bestDist) { bestDist = dE; bestIdx = i; reverse = true; }
      }
    }
    const chosen = pool.splice(bestIdx, 1)[0];
    if (reverse && !chosen.closed && chosen.points.length >= 2) {
      chosen.points = chosen.points.slice().reverse();
    }
    ordered.push(chosen);
    if (chosen.points.length) {
      currentEnd = chosen.points[chosen.points.length - 1];
    }
  }
  return ordered;
}

// Length totals, in mm. Approximates a plot driven by the paths in given order.
export function pathStats(paths) {
  let points = 0;
  let drawPx = 0;
  let travelPx = 0;
  let prevEnd = null;
  for (const p of paths) {
    if (!p.points || p.points.length < 2) continue;
    points += p.points.length;
    if (prevEnd) {
      const d = Math.hypot(p.points[0][0] - prevEnd[0], p.points[0][1] - prevEnd[1]);
      travelPx += d;
    }
    for (let i = 1; i < p.points.length; i++) {
      const d = Math.hypot(
        p.points[i][0] - p.points[i - 1][0],
        p.points[i][1] - p.points[i - 1][1]
      );
      drawPx += d;
    }
    prevEnd = p.points[p.points.length - 1];
  }
  return {
    paths: paths.filter((p) => p.points && p.points.length >= 2).length,
    points,
    drawMm: pxToMm(drawPx),
    travelMm: pxToMm(travelPx),
  };
}

// Convert mm totals into a plot time estimate in seconds.
// Defaults loosely match AxiDraw V3 factory tuning (200/500 mm/s).
export function estimateTimeSec({ drawMm, travelMm }, { drawSpeed = DRAW_SPEED, travelSpeed = TRAVEL_SPEED } = {}) {
  return drawMm / drawSpeed + travelMm / travelSpeed;
}
