/**
 * latticeForLayer — build the placement LATTICE a Grid guide provides to a
 * motif target (the 'lattice' modulation channel).
 *
 * The twin of fieldRegistry's `fieldForLayer`, but for a DISCRETE placement set
 * rather than a continuous scalar field. A Grid guide's value as a lattice is
 * the absolute positions of its line INTERSECTIONS — post-distribution,
 * post-jitter, and replicated across its radial-symmetry copies — each carrying
 * its copy's rotation so a stamped motif can rotate with the symmetry
 * (kaleidoscope). A motif consumer (ExtractedPatternGenerator) stamps its tile
 * at each node; the grid's jitter then "moves" the motifs and its symmetry
 * "duplicates" them, for free, from ONE shared array.
 *
 * Pure + canvas-independent (matching fieldForLayer): nodes are expressed
 * RELATIVE TO THE CANVAS CENTRE (x,y in px, angle in radians). The consumer,
 * which knows canvasW/canvasH, adds (canvasW/2, canvasH/2) to land absolute —
 * and expands ONCE, caching the array so its canvas draw and SVG export share
 * identical coordinates (canvas == SVG).
 *
 * Jitter parity: the grid computes jitter via live p5 `ctx.random` seeded with
 * its layer seed. `makeP5Random(seed)` reproduces that stream byte-for-byte
 * (see rng.js), so nodes sit on the grid's REAL, jittered crossings — not an
 * independent random field.
 */
import { gridLinePositions } from '../patterns/gridGeometry';
import { toSymmetryCount } from '../patterns/symmetryUtils';
import { makeP5Random } from '../patterns/rng';

/**
 * Can this layer act as a lattice guide? Only the Grid pattern today.
 * @param {object} layer
 * @returns {boolean}
 */
export function canProduceLattice(layer) {
  return layer?.patternType === 'grid';
}

/**
 * Build the canvas-centre-relative node set for a Grid guide, or null if the
 * layer is not a grid (e.g. a non-grid guide mistakenly mapped with the lattice
 * channel — the consumer then simply renders nothing).
 *
 * @param {object} guide - the guide layer (expects patternType 'grid').
 * @returns {{ nodes: { x: number, y: number, angle: number }[], cellSize: number }
 *   | null} `nodes` are relative to the canvas centre; total = N·(cols+1)·(rows+1).
 *   `cellSize` is the grid's nominal cell edge (px) — the consumer fits the motif
 *   tile to it, so motif size tracks grid spacing (no separate motif knob) rather
 *   than stamping a photo-sized tile at every crossing.
 */
export function latticeForLayer(guide) {
  if (!canProduceLattice(guide)) return null;

  const params = guide.params || {};
  const {
    spacing = 40,
    symmetry = 1,
    startAngle = 0, // degrees, matching Grid's param convention
    offsetX = 0,
    offsetY = 0,
  } = params;

  // Reconstruct the grid's exact jittered line positions (origin-centred),
  // consuming the SAME p5-seeded random stream the pattern drew with.
  const rng = makeP5Random(guide.seed);
  const { xJittered, yJittered } = gridLinePositions(params, rng);

  const n = toSymmetryCount(symmetry);
  const startRad = (startAngle * Math.PI) / 180;

  // Fully pre-expand: every intersection × every symmetry copy. Each copy k is
  // rotated by θ = 2π·k/n + startAngle about the (offset) centre — matching
  // applySymmetryDraw's translate(cx+offsetX, cy+offsetY); rotate(θ). offsetX/Y
  // are added to the centre (NOT rotated), identical for every copy, so we fold
  // them into the centre-relative coordinate here.
  const nodes = [];
  for (let k = 0; k < n; k++) {
    const theta = (2 * Math.PI * k) / n + startRad;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (const lx of xJittered) {
      for (const ly of yJittered) {
        nodes.push({
          x: offsetX + lx * cos - ly * sin,
          y: offsetY + lx * sin + ly * cos,
          angle: theta,
        });
      }
    }
  }

  return { nodes, cellSize: spacing };
}

export default latticeForLayer;
