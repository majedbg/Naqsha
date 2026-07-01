import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';
import { modulationTransfer } from '../fields/modulation';

export default class Spiral extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

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
      distortFrame = 'polar',
    } = params;

    // DISTORT modulation: a guide field (channel:'distort') spatially SCALES the
    // per-point noise jitter. `distortAmount` stays the CEILING; the field's
    // transfer output (clamped to [0,∞)) is a per-point mask deciding how much of
    // the ceiling applies where. Sampling is a pure array lookup (never ctx.noise/
    // random), so the noise stream is unshifted and null → byte-identical output.
    const mod = params?.modulation;
    const distortMod = mod && mod.channel === 'distort' && mod.field ? mod : null;

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
          // Effective amount: `distortAmount` is the ceiling; when a distort
          // field is supplied, sample it on the UNDISTORTED point (r, angle —
          // before dx/dy displacement, so there is no feedback) and scale by a
          // non-negative mask. A magnitude can't go below 0, so negatives clamp.
          let amt = distortAmount;
          if (distortMod) {
            const TWO_PI = Math.PI * 2;
            let u, v;
            if (distortFrame === 'cartesian') {
              u = (r * Math.cos(angle) + canvasW / 2) / canvasW;
              v = (r * Math.sin(angle) + canvasH / 2) / canvasH;
            } else {
              u = (((angle % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
              v = r / outerRadius;
            }
            const s = distortMod.field.sampleSigned(u, v);
            const mask = Math.max(0, modulationTransfer(s, distortMod));
            amt = distortAmount * mask;
          }
          dx = (ctx.noise(nx + arm * 100, ny) - 0.5) * 2 * amt;
          dy = (ctx.noise(nx + arm * 100 + 500, ny + 500) - 0.5) * 2 * amt;
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
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();

      for (const points of allArms) {
        ctx.beginShape();
        for (const pt of points) {
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
