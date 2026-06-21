# Material Preview ("Color View") — Locked Spec

> **STATUS: EXECUTED 2026-06-20.** All build-order steps shipped, 1547 tests green,
> production build clean, browser-verified (operation lens, picker prompt, green
> sheet, dark-sheet cut-contrast flip). Desktop Studio only; MobileStudio/ShareView
> pass `colorView=null` → operation behavior (no regression). Known v1 limitation:
> per-layer `bgColor`/`bgOpacity` fills paint over the sheet in material mode.
>
> Grilled 2026-06-20. A bottom-left canvas control that toggles the canvas
> between the **Operation** lens (today's technical cut=red / score=blue /
> engrave=black) and a **Material** lens that previews the design as if cut on a
> real sheet. Conceptually Google-Maps "Map vs Satellite": same geometry, two
> display lenses. **Preview-only — export is never touched.**

## Locked decisions

1. **Preview-only.** Material view recolors the canvas ONLY. `svgExport.js` and
   `resolveExportColor` stay literally untouched — export always emits the locked
   LightBurn convention. A test asserts operation-mode canvas color is
   byte-identical to today's output.
2. **Render model.** Material mode paints the **artboard** (the p5 surface,
   `canvasW×canvasH` = the stock sheet) with the material's sheet hex, and
   recolors every operation's strokes by a `(category, process)` rule. The
   operation's own color is ignored in this view (except `pen`). `CanvasChrome`
   rulers/bed stay around the artboard. Per-layer `bgColor`/`bgOpacity` fills are
   left as-is in v1 (they're artwork, not operations) — known limitation.
3. **Material source.** Picker reads an injected `materials` list. Phase 1 always
   uses `DEFAULT_PREVIEW_MATERIALS` (Studio has no org context — `OrgProvider`
   only wraps `/o/:slug`). Phase 2 (later): feed the logged-in member's active org
   materials; the resolver already accepts an injected list, so it drops in.
4. **Resolver.** Defaults carry explicit `{hex, category}`. For injected org
   materials: `category` from `type` (`/acryl|cast|petg|polyc/`→`lighten`;
   `/ply|wood|mdf|veneer|bamboo/`→`burn`; else `darken`); hex from
   `m.swatchHex ?? NAME_MAP[m.color] ?? '#C9C2B5'`.
5. **Cut stroke = strongest material-reaction tint.** (REVISED post-feedback
   2026-06-21: the original contrast-aware contour — dark on light sheets, light
   on dark — looked *flipped* to users, e.g. white cut lines on dark walnut, dark
   lines on bright fluorescent green. Real cut edges char dark on wood and frost
   light on acrylic, i.e. they tint in the SAME direction as score/engrave, just
   strongest.) Cut now mixes toward the material extreme at 0.92 (frost→white for
   acrylic, burn→near-black for wood) — more than engrave (0.72), more than
   score (0.45). Same MIN_VISIBLE 0.06 fallback.
6. **Score/engrave = MIX toward a fixed extreme, engrave stronger.** (Revised
   during build: additive lighten + a contrast floor inverted engrave/score
   ordering near the luminance ceiling — e.g. frost on bright fluorescent green.
   A monotonic mix toward an extreme can't reverse the ordering.)
   - frost (acrylic/lighten): mix toward white — score 0.45, engrave 0.72.
   - burn (wood): mix toward warm near-black `#0E0A06` — score 0.45, engrave 0.72.
   - If the mark/sheet luminance separation < 0.06 (sheet sits at the extreme:
     white acrylic / near-black wood) fall back to a faint readable contour
     (`#9AA0A6` on light sheets, `#C9C9C9` on dark).
7. **All profiles.** No profile gating. cut/score/engrave use shade rules; `pen`
   keeps `operation.color` (ink sits on the sheet); drag-cutter cut uses the
   contrast-aware contour.
8. **Persistence.** `localStorage 'sonoform-colorview' = { mode, materialId }`.
   NOT in document JSON. Fresh load defaults to Operation. Restore last material
   when switching to Material; first switch with none chosen auto-opens picker.
9. **Control UI.** Compact card docked bottom-left of the canvas viewport
   (matches canvas chrome). Segmented `[ Operation | Material ]` toggle. In
   Material mode the card also shows the current swatch + name; click opens a
   viewport-aware popover UPWARD titled "What material should we preview?" —
   swatches (photo when available, hex fallback) grouped Acrylic / Plywood.
   Reuses the `OperationPicker` popover positioning pattern.

## Default material set (`DEFAULT_PREVIEW_MATERIALS`)

| # | name | hex | category | photo asset |
|---|------|-----|----------|-------------|
| 1 | Green Fluorescent | `#E6E954` | lighten | itp green-fluorescent.jpg |
| 2 | Clear | `#E7E7E7` | lighten | itp clear.jpg |
| 3 | Turquoise Opaque | `#61DBC2` | lighten | itp turquoise-opaque.jpg |
| 4 | Blue Translucent | `#0082CD` | lighten | itp blue-translucent.jpg |
| 5 | Gotham Black Pearl | `#10130E` | lighten | itp gotham-black-pearl.jpg |
| 6 | Birch Plywood | `#D8B988` | burn | (hex only v1) |
| 7 | Walnut Plywood | `#6B4A2B` | burn | (hex only v1) |

Acrylic hexes + photos reuse `src/kits/itpCampMaterials.js`.

## Architecture / impact map

NEW:
- `src/lib/materialPreview.js` — `DEFAULT_PREVIEW_MATERIALS`, `materialCategory`,
  `materialSheetHex`, `materialStrokeColor`, color helpers (luminance / lighten /
  darken / mix), `resolveCanvasColor(layer, {operations, outputMode, colorView})`.
- `src/lib/hooks/useColorView.js` — `{ mode, materialId, material, setMode,
  setMaterialId }` backed by `localStorage 'sonoform-colorview'`, resolved against
  injected materials.
- `src/components/canvas/ColorViewControl.jsx` — the bottom-left card + popover.
- Tests for each (`materialPreview.test.js`, `useColorView.test.js`,
  `ColorViewControl.test.jsx`), incl. the operation-mode byte-identical test.

CHANGED:
- `src/lib/useCanvas.js` — swap the per-layer `resolveExportColor(...)` calls for
  `resolveCanvasColor(layer, {operations, outputMode, colorView})`; when
  `colorView.mode==='material'` use the sheet hex for `p.background(...)` instead
  of `bgColor`. New `colorView` prop (defaults null → unchanged behavior).
- `src/components/RightPanel.jsx` — thread `colorView` through to `useCanvas`.
- `src/pages/Studio.jsx` — mount `useColorView`, render `<ColorViewControl/>` as
  an absolute child of the canvas viewport div (`:938`), pass `colorView` to
  `RightPanel`.

UNTOUCHED (guarded): `svgExport.js`, `fabrication.js:resolveExportColor`,
`machineProfiles.js` locked colors, document JSON schema.

## Build order (TDD)

1. `materialPreview.js` + tests (resolver, shade math, contrast floor, default
   set, operation-mode === resolveExportColor passthrough).
2. `useColorView.js` + tests (persistence, default, restore, resolve material).
3. `ColorViewControl.jsx` + tests (toggle, popover, grouped swatches, auto-open)
   — built under `/impeccable`.
4. Wire `useCanvas` / `RightPanel` / `Studio`; verify build + existing suites.
