// Centerline extraction — skeletonize + branch trace + simplify (S6, issue
// #55; PRD #48 Stage E "Motif primitives", locked decision 9).
//
// potrace traces OUTLINES; line-work (tracery, linework, calligraphy strokes)
// must instead become SINGLE centerline paths a laser scores/cuts once — not
// doubled contour edges. This module turns a binarized raster into centerline
// polylines:
//
//   skeletonize(bw)              Zhang–Suen thinning → skeleton mask
//   traceSkeleton(mask, w, h)    skeleton graph → branch/loop polylines
//   simplifyPolyline(pts, tol)   Ramer–Douglas–Peucker
//   extractCenterlines(bw, opts) the composed pipeline → [{d, points, closed}]
//
// Everything is pure and typed on plain buffers ({data,width,height} RGBA or
// Uint8 masks) so it runs identically in the Web Worker and headless vitest.
// Arc/curve fitting is deliberately deferred (issue #55 marks it optional):
// simplified polylines already export as valid single score paths; an ELSD
// style arc bias can slot into pathFromPolyline later without contract change.

// ── Zhang–Suen thinning ─────────────────────────────────────────────────────

/**
 * Thin a binarized image to a 1px-wide skeleton (Zhang–Suen, 1984).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} bw
 *   Pure black/white RGBA (0 = ink, 255 = paper) as produced by
 *   vectorizer.thresholdImage.
 * @returns {Uint8Array} width*height mask, 1 = skeleton pixel
 */
export function skeletonize(bw) {
  const { data, width, height } = bw;
  // grid: 1 = ink
  let grid = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < grid.length; i++, p += 4) {
    grid[i] = data[p] < 128 ? 1 : 0;
  }

  const idx = (x, y) => y * width + x;
  const next = new Uint8Array(grid.length);
  let changed = true;

  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      next.set(grid);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!grid[idx(x, y)]) continue;
          // Neighbours P2..P9 clockwise from north.
          const p2 = grid[idx(x, y - 1)];
          const p3 = grid[idx(x + 1, y - 1)];
          const p4 = grid[idx(x + 1, y)];
          const p5 = grid[idx(x + 1, y + 1)];
          const p6 = grid[idx(x, y + 1)];
          const p7 = grid[idx(x - 1, y + 1)];
          const p8 = grid[idx(x - 1, y)];
          const p9 = grid[idx(x - 1, y - 1)];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          // A(P1): 0→1 transitions in the ordered neighbour ring.
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (ring[k] === 0 && ring[k + 1] === 1) a++;
          if (a !== 1) continue;
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          next[idx(x, y)] = 0;
          changed = true;
        }
      }
      grid.set(next);
    }
  }
  // Border pixels never thin (the loops run 1..dim-2); ink hugging the border
  // stays, which is correct — the skeleton must not evaporate at the edge.
  return grid;
}

// ── Skeleton graph tracing ──────────────────────────────────────────────────

const NEIGHBOURS = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * Trace a skeleton mask into polylines. Branch endpoints (degree 1) and
 * junctions (degree ≥ 3) are graph nodes; each node-to-node walk becomes an
 * OPEN polyline. Pure cycles (a circle's skeleton has no nodes at all) become
 * CLOSED polylines. Isolated pixels (degree 0) are dropped — a degenerate
 * skeleton is the caller's cue to fall back to the contour representation
 * (guaranteed single-motif floor).
 *
 * Adjacency is 8-connected with the standard diagonal pruning: a diagonal
 * edge is ignored when either orthogonal pixel between its ends is also
 * skeleton (the path goes through it). Without this, every staircase step of
 * a thinned curve reads as a spurious junction and the graph shatters into
 * hundreds of 2-point fragments.
 *
 * @param {Uint8Array} mask width*height, 1 = skeleton pixel
 * @returns {{points: [number, number][], closed: boolean}[]} pixel-center coords
 */
export function traceSkeleton(mask, width, height) {
  const idx = (x, y) => y * width + x;
  const at = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height ? mask[idx(x, y)] : 0;

  const neighboursOf = (i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const out = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!at(nx, ny)) continue;
      // Prune the diagonal when an orthogonal step covers it (symmetric:
      // both ends see the same two between-pixels).
      if (dx !== 0 && dy !== 0 && (at(x + dx, y) || at(x, y + dy))) continue;
      out.push(idx(nx, ny));
    }
    return out;
  };

  const degree = new Int8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) degree[i] = neighboursOf(i).length;
  }

  const visitedEdges = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const point = (i) => [(i % width) + 0.5, Math.floor(i / width) + 0.5];

  const polylines = [];
  const isNode = (i) => degree[i] !== 2;

  // Walk one branch starting along edge from→next until the next node.
  const walk = (from, nxt) => {
    const pts = [point(from), point(nxt)];
    visitedEdges.add(edgeKey(from, nxt));
    let prev = from;
    let cur = nxt;
    while (!isNode(cur)) {
      const nbrs = neighboursOf(cur);
      const forward = nbrs.find((n) => n !== prev && !visitedEdges.has(edgeKey(cur, n)));
      if (forward === undefined) break; // closed back on itself or exhausted
      visitedEdges.add(edgeKey(cur, forward));
      pts.push(point(forward));
      prev = cur;
      cur = forward;
    }
    return pts;
  };

  // 1) Branches from every node (endpoint or junction).
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !isNode(i) || degree[i] === 0) continue;
    for (const n of neighboursOf(i)) {
      if (visitedEdges.has(edgeKey(i, n))) continue;
      polylines.push({ points: walk(i, n), closed: false });
    }
  }

  // 2) Pure cycles: remaining degree-2 pixels with unvisited edges.
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || degree[i] !== 2) continue;
    const start = neighboursOf(i).find((n) => !visitedEdges.has(edgeKey(i, n)));
    if (start === undefined) continue;
    const pts = walk(i, start);
    // walk() stops when it can't move forward — for a cycle that's back at i.
    polylines.push({ points: pts, closed: true });
  }

  return polylines;
}

// ── Ramer–Douglas–Peucker simplification ────────────────────────────────────

function perpDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rdp(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDist = -1;
  let maxIdx = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= tolerance) return [a, b];
  const left = rdp(points.slice(0, maxIdx + 1), tolerance);
  const right = rdp(points.slice(maxIdx), tolerance);
  return left.slice(0, -1).concat(right);
}

/**
 * Ramer–Douglas–Peucker. Open polylines keep both endpoints; closed polylines
 * are anchored at the first point and its farthest counterpart so a loop can
 * never collapse to a segment.
 *
 * @param {[number, number][]} points
 * @param {number} [tolerance=1] max perpendicular deviation (px)
 * @param {boolean} [closed=false]
 */
export function simplifyPolyline(points, tolerance = 1, closed = false) {
  if (points.length <= 2) return points.slice();
  if (!closed) return rdp(points, tolerance);
  // Split the ring at the point farthest from points[0].
  let far = 1;
  let farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const first = rdp(points.slice(0, far + 1), tolerance);
  const second = rdp(points.slice(far), tolerance);
  return first.slice(0, -1).concat(second);
}

// ── Ink distance transform ─────────────────────────────────────────────────

/**
 * Chessboard distance from every ink pixel to the nearest paper pixel
 * (multi-source BFS; outside the image counts as paper). The max value along
 * a component's skeleton is its half stroke width — the Vectorizer's
 * stroke-vs-blob discriminant is skeletonLength / (2·maxRadius), which is
 * scale-invariant.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} bw
 * @returns {Int32Array} width*height distances (paper = 0)
 */
export function inkDistanceTransform(bw) {
  const { data, width, height } = bw;
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (data[p] >= 128) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  // Virtual paper ring outside the image: border ink starts at distance 1.
  for (let x = 0; x < width; x++) {
    for (const i of [x, (height - 1) * width + x]) {
      if (dist[i] === -1) {
        dist[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const i of [y * width, y * width + width - 1]) {
      if (dist[i] === -1) {
        dist[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (dist[ni] === -1) {
        dist[ni] = dist[i] + 1;
        queue[tail++] = ni;
      }
    }
  }
  return dist;
}

// ── Composition → path data ────────────────────────────────────────────────

/** Arc length of a polyline (adds the closing segment when closed). */
export function polylineLength({ points, closed }) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (closed && points.length > 2) {
    len += Math.hypot(
      points[0][0] - points[points.length - 1][0],
      points[0][1] - points[points.length - 1][1]
    );
  }
  return len;
}

const fmt = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Polyline → SVG path `d` (absolute M/L, Z when closed). */
export function pathFromPolyline({ points, closed }) {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const d =
    `M${fmt(first[0])} ${fmt(first[1])}` +
    rest.map(([x, y]) => ` L${fmt(x)} ${fmt(y)}`).join('');
  return closed ? `${d} Z` : d;
}

/**
 * Full centerline pass over a binarized image: skeletonize → trace → simplify.
 * Polylines shorter than `minLength` (px of arc length) are discarded as
 * skeleton noise/degenerate — callers treat an empty result as "no usable
 * centerline; keep the contour" (guaranteed single-motif floor).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} bw
 * @param {{tolerance?: number, minLength?: number}} [opts]
 * @returns {{ polylines: {points, closed}[], mask: Uint8Array, length: number }}
 *   `length` = total simplified arc length (used for stroke-likeness aspect).
 */
export function extractCenterlines(bw, opts = {}) {
  const { tolerance = 1, minLength = 3 } = opts;
  const mask = skeletonize(bw);
  const raw = traceSkeleton(mask, bw.width, bw.height);
  const polylines = [];
  let total = 0;
  for (const { points, closed } of raw) {
    const pl = { points: simplifyPolyline(points, tolerance, closed), closed };
    const len = polylineLength(pl);
    if (len < minLength) continue;
    total += len;
    pl.length = len;
    polylines.push(pl);
  }
  return { polylines, mask, length: total };
}
