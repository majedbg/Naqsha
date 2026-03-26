import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const PRESETS = {
  spots:     { dA: 1.0, dB: 0.5, feed: 0.035, kill: 0.064 },
  stripes:   { dA: 1.0, dB: 0.5, feed: 0.060, kill: 0.062 },
  labyrinth: { dA: 1.0, dB: 0.5, feed: 0.037, kill: 0.060 },
  coral:     { dA: 1.0, dB: 0.5, feed: 0.055, kill: 0.062 },
};

export default class TuringDash {
  constructor() {
    this.svgElements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    const {
      preset = 'spots',
      simIterations = 80,
      gridRes = 150,
      targetPoints = 600,
      minSpacing = 8,
      minDashLen = 4,
      maxDashLen = 20,
      strokeWeight = 0.8,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const halfW = canvasW / 2;
    const halfH = canvasH / 2;

    const rng = mulberry32(seed);

    const { dA, dB, feed, kill } = PRESETS[preset] || PRESETS.spots;

    // ---- Step 1: Gray-Scott reaction-diffusion ----
    const N = gridRes;

    // Allocate grids
    let A = [];
    let B = [];
    let A2 = [];
    let B2 = [];
    for (let x = 0; x < N; x++) {
      A[x] = new Float64Array(N);
      B[x] = new Float64Array(N);
      A2[x] = new Float64Array(N);
      B2[x] = new Float64Array(N);
    }

    // Initialize A=1, B=0
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        A[x][y] = 1.0;
        B[x][y] = 0.0;
      }
    }

    // Seed B in a circular region near center
    const cg = Math.floor(N / 2);
    const seedRadius = Math.floor(N / 5);
    for (let x = cg - seedRadius; x <= cg + seedRadius; x++) {
      for (let y = cg - seedRadius; y <= cg + seedRadius; y++) {
        if (x >= 0 && x < N && y >= 0 && y < N) {
          const dx = x - cg;
          const dy = y - cg;
          if (dx * dx + dy * dy <= seedRadius * seedRadius) {
            B[x][y] = 1.0 + rng() * 0.1 - 0.05;
          }
        }
      }
    }

    // Run simulation
    for (let iter = 0; iter < simIterations; iter++) {
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          // Toroidal wrap
          const xp = (x + 1) % N;
          const xm = (x - 1 + N) % N;
          const yp = (y + 1) % N;
          const ym = (y - 1 + N) % N;

          const laplA = A[xm][y] + A[xp][y] + A[x][ym] + A[x][yp] - 4 * A[x][y];
          const laplB = B[xm][y] + B[xp][y] + B[x][ym] + B[x][yp] - 4 * B[x][y];
          const reaction = A[x][y] * B[x][y] * B[x][y];

          A2[x][y] = A[x][y] + dA * laplA - reaction + feed * (1 - A[x][y]);
          B2[x][y] = B[x][y] + dB * laplB + reaction - (kill + feed) * B[x][y];
        }
      }
      // Swap buffers
      const tmpA = A; A = A2; A2 = tmpA;
      const tmpB = B; B = B2; B2 = tmpB;
    }

    // Normalize B to [0, 1]
    let bMin = Infinity;
    let bMax = -Infinity;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        if (B[x][y] < bMin) bMin = B[x][y];
        if (B[x][y] > bMax) bMax = B[x][y];
      }
    }
    const bRange = bMax - bMin || 1;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        B[x][y] = (B[x][y] - bMin) / bRange;
      }
    }

    // Helper: sample B at canvas-relative coords (relative to center)
    function sampleB(px, py) {
      // Map canvas coords (-halfW..halfW, -halfH..halfH) to grid (0..N-1)
      const gx = ((px + halfW) / canvasW) * (N - 1);
      const gy = ((py + halfH) / canvasH) * (N - 1);
      const ix = Math.max(0, Math.min(N - 1, Math.round(gx)));
      const iy = Math.max(0, Math.min(N - 1, Math.round(gy)));
      return B[ix][iy];
    }

    // ---- Step 2: Weighted point placement (Poisson-ish) ----
    const accepted = [];
    const cellSize = minSpacing / Math.SQRT2;
    const gridW = Math.ceil(canvasW / cellSize);
    const gridH = Math.ceil(canvasH / cellSize);
    const spatialGrid = new Array(gridW * gridH).fill(-1);

    function gridIndex(px, py) {
      const col = Math.floor((px + halfW) / cellSize);
      const row = Math.floor((py + halfH) / cellSize);
      return row * gridW + col;
    }

    function tooClose(px, py) {
      const col = Math.floor((px + halfW) / cellSize);
      const row = Math.floor((py + halfH) / cellSize);
      const searchRadius = 2;
      for (let dr = -searchRadius; dr <= searchRadius; dr++) {
        for (let dc = -searchRadius; dc <= searchRadius; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= gridH || c < 0 || c >= gridW) continue;
          const idx = spatialGrid[r * gridW + c];
          if (idx >= 0) {
            const other = accepted[idx];
            const dx = px - other[0];
            const dy = py - other[1];
            if (dx * dx + dy * dy < minSpacing * minSpacing) return true;
          }
        }
      }
      return false;
    }

    const maxAttempts = 50 * targetPoints;
    let attempts = 0;
    while (accepted.length < targetPoints && attempts < maxAttempts) {
      attempts++;
      const px = rng() * canvasW - halfW;
      const py = rng() * canvasH - halfH;

      const bVal = sampleB(px, py);
      if (rng() > bVal) continue;
      if (tooClose(px, py)) continue;

      const i = accepted.length;
      accepted.push([px, py]);
      const gi = gridIndex(px, py);
      if (gi >= 0 && gi < spatialGrid.length) {
        spatialGrid[gi] = i;
      }
    }

    // ---- Step 3: Gradient-oriented dashes ----
    const dashes = [];
    for (let i = 0; i < accepted.length; i++) {
      const [px, py] = accepted[i];

      // Map to grid coords
      const gx = ((px + halfW) / canvasW) * (N - 1);
      const gy = ((py + halfH) / canvasH) * (N - 1);
      const ix = Math.max(1, Math.min(N - 2, Math.round(gx)));
      const iy = Math.max(1, Math.min(N - 2, Math.round(gy)));

      // Central differences for gradient
      const gxVal = B[ix + 1][iy] - B[ix - 1][iy];
      const gyVal = B[ix][iy + 1] - B[ix][iy - 1];
      const gradAngle = Math.atan2(gyVal, gxVal);

      // Perpendicular to gradient (along contour)
      const dashAngle = gradAngle + Math.PI / 2;

      // Dash length mapped from B value
      const bVal = B[ix][iy];
      const dashLen = minDashLen + bVal * (maxDashLen - minDashLen);
      const halfLen = dashLen / 2;

      const x1 = px - halfLen * Math.cos(dashAngle);
      const y1 = py - halfLen * Math.sin(dashAngle);
      const x2 = px + halfLen * Math.cos(dashAngle);
      const y2 = py + halfLen * Math.sin(dashAngle);

      dashes.push({ x1, y1, x2, y2 });
    }

    // ---- Build SVG elements (once, outside drawBase) ----
    this.svgElements = [];
    for (const d of dashes) {
      this.svgElements.push(
        `<line x1="${d.x1.toFixed(2)}" y1="${d.y1.toFixed(2)}" x2="${d.x2.toFixed(2)}" y2="${d.y2.toFixed(2)}" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
      );
    }

    // ---- Draw on p5 canvas ----
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
