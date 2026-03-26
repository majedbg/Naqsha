import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class FractalTree {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);

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
      const jitterL = (p.random(-5, 5) * Math.PI) / 180;
      const jitterR = (p.random(-5, 5) * Math.PI) / 180;

      branch(x2, y2, angle - angleRad + jitterL, nextLength, depth - 1);
      branch(x2, y2, angle + angleRad + jitterR, nextLength, depth - 1);
    };

    const startX = 0;
    const startY = canvasH * 0.3;
    const startAngle = -Math.PI / 2;

    branch(startX, startY, startAngle, initialLength, iterations);

    // Build SVG path data for each segment
    for (const seg of segments) {
      const pathD = `M${seg.x1.toFixed(2)},${seg.y1.toFixed(2)} L${seg.x2.toFixed(2)},${seg.y2.toFixed(2)}`;
      this.svgElements.push({ pathD, strokeWeight: seg.sw });
    }

    // Draw on p5 canvas
    const drawBase = () => {
      p.noFill();
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);

      for (const seg of segments) {
        p.strokeWeight(seg.sw);
        p.line(seg.x1, seg.y1, seg.x2, seg.y2);
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const paths = this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight.toFixed(2)}" stroke-linecap="round"/>`
      )
      .join('\n');
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      paths,
      this._lastParams?.symmetry || 'single',
      this._lastCx,
      this._lastCy,
      this._lastParams?.startAngle || 0,
      this._lastParams?.offsetX || 0,
      this._lastParams?.offsetY || 0
    );
  }

  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}
