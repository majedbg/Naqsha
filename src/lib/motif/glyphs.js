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

// 'leaf' — a paisley/comma-like teardrop, deliberately NOT symmetric under
// x → −x (mirror across the vertical axis). The right side bulges wider than
// the left, so a downstream x-negation flip is visually observable. Authored
// as a small closed polyline (a handful of M/L commands) for a house-style
// exact vertex list.
const LEAF_D = 'M0,-10 L7,-4 L8,5 L2,10 L-6,6 L-7,-2 L-2,-8 Z';

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
    // Max vertex distance from origin is |(2,10)| = sqrt(104) ≈ 10.198; 10.2
    // is the bounding-circle radius (covers every authored vertex).
    viewRadius: 10.2,
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
