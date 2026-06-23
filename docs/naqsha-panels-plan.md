# Naqsha Panels — Locked Decision Spec (v1, 2D foundation)

> Companion to `docs/naqsha-panels-ORCHESTRATOR.md` (the TDD runbook). This file is
> the **source of truth** for *what* to build; the orchestrator owns *how* (sequencing,
> TDD, verification). §-numbers here are cited by the orchestrator's work items.
>
> Settled via `/grill-me` (2026-06-23). Narrative + rationale: `../../NAQSHA-SHEETS-GRILL-RESUME.md`.

---

## §1. Ground truth (verified in code — do not re-discover)

- App: `generative-art-studio/` — Vite 8 + React 19.2 + Tailwind + p5 2.x. Node v22.
- **Machine profile is the "mode".** `activeProfileId ∈ {'laser','plotter','dragCutter'}`
  in `src/pages/Studio.jsx:181`; selector `<select>` at `src/components/shell/LayerTree.jsx:429`.
  Panels are **`activeProfileId === 'laser'` only** (NOT dragCutter — opaque single-sheet,
  same logic that excludes plotter).
- **Layer** created in `src/lib/useLayers.js:64-92`: `{ id, name, visible, color, opacity,
  patternType, params, seed, operationId, penSlot, … }`. Flat array; no grouping tier today.
- **operationId** (`src/lib/operations.js`) = *how* a layer is processed (cut/score/engrave/pen
  + machineParams). **Panels are orthogonal**: `panelId` = *which physical substrate*.
- **localStorage = 3 keys**, not one: `sonoform-layers` (`useLayers.js:95,156`),
  `sonoform-bg-color` (`useLayers.js:38,157`), `sonoform-canvas` (`src/lib/hooks/useCanvasSize.js:11,59`).
- **Cloud save is field-whitelisted on both ends** (`src/lib/hooks/useCloudPersistence.js`):
  `config = { layers, canvasW, canvasH, presetIndex }` on save; destructured by name on load.
  `designs.config` is **jsonb**, owner-only RLS → adding `panels` needs **no new table/migration**.
- **Export:** `buildAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden, {…})`
  (`src/lib/svgExport.js:152`) takes a layer array and filters `l.visible` at `:155-156`.
  Per-panel SVG = same call with a `panelId`-filtered subset; combined = the all-layers call.
- **Canvas visibility filter** lives at `src/lib/useCanvas.js:99,125,165` (`if (!layer.visible) …`).
- **ConfirmDialog** with a `danger` variant already exists (`src/components/ui/ConfirmDialog.jsx`,
  from the object-tree work) — reuse for the delete-panel prompt.
- `materials`/`org_materials` tables exist but are **org-scoped** — NOT used in v1.

---

## §2. The panel model

```js
panel = {
  id,                 // 'panel-<n>-<rand>' stable
  name,               // 'Panel 1' default, user-editable
  substrate: {
    kind,             // 'acrylic' | 'plywood' | 'mdf' | 'cardstock' | 'other'
    thickness,        // number, in the app's active unit (mm/in); default ~3 (mm)
    color,            // hex tint, default a neutral
  },
  visible,            // boolean, default true
  order,              // 0-based stacking order
}
```

- **`MAX_PANELS = 3`** (hard cap).
- **`SUBSTRATE_KINDS`** = the 5 above; `'other'` allows a free-text label field.
- Membership lives on the **layer**: add **`layer.panelId`** (string). A panel never owns
  a `layerIds[]` (would let the partition desync). Helper resolution:
  `layersForPanel(layers, panelId) = layers.filter(l => l.panelId === panelId)`.

### §2.1 Invariants
- **Partition:** in laser mode every layer has exactly one valid `panelId`. A layer whose
  `panelId` is missing/dangling normalizes to the **first panel** (by `order`).
- **Always ≥1 panel** in laser mode (the seed guarantees it).
- **Cap:** `panels.length <= 3` at all times.

---

## §3. Persistence (corrects the old Q3 mechanism)

- **localStorage:** new key **`sonoform-panels`** holding the panel array
  (mirrors the per-concern key pattern). Load/save alongside the existing layer
  persistence. `layer.panelId` rides inside `sonoform-layers` (already a layer field).
- **Load-time normalizer** (§6 WI-1): if `sonoform-panels` is absent/empty/invalid →
  **seed `Panel 1`** (acrylic default) and set every layer's `panelId` to it. If panels
  exist but some layer's `panelId` is dangling → reassign to first panel. Forgiving
  (`Array.isArray` guards), no version field — matches existing `migrateLayer` style.
- **Cloud (`config` jsonb):** add `panels` to the whitelist at **both** seams in
  `src/lib/hooks/useCloudPersistence.js` — `config = { layers, canvasW, canvasH, presetIndex, panels }`
  on save; destructure `panels` on load (apply via the same normalizer). **No new table.**

---

## §4. Visibility

- **One helper:** `effectiveVisible(layer, panel) = panel.visible && layer.visible`.
- Wired into:
  - **Canvas** — at the `useCanvas.js:99/125/165` filter points, a layer whose panel is
    hidden behaves as not-visible (no-draw adapter), without mutating `layer.visible`.
  - **Export** — `buildAllLayersSVG` callers pass subsets already filtered by effective
    visibility (hidden panel → its layers excluded from both per-panel and combined SVG).
- Only active in laser mode; in plotter/dragCutter the helper degrades to `layer.visible`
  (no panels → panel treated as visible).

---

## §5. Mode-gating & dormancy

- Panel UI (LayerTree tier, add/delete, substrate editor) and per-panel export render
  **only when `activeProfileId === 'laser'`**.
- Switching **out** of laser → panel UI/export **hide**; `layer.panelId` values are
  **preserved untouched**. Switching back restores the exact grouping. Non-destructive —
  no panel data is cleared on profile change (contrast `handleProfileChange` which remaps
  *operations*; panels are deliberately left alone).
- Plotter/dragCutter render + export the flat layer list exactly as today.

---

## §6. UI — LayerTree grouped tier

- Panels render as **collapsible header rows** above their layers: name (inline-editable),
  substrate summary (kind + thickness, click → substrate editor), visibility toggle,
  collapse chevron. Layers nest under their panel.
- **Drag a layer** into another panel's group → reassign `panelId` (extends the existing
  `onReorderLayers` drag, `LayerTree.jsx:172`). New layers join the selected/expanded panel.
- **"+ Add panel"** button: **disabled at 3** with tooltip "Max 3 panels per document".
- **Delete panel** → ConfirmDialog (danger): "Delete the layers on this panel too?"
  - **No** → panel removed, its layers' `panelId` reassigned to the first remaining panel.
  - **Yes** → panel and its layers removed together.
  - Deleting the **last** panel is blocked (always ≥1) — or immediately re-seeds Panel 1.
- Desktop only (never touch `MobileStudio.jsx`).

---

## §7. Export (per-panel + combined, zipped, timestamped)

- New module `src/lib/panelExport.js`:
  - `exportPanelsZip(panels, layers, patternInstances, canvasW, canvasH, opts)`:
    - For each **visible** panel: `buildAllLayersSVG(layersForPanel(visibleLayers, panel.id), …)`
      → `naqsha-<design>-panel-<order+1>-<kind>.svg`.
    - One combined: `buildAllLayersSVG(allEffectiveVisibleLayers, …)` → `…-combined.svg`.
    - Bundle into a **ZIP** (new dep **JSZip**); download as
      `naqsha-<design>_<YYYY-MM-DD_HHmm>.zip` (timestamped; stateless version-finding).
- Reuses `buildAllLayersSVG` unchanged. Hidden panels/layers excluded (§4).
- Non-laser export path is unchanged.

---

## §8. Out of scope (v2 / future)

- **R3F 3D stacked acrylic viewer** + **inter-panel spacing slider** (no meaning in 2D).
- **`materials` catalog bridge** (org-scoped) — file as a future issue; v1 is inline substrate.
- Mobile.

---

## §9. Acceptance (v1 done)

- Laser mode: create up to 3 panels, name + substrate editable, drag layers between
  panels, hide a panel (its layers vanish from canvas + export), export a timestamped
  ZIP of per-panel + combined SVGs.
- Plotter/dragCutter: zero visible change vs today.
- Legacy designs open with a single auto-seeded "Panel 1" holding all layers; nothing breaks.
- Signed-in cloud save/load round-trips `panels` (no new table).
- `npm test` + `npm run build` green throughout; mobile untouched.
