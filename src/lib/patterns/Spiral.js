import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class Spiral {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);
    p.noiseSeed(seed);

    const {
      armCount = 3,
      turns = 8,
      innerRadius = 5,
      outerRadius = 400,
      growth = 1.0,
      distortAmount = 0,
      distortScale = 0.01,
      wobbleAmp = 0,
      wobbleFreq = 8,
      stepsPerTurn = 120,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const totalSteps = Math.round(turns * stepsPerTurn);
    const radialRange = outerRadius - innerRadius;

    const allArms = [];

    for (let arm = 0; arm < armCount; arm++) {
      const armOffset = (arm / armCount) * Math.PI * 2;
      const points = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i / totalSteps; // 0..1

        // Radius: grows from inner to outer with growth curve
        const r = innerRadius + radialRange * Math.pow(t, growth);

        // Base angle: turns full rotations + arm offset
        let angle = t * turns * Math.PI * 2 + armOffset;

        // Wobble: sinusoidal perturbation on the angle
        if (wobbleAmp > 0) {
          angle += wobbleAmp * Math.sin(t * wobbleFreq * Math.PI * 2) * (Math.PI / 180);
        }

        // Noise distortion: displaces the point radially and tangentially
        let dx = 0, dy = 0;
        if (distortAmount > 0) {
          const nx = Math.cos(angle) * r * distortScale;
          const ny = Math.sin(angle) * r * distortScale;
          dx = (p.noise(nx + arm * 100, ny) - 0.5) * 2 * distortAmount;
          dy = (p.noise(nx + arm * 100 + 500, ny + 500) - 0.5) * 2 * distortAmount;
        }

        const x = r * Math.cos(angle) + dx;
        const y = r * Math.sin(angle) + dy;
        points.push({ x, y });
      }

      allArms.push(points);

      // Build SVG path
      if (points.length > 1) {
        let pathD = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
        for (let i = 1; i < points.length; i++) {
          pathD += ` L${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
        }
        this.svgElements.push({ pathD, strokeWeight });
      }
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);
      p.strokeWeight(strokeWeight);
      p.noFill();

      for (const points of allArms) {
        p.beginShape();
        for (const pt of points) {
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
      layerId, color, opacity, paths,
      this._lastParams?.symmetry || 1, this._lastCx, this._lastCy,
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
