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

// --- WI-5: enumerated shape + fill glyphs ---------------------------------
//
// Lowercase helpers (NOT components) build the SVG geometry; the resulting
// nodes are stored in GLYPHS below. Shapes are inscribed in r = ARM so they
// sit on the same metric grid as the symmetry glyph. Outline shapes are
// hairline strokes (cut metaphor); `fill` is a solid mark (engrave); `both`
// is a solid mark with a *separated* concentric ring so it reads as fill AND
// a discrete outline, not just a heavier fill (D2 — legible distinction).

// Points string for a regular n-gon, first vertex at the top (-90°).
function polygonPoints(sides, r = ARM, rotationDeg = -90) {
  return Array.from({ length: sides }, (_, i) => {
    const rad = ((rotationDeg + (i * 360) / sides) * Math.PI) / 180;
    return `${(C + r * Math.cos(rad)).toFixed(2)},${(C + r * Math.sin(rad)).toFixed(2)}`;
  }).join(" ");
}

// Points string for a 5-point star: outer + inner radii alternate, top point up.
function starPoints(outer = ARM, inner = ARM * 0.42, rotationDeg = -90) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const rad = ((rotationDeg + (i * 360) / 10) * Math.PI) / 180;
    return `${(C + r * Math.cos(rad)).toFixed(2)},${(C + r * Math.sin(rad)).toFixed(2)}`;
  }).join(" ");
}

// Hairline-stroke wrapper: an outline shape (cut metaphor).
function outlineSvg(child) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} width="100%" height="100%" aria-hidden="true">
      {child}
    </svg>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

// Enumerated glyphs: keyed by name, consumed by IconSelect as `GLYPHS[name]`.
// Each value is a JSX node (no exported component — keeps react-refresh happy).
export const GLYPHS = {
  // --- geometric shapes (hairline outline) ---
  circle: outlineSvg(<circle cx={C} cy={C} r={ARM} {...STROKE} />),
  square: outlineSvg(
    <rect
      x={C - ARM * 0.78}
      y={C - ARM * 0.78}
      width={ARM * 1.56}
      height={ARM * 1.56}
      rx="1"
      {...STROKE}
    />,
  ),
  triangle: outlineSvg(<polygon points={polygonPoints(3)} {...STROKE} />),
  pentagon: outlineSvg(<polygon points={polygonPoints(5)} {...STROKE} />),
  hexagon: outlineSvg(<polygon points={polygonPoints(6)} {...STROKE} />),
  star: outlineSvg(<polygon points={starPoints()} {...STROKE} />),

  // --- fill modes (use the circle as the carrier mark) ---
  // outline = hairline ring (laser-cut metaphor).
  outline: outlineSvg(<circle cx={C} cy={C} r={ARM} {...STROKE} />),
  // fill = solid mark (engrave metaphor).
  fill: outlineSvg(<circle cx={C} cy={C} r={ARM} fill="currentColor" />),
  // both = solid mark + separated concentric ring (fill AND a discrete outline).
  both: outlineSvg(
    <>
      <circle cx={C} cy={C} r={ARM} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={C} cy={C} r={ARM * 0.62} fill="currentColor" />
    </>,
  ),

  // --- ModuleGrid cell-module glyphs (each evokes its per-cell motif) ---
  // sweep = a few lines swept from one corner across to the far side.
  sweep: outlineSvg(
    <>
      <line x1={C - ARM} y1={C + ARM} x2={C + ARM} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
      <line x1={C - ARM} y1={C + ARM} x2={C + ARM} y2={C} {...STROKE} strokeWidth="1.2" />
      <line x1={C - ARM} y1={C + ARM} x2={C} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
    </>,
  ),
  // fan = lines fanning out from a single low apex to the top edge.
  fan: outlineSvg(
    <>
      <line x1={C} y1={C + ARM} x2={C - ARM} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
      <line x1={C} y1={C + ARM} x2={C - ARM * 0.4} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
      <line x1={C} y1={C + ARM} x2={C + ARM * 0.4} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
      <line x1={C} y1={C + ARM} x2={C + ARM} y2={C - ARM} {...STROKE} strokeWidth="1.2" />
    </>,
  ),
  // rings = three concentric circles (nested ring motif).
  rings: outlineSvg(
    <>
      <circle cx={C} cy={C} r={ARM} {...STROKE} strokeWidth="1.2" />
      <circle cx={C} cy={C} r={ARM * 0.62} {...STROKE} strokeWidth="1.2" />
      <circle cx={C} cy={C} r={ARM * 0.26} {...STROKE} strokeWidth="1.2" />
    </>,
  ),
  // chevron = three stacked V's pointing down.
  chevron: outlineSvg(
    <>
      <polyline points={`${C - ARM},${C - ARM} ${C},${C - ARM * 0.4} ${C + ARM},${C - ARM}`} {...STROKE} strokeWidth="1.2" />
      <polyline points={`${C - ARM},${C - ARM * 0.1} ${C},${C + ARM * 0.5} ${C + ARM},${C - ARM * 0.1}`} {...STROKE} strokeWidth="1.2" />
      <polyline points={`${C - ARM},${C + ARM * 0.8} ${C},${C + ARM * 1.4} ${C + ARM},${C + ARM * 0.8}`} {...STROKE} strokeWidth="1.2" />
    </>,
  ),
  // diamond = two concentric rhombi (nested-diamond motif — sibling of rings).
  diamond: outlineSvg(
    <>
      <polygon points={`${C},${C - ARM} ${C + ARM},${C} ${C},${C + ARM} ${C - ARM},${C}`} {...STROKE} strokeWidth="1.2" />
      <polygon points={`${C},${C - ARM * 0.5} ${C + ARM * 0.5},${C} ${C},${C + ARM * 0.5} ${C - ARM * 0.5},${C}`} {...STROKE} strokeWidth="1.2" />
    </>,
  ),
};
