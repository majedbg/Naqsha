import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class FractalTree extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);

    const {
      iterations = 5,
      branchAngle = 25,
      lengthDecay = 0.68,
      initialLength = 100,
      strokeWeight = 1,
      strokeDepthDecay = 0.3,
      symmetry = 'single',
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const segments = [];

    const branch = (x1, y1, angle, length, depth) => {
      if (depth <= 0 || length < 1) return;

      const x2 = x1 + length * Math.cos(angle);
      const y2 = y1 + length * Math.sin(angle);

      // Compute stroke weight for this depth level
      const t = 1 - depth / iterations; // 0 at trunk, 1 at tips
      const sw = Math.max(0.1, strokeWeight * (1 - strokeDepthDecay * t));

      segments.push({ x1, y1, x2, y2, sw });

      const nextLength = length * lengthDecay;
      const angleRad = (branchAngle * Math.PI) / 180;
      const jitterL = (ctx.random(-5, 5) * Math.PI) / 180;
      const jitterR = (ctx.random(-5, 5) * Math.PI) / 180;

      branch(x2, y2, angle - angleRad + jitterL, nextLength, depth - 1);
      branch(x2, y2, angle + angleRad + jitterR, nextLength, depth - 1);
    };

    const startX = 0;
    const startY = canvasH * 0.3;
    const trunkAngle = -Math.PI / 2;

    branch(startX, startY, trunkAngle, initialLength, iterations);

    // Build SVG path data for each segment
    for (const seg of segments) {
      const pathD = `M${seg.x1.toFixed(2)},${seg.y1.toFixed(2)} L${seg.x2.toFixed(2)},${seg.y2.toFixed(2)}`;
      this.svgElements.push({ pathD, strokeWeight: seg.sw });
    }

    // Draw on canvas
    const drawBase = () => {
      ctx.noFill();
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);

      for (const seg of segments) {
        ctx.strokeWeight(seg.sw);
        ctx.line(seg.x1, seg.y1, seg.x2, seg.y2);
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  contentFor(color) {
    return this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight.toFixed(2)}" stroke-linecap="round"/>`
      )
      .join('\n');
  }
}
