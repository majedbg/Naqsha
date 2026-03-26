import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class Spirograph {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);
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

    // Draw on p5 canvas
    const drawBase = () => {
      p.noFill();
      p.stroke(color);
      p.strokeWeight(strokeWeight);

      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);

      p.beginShape();
      for (const pt of points) {
        p.vertex(pt.x, pt.y);
      }
      p.endShape();
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const paths = this.svgElements
      .map(
        (el) =>
          `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight}" stroke-linecap="round"/>`
      )
      .join('\n');
    return wrapSVGSymmetry(layerId, color, opacity, paths, this._lastParams?.symmetry || 'single', this._lastCx, this._lastCy, this._lastParams?.startAngle || 0, this._lastParams?.offsetX || 0, this._lastParams?.offsetY || 0);
  }

  // Store context for SVG export
  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}
