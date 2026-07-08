# SVG Motif — P2 (pen editor) ORCHESTRATOR — 2026-07-08

> **RESUME RULE:** a fresh session reads this file FIRST, trusts the WI statuses below, skips every
> `done` WI, and continues from the first non-`done` one. Update this doc BEFORE and AFTER each
> sub-agent dispatch — never batch. Spec: `svg-motif-editor-P2-PLAN.md`. Decisions:
> `svg-motif-editor-DECISIONS.md`. Shipped spine: `svg-motif-editor-P1-ORCHESTRATOR.md`.

**P2 goal:** an Illustrator-faithful pen editor modal (Naqsha-skinned chrome) that BOTH edits an
imported motif's anchors/handles/root AND draws motifs from scratch. Working-copy semantics: Save
commits (all N layers using the glyph restamp), Cancel discards, Save-as-copy forks. Live editor
canvas + throttled mini full-canvas Preview. TDD per WI. Baseline suite: **3761 passed / 54 skipped**.

## Architecture (verified in code + advisor-reviewed 2026-07-08)

### The P1 seams we build on (all shipped, verified)
- **Glyph shape** (`motif/glyphs.js`): `{ id, name, tradition, paths: [{d, closed}], viewRadius, root:{x,y,angle} }`.
  `getGlyph(id, customGlyphs)` — **built-ins ALWAYS win**; custom map consulted only for non-builtin ids.
- **`importMotif` emits `glyph.paths` as an ARRAY of single-`d` entries** (`closed` per glyph-path,
  `d` kept VERBATIM). A single `d` may itself contain multiple `M…Z` subpaths. ⇒ `parseDToAnchors`
  takes ONE `d` (multi-subpath aware); the editor maps over `glyph.paths[]`.
- **Store** (`useLayers.js`): `customGlyphs` state, `addCustomGlyph(glyph)→id` (stamps id), bulk
  `setCustomGlyphs`. `recordStructuralFn()` = the undo-history injection (call IMMEDIATELY BEFORE a
  setState to snapshot the pre-edit doc). `genGlyphId()` at line 54.
- **Undo history already carries customGlyphs**: `history/documentSnapshot.js` captures
  (`structuredClone(getCustomGlyphs())`, line 49) and restores (`setCustomGlyphs(s.customGlyphs ?? {})`,
  line 65). ⇒ a Save that goes through `updateCustomGlyph`+`recordStructuralFn` is undoable with ZERO
  extra snapshot wiring.
- **Render/propagation seam**: `useCanvas(…, customGlyphs)` resolves each motif's `glyphRef` upstream
  and injects the resolved `glyph` object into renderParams; `customGlyphs` is in its memo deps
  (line 367). ⇒ `updateCustomGlyph` restamps every `glyphRef===id` layer AUTOMATICALLY — **do NOT
  iterate layers**. Studio + ShareView + export all reuse this one seam.
- **Inspector `MotifDevice`** (line 572): per-motif-row picker (Built-in / Custom optgroups) +
  "Import SVG as motif…" per row. This is where the **Edit** (pencil) button + "New motif…" go.

### Advisor-locked contracts (fold into briefs — these are the real hazards)
1. **Fidelity is the EDITOR's dirty-flag job, NOT pathModel's.** `pathModel.js` is pure parse/serialize.
   Of the normalizations only **A→cubic is lossy**; L/C/Q/T→cubic are EXACT. The round-trip tolerance
   test proves the model *can* reproduce geometry — it is NOT license to always re-serialize. An
   UNEDITED Save must write the **verbatim original `d`**; only a dirty (edited) glyph-path serializes
   its model. `type` (corner/smooth) is an INTERACTION HINT ONLY — it must never change `anchorsToD`'s
   emitted geometry.
2. **`updateCustomGlyph` is free — don't hand-roll restamp.** `updateCustomGlyph(id, glyph)` =
   `recordStructuralFn()` then `setCustomGlyphs(prev => ({...prev, [id]:{...glyph, id}}))`. Render memo
   + snapshot do the rest. `updateCustomGlyph` on a BUILT-IN id silently no-ops at render (built-ins
   win in getGlyph) → the modal must enforce "Duplicate to edit" so that path is unreachable.
3. **Preview override seam.** A SECOND `useCanvas` with `customGlyphs` override
   `{...customGlyphs, [editId]: workingGlyph}`. Throttle the PUSH of workingGlyph into the override to
   rAF / drag-release (that identity change re-runs the whole pipeline). Before WI-P2-5, read Studio's
   `useCanvas(...)` call site and thread the SAME inputs (layers/bgColor/font/operations/outputMode/
   colorView/panels).
4. **Two undo stacks — do NOT conflate.** In-modal ⌘Z operates on the working-copy anchor history
   (local, discarded on Cancel). Only **Save** writes ONE document-history entry. An anchor drag must
   never touch document history; modal ⌘Z must not trigger document undo.
5. **viewRadius recomputes on ANY geometry OR root change** (D7-reconcile: viewRadius = max dist from
   root). Recompute live in the working copy so it flows to both Save and the preview override.
6. **Keyboard scoping.** Modal traps focus + `stopPropagation`/`preventDefault` on handled keys —
   especially **Delete** (anchor delete, NOT layer delete) and **⌘Z** — so they don't leak to global
   app shortcuts.
7. **`closed` lives per-subpath in the model** (from Z); glyph-path-level `closed` kept in sync on
   serialize.

## Waves & work items

### Wave 1 — parallel worktrees (disjoint, pure)
| WI | Description | TDD | Files (one writer) | Status |
|----|-------------|-----|--------------------|--------|
| WI-P2-1 | `pathModel.js` — `parseDToAnchors(d)` / `anchorsToD(model)`, cubic-normalized (Q/T/A→cubic, L→null-handle), corner/smooth inference from handle collinearity, fidelity round-trip (parse→serialize→flatten ≈ original→flatten). ONE `d` in/out, multi-subpath aware. `type` never alters geometry. | RED→GREEN vertical slices | `src/lib/motif/pathModel.js` (+test) | **done** ✅ integrated (22 tests) |
| WI-P2-1b | Store: `updateCustomGlyph(id, glyph)` (recordStructuralFn + setCustomGlyphs merge) + `deleteCustomGlyph(id)`; wire `addCustomGlyph`/`updateCustomGlyph`/`deleteCustomGlyph` into undo history (recordStructuralFn). Built-in id guard on update (no-op / not thrown). | CHAR (addCustomGlyph) then RED→GREEN | `src/lib/useLayers.js` (+`useLayers.customGlyphs.test.jsx`) | **done** ✅ integrated (14 tests) |

### Wave 2 — sequential on main (coupled editor, progressive)
| WI | Description | TDD | Files (one writer) | Status |
|----|-------------|-----|--------------------|--------|
| WI-P2-2 | `MotifEditorModal.jsx` shell (Naqsha `/impeccable craft` chrome) — working copy, Cancel/Save/Save-as-copy, "used by N layers" badge, Preview checkbox (inert for now), renders path READ-ONLY (from pathModel). Edit(pencil) button in MotifDevice (built-ins → "Duplicate to edit"). Wire Save→updateCustomGlyph, Save-as-copy→addCustomGlyph+rebind. Dirty-flag verbatim-`d` preservation. | RED→GREEN (component + wiring) | `src/components/motif-editor/MotifEditorModal.jsx`, `useMotifEditor.js`, `Inspector.jsx` (Edit button), `Studio.jsx` (modal mount + updateCustomGlyph wire) (+tests) | **done** ✅ integrated (20 tests) |
| WI-P2-3 | `penMachine.js` (pure) + `PenCanvas.jsx` DIRECT-SELECTION — render anchors/handles/root; hit-test; drag anchors + handles (smooth symmetric, ⌥-break→cusp); marquee multi-select; Delete. Machine tested headless. | RED→GREEN pure machine, then canvas | `src/components/motif-editor/penMachine.js`, `PenCanvas.jsx` (+tests); `useMotifEditor.js` (edit-commit + modal-undo), `MotifEditorModal.jsx` (embed PenCanvas) | **done** ✅ integrated (47 tests) |
| WI-P2-4 | Pen tool DRAW + structural edits — P (click=corner, drag=smooth, click-first=close, Esc/Enter finish), +/− add/delete-on-segment, Shift+C convert, ⌥ retract, double-click toggle, ⌘ temp-direct-select. Folds in draw-from-scratch ("New motif…"). Full hotkey map. | RED→GREEN pure machine, then canvas/hotkeys | `penMachine.js`, `PenCanvas.jsx`, `useMotifEditor.js`, `MotifEditorModal.jsx`, `Inspector.jsx` ("New motif…"), `Studio.jsx` (+tests). Runs SEQUENTIAL ON MAIN (non-worktree) — depends on uncommitted WI-P2-3 files. | **done** ✅ integrated (70 tests) |
| WI-P2-5 | Root handle (point + growth arm — drag point=move, drag arm=angle), pan (space-drag) + zoom (scroll), Shift 45°-constrain, and the rAF-throttled mini full-canvas Preview (2nd useCanvas w/ customGlyphs override). Final integration + `npm run dev` gate. | RED→GREEN | `PenCanvas.jsx`, `penMachine.js`, `useMotifEditor.js`, `MotifEditorModal.jsx`, new `MiniPreview.jsx`, `Studio.jsx` (previewContext) (+tests). SEQUENTIAL ON MAIN. | **done** ✅ integrated (94 tests) |

## Integration protocol
- Wave-1 worktrees: stage each worktree's diff → apply onto main → full `npm test` + `npm run lint`
  (changed files must be clean; ~27-err lint baseline in untouched files is OK) → remove worktree.
- Wave-2 WIs run sequentially DIRECTLY ON MAIN (sole writer) OR worktree-isolated; ONE writer per file.
- After EACH WI integrates: full `npm test` + `npm run lint`, then update this doc's status + run log.

## Guardrails (auto-committer is ON — keep the tree clean)
- Never `git commit`/`push`/reset/force-push. Never touch `src/components/canvas3d/Marks.jsx` or
  `src/components/shell/OperationsPanel.jsx` (unrelated user WIP). Only intended P2 files modified.
- Green unit tests do NOT verify the interactive editor — a `npm run dev` human checklist ships at the end.
- Do NOT deviate from the Illustrator hotkeys/appearance in the PLAN. Any forced deviation → record here + flag.

## Run log
- **2026-07-08 (start):** Read PLAN + DECISIONS + P1-ORCHESTRATOR. Verified spine: glyph shape,
  getGlyph builtin-wins, importMotif paths-array shape (locks parseDToAnchors=one-`d`), store
  (addCustomGlyph/setCustomGlyphs/recordStructuralFn/genGlyphId), documentSnapshot already carries
  customGlyphs (49/65), useCanvas customGlyphs dep (367) → auto-restamp, MotifDevice row (572).
  Advisor folded 7 contracts (fidelity=dirty-flag, free-restamp, preview-override, two-undo-stacks,
  viewRadius-recompute, keyboard-scoping, closed-per-subpath). Dispatching Wave 1 (WI-P2-1 ‖ WI-P2-1b).
- **2026-07-08 (Wave 1 done, integrated):** Both worktrees applied to main (disjoint files).
  WI-P2-1 `pathModel.js`: `parseDToAnchors(d)→{subpaths:[{anchors:[{x,y,in,out,type}],closed}]}` /
  `anchorsToD(model)→d`. Absolute handles; L/H/V→null, C/S→direct, Q/T→exact 2/3 elevation, A→arc-to-
  cubic (≤90° pieces, only lossy case); `type` inferred, NEVER touches serialize output (slice-10 pins
  it). Round-trip = symmetric Hausdorff (vertex→nearest-segment, both dirs) <0.5px on flattenPathD(tol
  0.02) + closed-flag equality (goes RED on dropped Z). 22 tests. WI-P2-1b: `updateCustomGlyph` (built-in
  guard `id in MOTIF_GLYPHS`→no-op), `deleteCustomGlyph` (absent/built-in→no-op), `addCustomGlyph` now
  calls `recordStructuralFn` (P1 gap fixed). Guards early-return BEFORE recordStructuralFn (no dead undo
  step — deliberate departure from the unconditional-record pattern). 14 tests. Full suite **3795 passed
  / 54 skipped** (+34). pathModel lint clean; useLayers lint = pre-existing baseline only (211-213/252).
  Worktrees removed. NOTE: concurrent user WIP `CameraRig.jsx` (+ auto-committer Marks/three3d drift on
  main) present in tree — NOT mine, left untouched. Next: Wave 2 WI-P2-2 (modal shell, sequential on main).
- **2026-07-08 (WI-P2-2 done, integrated):** MotifEditorModal shell built in worktree (branched pre-WI-1,
  so agent used INJECTION SEAMS — parseD/anchorsToD passed as props; updateCustomGlyph optional-chained).
  Integrated onto main (Inspector/Studio drift-free vs base) + wired the two seams: Studio imports
  `{parseDToAnchors, anchorsToD}` from pathModel and passes them to the modal; `updateCustomGlyph` now
  resolves (real store fn on main) so **Save is LIVE**. Working-copy hook `useMotifEditor(glyph, {parseD,
  anchorsToD})` → `{ name, tradition, viewRadius, root, paths:[{d/*verbatim*/, closed, model, dirty}] }`;
  pure helpers `makeWorkingCopy/serializeWorkingCopy/recomputeViewRadius/usedByCount/boundsFromWorkingCopy`
  exported for later WIs. FIDELITY proven: serialize of an un-dirtied glyph = byte-identical `d` (incl. a
  cubic-C fixture). Modal: editable name, "Used by N layers" badge, inert Preview checkbox, read-only SVG
  render (violet stroke + jewel-madder ⊕ root), focus-trap + Esc→cancel + keydown stopPropagation. Chrome
  via `/impeccable craft` (naqsheh graph-paper surface, tokens.css only). Inspector: per-row ✎ Edit →
  `onEditGlyph` for custom; built-in → duplicate-to-edit (fork geometry, rebind, open). 20 tests. Full
  suite **3815 passed / 54 skipped** (+20). Lint clean on all touched files.
  ⚠ KNOWN LIMITATION (fix in WI-P2-3 when real bounds land): the modal's preview viewBox bounds-scan
  pairs every number in `d` as (x,y), so H/V/A-command imports may crop/over-pad the framing (display
  only; built-in M/L/Z exact). Next: WI-P2-3 (penMachine + PenCanvas direct-selection).
- **2026-07-08 (WI-P2-3 done, integrated):** NOTE — first WI-P2-3 dispatch hit a stale worktree base
  (branched before WI-1 was committed → "missing pathModel/updateCustomGlyph"); user COMMITTED all P2
  files (HEAD a279165), re-dispatched from a complete main → clean. `penMachine.js` (pure, model-coords):
  `hitTest` (handles>anchors priority), `moveAnchor` (anchor+handles ride together), `moveHandle`
  (smooth mirrors OPPOSITE handle's DIRECTION preserving its own LENGTH; ⌥ breaks tangent→type:'corner'),
  `deleteAnchors` (rejoin; drop <2-anchor subpath), `toggleSelect`/`marqueeSelect`/`isSelected`. 14 tests.
  `useMotifEditor`: `previewPaths` (transient, NO snapshot) + `applyEdit` (recompute viewRadius, push ONE
  undo baseline captured on first preview of a gesture) + `undo`/`redo` — MODAL-LOCAL only, never touch
  document history (advisor contract #4). Drag = many previews + one commit = one undo step (guarded by a
  preview→preview→commit→undo test — the advisor-caught naive-snapshot bug). `PenCanvas.jsx`: anchors=
  squares (hollow/filled-accent), handles=dots+direction-lines, root=jewel ⊕; screen→model via
  getScreenCTM().inverse() with an IDENTITY fallback for jsdom (documented CTM limitation). Modal keydown:
  ⌘Z/⇧⌘Z→undo/redo, Delete→delete-selected, all preventDefault+stopPropagation (won't leak to global
  layer-delete/undo); guarded to skip when focus is in the name input (advisor-caught: Backspace/⌘Z in the
  field was hijacked — 2 regression tests). **WI-P2-2 bounds limitation FIXED (this WI):** rewrote
  `boundsFromWorkingCopy` to use the parsed anchor MODEL (anchors+handles, exact for H/V/A) when present,
  number-scan only as per-path fallback; +1 test proving an arc that number-scan clips is framed correctly.
  46 agent tests + my 1 bounds test = 47 in motif-editor. Full suite **3842 passed / 54 skipped**. Lint
  clean; tree holds ONLY P2 files (no 3D WIP leaked). Next: WI-P2-4 (pen DRAW + structural edits + hotkeys).
- **2026-07-08 (WI-P2-4 done):** Ran SEQUENTIAL ON MAIN (non-worktree, to see uncommitted WI-P2-3 files
  — avoids the worktree-staleness trap). New pure penMachine ops (immutable, model-coords): `hitTestSegment`
  (line project + cubic De Casteljau sample), `addAnchorOnSegment` (line→null-handle corner; cubic→exact
  De Casteljau split preserving shape), `convertAnchor` (smooth=symmetric handles from prev→next neighbor
  line, arms 1/3 neighbor dist; corner=null both), `setSmoothHandle` (convert-pull, symmetric equal-length
  — NEW op beyond the list, because moveHandle preserves opposite arm length which is wrong for a symmetric
  pull), `moveWholePath` (V tool), `appendAnchor` (corner/smooth; creates path+subpath on empty→draw-from-
  scratch), `closeSubpath`. Pen draw-session = `penDraft {pathIndex,subpathIndex}` state in the modal,
  threaded to PenCanvas; each placed anchor/close = one applyEdit (one undo). Tool state + toolbar
  (Pen/Select/Move/Convert) + hotkeys p/a/v/Shift+C in modal (after the input-focus guard); Esc/Enter
  finish a mid-draw path before cancel. "New motif…" per-row button → onNewMotif → Studio stamps a blank
  custom glyph (paths:[]), rebinds glyphRef, opens editor with initialTool='pen'. 70 motif-editor tests
  (was 47). Full suite **3865 passed / 54 skipped** (+23). Lint clean. Tree = ONLY P2 files (no 3D leak).
  ⚠ SPEC-INTERPRETATION CHOICES (flagged, faithful to the LOCKED table, none a deviation from it):
  (1) +/− add/delete driven by PEN-HOVER (idle pen over anchor=delete, over segment=add) rather than
  separate +/− key bindings — the PLAN row permits "+/− OR Pen over…". (2) Convert-click-on-a-CORNER is a
  deliberate no-op (spec pins only drag-corner→smooth + click-smooth→corner; double-click covers click-to-
  smooth). (3) ⌘/Ctrl temp-direct-select implemented at the POINTER level (per-gesture e.metaKey), not a
  modal tool-state swap — release restores Pen automatically. All consistent with the Illustrator table.
  Next: WI-P2-5 (root handle + growth arm, pan/zoom, Shift-45-constrain, throttled mini full-canvas Preview).
- **2026-07-08 (WI-P2-5 done — P2 COMPLETE):** Ran sequential-on-main. New pure penMachine helpers:
  `hitTestRoot(root,point,tol,armLen)` ('point'|'arm'|null), `constrainTo45(origin,point)` (snap vector
  dir to 45°, keep length), `angleFromArm(root,point)`. Hook: `previewRoot` (transient) + `applyRoot`
  (recompute viewRadius from paths+newRoot, one modal-local undo baseline; undo/redo restore root+viewRadius
  — did NOT generalize applyEdit, added a sibling to avoid churning every geometry commit). PenCanvas: root
  drag (point=move, arm=angle, `motif-editor-root-arm`), pan (Space+drag, window keydown/keyup), zoom
  (wheel about cursor) as a view transform `{tx,ty,scale}` inverted in clientToModel so hit-testing stays
  correct at any pan/zoom; Shift-45 live in move. MiniPreview (new, lazy-loaded): `useCanvas(ownRef, …,
  {...customGlyphs,[glyphId]:throttledGlyph})` — same 13-arg threading as RightPanel:218; rAF-COALESCED
  override push (N rapid drags → ≤1 restamp/frame), never commits. Studio: memoized `previewContext`
  mirroring RightPanel's exact exprs (machineProfile:activeProfileId, colorView:colorView.colorView,
  panels: laser?panels:[]). 94 motif-editor tests.
  ⚠ **REGRESSION CAUGHT + FIXED at integration (agent mislabeled it "pre-existing"):** MiniPreview's
  static `useCanvas` import (→p5→gifenc CJS/ESM hazard) added a NEW unmocked path into Studio's static
  graph → 16 StudioRoute/MobileStudio suites (which shield via mocking RightPanel, the OTHER useCanvas
  path) failed at import time; full suite had dropped 3865→3821 w/ 16 failed files. FIX (in-scope):
  `React.lazy(() => import('./MiniPreview'))` + `<Suspense>` in MotifEditorModal → useCanvas leaves the
  static graph (loads only when Preview is toggled); updated the modal test's mount assertion to
  `await findByTestId`. All 16 restored. Full suite **3889 passed / 54 skipped / 0 failures**. Lint clean.
  Tree = ONLY P2 files (no 3D leak).
  ⚠ SPEC NOTE (flagged, minor): the LOCKED table's "Space while PLACING a pen anchor = reposition that
  anchor" sub-behavior is NOT implemented — Space is wired to PAN (this WI's primary Space requirement).
  The pen-anchor-reposition-via-Space nicety is deferred; everything else in the table is in.

- **2026-07-08 (post-WI-5 advisor fixes — 2 real defects structure couldn't surface):**
  **(A) D6 Cancel-discards violation [BLOCKING, fixed]:** "New motif…" + "Duplicate to edit" mutated the
  document at OPEN time (addCustomGlyph + rebind), but onCancel only closed → Cancel left a blank/orphan
  glyph bound (New→Cancel rendered blank; Duplicate→Cancel left an orphan fork). Fix: DEFER the store
  write to Save. Open-state carries a transient `draftGlyph` (not in store) keyed by `MOTIF_DRAFT_ID`;
  Studio resolves `motifEditor.draftGlyph ?? getGlyph(...)`, `onSave` for a draft does `addCustomGlyph`
  +bind while edit does `updateCustomGlyph`, `onCancel` mutates NOTHING. Inspector Duplicate now passes
  the fork as `onEditGlyph(null, layerId, draftGlyph)` (no open-time write). MiniPreview gained
  `targetLayerId` → transiently rebinds that layer's glyphRef to the draft glyphId FOR THE PREVIEW ONLY
  (create-session preview stamps on the host without touching real `layers`; edit sessions = identity
  no-op). Updated InspectorEditButton + MiniPreview tests.
  **(B) viewRadius handle-blindness [non-blocking, fixed]:** `recomputeViewRadius` measured anchors ONLY
  while importMotif curve-samples and boundsFromWorkingCopy includes handles → the persisted viewRadius
  (drives placement scale) would POP on the first edit of a curve that bulges past its anchors. Fix:
  include in/out handle points (convex-hull bound of a cubic → safe over-estimate, never clips). +test.
  Full suite **3892 passed / 54 skipped / 0 fail**. 97 motif-editor tests. Lint clean. No 3D files touched.

## ✅ P2 COMPLETE — all 5 WIs (WI-P2-1/1b/2/3/4/5) + 2 advisor fixes on main. Full suite 3892 / 54 skip / 0 fail.
### Lint: motif-editor + touched files clean (repo ~27-err baseline untouched).

## Human `npm run dev` verification gate (green tests CANNOT see interactive/visual correctness)
Run `npm run dev`, add a host layer (e.g. a pattern that hosts motifs), open the Inspector Motif device:
1. **Edit an imported/custom motif:** add a motif → "Import SVG as motif…" a path SVG → click **✎ Edit**
   → the modal opens showing the path (violet), anchors (squares), and the jewel ⊕ root. With **A**:
   drag an anchor (handles ride along); drag a handle on a smooth point (opposite mirrors); ⌥-drag a
   handle (breaks to a cusp); marquee-select several anchors; **Delete** removes them (NOT the layer).
2. **Draw from scratch:** "New motif…" → modal opens with the **Pen (P)** tool → click to place corner
   anchors, click-drag for smooth ones, click the first anchor to CLOSE, Esc/Enter to finish. Switch
   tools with **P/A/V**, **Shift+C** to convert, double-click an anchor to toggle corner↔smooth.
3. **Root + growth arm:** drag the ⊕ to move the sprout point; drag the arm to set the growth angle;
   hold **Shift** to constrain drags to 45°. Confirm the motif rescales sensibly (viewRadius = reach
   from root).
4. **Pan/zoom:** **Space+drag** pans, **scroll** zooms about the cursor; anchors stay grabbable after.
5. **Modal undo:** ⌘Z/⇧⌘Z undoes/redoes edits INSIDE the modal only (does not disturb the document).
6. **Preview (D5):** tick **Preview** → the mini full-canvas shows the WHOLE pattern with your working
   motif applied, updating (rAF-throttled) as you drag — WITHOUT committing.
7. **Save propagation (D6):** with the glyph used by N layers ("Used by N layers" badge), **Save** →
   every placement using it restamps. **Cancel** → no change to the document. **Save as copy** → forks
   a new custom glyph and rebinds only the current layer (original untouched).
8. **Built-ins are read-only:** clicking Edit on a built-in glyph row does **Duplicate to edit** (forks
   a custom copy, opens that) — the built-in geometry is never mutated in place.
9. **Persistence:** Save, then reload the page → the edited motif still renders; open a share link → still renders.

### Deferred (recorded): P4 global library + premium gate; the "Space-repositions-pen-anchor" Illustrator
nicety (Space is pan here); transform/non-path SVG import flattening (still path-only from P1).
</content>
</invoke>
