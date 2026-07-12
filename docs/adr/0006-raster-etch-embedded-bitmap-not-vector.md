# A raster Etch exports as an embedded 1-bit bitmap, not vectorized dots

Every fabrication layer in Naqsha resolves to vector geometry — patterns, imports,
text, and motifs all export as SVG `<path>` data, and the s13 laser prototype and
the whole `extraction/` pipeline deliberately *vectorize* a binarized image into
filled contours or centreline strokes (ADR-0001, the two-path export). The Etch
layer breaks that rule on purpose: it dithers the source photo to a **locked 1-bit
bitmap** and embeds it in the SVG as an `<image>` (base64 data URI) at the engrave
colour, leaving cut/score paths vector so ADR-0001's two-path export still holds.

We chose raster over the codebase's default vector-dot approach because the driving
constraint is **WYSIWYG determinism on mirror acrylic**: the on-screen dithered
preview must equal what etches, bit for bit, because any handoff of the dithering
decision (e.g. letting LightBurn re-dither a greyscale image) is exactly the control
loss the feature exists to eliminate — one stray dot scars the mirror irreversibly.
A 1-bit bitmap that the laser *threshold-passes* preserves the exact dots; a
greyscale image would be re-screened downstream. Vectorizing the dots instead was
rejected as mechanically pathological: fine dither at 254 DPI is 10⁴–10⁵ dots, and a
laser vector-engraving that many tiny paths pays per-dot travel (hours, not
minutes) and explodes the SVG — whereas lasers raster-scan images natively.

Considered options:

- **Vectorized dots (each dot a filled `<circle>`/path).** Zero new export code
  (fits the filled-contour engrave pipeline), but pathological for fine dither;
  viable only for coarse halftone. Kept in mind as a *separate* future large-dot
  aesthetic, not the etch path.
- **Greyscale image, LightBurn dithers.** Least code, but forfeits WYSIWYG and the
  mirror guarantee — the whole point.

Consequences:

- `svgExport` gains net-new `<image>` handling (it has none today) —
  `image-rendering: pixelated`, physical placement in document px, pixel dimensions
  = physical × per-Etch DPI. This is the one place the Etch departs from the s13
  vector precedent.
- The premise rests on an **unverified external fact**: that LightBurn (or the
  target laser software) threshold-passes an embedded 1-bit `<image>` from an
  imported SVG *without re-dithering*. This is a NEEDS-HUMAN check. If it re-dithers,
  the fallback is a separate PNG sidecar alongside the SVG (breaking the single-file
  two-path shape, but preserving the dots).
- The Run Plan time estimate for an Etch is area×DPI (raster scan), a new estimator
  branch distinct from the vector path-length model.
- **Highlight Hold** (the mirror safety floor) is applied *after* screening as a
  fixed terminal clamp precisely because the export is a baked bitmap — there is no
  downstream re-interpretation that could reintroduce a held-out dot.
