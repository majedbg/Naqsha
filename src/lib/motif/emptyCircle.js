// Pure geometric primitive for "test-before-place empty-circle sizing"
// (Wong/Zongker/Salesin 1998): at a candidate anchor, compute the radius of
// the largest circle centered there that touches neither already-placed
// motif footprints nor the region boundary. No p5, no DOM, no React.

/**
 * Shortest distance from point p to segment a→b. Clamps to the endpoints.
 * Handles the degenerate case a === b (zero-length segment) by falling back
 * to point-to-point distance.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function pointToSegmentDistance(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;

  if (lenSq === 0) {
    // Degenerate segment: a and b coincide.
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  let t = (apx * abx + apy * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const footX = a.x + t * abx;
  const footY = a.y + t * aby;
  return Math.hypot(p.x - footX, p.y - footY);
}

/**
 * Ray-casting point-in-polygon test. Works for simple polygons in either
 * winding order. Points exactly on an edge are treated as a boundary case
 * that ray-casting may classify either way; callers rely on the distance
 * value (which is ~0 near an edge) rather than this boolean alone.
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}[]} points
 * @returns {boolean}
 */
function isPointInPolygon(p, points) {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Signed distance from center to the nearest boundary edge. Positive when
 * center is inside/within the region, negative when outside.
 * @param {{x:number,y:number}} center
 * @param {null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}} boundary
 * @returns {number} Infinity when boundary is null.
 */
function signedBoundaryDistance(center, boundary) {
  if (!boundary) return Infinity;

  if (boundary.type === 'rect') {
    const { width, height } = boundary;
    return Math.min(center.x, center.y, width - center.x, height - center.y);
  }

  if (boundary.type === 'polygon') {
    const { points } = boundary;
    let minDist = Infinity;
    const n = points.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const d = pointToSegmentDistance(center, points[j], points[i]);
      if (d < minDist) minDist = d;
    }
    const inside = isPointInPolygon(center, points);
    return inside ? minDist : -minDist;
  }

  return Infinity;
}

/**
 * The two terms of the largest-empty-circle radius, kept apart.
 *
 * The `hold` sizing law needs them separately because they are not the same
 * kind of limit: the obstacle term is **soft** (a held glyph may overlap a
 * neighbour) while the boundary term is **hard** (it may never be crossed).
 * The footprint overlay additionally needs to draw *the specific obstacle*
 * that capped a glyph, so the winning obstacle's identity comes back too.
 *
 * `largestEmptyCircleRadius` is exactly `Math.min` of the two terms; that
 * reduction is byte-identical to the fused loop this replaced, and is required
 * to stay so under ADR-0005.
 *
 * @param {{x:number,y:number}} center
 * @param {{x:number,y:number,r:number}[]} obstacles
 * @param {null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}} boundary
 * @returns {{boundary:number, obstacles:number, obstacle:null|{x:number,y:number,r:number}}}
 *   `boundary` is the signed boundary distance, `Infinity` when boundary is
 *   null. `obstacles` is the min clearance over the obstacle list, `Infinity`
 *   when that list is empty. `obstacle` is whichever obstacle produced the
 *   obstacle term — reported unconditionally, so it is still named when the
 *   boundary term is the smaller of the two. Deciding which term won is the
 *   caller's job. It is `null` when no obstacle ever bound the term (an empty
 *   list, or a list whose every clearance is NaN — see below).
 */
export function largestEmptyCircleParts(center, obstacles = [], boundary = null) {
  // Computed before the loop, exactly as the fused version did.
  const boundaryTerm = signedBoundaryDistance(center, boundary);

  // Seeded with Infinity rather than the boundary distance, so the two terms
  // stay independent. The accumulation keeps the fused loop's `<` comparison
  // rather than a per-iteration Math.min, and two behaviours ride on that:
  // a NaN clearance never displaces anything (`NaN < x` is false, where
  // Math.min would propagate the NaN instead), and exact ties between two
  // obstacles select the first one encountered.
  let obstacleTerm = Infinity;
  let winner = null;

  for (const obstacle of obstacles) {
    const dist = Math.hypot(center.x - obstacle.x, center.y - obstacle.y);
    const bound = dist - obstacle.r;
    if (bound < obstacleTerm) {
      obstacleTerm = bound;
      winner = obstacle;
    }
  }

  return { boundary: boundaryTerm, obstacles: obstacleTerm, obstacle: winner };
}

/**
 * Largest radius R of a circle centered at `center` that does not overlap
 * any obstacle and does not cross the boundary. A center inside an obstacle
 * or outside the boundary yields a value <= 0.
 *
 * A tie between the two terms resolves to the boundary, matching the fused
 * loop it replaced (`bound < radius` was false at equality) — and since both
 * terms hold the same value at a tie, `Math.min` selects that same value.
 *
 * @param {{x:number,y:number}} center
 * @param {{x:number,y:number,r:number}[]} obstacles
 * @param {null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}} boundary
 * @returns {number}
 */
export function largestEmptyCircleRadius(center, obstacles = [], boundary = null) {
  const p = largestEmptyCircleParts(center, obstacles, boundary);
  return Math.min(p.boundary, p.obstacles);
}

/**
 * Convenience predicate: does a circle of `radius` centered at `center` fit
 * without overlapping obstacles or crossing the boundary?
 * @param {{x:number,y:number}} center
 * @param {number} radius
 * @param {{x:number,y:number,r:number}[]} obstacles
 * @param {null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}} boundary
 * @returns {boolean}
 */
export function fitsAt(center, radius, obstacles = [], boundary = null) {
  return largestEmptyCircleRadius(center, obstacles, boundary) >= radius;
}
