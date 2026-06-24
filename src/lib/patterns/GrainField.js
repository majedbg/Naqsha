import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';
import { densityWeight } from '../fields/modulation';

export default class GrainField extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    const pointCount = params.pointCount ?? 150;
    const relaxPasses = params.relaxPasses ?? 4;
    const neighborK = params.neighborK ?? 3;
    const minDashLen = params.minDashLen ?? 6;
    const maxDashLen = params.maxDashLen ?? 28;
    const strokeWeight = params.strokeWeight ?? 1;
    const symmetry = params.symmetry ?? 1;
    const startAngle = params.startAngle ?? 0;
    const offsetX = params.offsetX ?? 0;
    const offsetY = params.offsetY ?? 0;

    const halfW = canvasW / 2;
    const halfH = canvasH / 2;

    // Density modulation (geometry-build time): a guide field supplied via
    // params.modulation weights the Lloyd centroids so points migrate toward —
    // and pack denser in — high-field regions. Resolved into a no-op when
    // absent: the weight is exactly 1, so the accumulation is byte-identical to
    // the unmodulated path (x*1 === x in IEEE754, summed in the same order).
    const mod = params.modulation;
    const densityMod =
      mod && mod.channel === 'density' && mod.field ? mod : null;

    // Step 1 — Lloyd's Relaxation
    ctx.randomSeed(seed);

    // Place initial random points in [-halfW, halfW] x [-halfH, halfH]
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        x: ctx.random(-halfW, halfW),
        y: ctx.random(-halfH, halfH),
      });
    }

    // Grid resolution for Voronoi approximation
    const res = 4;
    const gridW = Math.ceil(canvasW / res);
    const gridH = Math.ceil(canvasH / res);

    for (let pass = 0; pass < relaxPasses; pass++) {
      // For each grid cell, find nearest point
      const sumX = new Float64Array(pointCount);
      const sumY = new Float64Array(pointCount);
      const count = new Float64Array(pointCount);

      for (let gy = 0; gy < gridH; gy++) {
        const cy = -halfH + (gy + 0.5) * res;
        for (let gx = 0; gx < gridW; gx++) {
          const cx = -halfW + (gx + 0.5) * res;

          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < pointCount; i++) {
            const dx = cx - points[i].x;
            const dy = cy - points[i].y;
            const d = dx * dx + dy * dy;
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }

          // Density weight for this Voronoi cell. 1 when unmodulated → the
          // accumulation below is byte-identical to the original.
          let w = 1;
          if (densityMod) {
            const u = (cx + halfW) / canvasW;
            const v = (cy + halfH) / canvasH;
            w = densityWeight(densityMod.field.sampleSigned(u, v), densityMod);
          }

          sumX[bestIdx] += cx * w;
          sumY[bestIdx] += cy * w;
          count[bestIdx] += w;
        }
      }

      // Move each point to its centroid, clamped to bounds
      for (let i = 0; i < pointCount; i++) {
        if (count[i] > 0) {
          points[i].x = Math.max(-halfW, Math.min(halfW, sumX[i] / count[i]));
          points[i].y = Math.max(-halfH, Math.min(halfH, sumY[i] / count[i]));
        }
      }
    }

    // Step 2 — Neighbor-aligned dashes
    const dashes = [];

    for (let i = 0; i < pointCount; i++) {
      const pt = points[i];

      // Find neighborK nearest neighbors (O(n²))
      const dists = [];
      for (let j = 0; j < pointCount; j++) {
        if (j === i) continue;
        const dx = points[j].x - pt.x;
        const dy = points[j].y - pt.y;
        dists.push({ idx: j, dist: Math.sqrt(dx * dx + dy * dy), dx, dy });
      }
      dists.sort((a, b) => a.dist - b.dist);

      const k = Math.min(neighborK, dists.length);

      // Grain angle: average direction to nearest neighbors
      let avgDx = 0;
      let avgDy = 0;
      let avgDist = 0;
      for (let n = 0; n < k; n++) {
        avgDx += dists[n].dx;
        avgDy += dists[n].dy;
        avgDist += dists[n].dist;
      }
      avgDx /= k;
      avgDy /= k;
      avgDist /= k;

      const grainAngle = Math.atan2(avgDy, avgDx);

      // Map avg distance to dash half-length
      // Shorter avg distance (denser) -> shorter dash, longer -> longer dash
      // Use a simple linear mapping based on expected spacing range
      const expectedMin = Math.sqrt((canvasW * canvasH) / pointCount) * 0.3;
      const expectedMax = Math.sqrt((canvasW * canvasH) / pointCount) * 2.0;
      const t = Math.max(0, Math.min(1, (avgDist - expectedMin) / (expectedMax - expectedMin)));
      const dashHalf = (minDashLen + t * (maxDashLen - minDashLen)) / 2;

      const cosA = Math.cos(grainAngle);
      const sinA = Math.sin(grainAngle);

      dashes.push({
        x1: pt.x - cosA * dashHalf,
        y1: pt.y - sinA * dashHalf,
        x2: pt.x + cosA * dashHalf,
        y2: pt.y + sinA * dashHalf,
      });
    }

    // ctx drawing
    const drawBase = () => {
      ctx.stroke(ctx.red(ctx.color(color)), ctx.green(ctx.color(color)), ctx.blue(ctx.color(color)), (opacity / 100) * 255);
      ctx.strokeWeight(strokeWeight);
      ctx.strokeCap(ctx.ROUND);
      ctx.noFill();
      for (const d of dashes) {
        ctx.line(d.x1, d.y1, d.x2, d.y2);
      }
    };

    applySymmetryDraw(ctx, symmetry, halfW, halfH, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);

    // SVG export — store elements
    this.svgElements = dashes.map(
      (d) =>
        `      <line x1="${d.x1.toFixed(2)}" y1="${d.y1.toFixed(2)}" x2="${d.x2.toFixed(2)}" y2="${d.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
    );
  }

  // svgElements already carry 6-space indentation; joining with '\n' preserves
  // the exact pre-migration SVG output. The base contentFor would add 4 extra
  // spaces per element (10 total), breaking byte-identity with the golden master.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
