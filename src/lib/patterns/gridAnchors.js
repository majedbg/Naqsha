/**
 * gridAnchors — the pattern-owned, RNG-injected core of the Grid's role-tagged
 * anchor set (the four-role taxonomy: Crossings / Edges / Tips / Cells; see
 * docs/motif-adorn-research.md §1 #13).
 *
 * This is the SINGLE source of grid anchors, consumed by BOTH:
 *   - the motif seam (semanticAnchors → placementEngine): world-translates each
 *     anchor by (canvasW/2, canvasH/2) and stamps a motif at it.
 *   - the lattice seam (latticeForLayer → ExtractedPatternGenerator): consumes
 *     the centre-relative crossings directly as placement nodes.
 *
 * Both must land on the grid's REAL geometry — post-distribution, post-jitter,
 * and replicated across radial-symmetry copies — so the anchors are built from
 * `gridLinePositions` (the shared RNG-injected line-layout core) and the SAME
 * translate-then-rotate transform `applySymmetryDraw` / `latticeForLayer` use.
 * The rotation arithmetic below is character-for-character identical to
 * latticeForLayer.js:83-84 so `role:'crossing'` anchors are BYTE-IDENTICAL to
 * that module's nodes (pinned by the bridge-invariant test) — this is the whole
 * point of the seam: one geometry, two consumers, no drift.
 *
 * Coordinate frame: CENTRE-RELATIVE (origin-centred), offsets folded in but NOT
 * rotated (identical for every copy — matching applySymmetryDraw's
 * translate(cx+offsetX, cy+offsetY); rotate(θ)). The motif consumer adds the
 * canvas centre later; the lattice consumer uses the centred coords as-is.
 *
 * Pure + canvas-independent + no p5/DOM/React. The RNG is caller-injected (the
 * caller passes makeP5Random(seed)); the core never creates its own RNG and
 * never adds its own jitter draw — `gridLinePositions` owns the jitter stream,
 * called ONCE and reused for every role and every symmetry copy (each copy is
 * the SAME jittered lattice, rotated).
 */

import { gridLinePositions } from './gridGeometry';
import { toSymmetryCount } from './symmetryUtils';
import { anchorId } from '../motif/anchors.js';

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/**
 * @typedef {object} Anchor
 * @property {string} id      deterministic, unique across copies (…:copy).
 * @property {'crossing'|'edge'|'tip'|'cell'} role
 * @property {number} x        centre-relative px.
 * @property {number} y        centre-relative px.
 * @property {number} tangent  radians, rotated with the copy angle θ.
 * @property {number} normal   radians, rotated with the copy angle θ.
 * @property {number} s        role-specific scalar (arc length / 0).
 * @property {object} meta      role-specific fields + { copy, theta }.
 */

/**
 * Build the Grid's role-tagged anchors in the centre-relative frame, with
 * offsets folded in and radial-symmetry copies applied.
 *
 * Emission is grouped by role (crossings, then edges, then tips, then cells);
 * within each role the outer loop is the symmetry copy k, matching
 * latticeForLayer's k-outer expansion. Filtering the result for
 * `role:'crossing'` therefore yields the exact node order (k, i, j) that
 * latticeForLayer produces — the bridge invariant.
 *
 * @param {object} params - grid params (cols, rows, spacing, nonLinear,
 *   nonLinearGain, jitter, margin, symmetry, startAngle, offsetX, offsetY,
 *   drawHorizontal, drawVertical, modulation). Same defaults as
 *   semanticAnchors.gridAnchors / latticeForLayer.
 * @param {(min:number, max:number) => number} rng - p5-compatible random; the
 *   caller injects makeP5Random(seed). MUST be fresh (undrawn) so the jitter
 *   stream matches the pattern's / latticeForLayer's reconstruction.
 * @param {object} [opts] - reserved for future use; currently unused.
 * @returns {Array<Anchor>|null} anchors, or `null` for warp modulation (an
 *   arbitrary field displaces interior nodes off the lattice — unverifiable),
 *   or `[]` when nothing is drawn.
 */
export function gridAnchorsCentered(params, rng, opts = {}) {
  void opts; // reserved.
  const {
    cols = 12,
    rows = 12,
    margin = 20,
    symmetry = 1,
    startAngle = 0, // degrees, matching Grid's param convention.
    offsetX = 0,
    offsetY = 0,
    drawHorizontal = 1,
    drawVertical = 1,
  } = params || {};

  // Warp displaces interior nodes off the straight lattice by an arbitrary
  // field — unverifiable, so refuse to emit (mirrors semanticAnchors line 102).
  // Checked BEFORE gridLinePositions so early-return paths draw no randomness.
  const mod = params && params.modulation;
  if (mod && mod.channel === 'warp' && mod.field) return null;

  const hasV = drawVertical >= 0.5;
  const hasH = drawHorizontal >= 0.5;
  if (!hasV && !hasH) return []; // nothing drawn ⇒ no anchors.

  // Reconstruct the grid's exact jittered line positions (origin-centred),
  // consuming the injected rng ONCE. Reused for every role and every copy.
  const { xJittered, yJittered, totalW, totalH } = gridLinePositions(params, rng);
  const halfW = totalW / 2 + margin;
  const halfH = totalH / 2 + margin;

  // Symmetry copies: copy k is rotated by θ = 2π·k/n + startAngle about the
  // (offset) centre. Precompute { θ, cos, sin } per copy with the SAME formula
  // latticeForLayer uses (theta = (2*Math.PI*k)/n + startRad) so cos/sin — and
  // therefore the rotated crossings — come out bit-identical to that module.
  const n = toSymmetryCount(symmetry);
  // Only suffix ids with the copy index when there is more than one copy: a
  // single-copy grid keeps the pre-refactor ids (`crossing:i:j`, `edge:v:i:j`,
  // …) so id-keyed override persistence for the sym=1 corpus stays stable.
  const suffixCopy = n > 1;
  const startRad = (startAngle * Math.PI) / 180;
  const copies = [];
  for (let k = 0; k < n; k++) {
    const theta = (TWO_PI * k) / n + startRad;
    copies.push({ k, theta, cos: Math.cos(theta), sin: Math.sin(theta) });
  }

  const anchors = [];

  /**
   * Push one anchor: transform the pre-offset centred point (px,py) by copy
   * `c`'s (θ, offset) and add base tangent/normal + θ. The rotation is written
   * inline and operand-order-identical to latticeForLayer.js:83-84 —
   * `offsetX + px*cos - py*sin` — so crossings stay byte-identical. Do NOT
   * refactor into a matrix helper or reorder these products.
   *
   * Id copy-suffix is CONDITIONAL on the symmetry count: when n===1 the id has
   * NO `:copy` suffix (byte-identical to the pre-refactor ids
   * `anchorId('crossing', i, j)` etc., so the sym=1 corpus keeps stable,
   * id-keyed override persistence). When n>1 EVERY copy — including k=0 —
   * carries `:k`, so the base copy never collides with a sym=1 id.
   * @param {string} role
   * @param {Array<string|number>} idParts - id parts BEFORE the copy suffix.
   * @param {number} px - pre-offset centred x (from jittered positions / extents).
   * @param {number} py - pre-offset centred y.
   * @param {number} baseTangent - un-rotated tangent (radians).
   * @param {number} baseNormal - un-rotated normal (radians).
   * @param {number} s - role-specific scalar.
   * @param {object} meta - role-specific meta (copy/theta appended here).
   * @param {{k:number, theta:number, cos:number, sin:number}} c - copy transform.
   */
  function push(role, idParts, px, py, baseTangent, baseNormal, s, meta, c) {
    anchors.push({
      id: suffixCopy ? anchorId(role, ...idParts, c.k) : anchorId(role, ...idParts),
      role,
      x: offsetX + px * c.cos - py * c.sin,
      y: offsetY + px * c.sin + py * c.cos,
      tangent: baseTangent + c.theta,
      normal: baseNormal + c.theta,
      s,
      meta: { ...meta, copy: c.k, theta: c.theta },
    });
  }

  // ── CROSSINGS: every (vertical, horizontal) line intersection. Base
  //    tangent=+x (0), normal=+y (π/2). Interior crossings (strictly inside the
  //    lattice, not on its outer boundary row/col) are junctions. Requires both
  //    families drawn (an intersection needs one of each). k-outer / i / j —
  //    matching latticeForLayer's node order (the bridge invariant).
  if (hasV && hasH) {
    for (const c of copies) {
      for (let i = 0; i < xJittered.length; i++) {
        for (let j = 0; j < yJittered.length; j++) {
          const interior = i > 0 && i < cols && j > 0 && j < rows;
          push(
            'crossing',
            [i, j],
            xJittered[i],
            yJittered[j],
            0,
            HALF_PI,
            0,
            { row: j, col: i, junction: interior },
            c,
          );
        }
      }
    }
  }

  // ── EDGES: midpoint of each inter-crossing segment along a grid line. Base
  //    tangent = line direction; normal = tangent + π/2. s = arc length from the
  //    line's start endpoint to the midpoint (uses halfH / halfW). "Between
  //    crossings" needs the perpendicular family, so requires both.
  if (hasV && hasH) {
    for (const c of copies) {
      // Vertical-line edges: line i, segment between rows j and j+1.
      for (let i = 0; i < xJittered.length; i++) {
        for (let j = 0; j < yJittered.length - 1; j++) {
          const midCentered = (yJittered[j] + yJittered[j + 1]) / 2;
          push(
            'edge',
            ['v', i, j],
            xJittered[i],
            midCentered,
            HALF_PI, // line runs -halfH → +halfH (increasing y)
            HALF_PI + HALF_PI, // = π
            midCentered + halfH, // arc length from top endpoint (y=-halfH)
            { orientation: 'v', line: i, segment: j },
            c,
          );
        }
      }
      // Horizontal-line edges: line j, segment between cols i and i+1.
      for (let j = 0; j < yJittered.length; j++) {
        for (let i = 0; i < xJittered.length - 1; i++) {
          const midCentered = (xJittered[i] + xJittered[i + 1]) / 2;
          push(
            'edge',
            ['h', j, i],
            midCentered,
            yJittered[j],
            0, // line runs -halfW → +halfW (increasing x)
            HALF_PI,
            midCentered + halfW, // arc length from left endpoint (x=-halfW)
            { orientation: 'h', line: j, segment: i },
            c,
          );
        }
      }
    }
  }

  // ── TIPS: the two REAL endpoints of every drawn line (verticals stop at
  //    y=±halfH, horizontals at x=±halfW — NOT the abstract bbox corners).
  //    Base tangent = line direction; normal = outward along the line axis; s =
  //    arc length (0 at the start endpoint, full length at the end). Vertical
  //    tips need hasV, horizontal tips need hasH.
  if (hasV) {
    for (const c of copies) {
      for (let i = 0; i < xJittered.length; i++) {
        // end 0 = top (y=-halfH): outward is -y ⇒ normal -π/2, s=0.
        push('tip', ['v', i, 0], xJittered[i], -halfH, HALF_PI, -HALF_PI, 0, { orientation: 'v', line: i, end: 0 }, c);
        // end 1 = bottom (y=+halfH): outward is +y ⇒ normal +π/2, s=length.
        push('tip', ['v', i, 1], xJittered[i], halfH, HALF_PI, HALF_PI, 2 * halfH, { orientation: 'v', line: i, end: 1 }, c);
      }
    }
  }
  if (hasH) {
    for (const c of copies) {
      for (let j = 0; j < yJittered.length; j++) {
        // end 0 = left (x=-halfW): outward is -x ⇒ normal π, s=0.
        push('tip', ['h', j, 0], -halfW, yJittered[j], 0, Math.PI, 0, { orientation: 'h', line: j, end: 0 }, c);
        // end 1 = right (x=+halfW): outward is +x ⇒ normal 0, s=length.
        push('tip', ['h', j, 1], halfW, yJittered[j], 0, 0, 2 * halfW, { orientation: 'h', line: j, end: 1 }, c);
      }
    }
  }

  // ── CELLS: center of each grid cell (bounded by x-lines i,i+1 and y-lines
  //    j,j+1). A filled region, so base tangent=+x (0), normal=+y (π/2); s=0.
  //    Requires both families.
  if (hasV && hasH) {
    for (const c of copies) {
      for (let i = 0; i < xJittered.length - 1; i++) {
        const cxCell = (xJittered[i] + xJittered[i + 1]) / 2;
        for (let j = 0; j < yJittered.length - 1; j++) {
          const cyCell = (yJittered[j] + yJittered[j + 1]) / 2;
          push('cell', [i, j], cxCell, cyCell, 0, HALF_PI, 0, { row: j, col: i }, c);
        }
      }
    }
  }

  return anchors;
}

export default gridAnchorsCentered;
