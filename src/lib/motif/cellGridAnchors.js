// cellGridAnchors — module D of PRD #143. Turns a REGULAR TILING into `cell`
// anchors: one per cell, at its centre, declaring the cell's half-extent through
// the top-level `hostRadius` channel (#146) and the cell's own rotation through
// tangent/normal.
//
// GEOMETRY-IN, like the Voronoi extractor and its sibling `pointHostAnchors`
// (module B, circular containers): the host resolves its own tiling and stashes
// it; this module is a PURE function of that geometry, so every anchor sits on
// real painted geometry by construction.
//
// DELIBERATELY GENERIC. Module Grid (#151) is its first caller and Truchet (#153)
// is its second, so nothing here knows about either. The two describe the same
// shape of input differently and both are first-class:
//   • Module Grid   — per-cell `half` (the true half × the per-cell scale) and
//                     per-cell `rotation`, both already resolved by the pattern
//                     after its seeded rotation / jitter / scale decisions.
//   • Truchet       — uniform tile centres and ONE constant half-extent, supplied
//                     once as `opts.half`, with no rotation at all.
// A caller that supplies neither a per-cell nor a shared half still gets usable
// anchors; they simply declare no `hostRadius`, which is exactly what the field
// being OPTIONAL means — the engine sizes those glyphs as it does on any host
// that declares nothing.
//
// ── INTERFACE (stated precisely, because #153 consumes it) ──────────────────
//   cellGridAnchors(cells, opts?) → Anchor[]
//     cells : Array<{x, y, half?, rotation?}> in WORLD (canvas-pixel) coords, in
//             the host's own order, already in the PAINTED frame (start angle,
//             offsets and — for a host with a symmetry control — the copy's
//             transform, ALL applied by the caller).
//     opts.half : shared fallback half-extent, used for any cell that does not
//             carry its own. A per-cell `half` always wins.
//   Returns one anchor per SURVIVING cell; never null, never throws.
//
// ANCHOR IDENTITY IS NORMATIVE. `cell:<index>` over the SURVIVING cell list, in
// the host's own order. Override records match by exact id before falling back to
// spatial rebinding, and randomised Slots hash the id, so two implementations
// choosing different schemes would both pass their extractor tests and behave
// differently under reseed, override reset and hashed Slot assignment. Ids are
// POSITIONAL: changing the tiling's dimensions renumbers them and overrides then
// fall through to spatial rebinding — the same contract the Voronoi cell role and
// module B already have.
//
// NO SYMMETRY-COPY SUFFIX, matching module B for the same reason: Module Grid
// hardcodes symmetry to 1. A caller with a REAL symmetry control (Truchet) must
// append the copy index the way gridAnchors does — `anchorId(role, …parts, k)`,
// and, per the gridAnchors convention, ONLY when the copy count exceeds 1 so a
// single-copy shape keeps its unsuffixed, override-stable ids. That is a
// re-mapping of the ids this module returns, not a change to it.
//
// ROTATION IS CARRIED, NOT INVENTED. `tangent` is the cell's own rotation and
// `normal` a quarter-turn on, so the engine's default orientation (policy
// 'path', useNormal true) turns each glyph WITH its cell. A cell that declares no
// rotation — or a non-finite one — yields an UNROTATED anchor (tangent 0, normal
// +π/2), which is byte-identical to the fixed convention module B uses for a
// container that has no canonical direction. It never throws.

import { anchorId } from './anchors.js';

const HALF_PI = Math.PI / 2;

/**
 * @typedef {{x:number, y:number, half?:number, rotation?:number}} Cell
 *   world (canvas-pixel) coords, in the painted frame. `half` is the cell's
 *   half-extent (the inscribed radius of a square cell); `rotation` is radians.
 */

/**
 * `cell` anchors for a regular tiling.
 * @param {Cell[]} cells        the tiling's cells, in host order.
 * @param {{half?: number}} [opts]  shared fallback half-extent.
 * @returns {Array<object>} one anchor per surviving cell (never null).
 */
export function cellGridAnchors(cells, opts) {
  if (!Array.isArray(cells)) return [];

  const sharedHalf = opts && Number.isFinite(opts.half) && opts.half > 0 ? opts.half : null;

  const out = [];
  for (const cell of cells) {
    if (!cell) continue;
    const { x, y } = cell;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const own = cell.half;
    const half = Number.isFinite(own) && own > 0 ? own : sharedHalf;
    const rotation = Number.isFinite(cell.rotation) ? cell.rotation : 0;

    const i = out.length;
    const anchor = {
      id: anchorId('cell', i),
      role: 'cell',
      x,
      y,
      tangent: rotation,
      normal: rotation + HALF_PI,
      s: 0,
      meta: { cell: i },
    };
    // TOP-LEVEL, never in meta: this is a placement-critical engine input. The
    // key is OMITTED (not set to undefined/0) when the cell declares no usable
    // half — `hasHostRadius` in the placement engine keys off its presence, and
    // an anchor with no container must size exactly as it does today.
    if (half != null) anchor.hostRadius = half;
    out.push(anchor);
  }

  return out;
}
