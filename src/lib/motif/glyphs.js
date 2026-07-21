// Motif glyph library — pure data, no p5/DOM/React.
//
// A glyph is authored in a LOCAL coordinate system centered at the origin
// (0,0). `viewRadius` is the radius of the glyph's bounding circle in that
// local space; the instancing stage (instancing.js) scales this up to a
// placement's absolute footprint radius.
//
// See docs/motif-adorn-arch-brief.md §8/§9 for house conventions.

/**
 * @typedef {{d:string, closed:boolean}} GlyphPath
 * @typedef {{id:string, name:string, tradition:string, paths:GlyphPath[], viewRadius:number}} Glyph
 */

// 'leaf' — a leaf-blade that grows FROM the host line (design 2026-07). The
// stem/base vertex sits at the ORIGIN (0,0), which the placement engine puts ON
// the line; the whole blade extends along +x — the off-line direction, since a
// glyph's local +x maps to the path NORMAL after orientation (see instancing.js
// placementMatrix + placementEngine orientation 'path'/useNormal:true). So every
// non-base vertex is strictly x>0 and the blade hangs off ONE side of the line.
// Deliberately NOT symmetric under y → −y (mirror across the midrib, the +x
// growth axis): one flank bulges wider than the other. That midrib asymmetry is
// what makes a 180° turn — local (x,y)→(−x,−y), used by the Vine to alternate
// leaves above/below — read DIFFERENTLY from a plain `flip` (x-negation,
// (x,y)→(−x,y)); the two differ only by the y-negation the asymmetry exposes.
// Authored as a small closed polyline (a handful of M/L commands) for a
// house-style exact vertex list, overall ≈20 units long (matching the old
// ±10-tall leaf's footprint).
const LEAF_D = 'M0,0 L6,-6 L14,-5 L20,-0.5 L18,3 L11,4.5 L4,3 Z';

// 'dot' — a small filled circle, approximated as a regular octagon (8
// vertices at radius 3). Symmetric under any reflection/rotation.
const DOT_D =
  'M3,0 L2.1213,2.1213 L0,3 L-2.1213,2.1213 L-3,0 L-2.1213,-2.1213 L0,-3 L2.1213,-2.1213 Z';

// 'diamond' — a 4-point rhombus, taller than wide, symmetric under both axes.
const DIAMOND_D = 'M0,-8 L5,0 L0,8 L-5,0 Z';

// 'rosette' — a simple 6-petal radial rosette: 12 vertices alternating
// between an outer petal-tip radius (10) and an inner valley radius (4),
// spaced every 30°. Symmetric under 6-fold rotation and x/y reflection.
const ROSETTE_D =
  'M10,0 L3.4641,2 L5,8.66025 L0,4 L-5,8.66025 L-3.4641,2 L-10,0 L-3.4641,-2 L-5,-8.66025 L0,-4 L5,-8.66025 L3.4641,-2 Z';

/** @type {Record<string, Glyph>} */
export const MOTIF_GLYPHS = {
  leaf: {
    id: 'leaf',
    name: 'Leaf',
    tradition: 'botanical',
    paths: [{ d: LEAF_D, closed: true }],
    // Max vertex distance from the origin (the base) is the blade tip
    // |(20,-0.5)| = sqrt(400.25) ≈ 20.006; 20.1 is the bounding-circle radius
    // (covers every authored vertex). Larger than the old centered leaf's 10.2
    // because the blade now extends fully to one side instead of straddling the
    // origin — the drawn footprint is still `placement.radius`, so this only
    // re-anchors the leaf at its base, it does not change placement sizing.
    viewRadius: 20.1,
  },
  dot: {
    id: 'dot',
    name: 'Dot',
    tradition: 'geometric',
    paths: [{ d: DOT_D, closed: true }],
    // Every vertex is at radius exactly 3 (octagon inscribed in a
    // radius-3 circle); 3 is the bounding-circle radius.
    viewRadius: 3,
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    tradition: 'geometric',
    paths: [{ d: DIAMOND_D, closed: true }],
    // Max vertex distance from origin is |(0,-8)| = 8; 8 is the
    // bounding-circle radius (covers every authored vertex, including
    // the narrower ±5 side points).
    viewRadius: 8,
  },
  rosette: {
    id: 'rosette',
    name: 'Rosette',
    tradition: 'floral',
    paths: [{ d: ROSETTE_D, closed: true }],
    // Max vertex distance from origin is the outer petal-tip radius, 10;
    // the inner valley vertices (radius 4) are well within that bound.
    viewRadius: 10,
  },
};

/**
 * Resolve a glyph by id. Document-aware (WI-3): a built-in glyph ALWAYS wins;
 * the optional per-document `customGlyphs` map (owned by useLayers) is consulted
 * only for ids the built-in library doesn't own. Single-arg calls stay
 * back-compat (built-in or undefined), so untouched callers never break.
 * @param {string} id
 * @param {Record<string, Glyph>} [customGlyphs] per-document custom-glyph store
 * @returns {Glyph|undefined}
 */
export function getGlyph(id, customGlyphs) {
  return MOTIF_GLYPHS[id] ?? customGlyphs?.[id];
}
