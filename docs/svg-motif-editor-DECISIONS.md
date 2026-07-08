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

### D5 — Live preview: isolated editor + throttled mini full-canvas preview
- Editor's own canvas shows the SINGLE motif with instant handle feedback (cheap). The mini
  full-canvas preview (the "Preview" checkbox) re-stamps the whole pattern rAF-coalesced / on
  drag-release — NOT every mousemove. Smooth even with thousands of placements. Mini-preview renders
  from the WORKING COPY, so it never touches the committed document.

### D6 — Working-copy + shared-edit semantics
- The modal edits a WORKING COPY of the custom glyph (Photoshop filter model + repo's human-in-the-
  loop preview/apply/revert principle). **Save** commits; **Cancel** discards; real `document`
  mutates only on Save.
- Custom motifs are a SHARED asset: Save updates EVERY layer referencing the glyph (all restamp).
  The editor header shows **"used by N layers"** (never silent); a secondary **"Save as copy"**
  forks a new custom glyph and rebinds only the current layer. (Illustrator symbol / smart-object
  semantics.) Built-ins are read-only → "Duplicate to edit".

### D7 — Import normalization: outline/stroke-only, auto-normalized
- On import: flatten transforms/groups → absolute path `d`s; strip fills → stroked outlines; keep
  ALL subpaths (petals survive); auto-compute `viewRadius` from the bounding circle; center the
  geometry at bbox center; drop an initial root at bbox **bottom-center** (editable after). Matches
  the pen/laser outline model + existing `fill="none"` convention. Fill/hatch = future.
- Reuse existing `svg/sanitizeSvg`, `svg/parseDimensions`, `svg/extractOps` where they fit.
- **D7-reconcile (2026-07-08, from WI-2 impl):** WI-2's compose folds `T(−root)` in BEFORE `S`, so
  the ROOT is the scale pivot. Therefore `viewRadius` = **max distance from root to any point**
  (bounding circle centered at root), NOT the bbox-center circle D4 first sketched. Consequence
  (deliberate, better): a motif's `placement.radius` = its reach from where it sprouts; imported `d`
  stays **verbatim** (no path-rewriting/centering → curves preserved), root = bbox bottom-center.
  For built-ins root={0,0,0}=center so nothing changes. **Human-verify** the flower scales sensibly.
- **P1 import limitation (document, fast-follow):** `parseSVGImport` is `<path d>`-only via regex
  (no DOMParser in node tests) — it ignores `transform` attrs and non-path elements (rect/circle/
  polygon/nested-group transforms). Same limitation ImportedPath already ships. P1 supports flattened
  path-only SVGs; transform-flattening is a P2/fast-follow.

### D8 — Entry points: Motif device is the hub; artwork-import stays separate
- Motif device (Inspector `MotifDevice`, ~line 571): glyph picker lists built-ins + custom motifs,
  plus **"Import SVG as motif…"** and **"New motif…"** (draw-from-scratch, P3). A pencil **"Edit"**
  button opens the pen-editor modal for the selected CUSTOM motif (built-ins read-only → Duplicate to
  edit). The existing File>Import / drag-drop / paste → `addImportedLayer` (artwork) is UNCHANGED.

## Phased build (each phase independently shippable)

- **P1 — Tracer spine (no editor):** `flattenPathD(d, tol)` curve-aware (canvas + fixes plotter/laser
  curve gap); `document.customGlyphs` store (+ localStorage round-trip, mirrors `pathData`);
  import→normalize→custom glyph→`addMotifLayer({glyphRef})` with auto root; `getGlyph(ref, doc)`
  resolves builtin OR custom; `placementMatrix` honors `root {x,y,angle}` (pre-translate + local
  rotate). Motif device picker shows custom motifs + "Import SVG as motif…". PROVES the whole spine
  end-to-end (import a flower, place it, canvas==export, plottable).
- **P2 — Edit-imported modal:** pen-editor modal (large centered frame): move on-curve anchors, drag
  bezier handles, add/delete anchors, multi-subpath, set root point + growth direction. Working copy;
  isolated live canvas + throttled mini full-canvas preview (Preview checkbox); Save / Cancel /
  Save-as-copy; "used by N layers" badge; Edit button in Motif device.
- **P3 — Draw-from-scratch:** pen-creation state machine on the same editor (click→anchor, drag→
  handle, click-first→close, cusp/smooth). "New motif…" entry.
- **P4 — Global library + premium scaffold:** "Save to my library" (auth-gated) promotes a custom
  glyph to a user-global asset store (lean on Supabase cloud persistence). Dormant entitlement flag
  around the promotion — everything free now, flip-to-premium later.

## Open / to-confirm during build (not blockers)
- Custom-glyph id scheme + how `motifAutoName` reads custom names.
- Glyph picker `<select>` → thumbnail picker upgrade (P2 nicety).
- `flattenPathD` tolerance value + arc (A command) handling.
- Persistence schema for `document.customGlyphs` in the document snapshot / migration.
- Exact "used by N" query (scan layers for `glyphRef === id`).
- P4: global-library storage schema + entitlement flag location.
