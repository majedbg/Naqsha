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
 * Largest radius R of a circle centered at `center` that does not overlap
 * any obstacle and does not cross the boundary. A center inside an obstacle
 * or outside the boundary yields a value <= 0.
 * @param {{x:number,y:number}} center
 * @param {{x:number,y:number,r:number}[]} obstacles
 * @param {null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}} boundary
 * @returns {number}
 */
export function largestEmptyCircleRadius(center, obstacles = [], boundary = null) {
  let radius = signedBoundaryDistance(center, boundary);

  for (const obstacle of obstacles) {
    const dist = Math.hypot(center.x - obstacle.x, center.y - obstacle.y);
    const bound = dist - obstacle.r;
    if (bound < radius) radius = bound;
  }

  return radius;
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
