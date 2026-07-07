# SVG Motif + Pen Editor — grilling decisions (2026-07-08)

Feature: import SVGs as reusable "motifs" + an in-app pen/bezier editor (Photoshop-effect-style
modal with cancel/save/preview + mini live canvas preview) where a movable anchor point defines the
motif's "root" (sprout origin) for placement on patterns, editable in real time against the live
pattern preview.

Working brief accumulating from `/grill-me`. Each decision has the chosen option + rationale.

## Grounding facts (verified in code)
- Motifs today = 4 hardcoded glyphs (`motif/glyphs.js`): `leaf/dot/diamond/rosette`, each a `d`
  string in local coords centred at origin (0,0) + `viewRadius`. Motif layer holds a `glyphRef`
  string; `MotifPattern.generate` does `getGlyph(glyphRef)` → stamps via one matrix (dual-emit
  canvas + SVG). Glyph's origin (0,0) is already an implicit "root"; `viewRadius` sets scale.
- SVG import EXISTS but is a SEPARATE pipeline: `svgImport.js`/`useSvgImport.js` →
  `patterns/ImportedPath.js`, a standalone "place-as-artwork" layer. Stores verbatim `d` strings in
  `layer.params.pathData` (localStorage round-trip free). NOT wired to motifs.
- Both `MotifPattern` and `ImportedPath` canvas-render via `parsePathD` = **M/L/Z only → curves
  linearize on canvas**; SVG export keeps verbatim `d`. Same known gap hits the plotter pipeline.
- No pen/bezier editor exists. `catmullRomBezier.js`/`pathOps.js` are curve math only.

## Decisions

### D1 — Reuse model: per-document library, promotable to global (auth), premium-scaffolded
- Imported/edited motifs = named entries in a **per-document** custom-glyph store
  (`document.customGlyphs`). Motif layers reference by id (`glyphRef` resolves builtin OR custom).
  Editing a custom glyph restamps every layer using it (live propagation).
- A custom motif CAN be promoted to the user's **global library** via an explicit "save to my
  library" action — **requires login**; can lean on existing Supabase cloud persistence.
- Add **premium-gating scaffolding** around the promotion (entitlement flag) but leave it **OFF** —
  everything free now, easy to flip the global-library-save into a premium feature later.

### D2 — Curve fidelity: build-time tessellation via one shared flattener
- `flattenPathD(d, tol)` becomes curve-aware (tessellate C/Q/A → fine polyline) for **canvas**
  display; **SVG export** keeps verbatim `d` (true curves). Preserves the "one geometry → dual-emit"
  contract; canvas visually matches export. Same flattener fixes the **plotter/laser** curve gap.
  Pen editor still edits REAL beziers (handles); tessellation is display-only.

### D3 — Editor scope: FULL authoring (incl. draw-from-scratch)
- v1 includes the full pen tool: move on-curve anchors, drag bezier control handles, add/delete
  anchors, multi-subpath, set root — PLUS draw-from-scratch (click empty → anchor, drag → handle,
  click-first → close, cusp/smooth). **Large build** — a pen-tool state machine. Flag for PHASING
  (tracer: edit-imported first, then add draw-from-scratch). [see D-phasing, TBD]

### D4 — Root anchor: point + growth direction `{x, y, angle}`
- Root is a movable POINT (base of stem → coincides with the placement anchor) + a rotatable
  growth-axis handle. At placement: root.xy → anchor.xy; root.angle → aligns to the anchor's
  orientation (edge normal / crossing angle) so motifs sprout OUTWARD. Mechanically a pre-translate
  `T(-root.xy)` + local rotate folded into `placementMatrix` (which already maps origin→anchor and
  has a rotation slot). `viewRadius` scale convention unchanged (root does NOT drive scale).
