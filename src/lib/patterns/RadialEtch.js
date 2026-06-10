import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class RadialEtch extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      lineCount = 120,
      innerRadius = 20,
      outerRadius = 400,
      lengthJitter = 0.3,
      angleJitter = 0,
      noiseWarp = 0,
      noiseScale = 0.005,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const lines = [];
    for (let i = 0; i < lineCount; i++) {
      const t = i / lineCount;
      const baseAngle = t * Math.PI * 2;

      // Angle jitter
      const aj = angleJitter * (ctx.random(-1, 1)) * (Math.PI / lineCount);
      const angle = baseAngle + aj;

      // Noise-based warp on the angle
      const nx = Math.cos(angle) * 0.5 + 0.5;
      const ny = Math.sin(angle) * 0.5 + 0.5;
      const warp = noiseWarp > 0
        ? (ctx.noise(nx * noiseScale * 500, ny * noiseScale * 500) - 0.5) * 2 * noiseWarp * (Math.PI * 0.1)
        : 0;
      const finalAngle = angle + warp;

      // Inner/outer with length jitter
      const jitterMul = 1 + (ctx.random(-1, 1)) * lengthJitter;
      const rInner = Math.max(0, innerRadius * jitterMul);
      const rOuter = outerRadius * (1 + (ctx.random(-1, 1)) * lengthJitter * 0.5);

      const x1 = rInner * Math.cos(finalAngle);
      const y1 = rInner * Math.sin(finalAngle);
      const x2 = rOuter * Math.cos(finalAngle);
      const y2 = rOuter * Math.sin(finalAngle);

      lines.push({ x1, y1, x2, y2 });

      this.svgElements.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();
      for (const l of lines) {
        ctx.line(l.x1, l.y1, l.x2, l.y2);
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }
}
