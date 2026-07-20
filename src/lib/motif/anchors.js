// Generic edge-anchor sampler: places anchors along a host layer's path
// geometry via arc-length parameterization. This is the universal fallback
// anchor type used to scatter motifs on ANY layer — unlike semantic anchors
// (crossing/tip/cell, built in a later slice) it needs no pattern-specific
// structure, just polyline points.
//
// Engineering guardrail (docs/motif-adorn-arch-brief.md): tangent sampling
// must be (1) arc-length parameterized, (2) winding-direction robust, and
// (3) independent of host vertex density — the two Illustrator scatter-brush
// bugs that were never fixed. All three are exercised directly in
// anchors.test.js. No p5, no DOM, no React.

const EPS = 1e-6;

// Minimum effective edge-sampling spacing (px). sampleEdgeAnchors clamps a
// requested spacing up to this floor so a pathological tiny value can't sample a
// runaway anchor count and reintroduce the placement explosion (2026-07-19
// post-crash hardening, docs §6). 4px is comfortably below any legitimate motif
// spacing (the default is 24px) yet far above the sub-pixel values that blow up.
export const MIN_EDGE_SPACING = 4;

/**
 * Build the segment list for a polyline. Zero-length segments (coincident
 * consecutive points) are dropped so degenerate input never divides by zero
 * and never perturbs arc-length math. A closed path gets an implicit
 * closing segment from the last point back to the first.
 * @param {{x:number,y:number}[]} points
 * @param {boolean} closed
 * @returns {{a:{x:number,y:number}, b:{x:number,y:number}, length:number}[]}
 */
function buildSegments(points, closed) {
  const segments = [];
  const n = points.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0) segments.push({ a, b, length });
  }
  return segments;
}

/**
 * Total arc length of a polyline.
 * @param {{x:number,y:number}[]} points
 * @param {boolean} [closed=false]
 * @returns {number}
 */
export function polylineLength(points, closed = false) {
  if (!points || points.length < 2) return 0;
  const segments = buildSegments(points, closed);
  let total = 0;
  for (const seg of segments) total += seg.length;
  return total;
}

/**
 * Position + local travel direction at arc-length position `s` along a
 * pre-built segment list. `s` is clamped to [0, L]. When `s` lands exactly
 * on a segment boundary, the earlier segment's direction wins — a fixed,
 * deterministic tie-break that never changes when colinear points are
 * inserted along an edge (both sub-segments share the same direction, so
 * the tie-break is invisible on straight runs and only matters at true
 * corners).
 * @param {{a:{x:number,y:number}, b:{x:number,y:number}, length:number}[]} segments
 * @param {number} s
 * @returns {{x:number, y:number, tangent:number}}
 */
function sampleAtArcLength(segments, s) {
  const L = segments.reduce((sum, seg) => sum + seg.length, 0);
  let remaining = Math.min(Math.max(s, 0), L);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (remaining <= seg.length + EPS || isLast) {
      const t = seg.length === 0 ? 0 : Math.min(1, Math.max(0, remaining / seg.length));
      const x = seg.a.x + (seg.b.x - seg.a.x) * t;
      const y = seg.a.y + (seg.b.y - seg.a.y) * t;
      const tangent = Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x);
      return { x, y, tangent };
    }
    remaining -= seg.length;
  }

  // Unreachable when segments is non-empty (callers guard L === 0).
  const first = segments[0];
  return {
    x: first.a.x,
    y: first.a.y,
    tangent: Math.atan2(first.b.y - first.a.y, first.b.x - first.a.x),
  };
}

/**
 * Uniform arc-length resampling of a polyline. `spacing` (distance between
 * samples) takes precedence over `count` when both are given.
 *
 * Open paths: samples at s = 0, spacing, 2*spacing, … up to the largest
 * multiple ≤ L (the last gap may be shorter than `spacing` if L isn't an
 * exact multiple).
 *
 * Closed paths: the requested spacing is redistributed evenly around the
 * loop as n = round(L / spacing) samples at s = i * (L / n), i = 0..n-1.
 * This guarantees exactly `round(perimeter / spacing)` anchors and a
 * perfectly uniform step for any perimeter, rather than leaving a
 * short/long "seam" segment when the perimeter isn't a clean multiple of
 * spacing (the classic scatter-brush seam artifact).
 *
 * Output is independent of how the input polyline is subdivided: it depends
 * only on total arc length and per-segment direction, never on vertex
 * count.
 * @param {{x:number,y:number}[]} points
 * @param {{spacing?:number, count?:number, closed?:boolean}} opts
 * @returns {Array<{x:number, y:number, s:number, tangent:number}>}
 */
export function resampleByArcLength(points, { spacing, count, closed = false } = {}) {
  if (!points || points.length < 2) return [];
  const segments = buildSegments(points, closed);
  if (segments.length === 0) return [];
  const L = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (L === 0) return [];

  let step;
  if (spacing != null) {
    step = spacing;
  } else if (count != null) {
    if (closed) {
      step = count > 0 ? L / count : L;
    } else {
      step = count > 1 ? L / (count - 1) : L;
    }
  } else {
    throw new Error('resampleByArcLength requires spacing or count');
  }
  if (!(step > 0)) throw new Error('resampleByArcLength requires a positive spacing/count-derived step');

  const samples = [];

  if (closed) {
    const n = spacing != null ? Math.max(1, Math.round(L / step)) : Math.max(1, Math.round(count));
    const evenStep = L / n;
    for (let i = 0; i < n; i++) {
      const s = i * evenStep;
      const { x, y, tangent } = sampleAtArcLength(segments, s);
      samples.push({ x, y, s, tangent });
    }
  } else {
    const eps = Math.max(EPS, L * EPS);
    const n = Math.floor(L / step + eps);
    for (let i = 0; i <= n; i++) {
      const s = Math.min(i * step, L);
      const { x, y, tangent } = sampleAtArcLength(segments, s);
      samples.push({ x, y, s, tangent });
    }
  }

  return samples;
}

/**
 * Deterministic anchor id, e.g. anchorId('edge', 0, 3) → 'edge:0:3'.
 * @param {string} role
 * @param {...(string|number)} parts
 * @returns {string}
 */
export function anchorId(role, ...parts) {
  return [role, ...parts].join(':');
}

/**
 * Signed-area-weighted polygon centroid (shoelace formula). Unlike a plain
 * average of vertices, this is invariant to inserting extra colinear points
 * along an edge (they don't change the polygon's area or shape) and is
 * correct regardless of winding direction — the numerator and denominator
 * both flip sign together with the winding, so the ratio is unchanged.
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number, y:number}}
 */
function polygonCentroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const cross = p0.x * p1.y - p1.x * p0.y;
    area += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  area /= 2;

  if (Math.abs(area) < EPS) {
    // Degenerate/zero-area ring (e.g. all points colinear). Fall back to a
    // plain vertex average — pathological input only, outside the
    // arc-length/winding guardrails this module targets.
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }

  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * Canonicalize a tangent-perpendicular pair to point outward (away from
 * `centroid`), independent of the path's winding direction: it picks
 * whichever of tangent±PI/2 has a positive dot product with the vector from
 * centroid to `pos`, rather than assuming a fixed sign. This is the
 * winding-robustness mechanism — reversing the path's point order reverses
 * `tangent` but this function still resolves to the same outward direction.
 * @param {number} tangent
 * @param {{x:number,y:number}} pos
 * @param {{x:number,y:number}} centroid
 * @returns {number}
 */
function outwardNormal(tangent, pos, centroid) {
  const perpA = tangent + Math.PI / 2;
  const perpB = tangent - Math.PI / 2;
  const vx = pos.x - centroid.x;
  const vy = pos.y - centroid.y;
  const dotA = Math.cos(perpA) * vx + Math.sin(perpA) * vy;
  const dotB = Math.cos(perpB) * vx + Math.sin(perpB) * vy;
  return dotA >= dotB ? perpA : perpB;
}

/**
 * Normalize a path entry to { points, closed }. Accepts either the canonical
 * { points, closed } shape or a bare array of points (implicit closed=false).
 * @param {{points:{x:number,y:number}[], closed?:boolean}|{x:number,y:number}[]} path
 * @returns {{points:{x:number,y:number}[], closed:boolean}}
 */
function normalizePath(path) {
  if (Array.isArray(path)) {
    return { points: path, closed: false };
  }
  return { points: path && path.points ? path.points : [], closed: !!(path && path.closed) };
}

/**
 * Sample generic "Edge" anchors along a set of paths via arc-length
 * resampling. Works on any layer's geometry — the universal fallback anchor
 * type for motif placement.
 * @param {Array<{points:{x:number,y:number}[], closed?:boolean}|{x:number,y:number}[]>} paths
 * @param {{spacing?:number, count?:number, includeEndpoints?:boolean, idPrefix?:string}} [opts]
 * @returns {Array<{id:string, role:'edge', x:number, y:number, tangent:number, normal:number, s:number, meta:{pathIndex:number, sampleIndex:number, closed:boolean}}>}
 */
export function sampleEdgeAnchors(paths, opts = {}) {
  if (!paths || paths.length === 0) return [];
  const { spacing: requestedSpacing, count, includeEndpoints = true, idPrefix = 'edge' } = opts;
  // Spacing FLOOR (2026-07-19 post-crash hardening, docs §6). Effective spacing =
  // max(requested, MIN_EDGE_SPACING). A pathological small spacing (e.g. 0.1px on
  // a long, dense host) would arc-length-resample tens of thousands of anchors
  // per path and reintroduce the placement explosion the MAX_PLACEMENTS cap
  // guards downstream — this stops it at the SOURCE. Clamped here (the motif-
  // specific sampler) rather than in resampleByArcLength, which is shared with
  // non-motif callers that must honor tiny spacings verbatim.
  const spacing =
    requestedSpacing != null ? Math.max(requestedSpacing, MIN_EDGE_SPACING) : requestedSpacing;

  const anchors = [];

  paths.forEach((rawPath, pathIndex) => {
    const { points, closed } = normalizePath(rawPath);
    if (!points || points.length < 2) return;
    if (polylineLength(points, closed) === 0) return;

    let samples;
    if (spacing != null) {
      samples = resampleByArcLength(points, { spacing, closed });
    } else if (count != null && count > 0) {
      if (closed || includeEndpoints) {
        samples = resampleByArcLength(points, { count, closed });
      } else {
        // Exclude endpoints on an open path: over-sample by two interior
        // gaps, then drop the s=0 and s=L samples that bracket them.
        const padded = resampleByArcLength(points, { count: count + 2, closed });
        samples = padded.slice(1, -1);
      }
    } else {
      return; // Nothing requested for this path.
    }

    const centroid = closed ? polygonCentroid(points) : null;

    samples.forEach((sample, sampleIndex) => {
      const normal = closed
        ? outwardNormal(sample.tangent, sample, centroid)
        : sample.tangent + Math.PI / 2;

      anchors.push({
        id: anchorId(idPrefix, pathIndex, sampleIndex),
        role: 'edge',
        x: sample.x,
        y: sample.y,
        tangent: sample.tangent,
        normal,
        s: sample.s,
        meta: { pathIndex, sampleIndex, closed },
      });
    });
  });

  return anchors;
}
