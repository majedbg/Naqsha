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
 *
 * Single geometry source: the nodes are NOT computed here anymore — they ARE the
 * shared `gridAnchorsCentered` core's `role:'crossing'` anchors (the same core
 * that feeds the motif seam). The jitter+symmetry expansion this module used to
 * re-implement inline now lives ONLY in that core, so the lattice and motif
 * paths can never drift (pinned by gridAnchors' bridge-invariant test).
 */
import { gridAnchorsCentered } from '../patterns/gridAnchors';
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
  const { spacing = 40 } = params;

  // The lattice wants ALL intersection positions regardless of which line
  // families are STROKED (draw flags gate DRAWING, not the coordinate lattice).
  // The core gates crossings on drawVertical/drawHorizontal, so coerce both to 1
  // here. Crossing POSITIONS are independent of the draw flags (gridLinePositions
  // ignores them — they gate drawing, not layout), so this stays byte-identical
  // to the old inline expansion for EVERY param — including drawVertical=0 /
  // drawHorizontal=0 — while dropping the duplicated jitter+symmetry math.
  //
  // Jitter parity: the core consumes the injected makeP5Random(guide.seed)
  // stream ONCE (see gridAnchors.js), reproducing the grid's live-p5 jitter.
  const anchors = gridAnchorsCentered(
    { ...params, drawHorizontal: 1, drawVertical: 1 },
    makeP5Random(guide.seed),
  );

  // Nodes ARE the core's crossings, in the core's emission order (copy-k outer,
  // then i (x), then j (y)) — identical to this module's former k/lx/ly loop.
  // `angle` = the copy's symmetry rotation θ, stored by the core as meta.theta.
  const nodes = (anchors || [])
    .filter((a) => a.role === 'crossing')
    .map((a) => ({ x: a.x, y: a.y, angle: a.meta.theta }));

  return { nodes, cellSize: spacing };
}

export default latticeForLayer;
