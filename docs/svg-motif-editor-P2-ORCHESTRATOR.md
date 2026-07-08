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
| WI-P2-1 | `pathModel.js` — `parseDToAnchors(d)` / `anchorsToD(model)`, cubic-normalized (Q/T/A→cubic, L→null-handle), corner/smooth inference from handle collinearity, fidelity round-trip (parse→serialize→flatten ≈ original→flatten). ONE `d` in/out, multi-subpath aware. `type` never alters geometry. | RED→GREEN vertical slices | `src/lib/motif/pathModel.js` (+test) | **in-progress** |
| WI-P2-1b | Store: `updateCustomGlyph(id, glyph)` (recordStructuralFn + setCustomGlyphs merge) + `deleteCustomGlyph(id)`; wire `addCustomGlyph`/`updateCustomGlyph`/`deleteCustomGlyph` into undo history (recordStructuralFn). Built-in id guard on update (no-op / not thrown). | CHAR (addCustomGlyph) then RED→GREEN | `src/lib/useLayers.js` (+`useLayers.customGlyphs.test.jsx`) | **in-progress** |

### Wave 2 — sequential on main (coupled editor, progressive)
| WI | Description | TDD | Files (one writer) | Status |
|----|-------------|-----|--------------------|--------|
| WI-P2-2 | `MotifEditorModal.jsx` shell (Naqsha `/impeccable craft` chrome) — working copy, Cancel/Save/Save-as-copy, "used by N layers" badge, Preview checkbox (inert for now), renders path READ-ONLY (from pathModel). Edit(pencil) button in MotifDevice (built-ins → "Duplicate to edit"). Wire Save→updateCustomGlyph, Save-as-copy→addCustomGlyph+rebind. Dirty-flag verbatim-`d` preservation. | RED→GREEN (component + wiring) | `src/components/motif-editor/MotifEditorModal.jsx`, `useMotifEditor.js`, `Inspector.jsx` (Edit button), `Studio.jsx` (modal mount + updateCustomGlyph wire) (+tests) | pending |
| WI-P2-3 | `penMachine.js` (pure) + `PenCanvas.jsx` DIRECT-SELECTION — render anchors/handles/root; hit-test; drag anchors + handles (smooth symmetric, ⌥-break→cusp); marquee multi-select; Delete. Machine tested headless. | RED→GREEN pure machine, then canvas | `src/components/motif-editor/penMachine.js`, `PenCanvas.jsx` (+tests); `useMotifEditor.js` (wire) | pending |
| WI-P2-4 | Pen tool DRAW + structural edits — P (click=corner, drag=smooth, click-first=close, Esc/Enter finish), +/− add/delete-on-segment, Shift+C convert, ⌥ retract, double-click toggle, ⌘ temp-direct-select. Folds in draw-from-scratch ("New motif…"). Full hotkey map. | RED→GREEN pure machine, then canvas/hotkeys | `penMachine.js`, `PenCanvas.jsx`, `useMotifEditor.js`, `Inspector.jsx` ("New motif…") (+tests) | pending |
| WI-P2-5 | Root handle (point + growth arm — drag point=move, drag arm=angle), pan (space-drag) + zoom (scroll), Shift 45°-constrain, and the rAF-throttled mini full-canvas Preview (2nd useCanvas w/ customGlyphs override). Final integration + `npm run dev` gate. | RED→GREEN | `PenCanvas.jsx`, `penMachine.js`, `useMotifEditor.js`, `MotifEditorModal.jsx` (preview) (+tests) | pending |

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
</content>
</invoke>
