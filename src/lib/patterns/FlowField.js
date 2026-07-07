import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';
import { stackWarpDisplacement } from '../fields/warp';

export default class FlowField extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.noiseSeed(seed);
    ctx.randomSeed(seed);

    const {
      particleCount = 800,
      stepLength = 5,
      noiseScale = 0.004,
      curlStrength = 90,
      patternScale = 1,
      strokeWeight = 1,
      symmetry = 'none',
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const halfW = (canvasW / 2) * patternScale;
    const halfH = (canvasH / 2) * patternScale;
    const maxSteps = 100;

    // Generate all particle trails
    const trails = [];

    for (let i = 0; i < particleCount; i++) {
      // Positions relative to center (-halfW..halfW, -halfH..halfH)
      let x = ctx.random(-halfW, halfW);
      let y = ctx.random(-halfH, halfH);

      const points = [{ x, y }];

      for (let s = 0; s < maxSteps; s++) {
        // Noise lookup uses absolute position (offset to positive range)
        const absX = x + cx;
        const absY = y + cy;
        const angle = ctx.noise(absX * noiseScale, absY * noiseScale) * curlStrength * (Math.PI / 180) * 4;

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

    // --- WARP modulation (geometry-build time) --------------------------------
    // A guide field supplied via params.modulation (channel:'warp') displaces
    // the final particle-trail vertices along the field gradient, AFTER the
    // trail-build loop and BEFORE both the SVG-path build and drawBase, so canvas
    // and SVG warp identically. Unit-domain mapping uses canvasW/2 — NOT the
    // local halfW/halfH, which are scaled by patternScale. When warpMod is null
    // the trails are untouched → byte-identical to the unmodulated path.
    const mod = params?.modulation;
    const warpMod = mod && mod.channel === 'warp' && mod.field ? mod : null;
    if (warpMod) {
      for (const trail of trails) {
        for (const pt of trail) {
          const u = (pt.x + canvasW / 2) / canvasW;
          const v = (pt.y + canvasH / 2) / canvasH;
          // Phase 2b: vector-SUM every warp source (N=1 → single, byte-identical).
          const { dx, dy } = stackWarpDisplacement(warpMod.sources ?? [warpMod], u, v);
          pt.x += dx;
          pt.y += dy;
        }
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

    // Draw on canvas
    const drawBase = () => {
      ctx.noFill();
      const c = ctx.color(color);
      c.setAlpha(Math.round((opacity / 100) * 255));
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);

      for (const trail of trails) {
        ctx.beginShape();
        for (const pt of trail) {
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
