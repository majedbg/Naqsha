// GlyphThumb — stroke-only thumbnail of a motif glyph (motif-shell, D).
//
// The thumbnail IS the identity of a motif: users recognize motifs by shape,
// not by name, so every picker/list surface renders this instead of a text
// label alone. Renders ALL of the glyph's paths (the old 18px MotifDevice
// swatch drew only paths[0], so multi-path imports previewed partially —
// audit 2026-07). Draws in currentColor so callers tint via text-* classes.
// Memoized: rendered in dense grids (picker flyout, library panel) whose parent
// re-renders on every keystroke/hover, while its own props stay stable — `glyph`
// refs come from memoized buildGlyphEntries / getGlyph, `size`/`className` are
// primitives — so a shallow prop check skips rebuilding the SVG.
import { memo } from "react";

function GlyphThumb({ glyph, size = 28, className = "" }) {
  if (!glyph || !Array.isArray(glyph.paths)) return null;
  // 1.2× head-room over the bounding-circle radius so round joins/caps at the
  // extremes don't clip against the viewBox edge.
  const r = (glyph.viewRadius || 10) * 1.2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`}
      className={className}
      aria-hidden="true"
    >
      {glyph.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={r / 9}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default memo(GlyphThumb);
