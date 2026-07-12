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

/**
 * Fold a recorded draw-call stream into absolute-coordinate polylines.
 *
 * Recognized ops (all others are ignored — a host that draws only ellipse/rect/
 * triangle yields an empty result → graceful no-op edge host):
 *   TRANSFORM  push · pop · translate(x,y) · rotate(theta) · scale(s | sx,sy)
 *   DRAW       line(x1,y1,x2,y2)                 → one 2-point OPEN polyline
 *              beginShape · vertex(x,y) · endShape(mode?) → one polyline;
 *                CLOSED iff endShape's first arg is non-null (p5's CLOSE flag).
 *
 * Robustness: an unbalanced pop never discards the identity base; a shape with
 * fewer than 2 vertices is dropped (arc-length samplers need ≥2 points); a
 * vertex outside beginShape/endShape is ignored.
 *
 * @param {Array<{op:string,args:any[]}>} calls
 * @returns {Array<{points:{x:number,y:number}[], closed:boolean}>} hostPaths
 */
export function capturePolylines(calls) {
  const stack = [IDENTITY];
  const paths = [];
  let shape = null; // in-flight beginShape vertex buffer, or null

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
        break;
      case 'vertex':
        if (shape) shape.push(apply(top(), a[0], a[1]));
        break;
      case 'endShape':
        if (shape) {
          if (shape.length >= 2) {
            // p5 passes CLOSE (a non-null constant) to close a shape; open shapes
            // call endShape() with no arg. Treat any non-null first arg as closed.
            paths.push({ points: shape, closed: a[0] != null });
          }
          shape = null;
        }
        break;
      default:
        break; // ellipse/rect/triangle/style/etc. — not polyline geometry
    }
  }

  return paths;
}
