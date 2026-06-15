import { Pattern } from './drawingContext';
import { applySymmetryDraw } from './symmetryUtils';

/**
 * CirclePacking — a seed-deterministic random circle packing, drawn as circle
 * outlines for a pen-plotter / vinyl-cutter.
 *
 * Algorithm (centered at origin):
 *   The region spans the canvas centered at (0,0):
 *     rectangle = [-w/2, w/2] × [-h/2, h/2]
 *     circle    = disc of radius min(w,h)/2 centered at origin
 *   For `attempts` tries we pick ONE random candidate point inside the boundary
 *   and compute the largest radius r in [minRadius, maxRadius] that keeps the
 *   circle inside the boundary AND clear of every already-placed circle:
 *     r = min(maxRadius, distToBoundary, min over placed of (centerDist - theirR))
 *   If r >= minRadius the circle is placed. A coarse spatial grid accelerates the
 *   overlap query so the default `attempts` stays well under ~1s.
 *
 * Non-overlap + in-boundary are guaranteed BY CONSTRUCTION: r never exceeds the
 * distance to the boundary nor the gap to any neighbor, so placed circles are at
 * worst tangent and never cross the region edge.
 *
 * RNG discipline: ALL randomness happens in the packing pass (the only
 * ctx.random calls). Candidate generation never depends on placement state, so:
 *   - determinism holds for a fixed seed,
 *   - attempts=A is a clean RNG prefix of attempts=2A (more attempts → more or
 *     equal circles, monotone),
 *   - every render mode packs the IDENTICAL circle set for a fixed seed; the
 *     mode only changes how those circles are emitted.
 *
 * The circles (and any link lines / nested rings) are built ONCE in absolute,
 * origin-centered coords. `drawBase` replays them via `ctx` and the SVG strings
 * are emitted from the same arrays, so canvas == SVG. This pattern has NO
 * symmetry control — symmetry is hardcoded to 1.
 */
export default class CirclePacking extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    ctx.randomSeed(seed);
    this.svgElements = [];

    const {
      boundary = 'rectangle',
      render = 'outlines',
      minRadius = 4,
      maxRadius = 60,
      attempts = 2000,
      linkDistance = 40,
      ringCount = 3,
      strokeWeight = 0.6,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params || {};

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const halfW = canvasW / 2;
    const halfH = canvasH / 2;
    const discR = Math.min(canvasW, canvasH) / 2;

    const rMin = Math.max(0.0001, minRadius);
    const rMax = Math.max(rMin, maxRadius);
    const tries = Math.max(0, Math.round(attempts));
    const isDisc = boundary === 'circle';

    // --- Spatial grid for fast neighbor queries -------------------------------
    // Cell size = the largest placeable circle's diameter, so any circle that
    // could conflict with a candidate lives in the 3×3 block of cells around it.
    const cellSize = Math.max(1, rMax * 2);
    const gridCols = Math.max(1, Math.ceil(canvasW / cellSize) + 1);
    const gridRows = Math.max(1, Math.ceil(canvasH / cellSize) + 1);
    const grid = new Array(gridCols * gridRows);
    const cellOf = (x, y) => {
      // Origin-centered world → grid indices (clamped).
      let gcx = Math.floor((x + halfW) / cellSize);
      let gcy = Math.floor((y + halfH) / cellSize);
      if (gcx < 0) gcx = 0; else if (gcx >= gridCols) gcx = gridCols - 1;
      if (gcy < 0) gcy = 0; else if (gcy >= gridRows) gcy = gridRows - 1;
      return gcy * gridCols + gcx;
    };

    const placed = []; // { x, y, r }

    // --- Packing pass (the ONLY randomness in this pattern) -------------------
    for (let t = 0; t < tries; t++) {
      // One candidate point inside the boundary. Draw count per attempt is FIXED
      // (exactly two ctx.random calls), so the RNG stream is a clean function of
      // `t` — never of placement state or render mode.
      let px;
      let py;
      if (isDisc) {
        // Uniform inside the disc: r = R*sqrt(u), θ = 2π*u2 (no rejection).
        const rr = discR * Math.sqrt(ctx.random());
        const th = ctx.random() * Math.PI * 2;
        px = Math.cos(th) * rr;
        py = Math.sin(th) * rr;
      } else {
        px = ctx.random(-halfW, halfW);
        py = ctx.random(-halfH, halfH);
      }

      // Distance from the candidate to the boundary (how big it could grow
      // before touching the region edge).
      let distToBoundary;
      if (isDisc) {
        distToBoundary = discR - Math.hypot(px, py);
      } else {
        distToBoundary = Math.min(halfW - Math.abs(px), halfH - Math.abs(py));
      }
      if (distToBoundary <= rMin) continue; // can't even fit the smallest circle

      // Largest radius that stays inside the boundary and clear of neighbors.
      let r = Math.min(rMax, distToBoundary);

      // Query the 3×3 grid block around the candidate.
      const gcx = Math.min(gridCols - 1, Math.max(0, Math.floor((px + halfW) / cellSize)));
      const gcy = Math.min(gridRows - 1, Math.max(0, Math.floor((py + halfH) / cellSize)));
      let blocked = false;
      for (let dy = -1; dy <= 1 && !blocked; dy++) {
        const yy = gcy + dy;
        if (yy < 0 || yy >= gridRows) continue;
        for (let dx = -1; dx <= 1 && !blocked; dx++) {
          const xx = gcx + dx;
          if (xx < 0 || xx >= gridCols) continue;
          const bucket = grid[yy * gridCols + xx];
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const o = bucket[k];
            const gap = Math.hypot(px - o.x, py - o.y) - o.r;
            if (gap < r) {
              r = gap;
              if (r <= rMin) { blocked = true; break; }
            }
          }
        }
      }

      if (r >= rMin) {
        const circle = { x: px, y: py, r };
        placed.push(circle);
        const ci = cellOf(px, py);
        let bucket = grid[ci];
        if (!bucket) { bucket = []; grid[ci] = bucket; }
        bucket.push(circle);
      }
    }

    // --- Build emit geometry from the packed set (NO randomness below) --------
    // outlineCircles: every render mode draws these (or, for nested, a stepped
    // family of them). links adds connector lines.
    const outCircles = []; // { x, y, r }
    const lines = [];      // { x1, y1, x2, y2 }

    const rings = Math.max(2, Math.round(ringCount));

    for (let i = 0; i < placed.length; i++) {
      const c = placed[i];
      if (render === 'nested') {
        // `ringCount` concentric outlines stepping from the full radius inward.
        // Step so the outermost ring == c.r and the innermost is a small core.
        for (let s = 0; s < rings; s++) {
          const rr = c.r * (1 - s / rings);
          if (rr > 0) outCircles.push({ x: c.x, y: c.y, r: rr });
        }
      } else {
        outCircles.push({ x: c.x, y: c.y, r: c.r });
      }
    }

    if (render === 'links') {
      // Connectors between near-tangent neighbors: center-distance is within
      // linkDistance of touching, i.e. dist < linkDistance + (rA + rB).
      for (let i = 0; i < placed.length; i++) {
        const a = placed[i];
        for (let j = i + 1; j < placed.length; j++) {
          const b = placed[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < linkDistance + a.r + b.r) {
            lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
          }
        }
      }
    }

    // --- Emit SVG (origin-centered; the group wrapper translates/rotates) -----
    const f = (n) => (Math.round(n * 100) / 100).toString();
    for (const l of lines) {
      this.svgElements.push(
        `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(l.x2)}" y2="${f(l.y2)}" stroke="${color}" stroke-width="${strokeWeight}"/>`
      );
    }
    for (const c of outCircles) {
      this.svgElements.push(
        `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.r)}" stroke="${color}" stroke-width="${strokeWeight}" fill="none"/>`
      );
    }

    const drawBase = () => {
      const col = ctx.color(color);
      col.setAlpha(Math.round((opacity / 100) * 255));
      ctx.noFill();
      ctx.stroke(col);
      ctx.strokeWeight(strokeWeight);
      for (const l of lines) {
        ctx.line(l.x1, l.y1, l.x2, l.y2);
      }
      for (const c of outCircles) {
        // p5 ellipse takes diameters; SVG <circle r> is the radius.
        ctx.ellipse(c.x, c.y, c.r * 2, c.r * 2);
      }
    };

    // Symmetry hardcoded to 1 (this pattern has no symmetry control).
    applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  // One element per circle/line, joined plainly (mirrors ModuleGrid). toSVGGroup
  // is inherited and wraps with wrapSVGSymmetry(symmetry || 1, ...) → symmetry
  // defaults to 1 since there is no `symmetry` param.
  contentFor() {
    return this.svgElements.join('\n');
  }
}
