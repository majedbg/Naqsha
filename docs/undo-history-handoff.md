# Unified Undo/Redo — Architecture Handoff (for continuing work)

Read this BEFORE touching any history code. Spec: `docs/undo-history-plan.md`.
Branch: `feat/unified-undo-history`. The feature is largely shipped (S0–S8, S10);
this note captures the invariants so follow-on work doesn't silently break them.

## Files
- `src/lib/history/snapshot.js` — `HISTORY_SCHEMA_VERSION`, `cloneSnapshot` (deep).
- `src/lib/history/useHistory.js` — the engine. Owns ONLY `{past, future}` stacks.
- `src/lib/history/documentSnapshot.js` — `createDocumentIO({getters, setters})` →
  the ONE symmetric `capture`/`restore` literal (every slice enumerated once).
- `src/lib/history/persist.js` — Tier-1 localStorage (`historyKey`, `readTail`,
  `writeTail`, `clearTail`, `validateTail`).
- `src/pages/Studio.jsx` — wiring (the integration surface).
- `src/lib/useLayers.js` — record injection in mutators.
- `src/lib/hooks/useCanvasSize.js` — `captureCanvas`/`restoreCanvas`.

## Engine API (`useHistory({capture, restore, limit=50})`)
Returns: `record, beginCoalesce, endCoalesce, undo, redo, clear, seed,
exportTail, importTail, canUndo, canRedo`.

## The non-negotiable invariants (DO NOT BREAK)
1. **Capture-BEFORE-change.** `record()` snapshots the PRE-edit doc and pushes to
   `past`. It is called IMMEDIATELY BEFORE the mutation runs. `present` is never
   stored eagerly — it's reconstructed via `capture()` at the undo/redo boundary
   (refs have settled by then). A `capture()` taken AFTER a mutation reads stale
   refs → silently wrong undo. The ONLY test that catches this is the real-async
   sequence in `recordSites.integration.test.jsx` (edit → undo WITHOUT advancing
   the idle timer → assert pre-edit value). Keep/extend that pattern.
2. **Recording is imperative**, never in an effect — so undo/redo replay (which
   only calls `restore`) can't self-trigger a record (invariant I6).
3. **`restoringRef` guards EVERY record site.** `restoreDoc` sets
   `restoringRef.current = true` for its whole synchronous span; `recordEdit` /
   `recordStructural` / `recordBatch` early-return while it's set, because
   `restore` replays via `updateLayer`/`setBgColor`/`setOperations`. Any NEW
   record site you add MUST honor this guard (route through the existing helpers).
4. **undo/redo flush an open coalesce window first** (mid-burst ⌘Z commits then
   undoes the burst — don't strand the pending snapshot).
5. **Load vs. restore distinction (I5).** A document LOAD clears history; a
   restore REPLAY must not. Loads route through `loadDocumentLayers` (=
   `clear()` + `loadLayerSet`). `restore()` and the panel-delete structural edit
   use the RAW `loadLayerSet` (no clear). Never make `loadLayerSet` itself clear.

## Studio recording helpers (already defined, ~top of component)
- `recordEdit(signature)` — coalescing param edit (slider/typing burst → 1 entry;
  keyed by `layerId:fields`, flushes on signature change, 400ms idle).
- `recordStructural()` — discrete immediate entry (closes any open burst first).
- `recordBatch(fn)` — folds MULTIPLE slice mutations in `fn` into ONE entry
  (used by variable-weight: layer patch + operation band). Inner mutators' own
  `record`/`recordEdit` are absorbed into the open window.
- Injected into `useLayers` via `recordEdit`/`recordStructural` props (mutators
  call them before `setLayers`). `commitOperations` = `recordStructural()` +
  `setOperations(mapper)`. `handleBgColorChange` = `recordEdit('bgColor')`.

## What records today
Layer params (coalesced), structural layer ops (add/remove/dup/reorder/
changePattern/randomize), operation library (commitOperations), assignment (via
updateLayer), variable-weight (recordBatch), bgColor.

## Known GAPS (follow-on work)
- **Canvas resize** (W/H/unit/margin/preset/outputMode) does NOT record yet. It's
  in the snapshot (captureCanvas), so undoing a later edit won't corrupt it, but
  resize itself isn't undoable. The user entry point is `handleDocumentSetupApply`
  (NOT `applyCanvasSize` — loaders call that directly, must stay unrecorded).
- **Panels** (add/delete/update) do NOT record. UI handlers in the LayerTree
  portal (`onAddPanel`, `onDeletePanel`, `onUpdatePanel`). Note `onDeletePanel`
  currently calls raw `loadLayerSet(nl)` (no clear, no record).
- **Tier-2 cloud persistence (S9)** not done: embed `config.history` on MANUAL
  save only; import on cloud load; autosave must NOT write it. See plan §7 Tier-2.

## Testing / quality
- `npx vitest run src/lib/history/` for the engine/persist units.
- `npx vitest run` for the full suite (~2250 pass; node default env, jsdom per
  `// @vitest-environment jsdom` docblock).
- `npx eslint <files>` — the repo has 3 PRE-EXISTING errors in Studio.jsx
  (`parseForPlacement`) + useLayers.js (`useState(initRef.current...)`); those are
  NOT yours. Add no new ones. The `react-hooks/refs` rule fires if you pass a ref
  (or an inline arrow reading `.current`) to a function during render — wrap ref
  reads in `useCallback`.
- The Next.js / "use client" PostToolUse hints are FALSE POSITIVES (Vite app).
- `ribbonGeometry.js/.test.js` show as modified in the working tree — that's the
  user's concurrent work; do NOT stage or touch it.
- Commit per slice. Trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_018Zw7qLsE4nuuWobN6KMtAS`
