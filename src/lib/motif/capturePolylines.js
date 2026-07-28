// capturePolylines — the SINGLE pure place that folds a recorded draw-call
// stream (from a record-mode P5Adapter, see patterns/drawingContext.js) through
// a 2D affine transform stack and returns absolute-canvas-coordinate polylines.
//
// WHY THIS EXISTS (B2 — arbitrary-edge host capture, docs/motif-chain-plan.md D8):
// a formula pattern's generate() draws in a LOCAL frame (e.g. FlowField emits
// particle trails centered on the origin) and relies on an OUTER transform —
// applySymmetryDraw's push/translate/rotate — to place them on the canvas. To
// make ANY such polyline-emitting layer a legal edge-mode motif host we probe it
// into a record-mode adapter (RNG/noise/color still delegate to live p5, so the
// captured realization is byte-identical to the painted one) and replay the
// recorded ops HERE. All matrix math lives in this one pure module so the folding
// is unit-pinned in isolation (no p5, no DOM).
//
// Matrix convention (matches instancing.js): SVG affine [a,b,c,d,e,f] maps a
// point (x,y) → (a*x + c*y + e, b*x + d*y + f). p5's translate/rotate/scale
// POST-multiply the current transform (they transform the local coordinate
// system), so CTM' = CTM · T. rotate uses the math/CCW matrix
// [cos, sin, -sin, cos, 0, 0], identical to what p5 applies, so folded coords
// reproduce the drawn geometry exactly.

import { flattenCubic } from '../geometry/flattenCubic.js';

/** Identity SVG affine matrix. */
const IDENTITY = [1, 0, 0, 1, 0, 0];

/** SVG-convention affine product m1·m2 (m1 applied AFTER m2). */
function compose(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Apply an SVG-convention affine matrix to a point → absolute {x,y}. */
function apply(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// ── CLOSURE INFERENCE (#147, PRD #143) ───────────────────────────────────────
// A p5 shape is only EXPLICITLY closed when the pattern passes CLOSE to
// endShape(). Several shipping hosts draw shapes that are geometrically closed
// and terminate them bare: Lissajous at damping 0 traces a mathematically closed
// figure, and the marching-squares stitcher shared by Chladni and
// TopographicContours ends a ring by repeating its start vertex. Reported as
// open, those paths made Route's loop/strand scopes lie about what they were
// filtering and made the Zone partitioner invent a seam to flower at.
//
// So closure is INFERRED here, from endpoint coincidence. Deliberately on the
// capture side and not by passing CLOSE in the patterns: that would change what
// they paint and what they export, a real behavioural change to shipping
// patterns for the benefit of a third subsystem. Inference changes nothing
// painted. It is also host-agnostic by construction — this module sees a call
// stream, never a pattern id — so the same rule reaches every capture host.
//
// THE TOLERANCE, and why this value.
//
// Two endpoints count as coincident when they are within
// `CLOSURE_TOLERANCE_RELATIVE` of the path's OWN bounding-box diagonal, that
// diagonal floored at 1 px so a degenerate (point-like) path still gets a
// well-defined absolute threshold. Relative rather than absolute because closure
// is a property of the figure, not of the canvas: the same curve captured at
// 400 px and at 4000 px must classify identically.
//
// 1e-6 sits in a band that was measured, not guessed:
//   • FLOOR — a mathematically closed Lissajous leaves round-off of at most
//     ~6e-15 of its own diagonal, measured across the extreme of its param space
//     (freqA 12, freqB 11, cycles 48, steps 6000, amplitude 1, and again on a
//     4000x3000 canvas). A stitched Chladni/topographic ring lands at exactly 0.
//     1e-6 is ~10^8 above that noise, so the rule cannot be defeated by
//     arithmetic on a wider canvas or a denser curve.
//   • CEILING — 1e-6 of a 500 px figure is 5e-4 px. Both patterns' SVG writers
//     round coordinates to two decimals, so a gap that small is not even
//     REPRESENTABLE in the export, let alone visible on the canvas or cuttable
//     on a plotter. A gap under this threshold cannot be a deliberate open end;
//     it can only be arithmetic. Empirically the tightest genuinely-open gap
//     across both hosts' param spaces is 4.17 px on a ~500 px figure (~8e-3
//     relative) — four orders of margin.
//
// A path of fewer than three points is never inferred closed: a single segment
// is not a loop, and calling one closed would hand the Zone partitioner a path
// with neither an Apex nor an interior. An explicit endShape(CLOSE) always wins.

/**
 * Endpoint-coincidence tolerance as a fraction of a path's bounding-box
 * diagonal. See the block above for the derivation of the value.
 * @type {number}
 */
export const CLOSURE_TOLERANCE_RELATIVE = 1e-6;

/**
 * The absolute (px) closure tolerance for one polyline: the relative tolerance
 * scaled by the path's bounding-box diagonal, with the diagonal floored at 1 px.
 * @param {{x:number,y:number}[]} points
 * @returns {number}
 */
export function closureToleranceFor(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return CLOSURE_TOLERANCE_RELATIVE * Math.max(diagonal, 1);
}

/**
 * Whether a bare-terminated polyline should be reported as a closed loop: at
 * least three points, and first/last within `closureToleranceFor(points)` of
 * each other (inclusive).
 * @param {{x:number,y:number}[]} points
 * @returns {boolean}
 */
export function isImplicitlyClosed(points) {
  if (!points || points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(last.x - first.x, last.y - first.y) <= closureToleranceFor(points);
}

/**
 * Fold a recorded draw-call stream into absolute-coordinate polylines.
 *
 * Recognized ops (all others are ignored — a host that draws only ellipse/rect/
 * triangle yields an empty result → graceful no-op edge host):
 *   TRANSFORM  push · pop · translate(x,y) · rotate(theta) · scale(s | sx,sy)
 *   DRAW       line(x1,y1,x2,y2)                 → one 2-point OPEN polyline
 *              beginShape · vertex(x,y) · endShape(mode?) → one polyline;
 *                CLOSED when endShape's first arg is non-null (p5's CLOSE flag)
 *                OR when the shape's endpoints coincide within the stated
 *                closure tolerance (#147 — see CLOSURE_TOLERANCE_RELATIVE).
 *              bezierOrder(n) · bezierVertex(x,y) → p5 2.x curve API: a cubic is
 *                bezierOrder(3) plus THREE 1-point bezierVertex calls (c1, c2,
 *                end). Each such segment is FLATTENED (shared adaptive
 *                flattenCubic, device-dot tolerance) into on-curve points appended
 *                to the in-flight shape — so a WARPED single-axis grid's Bézier
 *                lines become exact-to-paint polylines the vine samples along.
 *
 * Robustness: an unbalanced pop never discards the identity base; a shape with
 * fewer than 2 vertices is dropped (arc-length samplers need ≥2 points); a
 * vertex (plain or bezier) outside beginShape/endShape is ignored; a bezier
 * segment with no preceding on-curve anchor is ignored.
 *
 * @param {Array<{op:string,args:any[]}>} calls
 * @returns {Array<{points:{x:number,y:number}[], closed:boolean}>} hostPaths
 */
export function capturePolylines(calls) {
  const stack = [IDENTITY];
  const paths = [];
  let shape = null; // in-flight beginShape vertex buffer, or null
  let bezierOrder = 3; // p5 2.x default cubic degree for bezierVertex
  let bezierBuf = null; // control points collected for the in-flight bezier segment

  const top = () => stack[stack.length - 1];
  const setTop = (m) => { stack[stack.length - 1] = m; };

  for (const call of calls || []) {
    if (!call || typeof call.op !== 'string') continue;
    const a = call.args || [];
    switch (call.op) {
      case 'push':
        stack.push(top().slice());
        break;
      case 'pop':
        // Never pop below the identity base — a stray/unbalanced pop is tolerated.
        if (stack.length > 1) stack.pop();
        break;
      case 'translate':
        setTop(compose(top(), [1, 0, 0, 1, a[0] || 0, a[1] || 0]));
        break;
      case 'rotate': {
        const t = a[0] || 0;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        setTop(compose(top(), [cos, sin, -sin, cos, 0, 0]));
        break;
      }
      case 'scale': {
        const sx = a[0] ?? 1;
        const sy = a[1] ?? sx; // scale(s) ⇒ uniform
        setTop(compose(top(), [sx, 0, 0, sy, 0, 0]));
        break;
      }
      case 'line': {
        const p1 = apply(top(), a[0], a[1]);
        const p2 = apply(top(), a[2], a[3]);
        paths.push({ points: [p1, p2], closed: false });
        break;
      }
      case 'beginShape':
        shape = [];
        bezierBuf = null;
        break;
      case 'vertex':
        if (shape) shape.push(apply(top(), a[0], a[1]));
        bezierBuf = null; // a plain vertex closes any half-collected bezier run
        break;
      case 'bezierOrder':
        // p5 2.x: sets the degree of the following bezierVertex run (cubic = 3).
        bezierOrder = a[0] || 3;
        break;
      case 'bezierVertex': {
        // p5 2.x emits one point per call; a cubic is bezierOrder(3) + three
        // calls (c1, c2, end) where the LAST is the on-curve endpoint. Fold each
        // control point through the CTM FIRST so the flatness tolerance is in
        // absolute render px (not rescaled by any CTM scale), then adaptively
        // flatten the cubic from the shape's current point.
        if (!shape || shape.length < 1) break; // no anchor to start the curve
        if (!bezierBuf) bezierBuf = [];
        bezierBuf.push(apply(top(), a[0], a[1]));
        if (bezierBuf.length >= bezierOrder) {
          const p0 = shape[shape.length - 1];
          if (bezierOrder === 3) {
            const [c1, c2, end] = bezierBuf;
            const flat = flattenCubic([
              [p0.x, p0.y], [c1.x, c1.y], [c2.x, c2.y], [end.x, end.y],
            ]);
            for (const [x, y] of flat) shape.push({ x, y });
          } else {
            // Non-cubic order (not emitted by any current host): fall back to the
            // on-curve endpoint so the shape stays continuous without guessing.
            const end = bezierBuf[bezierBuf.length - 1];
            shape.push({ x: end.x, y: end.y });
          }
          bezierBuf = null;
        }
        break;
      }
      case 'endShape':
        if (shape) {
          if (shape.length >= 2) {
            // p5 passes CLOSE (a non-null constant) to close a shape; open shapes
            // call endShape() with no arg. Treat any non-null first arg as closed.
            // A BARE endShape falls through to closure inference (#147) — see the
            // tolerance block above — so a host that draws a geometrically closed
            // figure without saying CLOSE is still reported as the loop it is.
            paths.push({ points: shape, closed: a[0] != null || isImplicitlyClosed(shape) });
          }
          shape = null;
          bezierBuf = null;
        }
        break;
      default:
        break; // ellipse/rect/triangle/style/etc. — not polyline geometry
    }
  }

  return paths;
}
