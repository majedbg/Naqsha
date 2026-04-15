// Approximate self-intersection counter.
//
// Scans all segments from the supplied paths, rejects pairs by bbox,
// then runs a proper line-segment intersection test on the rest.
//
// "Approximate" because:
//   - Collinear overlaps (segments lying on top of each other) are NOT
//     detected — the intersection test needs a non-zero cross product.
//   - We cap at MAX_SEGMENTS to keep the UI responsive. Above that, we
//     return { truncated: true } and the UI surfaces a "too complex to
//     check" state rather than lying about the count.
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

export function countOverlaps(paths) {
  const segs = [];
  let truncated = false;
  outer: for (let pi = 0; pi < paths.length; pi++) {
    const pts = paths[pi].points;
    if (!pts || pts.length < 2) continue;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      segs.push([
        x1, y1, x2, y2,
        Math.min(x1, x2), Math.max(x1, x2),
        Math.min(y1, y2), Math.max(y1, y2),
      ]);
      if (segs.length >= MAX_SEGMENTS) { truncated = true; break outer; }
    }
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
