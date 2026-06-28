# Panel/Layer Sidebar Redesign — TDD Orchestration Plan

**Branch:** `feat/panel-row-redesign` (git worktree off `origin/main`)
**Repo:** `generative-art-studio` · React/JSX · Vitest + Testing Library (jsdom per-file)
**Method:** Test-Driven, vertical slices (one test → minimal impl → repeat). **No horizontal slicing** (do not pre-write all tests).

---

## 0. Confirmed product decisions (the spec)

1. **Per-panel "+ Add layer"** under each panel's layers (grouped mode); clicking adds a layer **assigned to that panel**. The single global "+ New Layer" is **removed** in grouped mode. Flat mode (zero panels) keeps one global add-layer.
2. **"New panel" creation row** — styled like a `PanelHeader` row, **always at the foot** (creates the first panel too). Has a **material-preset dropdown** + a **"Create panel"** action:
   - Selecting a preset → creates a panel with that substrate.
   - "Create panel" (no preset) → creates a blank/default panel (`acrylic · 3mm`).
   - Disabled at the 3-panel cap (`MAX_PANELS`), tooltip "Max 3 panels per document".
   - Presets: `acrylic·3mm, acrylic·5mm, plywood·4mm, mdf·3mm, cardstock·1mm` (all editable afterward via the existing substrate editor).
3. **Panel ⋯ options menu** folds **all** panel actions: `Rename · Duplicate · Clear all layers · Delete`. The standalone **trash icon is removed**. Rename triggers the existing inline-rename edit mode. Delete reuses the existing delete `ConfirmDialog` (with its "delete layers too?" checkbox).
4. **Duplicate panel** = copy the panel **+ deep-copy its layers** (fresh ids, reassigned to the new panel). Disabled at cap.
5. **Clear all layers** removes every layer on that panel via a (danger) `ConfirmDialog`, but is **disabled/blocked** when it would empty the document (≥1-layer invariant), tooltip "Document needs at least one layer".

---

## 1. Anchor files (current state)

| Concern | File | Notes |
|---|---|---|
| Pure panel model/helpers | `src/lib/panels.js` | `MAX_PANELS=3`, `SUBSTRATE_KINDS`, `createPanel`, `addPanel`, `deletePanel`, `assignLayerToPanel`, `layersForPanel`. All pure. |
| Layer/panel state | `src/lib/useLayers.js` | `addLayer(patternType)` (`:219`), `duplicateLayer` w/ `cloneLayer` deep-copy (`:327`), `panels/setPanels`. |
| Sidebar + LayerRow | `src/components/shell/LayerTree.jsx` | grouped/flat tiers (`:647`), `+ Add panel` dashed btn (`:685`), global `+ New Layer` (`:711`). |
| Panel row | `src/components/shell/PanelHeader.jsx` | material chip, eye, **trash icon** (`:211`), inline rename, substrate editor, delete `ConfirmDialog` (`:283`). |
| Row options menu | `src/components/shell/RowMenu.jsx` | items `Rename·Duplicate·Download·Delete`; renders an item only if its handler is passed. |
| Confirm dialog | `src/components/ui/ConfirmDialog.jsx` | controlled `open`, `danger`, optional `children`. |
| Wiring | `src/pages/Studio.jsx` | `onAddPanel` (`:1637`), `onAddLayer` opens pattern picker (`:1628`), pattern pick → `addLayer(id)` (`:1438`), `onDuplicateLayer` (`:1621`). |

**Undo note:** every structural mutation must call `recordStructural()` (capture-before) — the app has unified undo history. Mirror the existing `onAddPanel`/`onDeletePanel` handlers.

---

## 2. Orchestration graph (dependencies & parallelism)

```
P0 setup ─┬─► P1 panels.js helpers ─────────┬─► P4 NewPanelRow ──┐
          ├─► P2 useLayers addLayer(panelId) ┤                    ├─► P6 LayerTree ─► P7 Studio wiring ─► P8 verify
          └─► P3 RowMenu clear-item ─────────┴─► P5 PanelHeader ──┘
```

**Default: run phases sequentially** in execution order `P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8`. Even file-disjoint phases share **one** worktree — a common git index and a `vitest` runner that sees each other's half-written files — so concurrency in a single worktree risks flaky/false test runs for little wall-clock gain (the graph is sequential almost everywhere). The arrows below are the *hard* ordering constraints; the file-disjoint pairs (P1/P2/P3, P4/P5) are the *only* phases you *could* parallelize, and **only** if you give each its own `isolation: worktree` and merge. Otherwise serialize.

**Single-owner-per-file rule** (defense in depth): each file below is edited by exactly one phase.

| File | Sole owner |
|---|---|
| `src/lib/panels.js` (+ test) | P1 |
| `src/lib/useLayers.js` (+ test) | P2 |
| `src/components/shell/RowMenu.jsx` (+ test) | P3 |
| `src/components/shell/NewPanelRow.jsx` (+ test, **new**) | P4 |
| `src/components/shell/PanelHeader.jsx` + `PanelHeader.test.jsx` (**new**) | P5 |
| `src/components/shell/LayerTree.jsx` + `LayerTree.test.jsx` + `LayerTree.panels.test.jsx` | P6 |
| `src/pages/Studio.jsx` (+ integration test) | P7 |

---

## 3. Phase 0 — Worktree setup (orchestrator, no subagent)

```bash
cd <main repo>
git fetch origin
# verify main is current; do NOT branch off the feat/unified-undo-history checkout
git worktree add ../gas-panel-row-redesign -b feat/panel-row-redesign origin/main
cd ../gas-panel-row-redesign
npm install            # or pnpm, match the lockfile
npx vitest run         # BASELINE must be green before any phase starts
```
**Done when:** worktree exists on `feat/panel-row-redesign` at `origin/main`, deps installed, full suite green. Drop this plan at `docs/plans/panel-row-redesign.md` in the worktree for subagents to read.

---

## 4. Phase 1 — `panels.js` pure helpers  *(parallel A)*

**Owns:** `src/lib/panels.js` + `src/lib/panels.test.js` (extend existing).
**Depends on:** P0.

TDD slices (each red→green before the next):
1. `SUBSTRATE_PRESETS` exported — array of `{ kind, thickness }` with the 5 confirmed entries, in order.
2. `presetLabel(preset)` → `"acrylic · 3mm"` (reuse/extend the existing `substrateSummary` style; keep the `·` separator consistent with `PanelHeader`).
3. `addPanel(panels, substrate?)` — when `substrate` given, new panel's `substrate` = `{ ...default, ...substrate }`; without it → current default. At cap → returns input ref unchanged (`===`). *(Backward-compatible: existing `addPanel(panels)` calls unaffected.)*
4. `duplicatePanel(panels, layers, id)` → `{ panels, layers }`:
   - appends a panel: substrate copied, `order` = next, name `"<name> copy"`, fresh `id`;
   - deep-copies every `layersForPanel(layers, id)` with **fresh layer ids** + `panelId` = new panel id (reuse the `cloneLayer` naming/id rules from `useLayers`);
   - unknown `id` → no-op (inputs unchanged); at `MAX_PANELS` cap → no-op.
5. `canDuplicatePanel(panels, layers, id, cap)` → `false` at the panel cap (`!canAddPanel(panels)`) **or** when copying would exceed the **layer** cap (`layers.length + layersForPanel(layers,id).length > cap`); else `true`. *(cap = the tier layer cap from `useLayers`.)*
6. `clearPanelLayers(layers, panelId)` → new `layers` array with that panel's layers removed (pure).
7. `canClearPanelLayers(layers, panelId)` → `false` if the panel has no layers **or** removing them would leave the document with 0 layers; else `true`.

**Done when:** all new helpers pure (no input mutation, new arrays out), unit-tested, suite green.

---

## 5. Phase 2 — `addLayer(panelId)` in `useLayers`  *(parallel A)*

**Owns:** `src/lib/useLayers.js` + `src/lib/useLayers.test.js`.
**Depends on:** P0.

TDD slices:
1. `addLayer(patternType, opts)` accepts `opts.panelId`; new layer's `panelId` = `opts.panelId`. Test via the hook (`renderHook` / existing harness): add with `{panelId:'p2'}` → new layer carries `panelId:'p2'`.
2. `addLayer(patternType)` with no opts → unchanged behavior (`panelId` stays as today; normalizer assigns on load). Guard against regressions in existing callers.
3. Still respects the tier `cap` (no-op at cap).

**Contract for downstream:** `addLayer(patternType, { panelId })`. Keep first-arg signature so `addLayer(id)` at `Studio.jsx:1438` still compiles.
**Done when:** new behavior tested, all existing `useLayers` tests green.

---

## 6. Phase 3 — `RowMenu` clear-layers item  *(parallel A)*

**Owns:** `src/components/shell/RowMenu.jsx` + `RowMenu.test.jsx`.
**Depends on:** P0.

TDD slices:
1. New optional props `onClearLayers`, `clearLayersDisabled?`, `clearLayersLabel="Clear all layers"`. When `onClearLayers` is provided, a "Clear all layers" item renders **between Duplicate and Delete**.
2. `clearLayersDisabled` → item rendered with `aria-disabled`/disabled styling, click does **not** fire `onClearLayers` and does not close on activation (or closes without firing — match existing disabled semantics; assert no callback).
3. Regression: existing layer usage (no `onClearLayers`) keeps order `Rename · Duplicate · Download · ─ · Delete` and all existing RowMenu tests pass.

**Done when:** new item + disabled path tested, existing tests green. Keep keyboard nav / click-away / Escape working.

---

## 7. Phase 4 — `NewPanelRow` component  *(parallel B, needs P1)*

**Owns:** `src/components/shell/NewPanelRow.jsx` + `NewPanelRow.test.jsx` (both new).
**Depends on:** P1 (imports `SUBSTRATE_PRESETS`, `presetLabel`).

Props contract: `{ onCreatePanel(substrate?), canAdd }`.
Styling: mirror `PanelHeader` chrome (same border/`bg-paper-warm`/`px-1.5 py-1`/`gap-1.5`, `+` glyph in the chevron slot, semibold "New panel" name) — i.e. a panel-row look, **not** the old dashed CTA.

TDD slices:
1. Renders a row with `aria-label="New panel"`, a `+` glyph, the label "New panel".
2. Renders a preset `<select>`/dropdown listing the 5 presets via `presetLabel`, plus a neutral first option ("Create panel" / no preset).
3. Selecting a preset → `onCreatePanel(<that substrate>)`.
4. Activating "Create panel" with no preset selected → `onCreatePanel()` (undefined arg).
5. `canAdd={false}` → dropdown + create action disabled, `title="Max 3 panels per document"`, no callbacks fire.

**Done when:** component renders + 5 behaviors tested in isolation.

---

## 8. Phase 5 — `PanelHeader` ⋯ menu (remove trash)  *(parallel B, needs P3)*

**Owns:** `src/components/shell/PanelHeader.jsx` + `PanelHeader.test.jsx` (new — test the header in isolation, mirroring the `makePanel` helper).
**Depends on:** P3 (uses the extended `RowMenu`).

New props consumed: `onDuplicatePanel(id)`, `onClearPanelLayers(id)`, `canDuplicate`, `canClearLayers`. Keep existing `onUpdatePanel`, `onDeletePanel`, rename, eye, chip, substrate editor.

> **Selector rule (applies to P5 & P6):** panel names are **not unique** — `createPanel` names by `order+1` and delete-then-add reuses an order, so two panels can both read "Panel 2" (exactly the screenshot). **Never** query per-panel controls by panel name. Add `data-testid={panel.id}` to the panel row wrapper and scope every per-panel assertion with `within(panelRowEl)`. The `⋯` button and "+ Add layer" use stable static `aria-label`s ("Panel options", "Add layer") found *within* the scoped row, not name-interpolated labels.

TDD slices:
1. A `⋯` button (`aria-label="Panel options"`) renders; the **standalone trash icon is removed**.
2. Opening the menu shows `Rename · Duplicate · Clear all layers · Delete` (Delete danger-styled).
3. **Rename** → enters the existing inline rename/edit mode (assert the name input appears).
4. **Duplicate** → calls `onDuplicatePanel(panel.id)`; `canDuplicate={false}` → item disabled with tooltip ("Max 3 panels per document" at the panel cap, or "Not enough layer slots to duplicate" when the copy would exceed the layer cap — `canDuplicate` is computed by `canDuplicatePanel` in P1).
5. **Clear all layers** → opens a **danger** `ConfirmDialog`; confirm → `onClearPanelLayers(panel.id)`; cancel → no call. `canClearLayers={false}` → item disabled, tooltip "Document needs at least one layer".
6. **Delete** → opens the **existing** delete `ConfirmDialog` (with the "delete layers too?" checkbox); confirm → `onDeletePanel(id, { deleteLayers })` exactly as before. Keep `canDelete` (panels.length>1) gating.

**Done when:** menu-driven actions tested in `PanelHeader.test.jsx`; trash icon gone; existing PanelHeader behaviors (eye, chip, substrate editor, drag target) intact.

---

## 9. Phase 6 — `LayerTree`: per-panel add-layer + mount `NewPanelRow`  *(needs P2,P4,P5)*

**Owns:** `src/components/shell/LayerTree.jsx` + `LayerTree.test.jsx` + `LayerTree.panels.test.jsx`.
**Depends on:** P4 (NewPanelRow), P5 (PanelHeader prop contract), P2 (`onAddLayer(panelId)` signature).

TDD slices:
1. **Grouped:** each panel row wrapper carries `data-testid={panel.id}`; each panel renders a "+ Add layer" button (static `aria-label="Add layer"`) under its layers. Query it via `within(getByTestId(panel.id))` and assert click → `onAddLayer(panel.id)`. (Do **not** query by panel name — names aren't unique.)
2. **Grouped:** the bottom global "+ New Layer" button is **not** rendered.
3. **Flat (no panels):** the global add-layer **is** rendered; click → `onAddLayer()` (no panel id).
4. The old `+ Add panel` dashed button is **replaced** by `<NewPanelRow>` at the foot, **always rendered** (grouped and flat), wired `onCreatePanel={onAddPanel}` + `canAdd={canAddPanel(panels)}`.
5. Per-panel add-layer respects the layer cap (`addDisabled`).
6. Pass the new panel props through to `PanelHeader`: `onDuplicatePanel`, `onClearPanelLayers`, plus per-panel `canDuplicate = canDuplicatePanel(panels, layers, panel.id, cap)` and `canClearLayers = canClearPanelLayers(layers, panel.id)`.
7. Update `LayerTree.panels.test.jsx`: **remove the obsolete trash-icon delete test**, route delete through the ⋯ menu; add the add-layer/NewPanelRow coverage above.

**Done when:** grouped/flat add-layer wiring tested, NewPanelRow mounted, panel props threaded, panels test file updated & green.

---

## 10. Phase 7 — `Studio` wiring + integration  *(needs P1,P2,P5,P6)*

**Owns:** `src/pages/Studio.jsx` (+ a Studio-level integration test if a harness exists; otherwise assert via the exported handlers).
**Depends on:** P1,P2,P5,P6.

TDD/integration slices:
1. **`onAddPanel(substrate?)`** → `recordStructural()` + `setPanels((p)=>addPanel(p, substrate))`. NewPanelRow preset → panel created with that substrate; no preset → default panel.
2. **Add-layer-to-panel threading:** clicking a panel's "+ Add layer" sets a `pendingPanelId` UI state and opens the pattern picker; when a pattern is picked, call `addLayer(id, { panelId: pendingPanelId })` then clear `pendingPanelId`. Flat/global add-layer leaves `pendingPanelId` undefined → layer unassigned (normalizer handles). *(Integration test: add-to-panel-2 → pick pattern → newest layer has `panelId === panel2.id`.)*
3. **`onDuplicatePanel(id)`** → `recordStructural()`, `const {panels:np, layers:nl} = duplicatePanel(panels, layers, id)`, `setPanels(np)`, `loadLayerSet(nl)` (mirror `onDeletePanel`). Undoable.
4. **`onClearPanelLayers(id)`** → `recordStructural()`, `loadLayerSet(clearPanelLayers(layers, id))`. Undoable. Guarded by `canClearPanelLayers`.
5. Pass `canAddPanel`, and the per-panel `canDuplicatePanel` / `canClearPanelLayers` flags down through LayerTree to PanelHeader.

**Done when:** all handlers wired, the add-to-specific-panel path verified end to end, undo/redo works for duplicate/clear (they call `recordStructural`).

---

## 11. Phase 8 — Full verification & cleanup

**Depends on:** P7.
- `npx vitest run` (whole suite) green; `npm run lint`.
- Grep for stragglers: no remaining `+ Add panel` / global `+ New Layer` in grouped mode; no orphaned trash-icon code/handlers in `PanelHeader`.
- Manual smoke (optional Playwright): create panel from preset; create blank panel; add layer under panel 1 and panel 2 (verify assignment); duplicate panel (layers copied with new ids); clear all layers (blocked when it would empty doc); rename/delete via ⋯; undo each.
- Confirm undo/redo restores state for every new structural op.

**Done when:** suite + lint green, manual checklist passes, branch ready for PR.

---

## 12. Subagent spawn brief (template)

> You are implementing **Phase N** of the panel-row redesign in worktree `../gas-panel-row-redesign` (branch `feat/panel-row-redesign`). Read `docs/plans/panel-row-redesign.md`. **TDD strictly: one test → minimal impl → repeat (vertical slices). Never write all tests up front. Never refactor while red.** You may ONLY edit the files listed under your phase's "Owns". Run `npx vitest run <your test files>` per cycle and the full suite before declaring done. Honor existing conventions: semantic Tailwind tokens (`bg-paper-warm`, `text-ink-soft`, `·` separators), `aria-label`s on controls, and `recordStructural()` before any structural mutation. Report: files changed, tests added (names), suite status.

## 13. Risk notes for the orchestrator
- **Shared worktree:** run only file-disjoint phases concurrently (batch A; batch B). Everything else sequential per the graph.
- **`LayerTree.panels.test.jsx`** is owned solely by P6 — P5 must NOT touch it (it adds its own `PanelHeader.test.jsx`). P6 removes the obsolete trash-delete test.
- **Backward-compat signatures:** `addPanel(panels)` and `addLayer(patternType)` must keep working for untouched callers — additive optional args only.
- **Cap interactions (decided, tested):** Duplicate-panel is disabled whenever `canDuplicatePanel` is false — i.e. at `MAX_PANELS` **or** when `currentLayers + sourcePanelLayers > layerCap`. No half-copies, no silent overflow; it's an all-or-nothing gated action (P1 helper + P5 disabled UI + P7 wiring all assert it).
- **Invariant:** Clear-all-layers disabled when it would empty the document; assert this both in `canClearPanelLayers` (P1) and the disabled UI path (P5/P6).
