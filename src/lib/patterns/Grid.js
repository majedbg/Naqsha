import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class Grid extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      cols = 12,
      rows = 12,
      spacing = 40,
      nonLinear = 0,
      nonLinearGain = 0,
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

    // Remap the normalized distance-from-center s in [0,1] using TWO independent
    // eases, then mirror it about the center. Both keep the endpoints pinned
    // (0->0, 1->1) and stay monotonic, so lines never reorder and the outer
    // footprint (+/- totalSpan/2) is unchanged.
    //
    //   power (nonLinear): s^gamma, gamma = 1+n for n>=0, 1/(1+|n|) for n<0.
    //     CONCENTRATION — gamma>1 bunches toward center, <1 toward edges, =1 even.
    //   gain  (nonLinearGain): an Inigo-Quilez/Schlick gain composed ON TOP,
    //     k = 3^g. SHARPNESS of the dense->sparse knee, independent of strength.
    //     k=1 (g=0) is the identity, so g=0 reproduces the pure power exactly.
    const gamma = nonLinear >= 0 ? 1 + nonLinear : 1 / (1 + Math.abs(nonLinear));
    const gainK = Math.pow(3, nonLinearGain);
    const gain = (x, k) => {
      const a = 0.5 * Math.pow(2 * (x < 0.5 ? x : 1 - x), k);
      return x < 0.5 ? a : 1 - a;
    };
    function distribute(count, totalSpan) {
      const positions = [];
      for (let i = 0; i <= count; i++) {
        const t = count > 0 ? i / count : 0.5; // 0..1
        const centered = t - 0.5; // -0.5..0.5
        const sign = centered >= 0 ? 1 : -1;
        const mag = Math.abs(centered) * 2; // 0..1, distance from center
        const eased = gain(Math.pow(mag, gamma), gainK); // power, then gain
        const tt = 0.5 + sign * eased * 0.5;
        positions.push(-totalSpan / 2 + tt * totalSpan);
      }
      return positions;
    }

    const totalW = cols * spacing;
    const totalH = rows * spacing;
    const xPositions = distribute(cols, totalW);
    const yPositions = distribute(rows, totalH);

    // Add jitter
    const xJittered = xPositions.map((x) => x + (jitter > 0 ? ctx.random(-jitter, jitter) : 0));
    const yJittered = yPositions.map((y) => y + (jitter > 0 ? ctx.random(-jitter, jitter) : 0));

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
