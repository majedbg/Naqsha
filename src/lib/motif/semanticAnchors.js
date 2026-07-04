// Semantic anchor extractors — derive Anchors of the four-role taxonomy
// (Crossings / Edges / Tips / Cells; docs/motif-adorn-research.md §1 #13) from a
// pattern's OWN structural math, not from generic path sampling. Unlike
// sampleEdgeAnchors (anchors.js), which needs only a polyline, a semantic
// extractor knows a pattern's geometry and can name where its meaningful
// structures live.
//
// Contract: getSemanticAnchors(patternType, params, canvasW, canvasH) returns
// Anchor[] for pattern types with an extractor, or null for the rest (the
// caller then falls back to generic edge anchors). Deterministic: identical
// params ⇒ identical anchors. Pure ESM — no p5/DOM/React.
//
// ── GRID extractor ──────────────────────────────────────────────────────────
// Faithful to src/lib/patterns/Grid.js `generate()`:
//   • Line positions come from distribute(count, totalSpan) (Grid.js:49-61):
//     count+1 positions, eased by power (gamma from `nonLinear`) then gain
//     (k=3^`nonLinearGain`), mirrored about center, spanning [-totalSpan/2,
//     +totalSpan/2]. This module replicates that math EXACTLY (see distribute
//     below) so anchors track the pattern's real, possibly-nonuniform spacing.
//   • totalW = cols*spacing, totalH = rows*spacing (Grid.js:63-64).
//   • Vertical lines at x=xPositions, spanning y∈[-halfH,halfH]; horizontal at
//     y=yPositions, spanning x∈[-halfW,halfW]; halfW=totalW/2+margin,
//     halfH=totalH/2+margin (Grid.js:72-88). Params read: cols, rows, spacing,
//     nonLinear, nonLinearGain, margin, drawHorizontal, drawVertical, offsetX,
//     offsetY (same defaults as Grid.js).
//
// Grid draws in a CENTERED frame that is then translated by (cx+offsetX,
// cy+offsetY) via applySymmetryDraw / wrapSVGSymmetry (symmetryUtils.js). We
// emit anchors in WORLD (canvas-pixel) coords = centered + (cx+offsetX,
// cy+offsetY), because the placement engine's field mask samples
// field.sampleNorm(x/canvasW, y/canvasH) — only meaningful for x∈[0,canvasW].
//
// DELIBERATE LIMITATIONS (documented, honesty-gated):
//   • symmetry>1 copies and startAngle rotation are NOT replicated — anchors
//     describe the single base copy at the default orientation. (A rotated /
//     N-fold layout would need the same transform applied per copy; deferred.)
//   • jitter>0 perturbs each drawn line by an RNG amount this extractor cannot
//     reproduce without the pattern's RNG stream. Anchors sit on the IDEAL
//     (pre-jitter) lattice; they drift from the drawing by up to ±jitter px.
//     The task explicitly greenlights degrade-and-document for jittered
//     variants; the divergence guard runs with jitter=0 for exact coincidence.
//   • warp modulation (params.modulation.channel==='warp') displaces interior
//     line nodes by an arbitrary field, so interior crossings can diverge
//     arbitrarily far from the straight lattice. We CANNOT verify coincidence,
//     so we return null (never ship anchors we can't tie to the drawing).

import { anchorId } from './anchors.js';

const HALF_PI = Math.PI / 2;

/**
 * Replicate Grid.js distribute() EXACTLY (Grid.js:43-61): count+1 positions
 * across [-totalSpan/2, +totalSpan/2], eased by power (gamma) then gain (k).
 * @param {number} count
 * @param {number} totalSpan
 * @param {number} gamma
 * @param {number} gainK
 * @returns {number[]}
 */
function distribute(count, totalSpan, gamma, gainK) {
  const gain = (x, k) => {
    const a = 0.5 * Math.pow(2 * (x < 0.5 ? x : 1 - x), k);
    return x < 0.5 ? a : 1 - a;
  };
  const positions = [];
  for (let i = 0; i <= count; i++) {
    const t = count > 0 ? i / count : 0.5;
    const centered = t - 0.5;
    const sign = centered >= 0 ? 1 : -1;
    const mag = Math.abs(centered) * 2;
    const eased = gain(Math.pow(mag, gamma), gainK);
    const tt = 0.5 + sign * eased * 0.5;
    positions.push(-totalSpan / 2 + tt * totalSpan);
  }
  return positions;
}

/**
 * Grid semantic extractor. See module header for the full role/limitation
 * contract. Emission order is fixed (crossings, edges, tips, cells) for
 * determinism.
 * @returns {Array<object>|null}
 */
function gridAnchors(params, canvasW, canvasH) {
  const {
    cols = 12,
    rows = 12,
    spacing = 40,
    nonLinear = 0,
    nonLinearGain = 0,
    margin = 20,
    drawHorizontal = 1,
    drawVertical = 1,
    offsetX = 0,
    offsetY = 0,
  } = params || {};

  // Warp displaces interior nodes off the straight lattice by an arbitrary
  // field — unverifiable, so refuse to emit (see module header).
  const mod = params && params.modulation;
  if (mod && mod.channel === 'warp' && mod.field) return null;

  const hasV = drawVertical >= 0.5;
  const hasH = drawHorizontal >= 0.5;
  if (!hasV && !hasH) return []; // nothing drawn ⇒ no anchors.

  const gamma = nonLinear >= 0 ? 1 + nonLinear : 1 / (1 + Math.abs(nonLinear));
  const gainK = Math.pow(3, nonLinearGain);

  const totalW = cols * spacing;
  const totalH = rows * spacing;
  const xPositions = distribute(cols, totalW, gamma, gainK); // cols+1
  const yPositions = distribute(rows, totalH, gamma, gainK); // rows+1
  const halfW = totalW / 2 + margin;
  const halfH = totalH / 2 + margin;

  // World-space origin (base copy; symmetry/rotation not applied — see header).
  const ox = canvasW / 2 + offsetX;
  const oy = canvasH / 2 + offsetY;

  const anchors = [];

  // ── CROSSINGS: every (vertical, horizontal) line intersection. tangent=+x,
  //    normal=+y (fixed convention). Interior crossings (strictly inside the
  //    lattice, not on its outer boundary row/col) are junctions, so the
  //    placement engine's junction policy can act on them. Requires both
  //    families drawn (an intersection needs one of each).
  if (hasV && hasH) {
    for (let i = 0; i < xPositions.length; i++) {
      for (let j = 0; j < yPositions.length; j++) {
        const interior = i > 0 && i < cols && j > 0 && j < rows;
        anchors.push({
          id: anchorId('crossing', i, j),
          role: 'crossing',
          x: xPositions[i] + ox,
          y: yPositions[j] + oy,
          tangent: 0,
          normal: HALF_PI,
          s: 0,
          meta: { row: j, col: i, junction: interior },
        });
      }
    }
  }

  // ── EDGES: midpoint of each inter-crossing segment along a grid line.
  //    tangent = line direction; normal = tangent + PI/2 (fixed convention).
  //    s = arc length from the line's start endpoint to the midpoint. "Between
  //    crossings" needs the perpendicular family to define the crossings, so
  //    vertical-line edges require horizontal lines, and vice versa.
  if (hasV && hasH) {
    // Vertical-line edges: line i, segment between rows j and j+1.
    for (let i = 0; i < xPositions.length; i++) {
      const x = xPositions[i] + ox;
      for (let j = 0; j < yPositions.length - 1; j++) {
        const midCentered = (yPositions[j] + yPositions[j + 1]) / 2;
        anchors.push({
          id: anchorId('edge', 'v', i, j),
          role: 'edge',
          x,
          y: midCentered + oy,
          tangent: HALF_PI, // line runs -halfH → +halfH (increasing y)
          normal: HALF_PI + HALF_PI, // = PI
          s: midCentered + halfH, // arc length from top endpoint (y=-halfH)
          meta: { orientation: 'v', line: i, segment: j },
        });
      }
    }
    // Horizontal-line edges: line j, segment between cols i and i+1.
    for (let j = 0; j < yPositions.length; j++) {
      const y = yPositions[j] + oy;
      for (let i = 0; i < xPositions.length - 1; i++) {
        const midCentered = (xPositions[i] + xPositions[i + 1]) / 2;
        anchors.push({
          id: anchorId('edge', 'h', j, i),
          role: 'edge',
          x: midCentered + ox,
          y,
          tangent: 0, // line runs -halfW → +halfW (increasing x)
          normal: HALF_PI,
          s: midCentered + halfW, // arc length from left endpoint (x=-halfW)
          meta: { orientation: 'h', line: j, segment: i },
        });
      }
    }
  }

  // ── TIPS: the two actual endpoints of every drawn line (verticals stop at
  //    y=±halfH, horizontals at x=±halfW). NOTE: these are the REAL line ends,
  //    not the abstract bounding-box corners (±halfW,±halfH) — no line ever
  //    reaches those, so anchoring there would be a fiction. tangent = line
  //    direction; normal = outward along the line axis (away from center); s =
  //    arc length (0 at the start endpoint, full length at the end).
  if (hasV) {
    for (let i = 0; i < xPositions.length; i++) {
      const x = xPositions[i] + ox;
      // end 0 = top (y=-halfH): outward is -y ⇒ normal -PI/2, s=0.
      anchors.push({
        id: anchorId('tip', 'v', i, 0),
        role: 'tip',
        x,
        y: -halfH + oy,
        tangent: HALF_PI,
        normal: -HALF_PI,
        s: 0,
        meta: { orientation: 'v', line: i, end: 0 },
      });
      // end 1 = bottom (y=+halfH): outward is +y ⇒ normal +PI/2, s=length.
      anchors.push({
        id: anchorId('tip', 'v', i, 1),
        role: 'tip',
        x,
        y: halfH + oy,
        tangent: HALF_PI,
        normal: HALF_PI,
        s: 2 * halfH,
        meta: { orientation: 'v', line: i, end: 1 },
      });
    }
  }
  if (hasH) {
    for (let j = 0; j < yPositions.length; j++) {
      const y = yPositions[j] + oy;
      // end 0 = left (x=-halfW): outward is -x ⇒ normal PI, s=0.
      anchors.push({
        id: anchorId('tip', 'h', j, 0),
        role: 'tip',
        x: -halfW + ox,
        y,
        tangent: 0,
        normal: Math.PI,
        s: 0,
        meta: { orientation: 'h', line: j, end: 0 },
      });
      // end 1 = right (x=+halfW): outward is +x ⇒ normal 0, s=length.
      anchors.push({
        id: anchorId('tip', 'h', j, 1),
        role: 'tip',
        x: halfW + ox,
        y,
        tangent: 0,
        normal: 0,
        s: 2 * halfW,
        meta: { orientation: 'h', line: j, end: 1 },
      });
    }
  }

  // ── CELLS: center of each grid cell (bounded by x-lines i,i+1 and y-lines
  //    j,j+1). A filled region, so tangent/normal follow the crossing
  //    convention (tangent=+x, normal=+y); s=0. Requires both families.
  if (hasV && hasH) {
    for (let i = 0; i < xPositions.length - 1; i++) {
      const cxCell = (xPositions[i] + xPositions[i + 1]) / 2 + ox;
      for (let j = 0; j < yPositions.length - 1; j++) {
        const cyCell = (yPositions[j] + yPositions[j + 1]) / 2 + oy;
        anchors.push({
          id: anchorId('cell', i, j),
          role: 'cell',
          x: cxCell,
          y: cyCell,
          tangent: 0,
          normal: HALF_PI,
          s: 0,
          meta: { row: j, col: i },
        });
      }
    }
  }

  return anchors;
}

/**
 * Return semantic anchors for a pattern, or null when no extractor exists (the
 * caller falls back to generic edge anchors from anchors.js).
 * @param {string} patternType
 * @param {object} params
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Array<object>|null}
 */
export function getSemanticAnchors(patternType, params, canvasW, canvasH) {
  switch (patternType) {
    case 'grid':
      return gridAnchors(params, canvasW, canvasH);
    // Extractors for these hosts are deferred to later slices.
    case 'voronoi':
    case 'spiral':
    case 'recursive':
    default:
      return null;
  }
}
