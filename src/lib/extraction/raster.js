// Headless tile rasterizer + IoU — the honesty anchor for the EVAL gate (S12,
// issue #61; PRD #48 decision 10). The motif-overlap sub-score of fitEvaluator
// renders BOTH the extracted motif and a candidate parametric family into the
// SAME normalized cell frame and measures intersection-over-union of their ink.
//
// WHY THIS IS THE DISCRIMINATOR (advisor MAJOR + task "IoU is the honesty
// anchor"): symmetry + lattice can match while the actual ink is nothing like a
// star, so IoU must genuinely gate. That only works if both drawings are
// rasterized the SAME way into the SAME frame, and — the load-bearing choice —
// star LINEWORK is rasterized as THIN strokes. Thin strokes make star-vs-star
// coincide (high IoU) while star-vs-floral does not (low IoU): the overlap
// measures STRUCTURE, not area. Thickening strokes or flood-filling regions
// collapses IoU toward mere area coincidence and stops discriminating — so
// STROKE_RADIUS below is deliberately small and is the first knob to turn if a
// fixture ever scores wrong.
//
// Pure JS + typed arrays, worker/node/browser identical (no DOM, no canvas), so
// the whole EVAL runs client-side on the main thread (cheap: a ~64² grid over a
// handful of candidates).

import { flattenPathD } from '../patterns/ExtractedPatternGenerator';

/** Default raster grid resolution (px per side). */
export const RASTER_GRID = 64;

// Stroke half-width in GRID pixels. Small on purpose (see file header): this is
// what keeps IoU measuring structural coincidence rather than filled area.
const STROKE_RADIUS = 1;

/**
 * Rasterize a tile ({ width, height, fills:[{d}], strokes:[{d}] }) into a
 * binary ink grid of `grid`×`grid` cells. The tile's own [0,width]×[0,height]
 * box is mapped to the grid preserving aspect (fit inside, centered), so a
 * family generated at the same cell size and the extracted motif land in a
 * shared frame. Fills are scanline-filled (even-odd, matching the export's
 * fill-rule); strokes are drawn as thin polylines.
 *
 * @returns {Uint8Array} length grid*grid, 1 = ink.
 */
export function rasterizeTile(tile, { grid = RASTER_GRID, strokeRadius = STROKE_RADIUS } = {}) {
  const out = new Uint8Array(grid * grid);
  if (!tile) return out;
  const w = tile.width || 1;
  const h = tile.height || 1;
  // Fit the tile box into the grid preserving aspect, centered.
  const s = (grid - 1) / Math.max(w, h);
  const ox = (grid - 1 - w * s) / 2;
  const oy = (grid - 1 - h * s) / 2;
  const tx = (x) => x * s + ox;
  const ty = (y) => y * s + oy;

  const set = (gx, gy) => {
    if (gx >= 0 && gx < grid && gy >= 0 && gy < grid) out[gy * grid + gx] = 1;
  };

  // Fills: even-odd scanline over each path's flattened subpaths (holes survive).
  for (const { d } of tile.fills ?? []) {
    const subs = flattenPathD(d).map((sp) => sp.points.map(([x, y]) => [tx(x), ty(y)]));
    fillPolys(subs, grid, set);
    // Also stroke the outline thinly so a thin sliver fill still registers.
    for (const pts of subs) strokePolyline(pts, strokeRadius, set);
  }
  // Strokes: thin polylines (the centerline linework — see header).
  for (const { d } of tile.strokes ?? []) {
    for (const sp of flattenPathD(d)) {
      const pts = sp.points.map(([x, y]) => [tx(x), ty(y)]);
      strokePolyline(pts, strokeRadius, set, sp.closed);
    }
  }
  return out;
}

/** Even-odd scanline fill of a set of (already grid-space) subpath polygons. */
function fillPolys(subs, grid, set) {
  for (let gy = 0; gy < grid; gy++) {
    const yc = gy + 0.5;
    const xs = [];
    for (const pts of subs) {
      const n = pts.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        if (y1 === y2) continue;
        if ((yc >= y1 && yc < y2) || (yc >= y2 && yc < y1)) {
          xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.ceil(xs[k] - 0.5);
      const xb = Math.floor(xs[k + 1] - 0.5);
      for (let gx = xa; gx <= xb; gx++) set(gx, gy);
    }
  }
}

/** Stamp a filled disc of the given radius (grid px) at (gx,gy). */
function stampDisc(gx, gy, r, set) {
  const ir = Math.ceil(r);
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.25) set(gx + dx, gy + dy);
    }
  }
}

/** Draw a thin polyline (grid space) by stamping discs along each segment. */
function strokePolyline(pts, r, set, closed = false) {
  const n = pts.length;
  const segEnd = closed ? n : n - 1;
  for (let i = 0; i < segEnd; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stampDisc(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), r, set);
    }
  }
  if (n === 1) stampDisc(Math.round(pts[0][0]), Math.round(pts[0][1]), r, set);
}

/**
 * Intersection-over-union of two equal-length binary ink grids.
 * Empty ∪ empty → 0 (no evidence of overlap, never a spurious 1).
 */
export function iou(a, b) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai || bi) union++;
    if (ai && bi) inter++;
  }
  return union === 0 ? 0 : inter / union;
}
