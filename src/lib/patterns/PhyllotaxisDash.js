import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class PhyllotaxisDash {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
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

    p.noiseSeed(seed);
    p.randomSeed(seed);

    this.svgElements = [];
    const GOLDEN_ANGLE = 2.399963;
    const dashes = [];

    for (let i = 0; i < seedCount; i++) {
      const angle = i * GOLDEN_ANGLE;
      const radius = spacingC * Math.sqrt(i);
      const xi = radius * Math.cos(angle);
      const yi = radius * Math.sin(angle);

      const theta = Math.atan2(yi, xi);
      const nInner = p.noise(xi * noiseScale, yi * noiseScale);
      const nOuter = p.noise(xi * noiseScale + 500, yi * noiseScale + 500);
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
      const c = p.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      p.stroke(c);
      p.strokeWeight(strokeWeight);
      p.noFill();
      for (const d of dashes) {
        p.line(d.x1, d.y1, d.x2, d.y2);
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const content = this.svgElements.join('\n');
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      content,
      this._lastParams?.symmetry || 1,
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
