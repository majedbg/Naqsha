# Text Tool Port Plan — `text-feature` → `main`

Status: PLAN (awaiting approval). Branch: `feat/text-tool-port` (off `main` @ `dadead3`).
Foundation checkpoint committed: `5171635` (SVG placement + move/resize transforms, 70/70 green).

## Why a port, not a merge

`text-feature` branched off old base `448f8ad` (+7 commits, old architecture).
`main` advanced +79 commits onto a new architecture (rework, shell redesign,
object-tree, org-admin MVP). A direct `git merge text-feature` would delete
~26.7k lines of main (org-admin, shell, kits). Rejected. We port the text
subsystem onto main's current architecture instead.

## What main already provides (no work needed)

- `transform/transformOps.js` — identical exports to text-feature incl. `transformToSVG` (the dep `TextNode` needs)
- `transform/handles.js`, `tools/transformGestures.js`, `tools/moveTransform.js` — move/resize gestures
- `scene/placement.js`, `scene/selectables.js`, `canvas/coords.js` — place + hit-test + coords
- `units.js`; UI `Select` / `NumberInput` / `ColorPicker`
- `useCanvas` live-transform render loop + per-layer `transform`; `RightPanel`/`Studio` pointer-place + move/resize patterns to mirror

## KEY DECISION — how text objects live in main's model

- **Option A — parallel `textNodes` array** (mirrors text-feature exactly).
  Studio holds `textNodes` state; `useCanvas` draws them via a `drawTextNode`
  loop alongside layers. Lowest friction, fastest, closest to source.
  Cost: a *second* selection/transform/export path that bypasses main's
  object-tree panel and layer UX.
- **Option B — text as a layer/node kind** (integrate into `useLayers`).
  Text flows through the same layer list, object-tree, selection, transform,
  and export as everything else. More adaptation work in `TextNode` + `useLayers`
  + export, but one unified path and text appears in the object-tree panel.

Recommendation: **Option B** — main invested 79 commits in a layer/object-tree
model; a parallel array would fragment selection/export/UX. Plan below assumes B
(notes mark where A would differ).

## Dependencies to add

- `opentype.js@^2.0.0` (package.json + lockfile)
- `src/assets/fonts/WorkSans-Regular.ttf` + `WorkSans-OFL.txt` (license)
- test helper `src/test/loadWorkSans.js`

## Port phases (TDD: copy tests first, green per phase)

### Phase 1 — Pure geometry modules (verbatim copy + their tests)
Zero architecture coupling; copy as-is from text-feature:
`text/textLayout.js`, `text/textToOutline.js`, `text/fitText.js`,
`text/caret.js`, `text/engraveCheck.js` (uses existing `units.js`),
`text/TextField.js`, `text/fontRegistry.js` (opentype + font asset).
Gate: their ~8 test files green in isolation.

### Phase 2 — TextNode adapted to main's model
Reshape `scene/TextNode.js` to main's node/layer shape (Option B: a node kind
consumable by `useLayers`/object-tree; Option A: standalone as in source).
Keep deps `transformToSVG`/`layoutText`/`textToOutline`/`effectiveFontSize`
(all present). Then `text/drawTextNode.js` ports unchanged (depends only on TextNode).
Gate: TextNode + drawTextNode tests green.

### Phase 3 — Rendering integration
Wire `drawTextNode` into main's `useCanvas` draw loop (B: iterate text-kind
layers; A: separate `textNodes` loop). Reuse existing transforms map + center-pivot.
Gate: a text node renders to canvas in a render smoke test.

### Phase 4 — Tool activation + pointer interaction
- `tools/toolRegistry.js`: flip `text` from inert → enabled (cursor `text`, hotkey T).
- `RightPanel.jsx`: add `textActive` branch to pointer handlers — drag-to-create
  text box (mirror the placement/`createRect` pattern from the foundation commit);
  enter edit mode on click of existing text.
- `ControlBar.jsx`: remove the "intentionally inert" guard; back controls with real state.
Gate: pointer create + select via existing selectables/handles.

### Phase 5 — Edit + properties UI
- `components/canvas/TextEditOverlay.jsx` (hidden textarea / IME / caret) — depends on TextNode.
- `components/TextPropertiesPanel.jsx` — deps (`Select`/`NumberInput`/`ColorPicker`/`fitText`/`engraveCheck`/`units`) all present.
- Studio: editingNodeId state + create/edit/exit handlers (mirror liveTransform pattern).
Gate: type/edit text, props update live.

### Phase 6 — Export + history
- `svgExport.js`: emit text outlines (textToOutline path data) on SVG export; engrave default.
- Ensure text ops flow through main's undo/history.
Gate: `svgExport` scene/combined tests green; round-trip a text node to SVG.

### Phase 7 — Full suite + browser verify
Full `npm test` green; launch app, place/edit/export a text object in-browser.

## Risk / scope notes
- ~20 files; ~10 verbatim (pure modules + tests), ~5 genuine integration rewrites.
- Funnel = `TextNode`; once adapted, downstream falls in.
- text-feature's own `scene/SceneNode.js`, `sceneGraph.js`, `designState.js`,
  `PatternNode.js`, `bbox.js`, `hitTest.js` are NOT ported — main has its own
  scene/selection infra; TextNode is rebased onto that.
- Option A is the fast path if object-tree integration is deferred; flag before Phase 2.
