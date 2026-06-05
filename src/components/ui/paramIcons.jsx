/*
 * paramIcons — SVG glyph source for IconSelect controls.
 *
 * Glyphs are pure SVG drawn with `currentColor` so they read both as
 * ink-soft on the paper ground (unselected) and as ink on the saffron
 * painted cell (selected). No external assets, no animation inside a glyph —
 * the selection motion lives on the button, not the mark.
 *
 * Glyphs are plain JSX-returning functions (not components) so this file can
 * export the registries below without tripping react-refresh. Two registries:
 *   GENERATED_GLYPHS — value -> node, for ranged controls (symmetry).
 *   GLYPHS           — name  -> node, for enumerated controls (WI-5 shapes).
 */

const VB = 24; // viewBox is 0 0 24 24, centre at (12,12)
const C = VB / 2;
const ARM = 8.5; // arm / radius length in viewBox units

// Programmatic radial-symmetry glyph: N arms at 360/N°, anchored at top so the
// mark reads as rotational order. n=1 is a lone centre dot (no symmetry);
// n=2 is a single vertical line (two collinear arms); n=4 is a plus. For dense
// counts (n >= 7) the arms stop disambiguating, so we drop to a faint ring with
// the numeral as the primary mark — legible on either ground (D2).
function symmetryGlyph(n) {
  if (n <= 1) {
    return (
      <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%" aria-hidden="true">
        <circle cx={C} cy={C} r="2.4" fill="currentColor" />
      </svg>
    );
  }

  if (n >= 7) {
    return (
      <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%" aria-hidden="true">
        <circle
          cx={C}
          cy={C}
          r={ARM}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
        />
        <text
          x={C}
          y={C}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          fontWeight="600"
          fill="currentColor"
          // Tabular figures so 10/11 stay optically centred.
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {n}
        </text>
      </svg>
    );
  }

  const arms = Array.from({ length: n }, (_, i) => {
    const rad = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return {
      x2: C + ARM * Math.cos(rad),
      y2: C + ARM * Math.sin(rad),
    };
  });

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%" aria-hidden="true">
      {arms.map((a, i) => (
        <line
          key={i}
          x1={C}
          y1={C}
          x2={a.x2}
          y2={a.y2}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

// Ranged glyphs: keyed by `glyph` name, called with the live value.
export const GENERATED_GLYPHS = {
  symmetry: (value) => symmetryGlyph(value),
};

// Enumerated glyphs: keyed by name. WI-5 (Shape IconSelect) appends the
// geometric shape + fill glyphs here.
export const GLYPHS = {};
