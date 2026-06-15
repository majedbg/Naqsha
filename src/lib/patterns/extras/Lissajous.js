import { Pattern } from '../drawingContext';
import { applySymmetryDraw } from '../symmetryUtils';
import { registerPattern } from '../../patternRegistry';

/**
 * Lissajous / harmonograph figure.
 *
 * Two perpendicular harmonic oscillations traced as ONE continuous curve:
 *   x = A · env · sin(freqA·θ + phase)
 *   y = B · env · sin(freqB·θ)
 * where env = e^(−damping·θ) is a slow exponential decay. damping=0 yields a
 * pure (closed) Lissajous figure; damping>0 spirals the ribbon inward like a
 * real harmonograph. θ sweeps 0..(cycles · 2π). A = B = amplitude · min(w,h)/2.
 *
 * Geometry is fully deterministic — it flows through Math.* only — but the
 * contract still requires seeding the ctx RNG/noise first.
 */
export default class Lissajous extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      freqA = 3,
      freqB = 2,
      phase = Math.PI / 2,
      amplitude = 0.8,
      damping = 0,
      steps = 2000,
      cycles = 12,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const A = amplitude * Math.min(canvasW, canvasH) / 2;
    const B = A;

    const totalSteps = Math.max(1, Math.round(steps));
    const thetaMax = cycles * Math.PI * 2;

    // Build the single continuous curve ONCE. Both the SVG path and the canvas
    // vertices are derived from this same points array, so they always agree.
    const points = [];
    for (let i = 0; i <= totalSteps; i++) {
      const theta = (i / totalSteps) * thetaMax;
      const env = Math.exp(-damping * theta);
      const x = A * env * Math.sin(freqA * theta + phase);
      const y = B * env * Math.sin(freqB * theta);
      points.push({ x, y });
    }

    if (points.length > 1) {
      let pathD = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L${points[i].x.toFixed(2)},${points[i].y.toFixed(2)}`;
      }
      this.svgElements.push({ pathD, strokeWeight });
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      ctx.noFill();

      ctx.beginShape();
      for (const pt of points) {
        ctx.vertex(pt.x, pt.y);
      }
      ctx.endShape();
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

const DEFAULTS = {
  freqA: 3,
  freqB: 2,
  phase: Math.PI / 2,
  amplitude: 0.8,
  damping: 0,
  steps: 2000,
  cycles: 12,
  strokeWeight: 0.8,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const PARAM_DEFS = [
  { key: 'freqA', label: 'Frequency A', min: 1, max: 12, step: 1, tooltip: 'Horizontal oscillation frequency.' },
  { key: 'freqB', label: 'Frequency B', min: 1, max: 12, step: 1, tooltip: 'Vertical oscillation frequency.' },
  { key: 'phase', label: 'Phase', min: 0, max: Math.PI * 2, step: 0.01, tooltip: 'Phase offset of the horizontal oscillation (radians).' },
  { key: 'amplitude', label: 'Amplitude', min: 0.1, max: 1, step: 0.01, tooltip: 'Size as a fraction of min(width,height)/2.' },
  { key: 'damping', label: 'Damping', min: 0, max: 0.05, step: 0.001, tooltip: 'Exponential decay; 0 is a closed figure, higher spirals inward.' },
  { key: 'steps', label: 'Steps', min: 100, max: 6000, step: 100, tooltip: 'Number of sample points along the curve (higher is smoother).' },
  { key: 'cycles', label: 'Cycles', min: 1, max: 48, step: 1, tooltip: 'Number of θ revolutions traced.' },
  { key: 'strokeWeight', label: 'Stroke Weight', min: 0.1, max: 10, step: 0.1, tooltip: 'Line thickness.' },
  { key: 'symmetry', label: 'Symmetry', min: 1, max: 11, step: 1, tooltip: 'Radial copies (1 = none).' },
  { key: 'startAngle', label: 'Start Angle', min: 0, max: 360, step: 1, tooltip: 'Rotation offset in degrees.' },
  { key: 'offsetX', label: 'Offset X', min: -400, max: 400, step: 1, tooltip: 'Horizontal shift in pixels.' },
  { key: 'offsetY', label: 'Offset Y', min: -400, max: 400, step: 1, tooltip: 'Vertical shift in pixels.' },
];

registerPattern('lissajous', Lissajous, 'Lissajous', DEFAULTS, PARAM_DEFS, { isAI: false });
