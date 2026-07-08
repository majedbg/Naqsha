# SVG Motif — P5 (polish + spec-completion) ORCHESTRATOR — 2026-07-08

> **RESUME RULE:** a fresh session reads this file FIRST, trusts the WI statuses below, skips every
> `done` WI, and continues from the first non-`done` one. Update this doc BEFORE and AFTER each
> sub-agent / slice. Spec: `svg-motif-editor-P2-PLAN.md` (LOCKED hotkey table), `svg-motif-editor-
> DECISIONS.md`. Shipped: P1/P2/P4 orchestrators. Baseline suite before P5: **3920 passed / 54 skipped**.

**P5 goal:** close the loose ends P2/P4 explicitly flagged — (1) Pen-tool spec completion (`+`/`−` key
bindings + Space-reposition-while-placing, verified vs the LOCKED table), (2) P4 UX polish (visible
save-to-library feedback + single-undo copy-on-use), (3) real-world SVG import fidelity (transforms +
basic shapes), built as the SAFE incremental version with fuller options flagged.

## Seams verified in code (recon 2026-07-08)
- **penMachine.js** (pure, model-coords): `hitTest`, `hitTestSegment`, `addAnchorOnSegment`,
  `deleteAnchors`, `appendAnchor`, `closeSubpath`, `moveAnchor/Handle/WholePath`, `convertAnchor`,
  `setSmoothHandle`, root helpers, `constrainTo45`. Every op immutable, returns new paths.
- **PenCanvas.jsx**: `spaceRef` (window keydown/keyup) drives PAN. `penDown` handles idle add/delete
  (pen-hover) + append; `pen-append` drag pulls the smooth `out` handle. Tools: pen/direct-select/
  move/convert; `changeTool` lives in the modal. `dragRef.current.kind==='pen-append'` = placing.
- **MotifEditorModal.jsx** `handleKeyDown` (~138): stopPropagation on all; p/a/v/Shift+C tool keys,
  ⌘Z/Delete scoped; input-focus guard. Footer (~326) has the P4 "Save to my library" button —
  `onSaveToLibrary?.(serialize())` fire-and-forget, NO feedback (the gap). `canSaveToLibrary`/
  `isLoggedIn`/`onRequireSignIn` props.
- **useMotifEditor.js**: working-copy hook; `changeTool` NOT here (in modal). Pure helpers exported.
- **Inspector.jsx `MotifDevice`** (~572): glyph `<select>` onChange (~781) does copy-on-use =
  `onCopyLibraryGlyph(lib.glyph)` **then** `onUpdateLayer(...)` → **two** undo entries.
- **Studio.jsx**: `recordBatch(fn)` (~260) = `beginCoalesce()/fn()/endCoalesce()` folds multi-slice
  mutations into ONE undo entry. `onCopyLibraryGlyph={(g)=>updateCustomGlyph?.(g.id,g)}` (~1954).
  `libraryMotifs` from `useGlobalMotifLibrary(user)`.
- **useGlobalMotifLibrary.js**: `promote(glyph)` → `Promise<motif|null>` (null on offline/error,
  never throws) — the seam save-to-library feedback reads.
- **useCloudPersistence.saveState** idiom = `idle|saving|saved|error` — the status pattern to mirror.

## File-lock / parallelism map
- **Slice 1** (pen-tool): `penMachine.js`, `PenCanvas.jsx`, `MotifEditorModal.jsx`, `useMotifEditor.js` (+tests).
- **Slice 2** (P4 polish): `MotifEditorModal.jsx`, `Inspector.jsx`, `Studio.jsx` (+tests).
- **Slice 3** (import): `importMotif.js`, `svgImport.js` (+tests).
- Slice 1 & Slice 2 BOTH write `MotifEditorModal.jsx` → run **SEQUENTIAL ON MAIN** (slice 1 then 2).
- Slice 3 is **DISJOINT** → **PARALLEL worktree**, integrated by orchestrator (stage→apply→full
  test+lint→remove worktree).

## Work items

| WI | Description | Files (one writer) | Status |
|----|-------------|--------------------|--------|
| P5-1 | Pen-tool spec completion: `+`/`−` add/delete-anchor **tool** key bindings (Illustrator: `+`=Add-Anchor tool, `−`=Delete-Anchor tool) reusing `addAnchorOnSegment`/`deleteAnchors`; **Space while placing a pen anchor repositions that anchor** (pen-append drag + space → move point, not pull handle). Verify vs LOCKED table; close any other gap. | penMachine.js, PenCanvas.jsx, MotifEditorModal.jsx, useMotifEditor.js (+tests) | **done** ✅ |
| P5-2 | P4 UX polish: (a) modal "Save to my library" gets `idle→saving→saved→error` feedback (mirror `useCloudPersistence.saveState`); (b) copy-on-use collapses to ONE undo entry via `recordBatch` (Studio `onUseLibraryGlyph(glyph,layerId,params)` wrapping updateCustomGlyph+updateLayer; Inspector calls it for library selections). | MotifEditorModal.jsx, Inspector.jsx, Studio.jsx (+tests) | **done** ✅ |
| P5-3 | Import transform-fidelity (SAFE incremental, advisor-gated): flatten a single top-level `transform` + convert basic shapes (rect/circle/ellipse/line/polygon/polyline) → `d`, keep regex/no-DOM approach; graceful fallback to today's behavior on anything unparseable. Record fuller options (nested-group matrices, DOMParser) as a flagged follow-up. | importMotif.js, svgImport.js (+tests) | **done** ✅ |

## Integration protocol
- Slice 3 worktree: stage diff → apply onto main → full `npm test` + `npm run lint` → remove worktree.
- Slices 1/2 sequential on main (sole writer). After EACH slice: full `npm test` + `npm run lint`, update this doc.

## Guardrails (auto-committer is ON — keep the tree clean)
- Never reset/force-push. Never touch 3D WIP: `src/components/canvas3d/**` (Marks.jsx, CameraRig.jsx),
  `src/lib/three3d/**`. Only intended P5 files modified.
- Do NOT deviate from the Illustrator LOCKED table. Skip Playwright/browser E2E (unit/integration only).
- Slice 3 must never crash on unparseable input — degrade to today's path-only behavior.

## Advisor-locked contracts (fold into briefs)
- **Slice 3 — `parseSVGImport` is SHARED** (`useLayers.js:290` artwork import, `scene/placement.js:131`,
  `importMotif.js:71`). **DO NOT mutate its `{ok, paths: string[]}` contract** — it would silently
  regress artwork import + placement. Add a NEW enhanced extractor in `svgImport.js` (e.g.
  `extractMotifDrawables(svg)`) that `importMotif` alone consumes; `parseSVGImport` stays byte-unchanged.
- **Slice 3 — only rewrite `d` when a transform actually applies.** Untransformed `<path>` stays
  VERBATIM (preserves curve-export fidelity). Only converted basic shapes + transform-bearing elements
  get a new `d`. To transform a `d`: `parseDToAnchors` (pure, import-safe, A/Q/T→cubic absolute) →
  apply the 2×3 matrix to every anchor+handle point → `anchorsToD`. Sidesteps per-command/arc-under-
  shear math; only loss = arc→cubic (already the accepted lossy case per DECISIONS).
- **Slice 3 — scope:** element-own `transform` + a SINGLE top-level (`<svg>` or one outer `<g>`)
  transform. Nested/multiple-group matrix chains = FLAGGED DOMParser follow-up (regex has no nesting
  model — do NOT claim nested support). Anything unparseable degrades to today's path-only behavior,
  never throws.
- **Slice 2 — prove single-undo** (mirror `recordSites.integration.test.jsx`): copy-on-use = exactly
  ONE history entry; one ⌘Z reverts BOTH glyph-copy + rebind. Verify updateCustomGlyph + updateLayer
  both record INSIDE the `beginCoalesce/endCoalesce` window (recordStructural calls flushEdit —
  confirm the param-burst composes, doesn't escape). Idempotent case (glyph already present) = rebind
  only = naturally one entry.
- **Slice 1 — `+`/`−` = tool-selector interpretation** (Illustrator: `+`=Add-Anchor tool, `−`=Delete-
  Anchor tool), satisfying the LOCKED table's "+/− OR pen-over" reading. Documented spec-choice, not a
  deviation. Space-reposition REUSES the existing `spaceRef` (no 2nd space path); hook the `pen-append`
  branch in `onPointerMove`. LOCKED-table scan confirms these two are the ONLY remaining gaps.

## Run log
- **2026-07-08 (start):** Read DECISIONS + P2-PLAN (LOCKED table) + P2/P4 orchestrators. Recon'd
  penMachine ops, PenCanvas pen-append/space-pan, modal handleKeyDown + save-to-library footer,
  useMotifEditor, Inspector copy-on-use (two-undo), Studio recordBatch, useGlobalMotifLibrary.promote,
  useCloudPersistence.saveState idiom. Decomposed into 3 slices (map above). Advisor folded 5 contracts
  (above). Verified `parseSVGImport` blast radius (shared 3 sites) + pathModel exports (pure). Confirmed
  LOCKED-table scan: only gaps = `+`/`−` keys + Space-reposition. Dispatching Slice 1 (on main) ‖
  Slice 3 (worktree) — disjoint file sets. Slice 2 sequential after Slice 1 (shared modal file).
- **2026-07-08 (P5-1 + P5-3 done, integrated):** Both worktree sub-agents landed; disjoint file sets
  applied to main cleanly, worktrees removed.
  **P5-1** (pen-tool): NO penMachine/useMotifEditor changes needed — reused existing pure ops. Modal:
  `add-anchor`/`delete-anchor` added to TOOLS (+toolbar buttons) + `handleKeyDown` cases (`+`/`=`→add,
  `-`/`_`→delete; no shift-guard since either chord must fire). PenCanvas: factored idle add/delete into
  shared `addAnchorAt`/`deleteAnchorAt`, dispatched by the two new tools; hover behavior untouched.
  Space-reposition: `pen-append` move branch checks the SAME `spaceRef` → re-previews a CORNER anchor at
  cursor + updates `drag.point`; release resumes handle-pull; still one commit=one undo. THIRD gap found
  on re-scan + closed: Shift-45°-constrain was missing on (1) pen-draw handle-pull [clearly in scope] and
  (2) V/move-path drag [broader "while dragging" reading — RATIFIED as Illustrator-faithful]. 5 new tests.
  **P5-3** (import): NEW `extractMotifDrawables(svg)→{ok,paths:string[]}` in svgImport.js (parseSVGImport
  UNTOUCHED — its 6 tests pass byte-identical). Shapes: rect(+rounded rx/ry cross-default+clamp)/circle/
  ellipse/line/polygon(closed)/polyline(open). Transforms: matrix/translate/scale/rotate(a[,cx,cy])/skewX/
  skewY, composed L→R, effective = top-level × element-own. `transformD` = parseDToAnchors→apply 2×3 matrix
  to anchors+handles→anchorsToD (no per-command/arc math; arc→cubic is the accepted lossy case). Untransformed
  `<path>` stays VERBATIM (proof tests both layers). EXTRA safety rail: a lone top-level `<g transform>` is
  honored ONLY when exactly one `<g>` exists (≥2 siblings → degrade, never mis-apply). 30 new tests.
  **Fixture fix (orchestrator):** `Inspector.motif.test.jsx` "no-path SVG" fixture used `<rect>` (now
  importable) → swapped to `<text>hi</text>` (genuinely no drawable geometry). Full suite **3956 passed /
  54 skipped / 0 fail**. Lint clean on all touched files. Committed P5-1+P5-3 as `3e6f227`.
- **2026-07-08 (P5-2 done — the Slice-2 sub-agent died on an API stall before writing; orchestrator
  implemented it directly on main via TDD):**
  **Task A (save feedback):** modal holds `libStatus∈idle|saving|saved|error` + a `handleSaveToLibrary`
  async handler — `saving` while `await onSaveToLibrary(serialize())`, then `saved` (truthy) / `error`
  (null-or-throw; promote never throws), auto-clearing to `idle` after 2.4s (timer cleared on unmount /
  re-click). Button label reflects status ("Saving…"/"Saved ✓"/"Couldn't save"), disabled while saving,
  `border-jewel-madder` on error, `aria-live=polite`. 2 new modal tests (saving→saved via a controllable
  promise; failure→"couldn't save"). Existing P4 login/entitlement tests unchanged.
  **Task B (single-undo copy-on-use):** verified `useHistory` — `beginCoalesce` is idempotent (no
  re-capture) + `record()` is suppressed inside an open window → the batch = exactly ONE entry with the
  true pre-gesture snapshot, and `endCoalesce` clears the idle timer (advisor hazard resolved: the nested
  updateLayer.recordEdit `beginCoalesce({idleMs})` composes, doesn't escape). Studio adds
  `onUseLibraryGlyph(glyph,layerId,params)` = `recordBatch(()=>{ if(!customGlyphs[glyph.id]) updateCustomGlyph(...);
  updateLayer(layerId,{params}); })`; threaded through Inspector→SelectedLayerInspector→MotifDevice; the
  glyph `<select>` onChange routes library selections through it (legacy two-call path kept as fallback
  when the seam isn't wired). PROOF: extended the Studio-mirror `recordSites.integration.test.jsx` harness
  to carry `customGlyphs` in capture/restore + a `useLibraryGlyph` callback → new test asserts copy-on-use
  is ONE undo entry reverting BOTH the glyph copy AND the rebind (`canUndo` false after one ⌘Z). Inspector
  test asserts the batched seam fires once and the legacy two-call path does NOT. Full suite **3960 passed
  / 54 skipped / 0 fail**. Lint clean on all 6 touched files. Tree = only P5-2 files (no 3D WIP).
