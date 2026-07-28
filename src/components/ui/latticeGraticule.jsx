/*
 * latticeGraticule — the ONE graticule primitive.
 *
 * A 2×2 graticule (two verticals × two horizontals) authored in the house
 * 24-unit box. It is the host fragment under RoleBadge's `LatticeFragment` —
 * two lines per family, because that bounds exactly one central cell for the
 * `cell` mark to sit in — and it is also the mark of the Grid Lines param
 * toggle (#166), whose three glyphs are the vertical family, the horizontal
 * family and both.
 *
 * The two homes share this module rather than each drawing their own lines, so
 * the param glyphs are siblings of the Route block's lattice BY CONSTRUCTION,
 * not by visual imitation. They differ in exactly one way, and it is deliberate:
 * RoleBadge mutes the fragment (stroke-opacity) so full-strength role marks read
 * over it, while a param glyph has no marks to read against and stays at full
 * strength. Callers own their own <g> wrapper, so each supplies its own opacity.
 *
 * House drawing rules: `currentColor` only (the caller tints via text color),
 * no hard-coded hue, no CSS vars. Plain JSX-returning functions rather than
 * components, matching paramIcons.jsx, so both registries can import from here
 * without tripping react-refresh.
 */

/** The 2×2 graticule's geometry, in viewBox units. */
export const GRATICULE = {
  vx: [6, 18], // vertical line x's
  hy: [6, 18], // horizontal line y's
  span: [2, 22], // line extent
};

/** Shared stroke weight + cap, so the two homes cannot drift apart. */
export const GRATICULE_STROKE = {
  strokeWidth: 1.1,
  strokeLinecap: "round",
};

/**
 * The graticule's <line> elements, per family. The caller owns the enclosing
 * <g> (and therefore stroke, opacity and any data attribute).
 *
 * @param {object} [families]
 * @param {boolean} [families.v]  draw the vertical family (default true)
 * @param {boolean} [families.h]  draw the horizontal family (default true)
 * @returns {JSX.Element} a fragment of <line> elements
 */
export function graticuleLines({ v = true, h = true } = {}) {
  return (
    <>
      {v &&
        GRATICULE.vx.map((x) => (
          <line key={`v${x}`} x1={x} y1={GRATICULE.span[0]} x2={x} y2={GRATICULE.span[1]} />
        ))}
      {h &&
        GRATICULE.hy.map((y) => (
          <line key={`h${y}`} x1={GRATICULE.span[0]} y1={y} x2={GRATICULE.span[1]} y2={y} />
        ))}
    </>
  );
}
