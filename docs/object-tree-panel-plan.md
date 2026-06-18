# Object Tree Panel — Locked Decision Spec

> Source of truth for the object-tree (layer-tree) panel overhaul.
> Grilled & locked 2026-06-18. Desktop shell only. NOT yet built.
> Implementation runbook: `docs/object-tree-panel-ORCHESTRATOR.md`.

---

## 0. Scope

Desktop shell only — `AppShell` / `LayerTree` / `Studio.jsx`. **`MobileStudio` is
untouched.** Where `LayerTree` is shared, new desktop-only affordances (resize
handle, hover states) must degrade gracefully, but no mobile UX is designed.

Five user-visible changes:

1. The object-tree region starts **wider** and is **drag-resizable** from its right edge.
2. Row action icons are **reorganized**: lock + visibility stay inline; infrequent
   actions move into a **"⋯" menu**.
3. Layers are **renamable**.
4. Pattern layers get a **symbol-based default name** (`Pattern (Sg)`).
5. The **lock** toggle starts doing something real (blocks randomization).

---

## 1. Code ground truth (verified 2026-06-18)

| Thing | Location | Note |
|---|---|---|
| Region width | `AppShell.jsx` `ObjectTreeRegion`, `w-56` (224px) `shrink-0 overflow-auto` | replace with state-driven width |
| Row render | `LayerTree.jsx:189–294` (`LayerRow`) | reorder ↑↓ · glyph · name(static span) · op-chip · 👁 · 🔒 · [rand-seed, rand-params, dup, export, delete] |
| Selection | `LayerTree.jsx:15` — row click → `onSelectLayer(id)` | **no canvas hit-test / click-select / drag-move exists anywhere** |
| Name field | `useLayers.js` `createLayer:58` (`name: 'Layer N'`) + a 2nd inline `addLayer` site (~L200) | two construction sites |
| Duplicate | `useLayers.js` `duplicateLayer` / `cloneLayer` — `name: '${src.name} copy'` | Moiré pairs also route through `cloneLayer` |
| Rename infra | `onUpdateLayer(id, {name})` already flows; legacy `LayerCard.jsx` has proven dbl-click inline edit (unmounted) | reuse pattern |
| Symbols | `constants.js:1136` `PATTERN_SYMBOLS` — unique 2-letter per pattern (`spirograph:'Sg'`, `lissajous:'Ls'`, `voronoi:'Vo'`…) | source for auto-name |
| Confirm dialog | `ui/ConfirmDialog.jsx` — controlled, Esc/Enter, on-brand, **unused so far**, **single saffron action** | needs a `danger` variant for Delete |
| Popper precedent | `shell/OperationPicker.jsx` — **deliberately inline (not portaled)** "so it's found by `within(region)` shell tests" | RowMenu follows this convention |
| Undo | none. `useOperationsHistory.js` is scoped to the **operations library only**; `MenuBar.jsx:152` Undo/Redo are disabled placeholders | randomize/delete are NOT undoable |
| Lock | `layer.locked` is read only to render the icon; **gates nothing** today | wire to randomization |
| Tests | Vitest (`npm test` = `vitest run`) + Testing Library; `*.test.jsx`; `within(region)` + `data-testid` conventions | |

---

## 2. Resizable panel

- **Default 280px · min 200px · max 480px.** Replaces fixed `w-56`.
- **Persist** to `localStorage["ui.objectTreeWidth"]`, written **on drag-end**
  (not continuously). On load, parse + **clamp to [200, 480]**; fall back to 280
  if absent/NaN.
- **Handle:** 6px invisible hit strip straddling the right edge; `cursor: col-resize`
  on hover. Visual = the existing 1px region divider, brightened to accent on
  hover/drag. No permanent thick grabber.
- **Drag:** attach `mousemove`/`mouseup` on `window` (so a fast drag can't fall
  off the strip); add `select-none` (and `cursor: col-resize`) on `<body>` for the
  duration; clamp live to bounds.
- **Double-click the handle → reset to 280.**

## 3. Row layout

Inline order, left→right:
`[reorder ↑↓] · glyph · name · op-swatch · 🎲 · 👁 · 🔒 · ⋯`

- All icons **always visible** (NOT hover-reveal).
- **Name = full-row click target** (selects the layer); icons carve their own
  hit-zones on the right so clicking them never also selects. Hover/selection
  highlight spans the full row width.
- **Randomize-seed is removed entirely.**

### 3.1 Op-chip → compact swatch
- Inline: **color swatch + uppercase first initial** of the operation name
  (Cut→`C`, Score→`S`, Engrave→`E`). Clicking opens the existing OperationPicker.
- Full operation name appears **only inside the dropdown** and on a **hover
  tooltip** of the swatch. No inline name text ever.

### 3.2 Responsive collapse
- **Below 240px panel width, hide the 🎲 dice** (👁/🔒/⋯ and the op-swatch stay).
- **Decision (implementation):** prefer a **CSS container query** on the panel
  (`@container`) so the row reacts to width without threading the live width
  value from AppShell → Studio → LayerTree. Tailwind container-query plugin or a
  raw `@container` rule. Fallback if container queries are awkward: pass a
  `compact` boolean prop down. (The op-swatch is already compact, so only the
  dice needs the breakpoint.)

## 4. "⋯" RowMenu

- **New reusable component** `shell/RowMenu.jsx`, modeled on `OperationPicker`
  (no new dependency).
- **Rendering: inline**, matching the OperationPicker convention (so `within(region)`
  shell tests can find it). Handle the `overflow-auto` clipping risk by **flipping
  upward** when the trigger is near the panel's bottom. (Only escalate to a
  portal if inline+flip can't avoid clipping — note it, don't default to it.)
- Items, top→bottom: **Rename · Duplicate · Download** · —— divider —— · **Delete** (red).
- Trigger: click ⋯ toggles. Dismiss: Esc / click-away / after selecting an item.
- Keyboard: ↑/↓ move, Enter activate, Esc close.
- **Only one row menu open at a time.**

## 5. Randomize-params (🎲)

- Inline dice icon (hidden < 240px). Click → **ConfirmDialog**:
  > **Randomize parameters?** This overwrites the current values for this layer.
  > **[Cancel] [Randomize]**
- Copy is deliberately truthful — there is **no undo** (§1). Do NOT promise undo.
- **On a locked layer:** dice is **disabled + tooltip "Layer locked"** (does not
  open the confirm).

## 6. Delete

- From the ⋯ menu (red). Click → **ConfirmDialog (danger variant)**:
  > **Delete "&lt;name&gt;"?** This can't be undone.
  > **[Cancel] [Delete]**  ← Delete button red
- `<name>` is the layer's display name. "Can't be undone" is truthful here.

## 7. Renaming

- **Double-click the name** → inline `<input>` (single-click still just selects).
  Also reachable via ⋯ **Rename** (focuses the same input).
- **Commit:** Enter or blur. **Cancel:** Esc (restores prior name).
- **Empty / whitespace-only:** reject → revert to previous name. **Trim** on commit.
- On entering edit: **select-all** the text.
- Writes via `onUpdateLayer(id, { name, nameIsCustom: true })`.

## 8. Auto-naming

- New **pattern** layers default to **`Pattern (<symbol>)`** from `PATTERN_SYMBOLS`
  (e.g. `Pattern (Sg)`). Centralize in a helper `autoLayerName(patternType)`:
  returns `Pattern (${symbol})` when a symbol exists, else falls back to the
  existing `Layer N` scheme (covers `import` / `ai-*` which have no symbol).
- New layer field **`nameIsCustom: false`** (set at BOTH creation sites). Manual
  rename sets it **`true`**.
- **Auto-name follows the pattern type** — when a layer's `patternType` changes
  AND `nameIsCustom === false`, recompute `name`. The pattern-switch router is the
  single chokepoint for `patternType` changes; recompute there.
- **No auto-indexing.** Two `Pattern (Sg)` layers may coexist; color/position/
  thumbnail + the dropdown disambiguate. Rename to differentiate.
- **Duplicate:** if source `nameIsCustom` → keep `"<name> copy"` + `nameIsCustom: true`;
  else → keep auto-name (recompute from patternType) + `nameIsCustom: false` (no "copy").
- **Migration (`loadLayers`):** any persisted layer lacking `nameIsCustom` →
  treat as **`true`** (never surprise-rename saved work); lacking `locked` → `false`.

## 9. Lock behavior (this change)

- Lock **disables randomization**:
  - Per-row 🎲 disabled + "Layer locked" tooltip (§5).
  - Header bulk "Rand Params" / "Rand Seeds" **skip locked layers**.
- **Deferred → GitHub issue** (file on `majedbg/Naqsha`): *"Locked layers ignore
  canvas interaction (no click-select, no drag-move)"* — forward-looking, since
  canvas layer-select/drag **does not exist yet** and can't be gated against
  absent code.

---

## 10. Open implementation decisions (resolve in-flight, low risk)

1. **Responsive breakpoint mechanism** — container query (preferred) vs `compact` prop. §3.2.
2. **RowMenu inline+flip vs portal** — inline+flip preferred for test-findability. §4.
3. **ConfirmDialog `danger` API** — add a `danger`/`destructive` boolean that swaps
   the confirm button to a red token; keep saffron default. §6.

## 11. Out of scope (do NOT build here)

- Undo/redo for layer params or deletion.
- Lock gating canvas interaction (filed as an issue instead).
- Drag-to-reorder on canvas or in the tree (reorder stays the ↑↓ buttons).
- Any mobile resize / rename UX.
