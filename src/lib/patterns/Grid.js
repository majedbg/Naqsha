import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class Grid {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    p.randomSeed(seed);
    p.noiseSeed(seed);

    const {
      cols = 12,
      rows = 12,
      spacing = 40,
      nonLinear = 0,
      jitter = 0,
      drawHorizontal = 1,
      drawVertical = 1,
      margin = 20,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Compute positions with non-linear spacing
    // nonLinear: 0 = even, >0 = lines bunch toward center, <0 = bunch toward edges
    function distribute(count, totalSpan) {
      const positions = [];
      for (let i = 0; i <= count; i++) {
        let t = count > 0 ? i / count : 0.5; // 0..1
        if (nonLinear > 0) {
          // Bunch toward center: push t toward 0.5
          t = 0.5 + (t - 0.5) * Math.pow(Math.abs(t - 0.5) * 2, nonLinear) * Math.sign(t - 0.5) / 1;
          // Simpler: power curve from center
          const centered = t - 0.5; // -0.5..0.5
          const sign = centered >= 0 ? 1 : -1;
          const mag = Math.abs(centered) * 2; // 0..1
          t = 0.5 + sign * Math.pow(mag, 1 + nonLinear) * 0.5;
        } else if (nonLinear < 0) {
          // Bunch toward edges
          const centered = t - 0.5;
          const sign = centered >= 0 ? 1 : -1;
          const mag = Math.abs(centered) * 2;
          t = 0.5 + sign * Math.pow(mag, 1 / (1 + Math.abs(nonLinear))) * 0.5;
        }
        positions.push(-totalSpan / 2 + t * totalSpan);
      }
      return positions;
    }

    const totalW = cols * spacing;
    const totalH = rows * spacing;
    const xPositions = distribute(cols, totalW);
    const yPositions = distribute(rows, totalH);

    // Add jitter
    const xJittered = xPositions.map((x) => x + (jitter > 0 ? p.random(-jitter, jitter) : 0));
    const yJittered = yPositions.map((y) => y + (jitter > 0 ? p.random(-jitter, jitter) : 0));

    const halfW = totalW / 2 + margin;
    const halfH = totalH / 2 + margin;
    const lines = [];

    // Vertical lines
    if (drawVertical >= 0.5) {
      for (const x of xJittered) {
        lines.push({ x1: x, y1: -halfH, x2: x, y2: halfH });
      }
    }

    // Horizontal lines
    if (drawHorizontal >= 0.5) {
      for (const y of yJittered) {
        lines.push({ x1: -halfW, y1: y, x2: halfW, y2: y });
      }
    }

    for (const l of lines) {
      this.svgElements.push(
        `<line x1="${l.x1.toFixed(2)}" y1="${l.y1.toFixed(2)}" x2="${l.x2.toFixed(2)}" y2="${l.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="butt"/>`
      );
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);
      p.stroke(c);
      p.strokeWeight(strokeWeight);
      p.noFill();
      for (const l of lines) {
        p.line(l.x1, l.y1, l.x2, l.y2);
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const content = this.svgElements.map((el) => `    ${el}`).join('\n');
    return wrapSVGSymmetry(
      layerId, color, opacity, content,
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
