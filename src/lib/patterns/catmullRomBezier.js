/**
 * Pure geometry helper: uniform Catmull-Rom spline -> cubic Bézier segments.
 *
 * No p5, no DOM, no RNG — standard JS math only. Deterministic and pure so the
 * exact same control points can drive both an SVG `<path>` `C` string and p5
 * `bezierVertex()` downstream (Grid warp emit).
 */

/**
 * Device-dot flatten budget, in px at render scale — the single source of truth
 * for "how smooth is smooth enough". A warped Catmull-Rom curve is painted from
 * the cubic control points this module emits; when the SAME curve is re-flattened
 * for motif capture (`capturePolylines`) or reconstruction (#105), the polyline
 * must deviate from the painted curve by LESS than one plotter-pen / laser-kerf
 * dot, so captured / reconstructed / painted geometry all agree sub-pixel. 0.15px
 * sits below one device dot at the app's canvas→output scale. Rationale:
 * docs/performance-decisions.md Case 1.
 */
export const RENDER_FLATTEN_TOL_PX = 0.15;

/**
 * Uniform Catmull-Rom spline through `points`, converted to cubic Bézier
 * segments. Endpoints are PINNED via the duplicate-endpoint boundary condition
 * (P[-1]=P[0], P[n]=P[n-1]) so the curve starts/ends exactly on the first/last
 * anchor with a natural one-sided tangent.
 *
 * Segment between P_i and P_{i+1}, with neighbors P_{i-1} and P_{i+2}:
 *   c1 = P_i     + (P_{i+1} - P_{i-1}) / 6
 *   c2 = P_{i+1} - (P_{i+2} - P_i)     / 6
 *
 * @param {{x:number,y:number}[]} points  ordered anchors, length K >= 2
 * @returns {{ start:{x:number,y:number}, segments: {c1:{x:number,y:number}, c2:{x:number,y:number}, end:{x:number,y:number}}[] }}
 *          segments.length === K-1; segment i goes points[i] -> points[i+1];
 *          segment.end deep-equals points[i+1] (curve interpolates anchors).
 */
export function catmullRomToBezier(points) {
  const pts = Array.isArray(points) ? points : [];
  const K = pts.length;

  // Edge case: fewer than 2 anchors -> no segments. Return a fresh start point.
  if (K < 2) {
    const p0 = pts[0];
    const start = p0 ? { x: p0.x, y: p0.y } : { x: 0, y: 0 };
    return { start, segments: [] };
  }

  // Clamp neighbor lookups by duplicating the endpoints (pinned boundary).
  const at = (i) => pts[i < 0 ? 0 : i > K - 1 ? K - 1 : i];

  const start = { x: pts[0].x, y: pts[0].y };
  const segments = [];

  for (let i = 0; i < K - 1; i++) {
    const Pm1 = at(i - 1);
    const Pi = at(i);
    const Pi1 = at(i + 1);
    const Pi2 = at(i + 2);

    const c1 = {
      x: Pi.x + (Pi1.x - Pm1.x) / 6,
      y: Pi.y + (Pi1.y - Pm1.y) / 6,
    };
    const c2 = {
      x: Pi1.x - (Pi2.x - Pi.x) / 6,
      y: Pi1.y - (Pi2.y - Pi.y) / 6,
    };
    const end = { x: Pi1.x, y: Pi1.y };

    segments.push({ c1, c2, end });
  }

  return { start, segments };
}
