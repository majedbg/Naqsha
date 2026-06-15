import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * Moire — one half of a two-layer moiré interference effect.
 *
 * Moiré is produced when two fine-grained fields are overlaid, one slightly
 * transformed relative to the other. Each field on its own is a uniform mesh;
 * the overlay produces large-scale fringe bands. In the final app each field is
 * its own LAYER (role 'A' and role 'B'); this class renders ONE field given its
 * params + role and is overlaid with a sibling instance to make the fringe.
 *
 * Field types (all built centered at origin, sized to fill the canvas with
 * `density` features):
 *   parallelLines  — `density` evenly-spaced straight lines spanning the canvas.
 *   concentricRings— `density` concentric circles stepping outward.
 *   radialLines    — `density` lines radiating from center.
 *
 * Role transform — the ONLY behavioral difference between the two roles:
 *   role 'A' → identity (untransformed reference field).
 *   role 'B' → the whole field geometry is transformed about the origin in the
 *              order SCALE → ROTATE → TRANSLATE: scale by `moireScale`, rotate by
 *              `moireRotation` degrees, then translate by (moireOffsetX,
 *              moireOffsetY). The transform is BAKED into the emitted/drawn
 *              coordinates (not an SVG transform wrapper), so canvas == SVG and
 *              a role-B field is genuinely different geometry from role A.
 *
 * Geometry is built ONCE in absolute, origin-centered coords. `drawBase` replays
 * it via ctx, and the SVG <line>/<circle> strings are emitted from the same
 * arrays, so canvas == SVG and the whole thing is param-deterministic (no
 * Math.random — these fields are pure functions of the params). This pattern has
 * NO symmetry control — symmetry is hardcoded to 1.
 */
export default class Moire extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];

    const {
      fieldType = 'parallelLines',
      density = 120,
      moireRotation = 5,
      moireOffsetX = 0,
      moireOffsetY = 0,
      moireScale = 1,
      strokeWeight = 0.5,
      moireRole = 'A',
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const n = Math.max(1, Math.round(density));

    // Size every field to the canvas DIAGONAL so a rotated/offset role-B field
    // still covers the whole canvas (no blank corners shrinking the overlap
    // region where the fringe lives).
    const diag = Math.hypot(canvasW, canvasH);
    const extent = diag;        // full span across the field
    const half = extent / 2;    // half-span / max radius

    // Role transform: SCALE → ROTATE → TRANSLATE about the origin, baked into
    // every emitted point. Role 'A' is identity. The transform is applied as a
    // point mapper so straight lines stay straight (rings become ellipses only
    // if moireScale were non-uniform, which it isn't — uniform scale keeps them
    // circular, which is correct for the zone-plate effect).
    const isB = moireRole === 'B';
    const rot = isB ? (moireRotation * Math.PI) / 180 : 0;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const sc = isB ? moireScale : 1;
    const tx = isB ? moireOffsetX : 0;
    const ty = isB ? moireOffsetY : 0;
    const xf = (x, y) => {
      // scale
      let px = x * sc;
      let py = y * sc;
      // rotate
      const rx = px * cosR - py * sinR;
      const ry = px * sinR + py * cosR;
      // translate
      return { x: rx + tx, y: ry + ty };
    };

    // Collected absolute, origin-centered primitives.
    const lines = [];   // { x1, y1, x2, y2 }
    const circles = []; // { cx, cy, r }  (only emitted when role-B transform is
                        // a pure scale/translate with no rotation; otherwise a
                        // circle is still a circle under rotation+uniform-scale,
                        // so we can always keep them circular — see below)

    const addLine = (ax, ay, bx, by) => {
      const a = xf(ax, ay);
      const b = xf(bx, by);
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    };

    if (fieldType === 'concentricRings') {
      // `density` concentric circles stepping outward from center to the
      // diagonal radius. Under the role transform a circle of radius r centered
      // at origin maps to a circle of radius r*scale centered at (tx,ty)
      // (rotation about origin does not change a centered circle's shape), so we
      // emit true <circle> primitives — canvas == SVG, no polygon approximation.
      const step = half / n;
      const center = xf(0, 0); // origin under the role transform → ring center
      for (let i = 1; i <= n; i++) {
        const r = i * step * sc;
        circles.push({ cx: center.x, cy: center.y, r });
      }
    } else if (fieldType === 'radialLines') {
      // `density` lines radiating from center out to the diagonal radius.
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        addLine(0, 0, Math.cos(a) * half, Math.sin(a) * half);
      }
    } else {
      // parallelLines (default): `density` evenly-spaced horizontal lines whose
      // y walks the field height, each spanning the full field width. The role
      // transform rotates/scales/shifts the whole grating.
      const span = half; // each line runs x ∈ [-span, span]
      for (let i = 0; i < n; i++) {
        const y = -half + ((i + 0.5) / n) * extent;
        addLine(-span, y, span, y);
      }
    }

    // --- Emit SVG (origin-centered; the group wrapper translates to canvas
    // center and applies startAngle/offset via inherited toSVGGroup) ----------
    const f = (v) => v.toFixed(2);
    for (const l of lines) {
      this.svgElements.push(
        `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(l.x2)}" y2="${f(l.y2)}" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }
    for (const c of circles) {
      this.svgElements.push(
        `<circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(c.r)}" stroke="${color}" stroke-width="${strokeWeight}" fill="none"/>`
      );
    }

    const drawBase = () => {
      const col = ctx.color(color);
      col.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(col);
      ctx.strokeWeight(strokeWeight);
      for (const l of lines) {
        ctx.line(l.x1, l.y1, l.x2, l.y2);
      }
      for (const c of circles) {
        // p5 ellipse takes diameters; SVG <circle r> is the radius.
        ctx.ellipse(c.cx, c.cy, c.r * 2, c.r * 2);
      }
    };

    // Symmetry hardcoded to 1 (this pattern has no symmetry control).
    applySymmetryDraw(ctx, 1, cx, cy, drawBase, (startAngle * Math.PI) / 180, offsetX, offsetY);
  }

  // One element per primitive, joined plainly (mirrors ModuleGrid/Topographic).
  // toSVGGroup is inherited and wraps with wrapSVGSymmetry(symmetry || 1, ...),
  // so symmetry defaults to 1 with no symmetry param.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
