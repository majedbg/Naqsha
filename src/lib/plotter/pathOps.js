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

const MM_PER_IN = 25.4;
const PPI = 96;
export const PX_PER_MM = PPI / MM_PER_IN;

export function mmToPx(mm) { return mm * PX_PER_MM; }
export function pxToMm(px) { return px / PX_PER_MM; }

// Tokenize a path-d string. Returns array of tokens: either a command letter
// (M/L/Z) or a numeric string.
function tokenize(d) {
  return d.match(/[MLZmlz]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || [];
}

export function parsePathD(d) {
  if (!d || typeof d !== 'string') return { points: [], closed: false };
  const tokens = tokenize(d);
  const points = [];
  let closed = false;
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MLml]$/.test(t)) { i++; continue; }
    if (/^[Zz]$/.test(t))   { closed = true; i++; continue; }
    const x = parseFloat(t);
    const y = parseFloat(tokens[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    i += 2;
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
// Defaults loosely match AxiDraw V3 factory tuning.
export function estimateTimeSec({ drawMm, travelMm }, { drawSpeed = 200, travelSpeed = 500 } = {}) {
  return drawMm / drawSpeed + travelMm / travelSpeed;
}
