import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

export default class Spirograph extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    const { R, r, d, revolutions, strokeWeight, symmetry, startAngle = 0, offsetX = 0, offsetY = 0 } = params;
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Generate hypotrochoid points
    const points = [];
    const steps = revolutions * 360;
    for (let i = 0; i <= steps; i++) {
      const t = (i / 360) * Math.PI * 2;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      points.push({ x, y });
    }

    // Build SVG path
    if (points.length > 1) {
      let pathD = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
      }
      this.svgElements.push({ pathD, strokeWeight });
    }

    // Draw on canvas
    const drawBase = () => {
      ctx.noFill();
      ctx.stroke(color);
      ctx.strokeWeight(strokeWeight);

      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);

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
