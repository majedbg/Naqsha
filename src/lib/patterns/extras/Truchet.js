import { Pattern } from '../drawingContext';
import { applySymmetryDraw } from '../symmetryUtils';
import { registerPattern } from '../../patternRegistry';

/**
 * Truchet tiling.
 *
 * A `tiles`×`tiles` grid of square cells spanning the canvas, laid out
 * origin-centered (like Grid). Each cell is randomly assigned one of two
 * orientations of a motif via the LAYER-SEEDED RNG (`ctx.random`, det:'seeded').
 *
 * tileSet selects the motif family:
 *   - 'arcs' (default): two quarter-circle arcs per cell, centered on a pair of
 *     opposite corners (radius = half the cell). orient ∈ {0,1} swaps which
 *     corner-pair is used, so the arcs join across tiles into flowing loops.
 *   - 'diagonals': a single diagonal line of the cell. orient ∈ {0,1} picks
 *     which diagonal.
 *   - 'triangles': one of two corner triangles filling half the cell.
 *
 * There is NO arc primitive in the drawing context, so each quarter-arc is
 * SAMPLED as a short polyline and emitted through beginShape/vertex/endShape
 * (canvas) and a matching <polyline> (SVG).
 *
 * ── One-RNG-pass canvas/SVG agreement ──────────────────────────────────────
 * `ctx.random` is called EXACTLY ONCE per tile, in a single pass that builds a
 * `tiles[]` array of { col, row, orient }. BOTH the svgElements strings AND the
 * drawBase canvas calls are then derived from that SAME array. drawBase never
 * touches ctx.random (which also matters because applySymmetryDraw runs
 * drawBase once per symmetry copy — pulling RNG there would desync everything).
 */
const ARC_SAMPLES = 16; // samples per quarter-arc

// Map a tileSet param (string or numeric index) to a canonical string.
const TILE_SETS = ['arcs', 'diagonals', 'triangles'];
function resolveTileSet(v) {
  if (typeof v === 'number') return TILE_SETS[Math.round(v)] || 'arcs';
  return TILE_SETS.includes(v) ? v : 'arcs';
}

// Sample a quarter-arc of `radius` centered at (ccx, ccy), sweeping the angle
// range [a0, a1] in ARC_SAMPLES steps. Returns an array of {x,y}.
function sampleArc(ccx, ccy, radius, a0, a1) {
  const pts = [];
  for (let s = 0; s <= ARC_SAMPLES; s++) {
    const a = a0 + (a1 - a0) * (s / ARC_SAMPLES);
    pts.push({ x: ccx + radius * Math.cos(a), y: ccy + radius * Math.sin(a) });
  }
  return pts;
}

// Build the list of polylines (each an array of {x,y}) for one tile, given its
// top-left corner (x0,y0), cell size, motif and orientation. For 'triangles'
// the returned entries are { tri:[p1,p2,p3] } instead of point arrays.
function tileShapes(tileSet, x0, y0, cell, orient) {
  const r = cell / 2;
  const xL = x0, xR = x0 + cell, yT = y0, yB = y0 + cell;
  const HP = Math.PI / 2;

  if (tileSet === 'diagonals') {
    // orient 0: top-left → bottom-right.  orient 1: bottom-left → top-right.
    return orient === 0
      ? [[{ x: xL, y: yT }, { x: xR, y: yB }]]
      : [[{ x: xL, y: yB }, { x: xR, y: yT }]];
  }

  if (tileSet === 'triangles') {
    // orient 0: top-left corner triangle.  orient 1: bottom-right corner.
    return orient === 0
      ? [{ tri: [{ x: xL, y: yT }, { x: xR, y: yT }, { x: xL, y: yB }] }]
      : [{ tri: [{ x: xR, y: yB }, { x: xR, y: yT }, { x: xL, y: yB }] }];
  }

  // 'arcs' — two quarter-circles centered on opposite corners.
  // orient 0: centers at top-left & bottom-right corners.
  // orient 1: centers at top-right & bottom-left corners.
  // Each arc sweeps the quarter facing INTO the cell.
  if (orient === 0) {
    // top-left corner (xL,yT): sweep 0 → HALF_PI (toward +x,+y inside cell)
    // bottom-right corner (xR,yB): sweep PI → 3PI/2 (toward −x,−y inside cell)
    return [
      sampleArc(xL, yT, r, 0, HP),
      sampleArc(xR, yB, r, Math.PI, Math.PI + HP),
    ];
  }
  // top-right corner (xR,yT): sweep HALF_PI → PI (toward −x,+y inside cell)
  // bottom-left corner (xL,yB): sweep 3PI/2 → 2PI (toward +x,−y inside cell)
  return [
    sampleArc(xR, yT, r, HP, Math.PI),
    sampleArc(xL, yB, r, Math.PI + HP, Math.PI * 2),
  ];
}

export default class Truchet extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    ctx.randomSeed(seed);
    ctx.noiseSeed(seed);

    const {
      tiles = 16,
      tileSet = 'arcs',
      strokeWeight = 1.0,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const set = resolveTileSet(tileSet);
    const filled = set === 'triangles';

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const cols = Math.max(1, Math.round(tiles));
    const rows = cols;
    const cell = Math.min(canvasW, canvasH) / cols;
    const totalW = cols * cell;
    const totalH = rows * cell;
    const ox = -totalW / 2; // origin-centered top-left x
    const oy = -totalH / 2;

    // ── ONE RNG PASS: choose orientation per tile exactly once ──────────────
    const tileList = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const orient = ctx.random() < 0.5 ? 0 : 1;
        tileList.push({ col, row, orient });
      }
    }

    // ── Derive BOTH renderers from the SAME tileList ────────────────────────
    // Expand each tile into its concrete shapes (point arrays / triangles).
    const shapes = [];
    for (const t of tileList) {
      const x0 = ox + t.col * cell;
      const y0 = oy + t.row * cell;
      for (const sh of tileShapes(set, x0, y0, cell, t.orient)) {
        shapes.push(sh);
      }
    }

    // SVG: one element per shape (1:1 with canvas shapes below).
    for (const sh of shapes) {
      if (sh.tri) {
        const [a, b, c] = sh.tri;
        this.svgElements.push(
          `<polygon points="${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}" fill="${color}" stroke="${color}" stroke-width="${strokeWeight}"/>`
        );
      } else {
        const pts = sh.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
        this.svgElements.push(
          `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWeight}" stroke-linecap="round"/>`
        );
      }
    }

    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);
      ctx.stroke(c);
      ctx.strokeWeight(strokeWeight);
      if (filled) {
        ctx.fill(c);
      } else {
        ctx.noFill();
      }

      // One beginShape/endShape (or triangle) per shape — 1:1 with svgElements.
      for (const sh of shapes) {
        if (sh.tri) {
          const [a, b, d] = sh.tri;
          ctx.triangle(a.x, a.y, b.x, b.y, d.x, d.y);
        } else {
          ctx.beginShape();
          for (const p of sh) ctx.vertex(p.x, p.y);
          ctx.endShape();
        }
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }
}

const DEFAULTS = {
  tiles: 16,
  tileSet: 0, // numeric index for the slider UI; 0 => 'arcs' (see resolveTileSet)
  strokeWeight: 1.0,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const PARAM_DEFS = [
  { key: 'tiles', label: 'Tiles', min: 6, max: 40, step: 1, tooltip: 'Grid resolution (cols ≈ rows).' },
  { key: 'tileSet', label: 'Tile Set', min: 0, max: 2, step: 1, tooltip: 'Motif family: 0 = arcs, 1 = diagonals, 2 = triangles.' },
  { key: 'strokeWeight', label: 'Stroke Weight', min: 0.1, max: 10, step: 0.1, tooltip: 'Line thickness.' },
  { key: 'symmetry', label: 'Symmetry', min: 1, max: 11, step: 1, tooltip: 'Radial copies (1 = none).' },
  { key: 'startAngle', label: 'Start Angle', min: 0, max: 360, step: 1, tooltip: 'Rotation offset in degrees.' },
  { key: 'offsetX', label: 'Offset X', min: -400, max: 400, step: 1, tooltip: 'Horizontal shift in pixels.' },
  { key: 'offsetY', label: 'Offset Y', min: -400, max: 400, step: 1, tooltip: 'Vertical shift in pixels.' },
];

registerPattern('truchet', Truchet, 'Truchet', DEFAULTS, PARAM_DEFS, { isAI: false });
