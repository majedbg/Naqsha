# Unified Undo/Redo — Implementation Plan & Spec

**Status:** Specified (grilled 2026-06-27), ready for TDD execution
**Feature:** A single, app-wide undo/redo history that covers **all document edits** — property-panel param changes **and** canvas drag-to-move/rotate/resize transforms — and **absorbs** the existing narrow `useOperationsHistory`.
**Methodology:** TDD (red → green → refactor), one vertical slice at a time, via the `/tdd` loop.

---

## 1. Goal & motivation

Today, undo (`⌘Z`) exists but is **scoped to one slice**: the operation library + operation assignment (`useOperationsHistory.js`, pro-shell only). Moving a pattern on the canvas, editing a slider in the Inspector, recoloring, resizing the artboard — **none of it is undoable.** Users have even been mis-clicking the "align" buttons hoping they were undo/redo.

We want one mental model: **a single stack of whole-document snapshots.** Every committed user action pushes the previous document state; undo walks backward through exactly the states the user passed through.

```
        past (undo stack)          present        future (redo stack)
  [s0] [s1] [s2] ............... [ s3 ]  ........ [s4] [s5]
   ↑ oldest                      current            ↑ cleared on any new edit
```

---

## 2. Decision log (locked via grilling)

| # | Decision | Choice |
|---|---|---|
| D1 | **Scope of a snapshot** | Document content only: `layers`, `panels`, `bgColor`, `operations` (+assignments), `canvasSize` (W/H/unit/margin/preset/outputMode). **Selection is NOT in the snapshot** (best-effort re-selection on restore is allowed but never creates/clears history). Machine-profile switch is **not** undoable. |
| D2 | **Architecture** | **Option A — injected `capture()`/`restore()` over a whole-document snapshot stack.** Each existing hook keeps owning its `useState`; a coordinator assembles/dispatches the snapshot. Validated by research (P1 snapshot stack scored 28/30 vs command-log 25, immer-patch 22) — centralization (B/C) buys nothing at our ≤6 KB single-user scale. |
| D3 | **Engine model** | **Ref-as-synchronous-source-of-truth + imperative recording**, inherited from `useOperationsHistory` (generalized from 2 slices to ~6). Capture/restore happen in one synchronous handler pass; recording is imperative in action callbacks (never in an effect), so undo/redo re-application cannot self-trigger a commit. |
| D4 | **Keybinding scope** | **Global** `⌘Z` / `⇧⌘Z` in **all shells** (not pro-gated), with the existing typing-guard (do not hijack while focus is in an input/textarea/contentEditable, so native text-cursor undo survives). |
| D5 | **Coalescing** | Explicit open/close boundary (not a bare timer). Idle window **400ms**. See §6 table. |
| D6 | **Lifecycle** | Seed on mount; **clear** history on design-load / `loadLayerSet` / draft-restore / new-doc / profile-switch; inbound autosave/sync never records (`source:'user'` only). |
| D7 | **Persistence** | History **persists beyond reload** (user override of the usual convention — justified by tiny docs). **Tier 1** local: `localStorage`, keyed by document identity, debounced. **Tier 2** logged-in: history tail embedded in the **manually-saved** `config` (not autosave). Three safety rails: version-stamp, migrate-on-restore, smaller persisted cap. See §7. |
| D8 | **Depth cap** | In-memory **50**; persisted tail **25** (of `past`) + the `future` stack. |
| D9 | **Absorb `useOperationsHistory`** | **Delete it entirely.** Migrate its tests; preserve `resetHistory`-on-profile-switch; fold `capture/restoreAssignments` into the unified capture/restore. |
| D10 | **UI surface** | `⌘Z`/`⇧⌘Z` + **Edit menu** (Undo/Redo with `canUndo`/`canRedo` enablement) + **toolbar buttons** far-left of `ControlBar`, in a group **separated** from tool-specific actions (undo/redo apply across all tools). **No** visual history panel in v1 (noted as future). |
| D11 | **Dirty/autosave** | Undo/redo mutate the doc → mark dirty → eligible for autosave, no special-casing. |
| D12 | **Save cadence** | Cloud autosave `2500ms → 3000ms`. Local-draft `localStorage` writer `500ms → 3000ms` (Tier-1 history rides this writer). |
| D13 | **Invariant** | Figma's rule holds by construction: *"undo a lot, copy something, redo to present → the document is unchanged."* Linear stack, no branching. |

---

## 3. Architecture

### 3.1 The history engine — `src/lib/history/useHistory.js` (new)

A generalized port of `useOperationsHistory`'s proven engine. **Owns no document state** — it owns only the two stacks, and is handed two closures:

```js
useHistory({
  capture,            // () => Snapshot   — read ALL slices synchronously, deep-cloned
  restore,            // (Snapshot) => void — write ALL slices back synchronously
  limit = 50,
})
// returns: { record, beginCoalesce, endCoalesce, undo, redo,
//            canUndo, canRedo, clear, seed, exportTail, importTail }
```

- **`modelRef`** = `{ past: Snapshot[], future: Snapshot[], present: Snapshot }` held in a **ref** (synchronous truth). A `view` state mirrors `{ canUndo, canRedo }` for render via `publish()`.
- **`record()` — capture-BEFORE-change, always.** The single discipline: `record()` is called **immediately before** the mutation runs (or is handed the pre-mutation snapshot). It pushes the **current `present`** (the pre-edit state) onto `past`, sets the new `present` to that same pre-edit snapshot's successor on the *next* recorded transition, and clears `future`.

  > ⚠️ **Off-by-one hazard (do NOT capture after the mutation).** `capture()` reads `layersRef`/`panelsRef`, but those slices are `useState`-owned and their refs are effect-synced — so they **lag** `setState` by a commit. Calling `capture()` *right after* `updateLayer()` would grab the **stale pre-edit** state, silently. Therefore the model holds `present` = "the last committed snapshot," and `record()` works by: (1) push current `present` → `past`, (2) on the *following* synchronous read or via an explicitly-passed value, advance `present`. Concretely, prefer the **pre-snapshot** form: `record()` snapshots `present` to `past` and clears `future`; `present` is re-synced from `capture()` lazily on the next `record`/`undo`/`redo` boundary (when refs have caught up), **or** callers pass the new state in explicitly: `record({ before, after })`. This matches `beginCoalesce`, which already captures the snapshot *before* the gesture — both paths are capture-before, no mixed timing.

- **`undo()`** — `future.push(present); present = past.pop(); restore(present)`.
- **`redo()`** — symmetric.
- Recording is **imperative** (called from action callbacks), never in an effect → no suppression flag needed.

> The single failure mode of injected-capture is an **incomplete `capture()`**. Mitigation: `capture()` assembles the snapshot from **one explicit object literal in one file** (grep-able), and a unit test round-trips `restore(capture())` as a no-op.

### 3.2 The wiring layer — `Studio.jsx`

`Studio` builds `capture`/`restore` from each hook's getters/bulk-setters (the existing `captureAssignments`/`restoreAssignments` pattern, generalized):

```js
const capture = () => ({
  v: HISTORY_SCHEMA_VERSION,
  layers:   cloneLayers(layersRef.current),
  panels:   clone(panelsRef.current),
  bgColor:  bgColorRef.current,
  operations: clone(operationsRef.current),
  assignments: captureAssignments(),     // {layerId: operationId}
  canvas:   captureCanvas(),             // {w,h,unit,margin,presetIndex,outputMode}
});

const restore = (s) => {
  loadLayerSet(s.layers);                // runs migrateLayer on each — the migrate-on-restore rail
  setPanels(s.panels);
  setBgColor(s.bgColor);
  restoreOperations(s.operations);
  restoreAssignments(s.assignments);
  restoreCanvas(s.canvas);
  // selection: best-effort re-select s-relevant layer; never recorded
};
```

Bulk setters to add where missing: `useCanvasSize` needs `captureCanvas`/`restoreCanvas`; `useLayers` already has `loadLayerSet` + `setPanels`/`setBgColor`.

### 3.3 Snapshot shape

```ts
type Snapshot = {
  v: number;                 // HISTORY_SCHEMA_VERSION
  layers: Layer[];           // flat array, deep clone
  panels: Panel[];
  bgColor: string;
  operations: Operation[];
  assignments: Record<LayerId, OperationId>;
  canvas: { w, h, unit, margin, presetIndex, outputMode };
};
// NOT included: selectedLayerId, editingNodeId, liveTransform, activeProfileId, bedSize.
```

Size: ~6 KB × 50 ≈ <½ MB in memory. Negligible.

---

## 4. Where entries are recorded (the commit choke-points)

Almost everything already funnels through few sites:

| Edit source | Site | Action |
|---|---|---|
| Param change (Inspector) | `useLayers.updateLayer` | `record()` after the `setLayers` patch (respecting coalescing). |
| Drag/rotate/resize on canvas | `Studio.handleCanvasCommit` (L460) | `record()` on pointer-up, only if `drag.moved`. Already coalesced. |
| Add/remove/dup/reorder/pattern-swap | `useLayers` structural ops | `record()` per op. |
| Operation library + assignment | the old `commitOperations`/`commitAssignment` paths | `record()` (replaces the deleted hook). |
| Canvas resize | `useCanvasSize` setters | `record()` per commit. |
| bgColor / panels | their setters | `record()`. |

---

## 5. Coalescing

Open a **pending entry** on gesture start, merge intermediate changes, close on idle/blur. Never a bare debounce alone.

| Interaction | One entry = | Boundary |
|---|---|---|
| Canvas drag/rotate/resize | one gesture | `beginCoalesce` on pointerdown, `endCoalesce` (`record`) on pointerup if moved. ✓ already shaped |
| Slider/number-drag (Inspector) | one grab→release | `beginCoalesce` on pointerdown; `endCoalesce` on pointerup |
| Discrete param (toggle/dropdown/swatch/single entry) | each change | `record()` per change |
| Typing in a text param field | one burst | debounce **400ms** idle **AND** close on blur/Enter |
| Text-layer content typing | one burst | same 400ms+blur rule (no special-case) |
| Operation param edits | follow same rules as layer params | — |
| Randomize / reset / add / remove / reorder | each op | `record()` per op |

Mechanism: `beginCoalesce()` captures the pre-gesture snapshot once and suppresses intermediate `record()`s; `endCoalesce()` commits a single entry. The 400ms timer + blur/Enter both call `endCoalesce()`.

---

## 6. Lifecycle

| Event | Behavior |
|---|---|
| Editor mount | `seed(capture())` → `present` set, `past`/`future` empty. First real edit pushes the seed. |
| Load design / `loadLayerSet` / draft restore / new doc | `clear()` then `seed()` **or** `importTail()` if the loaded doc carries a compatible persisted history (§7). |
| Switch machine profile | `clear()` (preserves old `resetHistory` semantics). |
| Page reload / new session | History **rehydrated** from Tier-1 local cache (or Tier-2 doc) — see §7. |
| Inbound autosave / remote sync | **Never** records (only `source:'user'` actions record). |
| Cloud save completes | History **not** cleared (you can save and still undo). |

---

## 7. Persistence (the user override) + safety rails

History persists across reload. Two tiers, three non-negotiable rails.

### Tier 1 — local (everyone, incl. guests)
- Persist `{ past: last25, future, present, v }` to `localStorage`, **keyed by document identity** (`design:<id>` or `draft`), debounced on the **3s** local-draft writer.
- On editor mount for a given doc, if a compatible cache exists → `importTail()`; else `seed()`.

### Tier 2 — logged-in (travels with the doc)
- On **manual save only** (`⌘S`/explicit), embed `config.history = { past: last25, future, v }` into the `designs` JSONB row.
- Reopening that design on any device → `importTail()` from `config.history`.
- **Autosave does NOT write `config.history`** (only the doc) — avoids bloating frequent writes.

### The three safety rails (mandatory)
1. **Version stamp** — `HISTORY_SCHEMA_VERSION` on every persisted blob. On import, mismatch → **silently drop history, keep the document.** Escape hatch for breaking layer-model changes.
2. **Migrate on restore** — every imported snapshot's layers run through `migrateLayer`/`loadLayerSet` before becoming `present`. No raw old snapshot reaches render.
3. **Persisted cap < in-memory cap** — persist last **25** of `past` (+ `future`); in-memory stays **50**.

---

## 8. Absorbing `useOperationsHistory`

- **Delete** `src/lib/hooks/useOperationsHistory.js`.
- Move/adapt its tests to `useHistory` (the operations+assignments behaviors become a subset of whole-doc snapshots).
- Replace its pro-gated `⌘Z` binding (Studio L497-519) and menu wiring (L1245-1246) with the unified global handler.
- Preserve **`resetHistory`-on-profile-switch** as `clear()`.
- Fold `captureAssignments`/`restoreAssignments` into the unified `capture`/`restore`.
- Keep its **imperative-recording + ref-model** discipline.

---

## 9. UI surface

- **Keybinding:** global `⌘Z` / `⇧⌘Z` (`⌘⇧Z`), typing-guarded, in every shell.
- **Menu:** `MenuBar.jsx` Edit ▸ Undo / Redo, enabled by `canUndo`/`canRedo`.
- **Toolbar buttons:** `ControlBar.jsx`, **far-left, own group, a divider separating them from tool-specific actions** (undo/redo are global across select/move/rotate/resize/text). Disabled state bound to `canUndo`/`canRedo`. Tooltips show the shortcut.
- **Future (not v1):** a visual history panel (timeline list of entries). Architecture already supports it — the `past`/`future` arrays are the data source.

---

## 10. Adjacent changes

- `useAutosave.js`: `debounceMs` `2500 → 3000`.
- `useLayers.js` localStorage writer (L165-176): `500 → 3000`. Note: increases worst-case crash-loss window from ~0.5s to ~3s (accepted).

---

## 11. Invariants & edge cases (assert in tests)

- **I1 — round-trip identity:** `restore(capture())` leaves every slice deep-equal (no-op). *Guards incomplete capture.*
- **I2 — redo survives non-edits:** selecting/clicking a layer never clears `future`. (Excalidraw's most-cited bug.)
- **I3 — Figma invariant:** undo×N → copy → redo×N ⇒ document deep-equal to pre-sequence present.
- **I4 — coalesced gesture = 1 entry:** a 60-frame drag produces exactly one `past` entry.
- **I5 — load clears (or replaces) history:** post-load, undo cannot cross into the previous document.
- **I6 — re-application doesn't self-record:** undo/redo never grows `past` spuriously.
- **I7 — version mismatch drops history, keeps doc.**
- **I8 — cap enforced:** `past.length ≤ 50`; oldest dropped first.
- **I9 — profile switch clears history.**
- **I10 — autosave/sync never records.**

---

## 12. TDD slice plan (red → green per slice)

Each slice ships its own failing tests first, then implementation. Pure-engine slices need **zero React**.

| Slice | Deliverable | Key tests (red first) |
|---|---|---|
| **S0** | Scaffolding: `src/lib/history/` dir, `HISTORY_SCHEMA_VERSION`, `Snapshot` shape, `cloneSnapshot`. | clone is deep; version constant exported. |
| **S1** | **Pure engine** `useHistory` core: `record/undo/redo/canUndo/canRedo/clear/seed`, ref-model, `limit`. Test via React Testing Library `renderHook` with stub capture/restore. | I3, I6, I8; basic record→undo→redo; clear empties both stacks. |
| **S2** | **Coalescing**: `beginCoalesce`/`endCoalesce` + 400ms idle timer + blur/Enter close. | I4; two quick discrete edits ≠ merged; gesture = 1 entry; idle-timeout closes; blur closes. |
| **S3** | **Wiring in Studio**: build `capture`/`restore` across all slices; add `captureCanvas`/`restoreCanvas` to `useCanvasSize`. | I1 round-trip no-op across all 6 slices. |
| **S4** | **Record sites**: hook `updateLayer`, `handleCanvasCommit`, structural ops, canvas/bg/panels setters. | param edit recorded; drag commit recorded & coalesced; I2 (selection doesn't clear redo). **Async-path test (catches the §3.1 off-by-one):** drive a real edit through `updateLayer`'s `setState`, then `undo()` ⇒ asserts the *old* value; then `redo()` ⇒ asserts the *new* value. I1's isolated round-trip will NOT catch a capture-after-mutation bug — this sequence test must run against the real async path. |
| **S5** | **Absorb `useOperationsHistory`**: delete it, migrate tests, route operations/assignments through `useHistory`, preserve `resetHistory→clear` on profile switch. | old operation-undo tests pass against new engine; I9. |
| **S6** | **Global keybinding + typing-guard + Edit menu** (all shells). | ⌘Z/⇧⌘Z fire undo/redo; guarded inside inputs; menu enablement reflects canUndo/canRedo. |
| **S7** | **Toolbar buttons** in `ControlBar` (far-left, separated group, disabled-state). | render + click → undo/redo; disabled when !canUndo/!canRedo. |
| **S8** | **Tier-1 local persistence** (localStorage, keyed, 3s writer; import on mount; version+migrate rails). | I5, I7; reload restores tail; mismatched version drops history keeps doc; switching docs doesn't cross histories. |
| **S9** | **Tier-2 cloud persistence** (manual-save embeds `config.history`; load imports; autosave does NOT). | manual save writes history tail; autosave omits it; reopen imports & migrates. |
| **S10** | **Cadence bumps** (autosave 3000, local writer 3000) + final integration sweep. | I10; debounce values; full end-to-end record→reload→undo. |

Suggested commit granularity: one green commit per slice. Browser-verify after S4 (drag undo), S7 (buttons), S8 (reload persistence).

---

## 13. Out of scope (v1) / future

- Visual history panel / timeline (data already available in `past`/`future`).
- Branching history (we keep linear — Figma invariant).
- `IndexedDB` migration if `localStorage` budget gets tight.
- Cross-tab history sync.

---

## 14. File-touch map

**New:** `src/lib/history/useHistory.js`, `src/lib/history/snapshot.js` (shape + clone + version), `src/lib/history/persist.js` (Tier-1/Tier-2 read/write + rails), plus their `*.test.js(x)`.
**Modified:** `src/pages/Studio.jsx` (capture/restore wiring, record sites, keybinding, menu/toolbar props), `src/lib/useLayers.js` (record hooks in mutators, 3s writer), `src/lib/hooks/useCanvasSize.js` (capture/restoreCanvas), `src/components/shell/MenuBar.jsx` (Edit menu), `src/components/shell/ControlBar.jsx` (toolbar buttons), `src/lib/hooks/useAutosave.js` (3000ms), `src/lib/designService.js` (persist/load `config.history`).
**Deleted:** `src/lib/hooks/useOperationsHistory.js` (tests migrated).
