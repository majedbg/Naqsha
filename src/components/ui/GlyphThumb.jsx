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
import { glyphViewBox } from "../../lib/motif/glyphBounds";

function GlyphThumb({ glyph, size = 28, className = "" }) {
  if (!glyph || !Array.isArray(glyph.paths)) return null;
  // Frame the glyph's ACTUAL drawn extent, not a radius about the local origin.
  // The old origin-centered box assumed the art straddles (0,0) — true of the
  // four hand-authored built-ins, false of every SVG import, which arrives in
  // its source document's user space. See glyphBounds.js.
  const { x, y, w, h, strokeWidth } = glyphViewBox(glyph);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${x} ${y} ${w} ${h}`}
      className={className}
      aria-hidden="true"
    >
      {glyph.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default memo(GlyphThumb);
