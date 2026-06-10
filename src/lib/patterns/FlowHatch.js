import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class FlowHatch extends Pattern {
  // svgElements are pre-indented strings ("    <line .../>"); join with '\n' only.
  contentFor() {
    return this.svgElements.join('\n');
  }

  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.noiseSeed(seed);
    ctx.randomSeed(seed);

    const {
      particleCount = 200,
      stepsPerParticle = 80,
      stepLength = 5,
      sampleEvery = 3,
      noiseScale = 0.005,
      minDashLen = 8,
      maxDashLen = 24,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const halfW = canvasW / 2;
    const halfH = canvasH / 2;

    // Flow field angle lookup (coords relative to center, offset to positive for noise)
    const angle = (x, y) =>
      ctx.noise((x + halfW) * noiseScale, (y + halfH) * noiseScale) * ctx.TWO_PI * 2;

    // Step 2 — Walk particles and collect anchor points
    const dashes = [];

    for (let i = 0; i < particleCount; i++) {
      let x = ctx.random(-halfW, halfW);
      let y = ctx.random(-halfH, halfH);

      for (let s = 0; s < stepsPerParticle; s++) {
        const a = angle(x, y);
        x += Math.cos(a) * stepLength;
        y += Math.sin(a) * stepLength;

        // Stop if particle exits bounds
        if (x < -halfW || x > halfW || y < -halfH || y > halfH) {
          break;
        }

        // Sample anchor every sampleEvery steps
        if (s % sampleEvery === 0) {
          // Step 3 — Perpendicular dash at this anchor
          const flowAngle = angle(x, y);
          const perpAngle = flowAngle + Math.PI / 2;

          // Second noise layer for length modulation
          const lenNoise = ctx.noise(x * 0.01 + 300, y * 0.01 + 300);
          const len = ctx.map(lenNoise, 0, 1, minDashLen, maxDashLen);

          const halfLen = len / 2;
          const dx = Math.cos(perpAngle) * halfLen;
          const dy = Math.sin(perpAngle) * halfLen;

          const x1 = x - dx;
          const y1 = y - dy;
          const x2 = x + dx;
          const y2 = y + dy;

          dashes.push({ x1, y1, x2, y2 });
        }
      }
    }

    // Store SVG elements
    for (const d of dashes) {
      this.svgElements.push(
        `    <line x1="${d.x1.toFixed(2)}" y1="${d.y1.toFixed(2)}" x2="${d.x2.toFixed(2)}" y2="${d.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }

    // Draw on canvas
    const drawBase = () => {
      ctx.noFill();
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);

      for (const d of dashes) {
        ctx.line(d.x1, d.y1, d.x2, d.y2);
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }
}
