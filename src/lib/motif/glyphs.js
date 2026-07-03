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
};

/**
 * @param {string} id
 * @returns {Glyph|undefined}
 */
export function getGlyph(id) {
  return MOTIF_GLYPHS[id];
}
