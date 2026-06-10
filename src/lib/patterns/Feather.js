import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

export default class Feather extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    const {
      curveType = 'hypotrochoid',
      R = 180,
      r = 60,
      d = 80,
      roseK = 5,
      roseA = 200,
      sampleCount = 1200,
      harmonicK = 6,
      innerBase = 2,
      innerAmp = 10,
      outerBase = 2,
      outerAmp = 14,
      strokeWeight = 0.6,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.randomSeed(seed);

    this.svgElements = [];

    // Build the parametric position function and T_max
    let posX, posY, tMax;

    if (curveType === 'rose') {
      posX = (t) => roseA * Math.cos(roseK * t) * Math.cos(t);
      posY = (t) => roseA * Math.cos(roseK * t) * Math.sin(t);
      tMax = 2 * Math.PI;
    } else {
      const diff = R - r;
      const ratio = diff / r;
      posX = (t) => diff * Math.cos(t) + d * Math.cos(ratio * t);
      posY = (t) => diff * Math.sin(t) - d * Math.sin(ratio * t);
      tMax = 20 * 2 * Math.PI;
    }

    const eps = 0.001;
    const dashes = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      const xi = posX(t);
      const yi = posY(t);

      const dx = posX(t + eps) - posX(t - eps);
      const dy = posY(t + eps) - posY(t - eps);
      const tangent = Math.atan2(dy, dx);

      const harmonic = Math.sin(t * harmonicK);
      const dStart = innerBase + innerAmp * Math.abs(harmonic);
      const dEnd = outerBase + outerAmp * Math.abs(harmonic);

      const x1 = xi - dStart * Math.cos(tangent);
      const y1 = yi - dStart * Math.sin(tangent);
      const x2 = xi + dEnd * Math.cos(tangent);
      const y2 = yi + dEnd * Math.sin(tangent);

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

  // Custom contentFor: original toSVGGroup joined with '\n' (no indent).
  // The base Pattern.contentFor() uses a 4-space indent, which would break
  // byte-identity with the pre-migration SVG output.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
