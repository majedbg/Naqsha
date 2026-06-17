# Text Field Tool — Architecture & Plan

> Illustrator-style text tool for the Sonoform generative-art / machine-cutting studio.
> Drag a box → type → text becomes machine-cuttable vector outlines, selectable,
> movable, rotatable, resizable, and re-editable. First interactive editing surface
> in the app.
>
> Status: PLAN (grilled 2026-06-16). Not yet implemented.

---

## 0. The reframe

This is **not** "add a text pattern." The app today is a one-way pipeline
(`params → p5 renders pixels + emits SVG strings → export to cutter`); layers are
immutable render recipes and the canvas is display-only. There is **no selection,
no transform, no tool system, no input handling, no fonts, and no undo**.

This feature introduces the app's **first interactive editing surface**, and text is
its first citizen. Almost every decision below follows from that.

---

## 1. Locked decisions (grilling outcomes)

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Object model | **General `SceneNode` graph** — `PatternNode` wraps today's 20 patterns, `TextNode` is the first interactive node. Unified transform / selection / z-order / export. | Reusable backbone for future interactive features; absorbs the existing cut/engrave role + SVG invariants. |
| 2 | Edit surface | **Canvas-drawn rendering + hidden DOM input capture.** p5 draws glyphs + caret; an invisible focus-trapped `<textarea>` captures keystrokes/IME/paste/mobile. | Custom canvas visuals *without* hand-rolling IME/paste/RTL. Proven pattern (Monaco, CodeMirror). |
| 3 | Text→vector | **opentype.js.** One `Path` object → canvas draw commands **and** `toPathData()` SVG. | Single geometry source ⇒ canvas preview and exported SVG cannot drift (honors existing invariant). Latin-complete; complex-script deferred. |
| 4 | Single vs multi-line threshold | **H:W ≥ 1.0 (square).** Box wider than tall ⇒ single auto-fit line; taller than wide ⇒ multi-line. | Most intuitive, no magic constant, safest against a single line bursting past box width. (See §5.) |
| 5 | Cut vs etch/fill | **Reuse existing roles; geometry is always the closed glyph contour. DEFAULT ROLE = ENGRAVE.** Two engrave sub-modes: *outline-engrave* (stroke the contour, `fill:none`) and *fill-engrave* (filled path → solid letters). **Cut is an expert-only path** (detaches counters; see §6.3). | Smallest change; `fabrication.js` untouched. Matches the workshop fabrication model ("engraves only, no per-piece outline cut" — `ITP-Camp-Naqsha-Workshop.md:35`; "a fill becomes an engrave" — line 48). Fill is the *first* filled geometry in the pipeline; **laser-only** (flagged), plotter-hatch deferred. Winding rule: **use opentype.js's native nonzero**; only switch to `evenodd` if counter-heavy/bold weights misrender (test "Bo8e"). |
| 6 | Transform scope | **Full move + rotate + 8 resize handles.** | User chose the complete Illustrator-like surface. |
| 7 | Resize model | **Re-layout (param-driven), not affine scale.** Corner → `fontSize`; horizontal side → `wrapWidth` + reflow; vertical side → `fontSize` (1-line) / box height (multi). Node intrinsic scale stays 1. | Glyphs never distort on non-uniform drags; export is always true-size geometry with correct kerf. |
| 8 | Fonts | **Curated bundled set (~8–12 OFL/Apache), pre-vetted for clean outlines + cuttability.** Default = clean sans. No upload in v1. | Settled licensing, trivial persistence (font id), no hairline-cut failures, no choice paralysis. |
| 9 | Undo/redo | **Global snapshot-based history over the serializable scene graph** (Cmd+Z / Cmd+Shift+Z). Drags coalesce to one entry; typing uses native input undo then snapshots on commit. | Direct manipulation needs undo; state is already JSON. Every future interactive feature inherits it. |
| 10 | Tool system home | **Canvas toolbar overlay** with an `activeTool` state (Select, Text now; extensible). `T`=text, `V`/Esc=select. | Scalable IA matching the scene-graph direction; future tools get a slot, not a bespoke button. |

### Folded-in behavior defaults (confirm)
- **New text defaults to the `engrave` role, fill-engrave (solid letters)** — the workshop keepsake case. Outline-engrave and Cut are opt-in.
- **Drag = area box; click (no drag) = point text** at a default size.
- **After committing text, revert to Select tool.**
- **Select + single-click = transform; Select + double-click = edit.** `Esc` commits-and-exits editing.
- **Committing an empty text node deletes it.**

---

## 2. Target architecture

### 2.1 Module / folder layout (mirrors existing `src/lib/*`, `src/components/*` conventions)

```
src/lib/scene/
  SceneNode.js          # base: id, type, transform {x,y,rotation,scale}, z, visible, role/penSlot
  PatternNode.js        # wraps an existing Pattern instance (adapter; today's layers)
  TextNode.js           # text-specific: { text, fontId, fontSize, align, lineHeight,
                         #                 letterSpacing, box{w,h}, lineMode, renderMode:'outline'|'fill' }
  sceneGraph.js         # ordered node list, z-order ops, (de)serialize  ← supersedes raw layers[]
  hitTest.js            # point-in-node, handle hit-testing (rotated-aware)
  bbox.js               # node bounding boxes in local + world space

src/lib/text/
  fontRegistry.js       # bundled font catalog + lazy opentype.parse cache (id → Font)
  textLayout.js         # text + font + size + box → laid-out lines + glyph runs (wrap, align, leading)
  textToOutline.js      # layout → single opentype Path → { commands (canvas), pathData (SVG) }
  fitText.js            # box geometry → single-vs-multi (H:W≥1) + fontSize/wrapWidth derivation

src/lib/transform/
  transformOps.js       # translate / rotate / re-layout-resize math; drag gesture → param mutation
  handles.js            # handle layout (8 resize + rotate) for a node's world bbox

src/lib/history/
  useHistory.js         # past/present/future snapshot stack; commit(), undo(), redo(), coalesce

src/lib/tools/
  toolRegistry.js       # tool defs (select, text); keymap
  useActiveTool.js      # activeTool state + canvas pointer-event router

src/components/canvas/
  CanvasToolbar.jsx     # overlay: [V Select] [T Text] [+ future]
  SelectionOverlay.jsx  # (state only — handles are DRAWN on canvas; this owns hidden input + a11y)
  TextCaptureInput.jsx  # invisible focus-trapped <textarea> (IME/paste/mobile)
  TextPropertiesPanel.jsx # font picker, size, align, line-height, outline/fill, role

src/lib/canvas/
  sceneRenderer.js      # draws nodes + (when active) selection handles + caret into the p5 draw loop
```

### 2.2 Data flow

```
 pointer/keyboard
      │
 useActiveTool (router by activeTool)
      │  create / select / move / rotate / resize / edit
      ▼
 transformOps / textLayout  ──mutates──▶  sceneGraph (nodes[])
      │                                        │
 useHistory.commit(snapshot)                   │ (state = serializable JSON, autosaved)
      │                                        ▼
      │                                 sceneRenderer ──▶ p5 canvas (art + handles + caret)
      ▼                                        │
 TextNode.toSVGGroup() ◀── textToOutline ──────┘
      │  (same opentype Path → pathData)
      ▼
 buildLayerSVG / buildAllLayersSVG  →  download → cutter   (UNCHANGED export path)
```

### 2.3 Key invariants preserved
- **Canvas == SVG:** TextNode renders from the *same* opentype `Path` it serializes. No drift.
- **Export path untouched:** `TextNode.toSVGGroup()` emits a `<g>` of `<path>` exactly like a pattern; `svgExport.js`, `fabrication.js`, manifest all work as-is.
- **Roles reused:** `role: cut|score|engrave` and `penSlot` apply to TextNode unchanged; laser mode recolors as today.

### 2.4 Migration / sequencing (strangler, NOT big-bang)
The scene graph is introduced *alongside* `layers[]`, not by rewriting it first:
1. `sceneGraph` wraps the existing `layers[]` as `PatternNode`s via an adapter — **zero behavior change**, all 583 tests stay green.
2. Build the interactive systems (tools, transform, history, text) against the scene graph.
3. `TextNode` joins the same node list; export/persistence already flow through it.
4. Only later (optional) collapse `useLayers` internals onto `sceneGraph` as the single source of truth.

---

## 3. Rendering & interaction detail

- **Two render cadences.** Today's pattern render is debounced (150 ms) — fine for params, **far too slow for dragging**. Add a *fast interaction layer*: during an active gesture, redraw only the selection/handles/caret + the dragged node at 60 fps; keep the heavy pattern render debounced. (Likely a second p5 layer or a dedicated redraw flag.)
- **Caret + selection** are drawn in the p5 loop from `capture.selectionStart/End`; blink via timestamp.
- **Hit-testing** accounts for node rotation (inverse-transform the pointer into node-local space).
- **Handles**: 8 resize + 1 rotate, laid out on the world bbox; min-size clamp; `Shift` = aspect-lock (corner) / 15° snap (rotate).

---

## 4. Physical-size correctness (fabrication)
- Canvas is **96 PPI**. `fontSize` is authored in px but the real deliverable is **physical size** (mm). Surface font size in **mm/pt as well as px**, or at minimum show the resulting physical cap-height, so "2 cm tall letters" is achievable and predictable.
- Feed text into the existing **engrave-ability / overlap checks** (`overlapCheck.js`, `OverlapWarnings`): warn on hairline stroke widths, sub-kerf counters, or glyph features below the machine's min feature size.
- **Bed bounds**: warn/clip when a text node falls outside the cut bed (reuse `BedOverlay` logic).

---

## 5. The single-vs-multi-line threshold (explicit deliverable)

No industry-standard constant exists — Illustrator/Figma avoid the guess entirely
(click = point text, drag = area text). For an auto-decide-from-drag heuristic, the
top 3 defensible thresholds, expressed as **height:width (H:W)** so a tall/narrow box
trips multi-line:

| Option | Flip point | Behavior | Trade-off |
|--------|-----------|----------|-----------|
| **A — H:W ≥ 1.0 (CHOSEN)** | the square | wider-than-tall ⇒ single auto-fit line; taller-than-wide ⇒ multi-line | Most intuitive, no magic number, safest against single-line overflow. A near-square box for one long word may wrap (easily undone). |
| B — H:W ≥ 1.5 | 1.5× taller than wide | buffer keeps near-square single-word boxes as one line | Mild risk of an over-wide single line overflowing the box. |
| C — H:W ≥ 2.0 | distinctly tall | only obvious columns multi-line | Highest overflow risk; most single-line-biased. |

**Chosen: A (H:W ≥ 1.0).** The user's "5:1 tall ⇒ multi-line" example is multi-line under all three.

**Safeguard regardless of threshold:** for single-line mode, fit font to
`min(heightFit, widthFit)` so a long single line shrinks to stay inside the box width
rather than bursting out — the threshold is never the only guard.

---

## 6. Unforeseen product issues / things to flesh out

**Fabrication**
1. **Plotter "fill" is meaningless** — a pen can't raster. v1 disables fill in plotter mode with a tooltip; true plotter fill needs a **hatch-fill generator** (deferred).
2. **Single-stroke (Hershey) fonts** are the *correct* way to engrave thin text in one pass on a plotter/fine laser — a whole separate font system (deferred, flagged).
3. **Cutting text detaches letters (the big one).** Cutting a glyph *outline* on acrylic drops every counter (O, a, e, B interiors) out and frees each letter — confetti, not a name. This is why **default role = engrave**, and why **Cut for text is expert-only** and must trigger a counter-detachment warning + (future) auto **stencil-bridge** generation before it's usable. The workshop "engraves only" (`ITP-Camp-Naqsha-Workshop.md:35`), so v1 can ship engrave-only and treat cut as a later, gated capability. Winding: opentype.js native **nonzero** keeps counters as holes for fill-engrave; test "Bo8e" before asserting `evenodd`.
4. **Min feature size** — thin fonts/small sizes break physically; vet the bundled set and wire into engrave-ability warnings.
5. **Physical units** — px-only sizing is wrong for a fabrication tool (see §4).

**Interaction / UX**
6. **Two render cadences** (§3) — interactive drag must not run the 150 ms pattern pipeline.
7. **Empty/whitespace-only text** — auto-delete on commit.
8. **Click vs drag ambiguity** — a tiny accidental drag shouldn't create a 3 px area box; apply a drag threshold (~4 px) below which it's a click → point text.
9. **Editing a rotated node** — the hidden input and caret math must work in rotated space (or temporarily un-rotate while editing).
10. **Mode discoverability** — make "Select vs Text" state and "double-click to edit" obvious (cursor changes, toolbar highlight).
11. **Z-order** — where does text sit vs pattern layers? Needs explicit ordering in the layer stack UI.
12. **Color vs role** — in laser mode, text color is overridden by role color (same as patterns); make that non-surprising.

**Data / lifecycle**
13. **Re-editability persistence** — store `{ text, fontId, fontSize, … }` (not just baked paths) so designs reload editable; exported SVG stays self-contained outlines.
14. **Share view** (`ShareView.jsx`) is read-only — render baked text outlines, no editing, no font dependency.
15. **Tier limits** (`tierLimits.js`) — is text a gated feature? Per-design text-node cap?
16. **AI-pattern / cloud-persistence schemas** must round-trip the new node type.

**Typography (pick defaults)**
17. Alignment (default left), line-height (default ~1.2), letter-spacing/tracking control — propose as panel controls with sane defaults.
18. **Curved text / text-on-path** (text around a naqsha circle) — likely-wanted future; design `TextNode` so a `pathRef` can be added later. Deferred.

**Accessibility**
19. Canvas-drawn text is invisible to assistive tech — expose an off-screen live mirror of node text and keyboard operability via the hidden input.

---

## 7. Suggested phasing

> **Honest scope note:** picking the maximal option at every fork (general scene graph,
> full 8-handle transform, global undo, real tool system) turned a feature into a
> **platform**. That's a legitimate choice for "reusable for future features," but P0–P1
> is platform-scale work that ships *zero text*. The P0 tracer-bullet below is the lean
> path to proving text-on-the-cutter without waiting for the refactor.

- **P0a — Tracer bullet (DONE 2026-06-16, TDD):** hardcoded string → opentype.js → SVG `<path>` → through the *actual* `buildLayerSVG` → engrave-ready `.svg`. Built `src/lib/text/{textToOutline,TextField}.js` (+ tests), bundled `WorkSans-Regular.ttf` (OFL) + `opentype.js@2`, fixture `src/test/loadWorkSans.js`, generator `scripts/text-tracer-sample.mjs` → `docs/text-tracer-sample.svg` (renders "Sara" correctly, counters intact, nonzero winding). 7 new tests, full suite 601 green. Validated: glyph geometry → correct physical output; single Path → canvas+SVG; counters survive (no confetti). *Remaining manual step: load `docs/text-tracer-sample.svg` into LightBurn and run a real engrave.*
- **P0b — Scene graph adapter (DONE 2026-06-16, TDD):** `src/lib/scene/{SceneNode,PatternNode,sceneGraph}.js`. `SceneGraph.fromLayers(layers, instances)` ⇄ `toExportInputs()` is a **lossless** round-trip — export via the graph is byte-identical to `buildAllLayersSVG` over `layers[]`, proven incl. a real generated `CirclePacking` (the zero-behavior-change guarantee). `SceneNode` carries `{id,type,transform{x,y,rotation,scale},visible}` (identity transform = the seam `TextNode` will use; patterns ignore it). `reorder()` + `serialize()` covered. 7 new tests; full suite 608 pass / 0 fail. **Additive only — NOT yet wired into Studio/useLayers** (that adoption is later/optional per §2.4).
- **P1 — Tools + selection + history:** `useActiveTool`, `CanvasToolbar`, hit-test, handles, `useHistory`. Select/move/rotate/resize *patterns* (proves the systems with no text yet).
  - **P1 cores DONE 2026-06-16 (TDD, parallel subagents), +57 tests, full suite 665 pass / 0 fail, build green:**
    - `src/lib/history/useHistory.js` — snapshot undo/redo reducer + hook (one `commit` = one user action; caller coalesces drags). 7 tests.
    - `src/lib/transform/transformOps.js` — `applyTransform`/`inversePoint`/`transformBBox` + **identity-safe `transformToSVG`** (''→identity). `handles.js` — 8 resize + rotate layout, `hitTestHandle`, `clampSize`. 20 tests.
    - `src/lib/scene/bbox.js` (PatternNode = full-canvas approx, documented) + `hitTest.js` (rotation-aware via inverse-transform). 
    - `src/lib/tools/{toolRegistry,useActiveTool}.js` — `activeTool` state + pure pointer router; `select` live, `text` registered-but-disabled (P2). 19 tests.
    - `PatternNode.toSVGGroup()` now applies the transform **identity-safe** → export byte-identical when identity (608 baseline preserved), `<g transform>` only when non-identity (proven in `PatternNode.transform.test.js`).
  - **P1 wiring slice 1 — DONE + browser-verified 2026-06-16 (move-only):** `CanvasToolbar.jsx` (Select active / Text disabled-P2), p5-drawn selection bbox, `nodeTransforms` + `selectedNodeId` + `useHistory` in `Studio`, pointer overlay in `RightPanel` (`screenToCanvas` coord-mapping), `useCanvas` applies per-layer translate (rAF immediate re-render, params still 150ms-debounced), export routed through `buildSceneSVG`/`SceneGraph.fromLayers(…, transforms)`. Helpers: `src/lib/canvas/coords.js`, `src/lib/tools/moveTransform.js`. **Verified in real browser:** click-select + drag moves the pattern, NO snap-back, Cmd+Z/⇧Z undo/redo, only the pre-existing nested-button console warning. Build green, 683 tests / 0 fail, eslint clean.
  - **P1 slice 2 — DONE + browser-verified 2026-06-16 (rotate + resize):** center-pivot reconciled — `transformToSVG(transform, pivot)` emits `translate(x y) translate(cx cy) rotate scale translate(-cx -cy)`; `buildSceneSVG` passes LOCAL bbox center (NOT world AABB center — that would break canvas==SVG for translated+rotated nodes); `useCanvas` renders the matching p5 sequence and draws the 8 resize + rotate handles inside the node transform. Gestures via pure `src/lib/tools/transformGestures.js` (`classifyPointer`/`rotateTransform`/`scaleTransform`, uniform scale, Shift=15° rotate snap); RightPanel branches pointerdown on handle-vs-node (overlay extended above canvas so the rotate handle is grabbable). **Browser-verified:** rotate-about-center, corner-resize scale-about-center, undo/redo, handles transform with node, no new console errors. 704 tests / 0 fail, build+eslint green.
  - **P1 known gaps (carry into P2):** PatternNode full-canvas bbox → empty-click-deselect doesn't fire (Esc works), resize is uniform-only (per-axis reflow is a TEXT concern), handle hot-spot scales with node, regenerate-per-drag CPU cost (two-cadence render). All shine/resolve once TextNode has a real tight bbox.
- **P2 — Text core & editor — DONE + browser-verified 2026-06-16:**
  - P2a: `src/lib/text/{textLayout,fitText}.js` + `src/lib/scene/TextNode.js` (tight localBBox, fill/outline engrave, serialize→fontId).
  - P2b-1: `src/lib/text/fontRegistry.js` (Work Sans OFL via Vite `?url`, memoized `loadFont`, `useFont`).
  - P2b-2a: text renders on canvas (`drawTextNode.js`, opentype cmds→p5 with counter holes) + exports (`buildCombinedSceneSVG`). **Fixed a real bug:** opentype 2.0.0 `toPathData()` emits NaN for quadratic segments on TrueType fonts — now serialize from clean commands (`commandsToPathData`).
  - P2b-2b-i: text nodes selectable/movable/rotatable/resizable via unified `src/lib/scene/selectables.js` + shared `transforms` map (undo for free); tight bbox + per-node center pivot.
  - P2b-2b-ii: **live editor** — Text tool drag-create (rubber-band) / click point-text, hidden `<textarea>` capture (IME/paste), p5 blinking caret (`src/lib/text/caret.js`), Enter=newline, Esc/click-away/tool-switch commits, empty→delete, double-click re-edit, `TextEditOverlay.jsx`. History evolved to composite `{transforms, textNodes}` so undo covers text content.
  - **Verified in browser (Playwright):** create→type "Sara"→caret→commit→select→move→double-click→"Sarah"→Cmd+Z reverts. 771 tests / 0 fail, build green, 0 new console errors. Uncommitted on `text-feature`.
  - **Known v1 simplification:** mouse caret-repositioning inside an editing node isn't supported (textarea holds focus; caret moves via typing/arrows). Deferred.
- **P3 — Text polish:** properties panel (font/size/align/outline-vs-fill engrave/role), threshold + width-fit safeguard, physical units, engrave-ability warnings, share-view rendering, tier/persistence wiring. Order (confirmed): 1 width-fit → 2 persistence → 3 share-view → 4 properties panel → 5 mm units → 6 engrave warnings. **Tier gating (§6.15): user-confirmed UNGATED in v1** — text available to all tiers, no per-design node cap, no `useGate`/`tierLimits` wiring; can gate later non-breakingly (persistence round-trips regardless of tier).
  - **P3-6 engrave-ability warnings — DONE + browser-verified 2026-06-16 (TDD):** pure `src/lib/text/engraveCheck.js` `textEngraveWarnings(node, font, {minCapHeightMm})` → flags text whose physical **cap-height is below a ~1.5mm clean-engrave floor** (`MIN_CAP_HEIGHT_MM`), measured at the EFFECTIVE size so a width-fit-shrunk single line is judged at what actually engraves. This is the tractable proxy for "thin text / sub-kerf counters" (counters burn shut, fine strokes lose definition). Surfaced inline in `TextPropertiesPanel` as an amber `role=alert` box. Deferred (noted): exact per-counter sub-kerf geometry analysis + bed-bounds clipping (canvas `BedOverlay` already visualizes bed). +6 tests (800 pass/4 skip), build+eslint clean. **Browser ground-truth:** size 1mm → "⚠ Cap height ≈0.7mm is below the ~1.5mm clean-engrave minimum…"; 10mm → warning clears; no new console errors (pre-existing ParamGroup nested-button only). Uncommitted. **P3 COMPLETE (all 6 items).**
  - **P3-4 properties panel + P3-5 mm units — DONE + browser-verified 2026-06-16 (TDD for pure bits):** `src/components/TextPropertiesPanel.jsx` renders in the LeftPanel **Design tab** when a text node is selected (desktop + mobile), reusing `Select`/`NumberInput`/`ColorPicker` primitives. Controls: **Font** picker (only Work Sans bundled so far → single option; more fonts deferred), **Size in mm** + live **cap-height readout** (`capHeightPx` pure helper, OS/2 sCapHeight ratio; mm via `units.pxToUnit`/`unitToPx` at 96 PPI), **Align** L/C/R, **Engrave style** Fill/Outline (the export-honored `renderMode`), **Color** swatch. **Scope (user-confirmed):** engrave-only — color = engrave paint, fill/outline = the two engrave sub-modes; NO cut/score role selector (workshop is engrave-only; text export bypasses applyOutputMode). Edits flow through Studio `handleUpdateTextNode(id, patch)` → live re-layout/render + a **350ms trailing-debounce history commit** so typing a size / dragging color collapses to ONE undo entry. Deferred: line-height + letter-spacing controls (letter-spacing needs layout support), respecting the global unit toggle (mm-only for now). **Browser ground-truth:** select node → panel shows (cap ≈8.4mm @48px); Size 48px→**113.39px = exactly 30mm**; single Cmd+Z reverts the whole edit; align left→center + fill→outline flip the node. **Advisor-caught fix (verified):** the cap-height readout originally used STORED fontSize, but for a width-capped single-line area box the glyphs render/export at `effectiveFontSize` — divergence (e.g. stored→23.5mm vs actual 8.0mm). Cap readout now uses effective size + a "· fits width" annotation when capped; locked by a `TextNode.toSVGGroup` export-invariant test (exports at effective, not stored). Also TODO(multi-font) comments at the two single-font render sites (Studio/ShareView resolve one font for all nodes). 801 tests/4 skip, build+eslint clean, only the pre-existing ParamGroup nested-button warning. Uncommitted.
    - **UX-review polish pass (2026-06-16, /audit + /impeccable via 2 review subagents, audit score 12→ improved):** fixed in `TextPropertiesPanel.jsx` — (1) engrave warning now uses theme-flipping `tone-mild` tokens (was raw `amber-*`: failed contrast + didn't theme-flip; matches `OverlapWarnings` baseline); (2) `role="alert"`→`role="status"` (polite, no per-keystroke re-announce); (3) segmented Align/Style now `role="radiogroup"`+`role="radio"`/`aria-checked` (active state was color-only); (4) "mm cap"→"mm cap-height" (disambiguates from "capped/fits-width"); (5) Color row → label-above to match the other controls; (6) single-bundled-font shows a static field ("more soon") instead of a broken 1-option `<select>`; (7) grouped spacing rhythm (Type / Appearance) + `rounded-md` (was off-scale `rounded-lg`). **Flagged, NOT changed (shared app-wide primitives — need user OK):** `ui/ColorPicker.jsx` swatch is a non-focusable `<div>` (keyboard/focus a11y); `ui/Select.jsx`+`ui/NumberInput.jsx` labels lack `htmlFor` association. Verified in browser. 801 tests still green.
  - **P3-3 share-view rendering — DONE + browser-verified 2026-06-16:** the DB-backed read-only `/share/:token` page (`ShareView.jsx`) now renders published text. It threads `config.bgColor`/`transforms`/`textNodes` + the bundled font (`useFont(DEFAULT_FONT_ID)`) into `useCanvas` (which already draws text via `drawTextNode`); display-only (selectedNodeId/editingNodeId null, no tools). No external font dep — text re-renders from stored `fontId` + bundled outline (single-geometry source), NOT baked paths. **Fixed a latent p5 teardown race** surfaced by ShareView's async design load (canvas dims change post-mount → p5 recreated → a scheduled rAF `renderAll` ran before the new instance's `setup()` built its renderer → `p.clear()` deref'd undefined): `renderAll` now bails on `!p._renderer`. Hardening benefits all `useCanvas` callers. **Browser ground-truth (Supabase RPC mocked):** published design with a 12°-rotated "SHARED" node renders correctly (transform honored, author header shown), 0 console errors. 792 tests/4 skip, build+eslint clean (only pre-existing renderAll hook-dep warning). Uncommitted.
  - **P3-2 persistence round-trip — DONE + browser-verified 2026-06-16 (TDD):** `textNodes` + the shared `transforms` map now save/load across ALL three surfaces — stateless `?s=` share link (`buildState`/share-hydration), cloud `config` (`useCloudPersistence`), and a new local backup (`sonoform-text` key). New pieces: `useHistory` **RESET** action + `reset(present)` (loaded design = fresh baseline, undo stacks cleared); pure `src/lib/scene/designState.js` (`collectLiveIds`/`filterTransforms`/`parseTextNodes` — transforms filtered to live ids so deleted-node entries don't accumulate); `loadInitialTextState()` initializer in `useDesignPersistence` so reload restores text **synchronously via the `useHistory` initializer** (avoids a clobber race the restore-effect approach hit — caught in browser, fixed). Studio routes every load through `applyTextState()` (= `history.reset`) — share, cloud, cloud-config, examples, group-load (examples/groups clear text → flagged: **group-SAVE drops text**, known limitation). `serializeState`/`isDirty` extended so text edits register as unsaved. **Side effect (intended, flag at commit): pattern MOVES now persist too** (same shared map — pre-existing gap closed). Old saves without these fields load at identity (backward-compatible). +21 tests (792 pass/4 skip), build+eslint clean. **Browser ground-truth:** create→type→commit→reload restores editable text (fontId only, no live font); `?s=` link hydrates a distinct design with local backup cleared; 0 console errors. Uncommitted.
  - **P3-1 width-fit safeguard — DONE + browser-verified 2026-06-16 (TDD):** pure `effectiveFontSize(node, font, {minFontSize})` in `src/lib/text/fitText.js` = min(stored heightFit, widthFit) for single-line AREA boxes only (`lineMode==='single' && box.w>0`); multi-line wraps, point text grows freely. Linear via `advance = box.w / getAdvanceWidth(text,1)`. Centralized as `TextNode.effectiveFontSize()`; ALL geometry consumers route through it — `TextNode.layout()`/`toSVGGroup()`, `drawTextNode.textNodeCommands`, `useCanvas` caret (size + strokeWeight), `TextEditOverlay` textarea size/box. +6 tests (777 pass/4 skip), build+eslint clean. **Browser ground-truth:** a single line stored at 157px in an 808px-wide box capped to 45.68px → advance 808.42 == box width (would've burst ~3.4× without it); 0 console errors. Uncommitted.
- **Deferred:** cut-mode + stencil bridges, plotter hatch-fill, Hershey single-stroke, font upload / Google Fonts, complex-script (harfbuzz), text-on-path.
```
