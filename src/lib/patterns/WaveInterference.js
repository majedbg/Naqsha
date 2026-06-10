import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class WaveInterference extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);

    const {
      waveCount = 5,
      frequency = 6,
      amplitude = 45,
      lineSpacing = 12,
      strokeWeight = 1,
      symmetry = 'none',
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const halfW = canvasW / 2;
    const halfH = canvasH / 2;

    // Pre-generate random phases for each wave layer
    const phases = [];
    const freqMults = [];
    for (let w = 0; w < waveCount; w++) {
      phases.push(ctx.random(0, ctx.TWO_PI));
      freqMults.push(0.7 + ctx.random(0, 0.6) + w * 0.15);
    }

    // Generate horizontal lines from top to bottom
    const lines = [];

    for (let lineY = -halfH; lineY <= halfH; lineY += lineSpacing) {
      const points = [];
      const steps = Math.ceil(canvasW / 2);

      for (let i = 0; i <= steps; i++) {
        const x = -halfW + (canvasW / steps) * i;
        let yDisplacement = 0;

        for (let w = 0; w < waveCount; w++) {
          yDisplacement +=
            (amplitude / waveCount) *
            Math.sin(
              frequency * freqMults[w] * (x / canvasW) * ctx.TWO_PI + phases[w]
            );
        }

        points.push({ x, y: lineY + yDisplacement });
      }

      lines.push(points);
    }

    // Build SVG polyline strings
    for (const line of lines) {
      let pathD = `M${line[0].x.toFixed(2)},${line[0].y.toFixed(2)}`;
      for (let i = 1; i < line.length; i++) {
        pathD += ` L${line[i].x.toFixed(2)},${line[i].y.toFixed(2)}`;
      }
      this.svgElements.push({ pathD, strokeWeight });
    }

    // Draw on canvas
    const drawBase = () => {
      ctx.noFill();
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);

      for (const line of lines) {
        ctx.beginShape();
        for (const pt of line) {
          ctx.vertex(pt.x, pt.y);
        }
        ctx.endShape();
      }
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
