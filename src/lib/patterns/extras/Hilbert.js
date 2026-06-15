import { Pattern } from '../drawingContext';
import { applySymmetryDraw } from '../symmetryUtils';
import { registerPattern } from '../../patternRegistry';

/**
 * Hilbert space-filling curve.
 *
 * ONE continuous pen path that visits every cell of a 2^order × 2^order grid
 * exactly once. The whole point is a single unbroken polyline: the curve has
 * #points = 4^order = (2^order)^2 and is emitted as a SINGLE <path d="M..L..">
 * AND drawn with ONE beginShape() … vertex()×N … endShape() run.
 *
 * Vertices are produced in path order via the standard d2xy bit-manipulation
 * algorithm: for n = 2^order, iterate the distance d in 0..n*n-1 and decode the
 * grid cell (x,y) by walking the recursive quadrant rotation. All math is
 * integer/bit (shifts, never float division) so the decode is exact and fully
 * deterministic.
 *
 * Geometry never touches the RNG, but the contract still requires seeding the
 * ctx RNG/noise first. The unit grid [0, n-1] is mapped to origin-centered
 * pixels spanning [-S/2, S/2] with S = min(w,h) - 2*margin; applySymmetryDraw
 * then translates the origin to the canvas center.
 */
export default class Hilbert extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      order = 5,
      margin = 20,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Clamp order into [1, 7] — 4^7 ≈ 16k points is the practical max.
    const k = Math.max(1, Math.min(7, Math.round(order)));
    const n = Math.pow(2, k); // grid side length (>= 2)
    const total = n * n; // number of cells / points = 4^k

    // S = footprint; map grid coords [0, n-1] -> centered pixels [-S/2, S/2].
    const S = Math.min(canvasW, canvasH) - 2 * margin;
    const cell = S / (n - 1);
    const half = S / 2;

    // Standard Hilbert d2xy decode using bit shifts only (integer-exact).
    const d2xy = (nn, d) => {
      let rx, ry, t = d;
      let x = 0, y = 0;
      for (let s = 1; s < nn; s <<= 1) {
        rx = 1 & (t >> 1);
        ry = 1 & (t ^ rx);
        // Rotate the quadrant using the CURRENT sub-square size s.
        if (ry === 0) {
          if (rx === 1) {
            x = s - 1 - x;
            y = s - 1 - y;
          }
          const tmp = x;
          x = y;
          y = tmp;
        }
        x += s * rx;
        y += s * ry;
        t >>= 2;
      }
      return [x, y];
    };

    // Build the single continuous curve ONCE; SVG path and canvas vertices both
    // derive from this same points array, so they always agree. Strict d < total
    // yields exactly 4^k points (no duplicated start/end).
    const points = [];
    for (let d = 0; d < total; d++) {
      const [gx, gy] = d2xy(n, d);
      points.push({ x: gx * cell - half, y: gy * cell - half });
    }

    if (points.length > 1) {
      let pathD = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
      }
      this.svgElements.push({ pathD, strokeWeight });
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();

      ctx.beginShape();
      for (const pt of points) {
        ctx.vertex(pt.x, pt.y);
      }
      ctx.endShape();
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  contentFor(color) {
    return this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight}" stroke-linecap="round"/>`
      )
      .join('\n');
  }
}

const DEFAULTS = {
  order: 5,
  margin: 20,
  strokeWeight: 0.8,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const PARAM_DEFS = [
  { key: 'order', label: 'Order', min: 1, max: 7, step: 1, tooltip: 'Recursion depth; the curve fills a 2^order × 2^order grid (4^order points).' },
  { key: 'margin', label: 'Margin', min: 0, max: 200, step: 1, tooltip: 'Padding from the canvas edge in pixels.' },
  { key: 'strokeWeight', label: 'Stroke Weight', min: 0.1, max: 10, step: 0.1, tooltip: 'Line thickness.' },
  { key: 'symmetry', label: 'Symmetry', min: 1, max: 11, step: 1, tooltip: 'Radial copies (1 = none).' },
  { key: 'startAngle', label: 'Start Angle', min: 0, max: 360, step: 1, tooltip: 'Rotation offset in degrees.' },
  { key: 'offsetX', label: 'Offset X', min: -400, max: 400, step: 1, tooltip: 'Horizontal shift in pixels.' },
  { key: 'offsetY', label: 'Offset Y', min: -400, max: 400, step: 1, tooltip: 'Vertical shift in pixels.' },
];

registerPattern('hilbert', Hilbert, 'Hilbert Curve', DEFAULTS, PARAM_DEFS, { isAI: false });
