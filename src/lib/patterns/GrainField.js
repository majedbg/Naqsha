import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class GrainField {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
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

    // Step 1 — Lloyd's Relaxation
    p.randomSeed(seed);

    // Place initial random points in [-halfW, halfW] x [-halfH, halfH]
    const points = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        x: p.random(-halfW, halfW),
        y: p.random(-halfH, halfH),
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
      const count = new Uint32Array(pointCount);

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

          sumX[bestIdx] += cx;
          sumY[bestIdx] += cy;
          count[bestIdx]++;
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

    // p5 drawing
    const drawBase = () => {
      p.stroke(p.red(p.color(color)), p.green(p.color(color)), p.blue(p.color(color)), (opacity / 100) * 255);
      p.strokeWeight(strokeWeight);
      p.strokeCap(p.ROUND);
      p.noFill();
      for (const d of dashes) {
        p.line(d.x1, d.y1, d.x2, d.y2);
      }
    };

    applySymmetryDraw(p, symmetry, halfW, halfH, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);

    // SVG export — store elements
    this.svgElements = dashes.map(
      (d) =>
        `      <line x1="${d.x1.toFixed(2)}" y1="${d.y1.toFixed(2)}" x2="${d.x2.toFixed(2)}" y2="${d.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
    );
  }

  toSVGGroup(layerId, color, opacity) {
    const params = this._lastParams || {};
    const symmetry = params.symmetry ?? 1;
    const cx = this._lastCx || 0;
    const cy = this._lastCy || 0;
    const pathsContent = this.svgElements.join('\n');
    return wrapSVGSymmetry(layerId, color, opacity, pathsContent, symmetry, cx, cy, params.startAngle || 0, params.offsetX || 0, params.offsetY || 0);
  }

  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}
