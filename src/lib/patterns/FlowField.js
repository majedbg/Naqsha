import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class FlowField {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.noiseSeed(seed);
    p.randomSeed(seed);

    const {
      particleCount = 800,
      stepLength = 5,
      noiseScale = 0.004,
      curlStrength = 90,
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
    const maxSteps = 100;

    // Generate all particle trails
    const trails = [];

    for (let i = 0; i < particleCount; i++) {
      // Positions relative to center (-halfW..halfW, -halfH..halfH)
      let x = p.random(-halfW, halfW);
      let y = p.random(-halfH, halfH);

      const points = [{ x, y }];

      for (let s = 0; s < maxSteps; s++) {
        // Noise lookup uses absolute position (offset to positive range)
        const absX = x + cx;
        const absY = y + cy;
        const angle = p.noise(absX * noiseScale, absY * noiseScale) * curlStrength * (Math.PI / 180) * 4;

        x += Math.cos(angle) * stepLength;
        y += Math.sin(angle) * stepLength;

        // Stop if the particle leaves the canvas bounds
        if (x < -halfW || x > halfW || y < -halfH || y > halfH) {
          break;
        }

        points.push({ x, y });
      }

      if (points.length > 1) {
        trails.push(points);
      }
    }

    // Build SVG path strings
    for (const trail of trails) {
      let pathD = `M${trail[0].x.toFixed(2)},${trail[0].y.toFixed(2)}`;
      for (let i = 1; i < trail.length; i++) {
        pathD += ` L${trail[i].x.toFixed(2)},${trail[i].y.toFixed(2)}`;
      }
      this.svgElements.push({ pathD, strokeWeight });
    }

    // Draw on p5 canvas
    const drawBase = () => {
      p.noFill();
      const c = p.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      p.stroke(c);
      p.strokeWeight(strokeWeight);

      for (const trail of trails) {
        p.beginShape();
        for (const pt of trail) {
          p.vertex(pt.x, pt.y);
        }
        p.endShape();
      }
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
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      paths,
      this._lastParams?.symmetry || 'none',
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
