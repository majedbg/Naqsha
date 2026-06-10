import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

export default class PhyllotaxisDash extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    const {
      seedCount = 2000,
      spacingC = 9,
      innerMax = 8,
      outerMax = 18,
      noiseScale = 0.008,
      strokeWeight = 0.7,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.noiseSeed(seed);
    ctx.randomSeed(seed);

    this.svgElements = [];
    const GOLDEN_ANGLE = 2.399963;
    const dashes = [];

    for (let i = 0; i < seedCount; i++) {
      const angle = i * GOLDEN_ANGLE;
      const radius = spacingC * Math.sqrt(i);
      const xi = radius * Math.cos(angle);
      const yi = radius * Math.sin(angle);

      const theta = Math.atan2(yi, xi);
      const nInner = ctx.noise(xi * noiseScale, yi * noiseScale);
      const nOuter = ctx.noise(xi * noiseScale + 500, yi * noiseScale + 500);
      const dInner = -innerMax * nInner;
      const dOuter = outerMax * nOuter;

      const x1 = xi + dInner * Math.cos(theta);
      const y1 = yi + dInner * Math.sin(theta);
      const x2 = xi + dOuter * Math.cos(theta);
      const y2 = yi + dOuter * Math.sin(theta);

      dashes.push({ x1, y1, x2, y2 });
      this.svgElements.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }

    const drawBase = () => {
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();
      for (const d of dashes) {
        ctx.line(d.x1, d.y1, d.x2, d.y2);
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // Custom contentFor: original toSVGGroup joined svgElements with '\n' (no indent),
  // which differs from the base default (4-space indent per element). Override to
  // preserve byte-identical SVG output.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
