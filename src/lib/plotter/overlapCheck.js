// Approximate self-intersection counter.
//
// Scans all segments from the supplied paths, rejects pairs by bbox,
// then runs a proper line-segment intersection test on the rest.
//
// "Approximate" because:
//   - Collinear overlaps (segments lying on top of each other) are NOT
//     detected — the intersection test needs a non-zero cross product.
//   - We cap the pairwise test at MAX_SEGMENTS to keep the UI responsive.
//     Above that we return { truncated: true } and count over a CANONICAL
//     subset (below), so the count is a lower bound — the UI must phrase
//     it as "at least N", never as an exact figure.
//
// DETERMINISM UNDER PERMUTATION (the truncation contract):
// Physical overlap is a property of the geometry laid on the sheet, not of
// draw order — permuting or reversing paths cannot change how often the plot
// crosses itself. The legacy cap took the FIRST 3000 segments in input order,
// which made the count order-dependent: applying the Reorder optimization
// permuted the paths, the cap sampled a different subset, and the Run Plan's
// overlaps warning collapsed (e.g. 85 → 0) with zero geometric change. Now we
// collect ALL segments and, only when over the cap, sort them by a canonical
// key that ignores both path order and segment direction (bbox, then
// lexicographically-normalized endpoints) and keep the first MAX_SEGMENTS.
// The same multiset of segments therefore always selects the same subset —
// and yields the same count — regardless of how the paths are ordered or
// oriented. Keeping a spatially contiguous band (rather than a scattered
// sample) keeps crossing PAIRS together, so the truncated count stays a
// meaningful lower bound instead of collapsing toward zero.
//
// Good enough for "is my plot crossing itself a lot?" — which is the
// question hobbyist plotter / laser users actually ask.

const MAX_SEGMENTS = 3000;
const MAX_SAMPLES = 24;

function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const dx1 = x2 - x1, dy1 = y2 - y1;
  const dx2 = x4 - x3, dy2 = y4 - y3;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (denom === 0) return null;
  const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / denom;
  const u = ((x3 - x1) * dy1 - (y3 - y1) * dx1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [x1 + t * dx1, y1 + t * dy1];
}

// Canonical, order- and direction-independent comparator for segment records
// ([x1,y1,x2,y2, minX,maxX,minY,maxY]). Primary key is the bbox (a spatial
// band, left-to-right); ties break on the endpoints normalized so that the
// lexicographically smaller endpoint comes first — a segment and its reverse
// compare equal, and only geometrically identical segments tie fully (which
// makes them interchangeable, so the selection stays deterministic).
function canonicalSegCompare(a, b) {
  const d = (a[4] - b[4]) || (a[6] - b[6]) || (a[5] - b[5]) || (a[7] - b[7]);
  if (d) return d;
  const flipA = a[0] > a[2] || (a[0] === a[2] && a[1] > a[3]);
  const flipB = b[0] > b[2] || (b[0] === b[2] && b[1] > b[3]);
  const a0x = flipA ? a[2] : a[0], a0y = flipA ? a[3] : a[1];
  const a1x = flipA ? a[0] : a[2], a1y = flipA ? a[1] : a[3];
  const b0x = flipB ? b[2] : b[0], b0y = flipB ? b[3] : b[1];
  const b1x = flipB ? b[0] : b[2], b1y = flipB ? b[1] : b[3];
  return (a0x - b0x) || (a0y - b0y) || (a1x - b1x) || (a1y - b1y);
}

export function countOverlaps(paths) {
  // Collect ALL segments first (linear, cheap) — truncation happens on the
  // full set so the selection can be order-independent.
  const allSegs = [];
  for (let pi = 0; pi < paths.length; pi++) {
    const pts = paths[pi].points;
    if (!pts || pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      allSegs.push([
        x1, y1, x2, y2,
        Math.min(x1, x2), Math.max(x1, x2),
        Math.min(y1, y2), Math.max(y1, y2),
      ]);
    }
  }

  // The cap engages only when segments are actually DROPPED — exactly
  // MAX_SEGMENTS is fully tested and its count is exact (truncated=false).
  let truncated = false;
  let segs = allSegs;
  if (allSegs.length > MAX_SEGMENTS) {
    truncated = true;
    segs = allSegs.slice().sort(canonicalSegCompare).slice(0, MAX_SEGMENTS);
  }

  let count = 0;
  const samples = [];
  const EPS2 = 0.04; // shared endpoints ignored within 0.2px
  const shares = (ax, ay, bx, by) => {
    const dx = ax - bx; const dy = ay - by;
    return (dx * dx + dy * dy) < EPS2;
  };
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const b = segs[j];
      if (a[5] < b[4] || b[5] < a[4] || a[7] < b[6] || b[7] < a[6]) continue;
      if (shares(a[0], a[1], b[0], b[1]) || shares(a[0], a[1], b[2], b[3])
       || shares(a[2], a[3], b[0], b[1]) || shares(a[2], a[3], b[2], b[3])) continue;
      const hit = intersect(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);
      if (hit) {
        count++;
        if (samples.length < MAX_SAMPLES) samples.push(hit);
      }
    }
  }

  return { count, truncated, samples, segmentCount: segs.length };
}
