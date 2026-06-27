# 3D Preview — Maintainer & Agent Guide

> **Audience:** a future human or coding agent who needs to *change* this feature — fix a render bug,
> or rework a product/design decision or edge case. This is the map. It tells you **what behavior lives
> in which file**, **why each thing is the way it is**, and **where a change lands** (code vs. design).
>
> **Companion docs (read in this order if you're new):**
> 1. `docs/3d-preview-plan.md` — the locked spec: the 16 decisions (D1–D16) and their rationale.
> 2. **this file** — the navigational + responsibility + rework map.
> 3. `docs/3d-preview-run-log.md` — the build history (per-slice commits, gate numbers, smoke results,
>    and the disclosed approximations / residual risks).
> 4. `docs/naqsha-panels-plan.md` — upstream v1 (the 2D panel data model A is built on).
>
> **Branch:** built on `feat/3d-preview` (unmerged as of 2026-06-27). Screenshots:
> `docs/3d-shots/A-panel-stack.png`, `docs/3d-shots/B-height-surface.png`.

---

## 1. What this feature is, in one breath

A WebGL/three.js (React-Three-Fiber) preview layer with **two surfaces** sharing **one** R3F scene host:

- **Surface A — "panel-stack":** the design's panels as stacked, thickness-extruded acrylic/wood sheets
  with engraved/cut marks glowing under selective bloom. An always-on canvas **lens** (peer of the
  Operation/Material "Color View" lenses).
- **Surface B — "height-surface":** a modulation **guide layer's** ScalarField as a 3D relief, with the
  layers it modulates draped on top. Launched contextually from the guide's MODULATOR panel in the
  Inspector ("Preview in 3D").

3D is **preview-only**. The 2D SVG/ZIP laser-cut export is the source of truth for fabrication and is
**never touched** by any of this.

---

## 2. The single most important rule: the dynamic-import boundary (D9)

three.js is ~1 MB. It must **never** enter the 2D app bundle. The whole feature is split across a hard
line:

```
   2D side (always loaded)                    3D side (lazy async chunk: Scene3D-*.js)
   ────────────────────────                   ───────────────────────────────────────
   src/lib/three3d/*.js   ← PURE, three-free   src/components/canvas3d/*.jsx ← imports three/@react-three
   (unit-tested logic)                         (the ONLY place allowed to)
        │                                              ▲
        │  data (plain objects, ScalarField)           │ React.lazy(() => import('./Scene3D.jsx'))
        └──────────────────────────────────────────────┘
                          Canvas3DHost.jsx (the boundary; imports NO three itself)
```

**Rules an editor must keep:**
- Anything under `src/lib/three3d/` stays **pure and three-free** (so it's unit-testable in jsdom). If you
  need a three type, you're on the wrong side of the line — pass plain data instead.
- The **only** modules that may `import 'three'` / `@react-three/*` are under `src/components/canvas3d/`,
  and they are reachable **only** through `Canvas3DHost`'s `React.lazy`. Never statically import `Scene3D`
  or any `canvas3d/*` file from a 2D render-path module.
- **Verify after any change:** `npm run build`, then confirm `three` / `@react-three` appear in the
  `Scene3D-*.js` chunk and **not** in the main `index-*.js` chunk. (S1/S11 do this; the run log shows the
  expected split.)

---

## 3. File responsibility map

### 3a. Pure logic — `src/lib/three3d/` (three-free, unit-tested, runs on the 2D side)

| File | Responsibility | Key exports | Implements | Tests |
|---|---|---|---|---|
| `subModeReducer.js` | The view state machine: `{mode: 'off'\|'panel-stack'\|'height-surface', focusFieldLayerId}`. | `initialSubModeState`, `subModeReducer`, `is3DActive` | D1 | `subModeReducer.test.js` |
| `use3DPreview.js` | React hook wrapping the reducer; stable `openPanelStack`/`openHeightSurface(layerId)`/`close` callbacks. | `use3DPreview` | D1 | `use3DPreview.test.jsx` |
| `lensSelection.js` | Derives the *active* lens from `colorView.mode` + `subMode` (3D is **derived**, not a stored 3rd state — that's why closing 3D restores the prior 2D lens for free). | `deriveActiveLens` | D1/D2 | `lensSelection.test.js` |
| `use3DLensEntry.js` | Coordinates enter/exit/rebuild + holds the design snapshot; the glue the lens UI calls. | `use3DLensEntry` | D2/D14 | `use3DLensEntry.test.jsx` |
| `designSnapshot.js` | Deep-clone + **deep-freeze** the current design (layers/panels/operations/machineProfile) so the scene is non-reactive (snapshot-on-enter). | `buildDesignSnapshot` | D14 | `designSnapshot.test.js` |
| `cameraFit.js` | Pure zoom-to-fit math: frame a bounding box at the 3/4 angle; `MIN_RADIUS` guards a black view. | `computeZoomToFit`, `boundingRadius`, `viewDirection`, consts `DEFAULT_ELEVATION_DEG=35`, `DEFAULT_AZIMUTH_DEG=45`, `DEFAULT_FOV=50` | D4 | `cameraFit.test.js` |
| `sheetSpecs.js` | **Surface A geometry brain.** Panels → ordered sheet specs (z-stack from thickness + spacing, size from mm-bounds, material descriptor per `substrate.kind`). Spacing clamp. | `buildSheetSpecs`, `materialDescriptorForSubstrate`, `clampSpacing`, `boundsForSheetSpecs`, consts `SPACING_MIN=0`/`SPACING_MAX=60`/`SPACING_DEFAULT=12` | D7/D11 | `sheetSpecs.test.js` |
| `markTexture.js` | **Surface A marks brain.** Decides texture-vs-ribbon per panel (the cap), maps a laser process → emissive treatment, builds per-panel per-process SVG strings. | `routePanelRenderModes`, `shouldUseTextureMode`, `treatmentForProcess`, `countSvgPaths`, `buildPanelMarkSVGs`, consts `PATH_CAP=1500`, `TEXTURE_DPR_FLOOR=1.5` | D3/D6 | `markTexture.test.js` |
| `heightSurface.js` | **Surface B relief brain.** ScalarField → height-mesh vertices/colors (segment-capped), exaggeration scaling, diverging colormap. | `buildHeightmap`, `reliefColor`, `defaultExaggeration`, `exaggerationMax`, `clampExaggeration`, `uvToWorld`, `boundsForRelief`, consts `SEGMENT_CAP=256` | D5/D10 | `heightSurface.test.js` |
| `drape.js` | **Surface B drape brain.** Resolves the guide's active targets + builds the per-channel drape geometry (warp = in-plane ∇f displacement; density = inverse-CDF tick spacing). | `resolveActiveTargets`, `buildDrapeForTarget`, `buildWarpDrape`, `buildDensityDrape`, `warpDisplaceUV`, `densityTickUs`, consts `WARP_GRID=24`, `WARP_GAIN=0.04`, `WARP_MAX_FRAC=0.04`, `DENSITY_ROWS=16`, `DENSITY_SPACING=0.08`, `DENSITY_SAMPLES=240` | D5/§3.4 | `drape.test.js` |
| `snapshotExport.js` | PNG "Save image": pure filename builder (timestamp injected) + canvas→download. | `saveCanvasPng`, `buildSnapshotFilename`, `formatTimestamp`, `downloadDataUrl` | D8 | `snapshotExport.test.js` |
| `preview3dPersistence.js` | localStorage of view-prefs (sub-mode, spacing, exaggeration). Validates/clamps; camera is **never** persisted. | `loadPreview3DSettings`, `savePreview3DSettings`, `normalizePreview3DSettings`, `defaultPreview3DSettings`, key `sonoform-3d-preview` | D13 | `preview3dPersistence.test.js` |

### 3b. R3F scene — `src/components/canvas3d/` (imports three; lives in the lazy chunk)

| File | Responsibility | Implements |
|---|---|---|
| `Canvas3DHost.jsx` | **The boundary.** `React.lazy(() => import('./Scene3D'))` + Suspense ("Building preview…"). Imports no three itself. | D1/D14 |
| `Scene3D.jsx` | **The composition root.** One `<Canvas>`, one camera rig, one env, one bloom pass. Branches on `mode` to mount Surface A (`Sheets`+`Marks`) or Surface B (`Relief`+`DrapedMarks`). Owns the spacing/exaggeration slider local state + the "Save image" / "Reset view" overlay buttons. | D1/D4/D12 |
| `CameraRig.jsx` | Perspective cam + damped `OrbitControls`; applies `computeZoomToFit`; reset signal. | D4 |
| `SceneEnvironment.jsx` | drei `<Environment preset="studio">` IBL + dark bg (`DARK_BG='#0b0b10'`). | D12 |
| `EmissiveBloom.jsx` | `EffectComposer` + **SelectiveBloom** (only `<Select>`-wrapped emissive meshes bloom). | D12 |
| `Sheets.jsx` | Renders Surface A slabs from sheet specs; transmissive (acrylic) vs opaque (wood/mdf/cardstock) material per descriptor. | D7 |
| `Marks.jsx` | Renders Surface A marks: per-panel CanvasTexture emissive planes (texture mode), `<Select>`-wrapped so only marks bloom. Routes to ribbon mode via `ribbonGeometry`. | D3/D6 |
| `ribbonGeometry.js` | (three-using helper, hence in `canvas3d/`) `SVGLoader.parse → pointsToStroke → mergeGeometries` for sparse panels (≤cap). Has its own unit test. | D6/S10 |
| `Relief.jsx` | Renders Surface B height-mesh from `buildHeightmap` output; lit, kept **out** of the bloom Select. | D5/D10 |
| `DrapedMarks.jsx` | Renders Surface B drape as emissive `LineSegments` per target. | §3.4 |

### 3c. 2D-side integration points (where the feature plugs into the studio)

| File | What it wires | Lines (approx) |
|---|---|---|
| `src/pages/Studio.jsx` | Owns the state: `const threeD = use3DPreview()` + `const lensEntry = use3DLensEntry({colorView, threeD, captureDesign})`. Passes `threeDMode`/`focusFieldLayerId`/`threeDSnapshot`/`threeDActive` down to `RightPanel`, and `onPreviewField={threeD.openHeightSurface}` into the Inspector. | ~424–441, ~983–1032, ~1248 |
| `src/components/RightPanel.jsx` | Mounts `<Canvas3DHost>` as an overlay when `threeDMode !== 'off'` (p5 hidden via visibility, **not** unmounted). Builds the 2D-side inputs the scene needs: `buildPanelMarkSVGs` (A marks) and `resolveActiveTargets` (B targets), passes them + the resolved `reliefField` across the boundary. | ~23–72 |
| `src/components/canvas/ColorViewControl.jsx` | The **Surface A entry**: the always-on "3D" radio peer of Operation/Material. `onEnter3D`/`onExit3D`; while 3D is active, neither 2D lens is checked and the material chip is suppressed. | ~161–168 |
| `src/components/shell/Inspector.jsx` | The **Surface B entry**: the `data-testid="modulator-preview-3d"` "Preview in 3D" button inside the MODULATOR panel; calls `onPreviewField(guideLayerId)` → `threeD.openHeightSurface`. | ~289–299, ~499 |

---

## 4. Data flow per surface (trace it end-to-end)

**Surface A (panel-stack):**
```
ColorViewControl "3D" radio → Studio lensEntry.enter → buildDesignSnapshot() [designSnapshot.js]
  → RightPanel: buildPanelMarkSVGs(snapshot) [markTexture.js] + buildSheetSpecs inputs
  → Canvas3DHost (lazy) → Scene3D(mode='panel-stack', snapshot, marksByPanel, spacing, boundsMm)
     → buildSheetSpecs() [sheetSpecs.js] → Sheets.jsx (materials per kind)
     → routePanelRenderModes() [markTexture.js] → Marks.jsx (texture) or ribbonGeometry.js (vector)
     → CameraRig zoom-fit on the sheet bounds; EmissiveBloom blooms only <Select>-ed marks
  Spacing slider → setSpacingMm → re-layout z-offsets; persisted via preview3dPersistence (A only)
  "Save image" → saveCanvasPng() [snapshotExport.js]
```

**Surface B (height-surface):**
```
Inspector "Preview in 3D" → onPreviewField(guideId) → threeD.openHeightSurface(guideId)
  → RightPanel resolves reliefField = fieldForLayer(guide) [existing fieldRegistry] (ScalarField is three-free)
     + drapeTargets = resolveActiveTargets(guide, layers) [drape.js]
  → Scene3D(mode='height-surface', reliefField, drapeTargets, exaggeration)
     → buildHeightmap() + reliefColor() [heightSurface.js] → Relief.jsx
     → buildDrapeForTarget() per target [drape.js] → DrapedMarks.jsx (LineSegments per target, toggles)
  Exaggeration slider → setExaggerationMm; persisted via preview3dPersistence (B only)
```

---

## 5. "I want to change X" → go here

| Goal | File · symbol | Code or product decision? |
|---|---|---|
| Spacing slider range / default | `sheetSpecs.js` · `SPACING_MIN/MAX/DEFAULT` | code constant (product feel — D11) |
| Path-count cap (ribbon↔texture) | `markTexture.js` · `PATH_CAP`, `shouldUseTextureMode` | code constant (perf — D6/§9 veto) |
| Force texture on mobile/low-DPR | `markTexture.js` · `TEXTURE_DPR_FLOOR`, `shouldUseTextureMode` | code (D6/D9) |
| Per-process mark color/intensity (incl. **engrave≈near-white**) | `markTexture.js` · `treatmentForProcess` | **product decision** (D3/§9) |
| Add/alter a substrate material (acrylic/wood/…) | `sheetSpecs.js` · `materialDescriptorForSubstrate` → `Sheets.jsx` | code + product (D7) |
| Height-surface colormap | `heightSurface.js` · `reliefColor` | **product decision** (D10) |
| Vertical exaggeration default/max | `heightSurface.js` · `defaultExaggeration`, `exaggerationMax` | code (D10) |
| **Drape semantics** (warp displacement, density spacing) | `drape.js` · `buildWarpDrape`/`buildDensityDrape` + consts `WARP_*`/`DENSITY_*` → `DrapedMarks.jsx` | **product decision** (§3.4 — see §6.1) |
| Which targets drape (all active vs one) | `drape.js` · `resolveActiveTargets` | product (D5) |
| Camera default angle / fit margin | `cameraFit.js` · `DEFAULT_ELEVATION_DEG`/`AZIMUTH_DEG`/`DEFAULT_FIT_MARGIN` | code (D4) |
| Bloom strength / what blooms | `EmissiveBloom.jsx` + the `<Select>` wrapping in `Marks.jsx`/`Scene3D.jsx` | code (D12 — see §6.5 warning) |
| Background color | `SceneEnvironment.jsx` · `DARK_BG` | code (D12) |
| What persists across sessions | `preview3dPersistence.js` · `normalizePreview3DSettings` | code (D13 — see §6.4) |
| PNG filename / export behavior | `snapshotExport.js` · `buildSnapshotFilename`, `saveCanvasPng` | code (D8) |
| Where A/B are entered from | A: `ColorViewControl.jsx`; B: `Inspector.jsx` (`modulator-preview-3d`) | product (D2) |
| Make 3D live-reactive to edits | `use3DLensEntry.js` + `designSnapshot.js` (currently snapshot-on-enter) | **product decision** (D14 — see §6.6) |
| Add a third sub-mode | `subModeReducer.js` + `Scene3D.jsx` branch + an entry point | code |

---

## 6. Product-level oversights & edge cases (the rework registry)

> These are **not** bugs in the "it crashes" sense — they're disclosed approximations, design trade-offs,
> and unverified edges. Each says *what it is, why, and what a rework touches.* This is the section to read
> before re-working the design.

### 6.1 Surface B drape is a representative lattice, not the target's literal marks  *(highest-value rework)*
- **What:** `DrapedMarks` renders a deterministic lattice — warp shows a deformed grid; density shows
  spacing ticks/studs — that conveys *each channel's effect field*, **not** the actual target pattern's
  stroke geometry displaced. (Run log "Overall state" #1.)
- **Why:** the snapshot passed to B carries the field + target *descriptors*, not the target pattern
  instances; building real displaced marks for every target overnight was out of scope.
- **Rework touches:** `drape.js` (`buildWarpDrape`/`buildDensityDrape`) to consume real target geometry;
  `RightPanel.jsx` to put target pattern instances/SVG into the B payload; `DrapedMarks.jsx` to render
  them. This is the biggest gap between the "see what the modulation does" promise and what's drawn.

### 6.2 Engrave tint is neutral near-white (`#f0f0f0`), not black
- **What/why:** PRD §9 reads "engrave≈black," but pure black **cannot emit/bloom**, so engrave is a neutral
  near-white. Intentional, disclosed (§9 veto).
- **Rework touches:** `markTexture.js` · `treatmentForProcess` (and decide the visual encoding you actually
  want — e.g. hue instead of luminance).

### 6.3 S10 ribbons are flat (vector crispness only, no baked depth)
- **What/why:** `ribbonGeometry.js` uses `pointsToStroke` (flat ribbons), **not** `ExtrudeGeometry` — z-depth
  was imperceptible under bloom, so it was left out. The win over texture mode is crispness, not relief.
- **Rework touches:** `ribbonGeometry.js` (introduce extrude depth) — only worth it if you change lighting so
  depth reads.

### 6.4 Exaggeration persists as absolute mm (cross-design surprise)
- **What:** reopening B on a *differently-sized* design can read near-flat or over-spiky until you nudge the
  slider, because the saved value is absolute mm, not bounds-relative. (Run log #4.)
- **Rework touches:** `preview3dPersistence.js` + the seeding in `Scene3D.jsx` — persist as a *fraction of
  bounds* or per-design instead.

### 6.5 Per-frame console warning: "Layer out of range, resetting to N"  *(code bug, cosmetic)*
- **What:** fires ~once/frame on both surfaces (A→2, B→0), count grows unbounded. Warning only — scene
  renders correctly, bloom stays selective — but it spams the log.
- **Likely cause / rework touches:** the SelectiveBloom layer-index config from S2 — `EmissiveBloom.jsx`
  and/or the `<Select>`/layer assignment in `Marks.jsx`/`Relief.jsx`/`Scene3D.jsx`. Fix before merge if cheap.

### 6.6 Snapshot is non-reactive (by design) — needs the Rebuild button
- **What/why:** D14 — entering 3D snapshots the design; later 2D edits do **not** flow in until you hit
  "↻ Rebuild" or re-enter. Intentional (perf + determinism), but a first-time user may think it's frozen.
- **Rework touches:** `use3DLensEntry.js`/`designSnapshot.js` if you ever want (debounced) live reactivity.

### 6.7 Unverified GPU-correctness edges (no automated coverage — see §7)
- Marks could be **mirrored / text backwards** (CanvasTexture `flipY` default) — check `Marks.jsx`/
  `markTexture.js` rasterization orientation.
- Bloom could leak onto the **acrylic body / background** (D12 trap) — should be grooves/marks only.
- B colormap can read **washed-out / over-white** in the bright midrange (visible in `B-height-surface.png`)
  — tune `reliefColor` and/or the relief's exclusion from bloom.

### 6.8 Edges to verify when touching this
- **Non-laser processes:** `treatmentForProcess` is built around `cut`/`score`/`engrave`. Confirm `pen`
  (Pen Plotter) and `dragCutter` (`cut`-only) processes map sensibly (the A screenshot was taken in Pen
  Plotter mode showing a "Cut" op — verify the mapping isn't silently falling through).
- **Empty/degenerate:** 0 panels / all-hidden (A shows an empty-state hint, S11); a guide with **no active
  targets** (B shows relief-only + hint, S9). Keep these when refactoring.
- **MAX_PANELS = 3** is inherited from the v1 panel model — A assumes ≤3 sheets.
- **Single source only:** B shows one guide's field; multi-source modulation (Phase 2b) is out of scope and
  not represented.

---

## 7. Testing map (what's guaranteed vs. eyeball-only)

- **Unit-tested (vitest, jsdom, the real gate):** every `src/lib/three3d/*.js` module + `ribbonGeometry.js`.
  This is where logic correctness is locked — **add tests here** for any logic change. Final suite: 2135
  pass / 0 fail.
- **NOT unit-tested (jsdom has no WebGL):** all `*.jsx` R3F components don't render in tests (mocked to
  sentinels). Their correctness is only covered by the **soft** Playwright-MCP screenshot smoke (S7a/S7b)
  — which is an artifact + human eyeball, **not** a gate. So: **any visual/GPU change must be eyeballed**
  (see §6.7). The smoke screenshots live in `docs/3d-shots/`.
- Gate-keeping for any edit: `npm run test` (≥1949, 0 fail), `npm run build` (green + boundary intact),
  `npm run lint` (≤ baseline 30). Then eyeball the two surfaces in a browser.

---

## 8. Quick recipes

- **Add a substrate kind:** extend `materialDescriptorForSubstrate` (`sheetSpecs.js`) with the new kind's
  descriptor; handle the descriptor in `Sheets.jsx`; add a `sheetSpecs.test.js` case. (Also add the kind to
  the v1 `SUBSTRATE_KINDS` if it's user-selectable — see `src/lib/panels.js`.)
- **Change what blooms:** wrap/unwrap meshes in `<Select>` (`Marks.jsx`/`Relief.jsx`) and tune
  `EmissiveBloom.jsx`. Remember: bloom should hit emissive marks only (D12).
- **Re-work the drape (6.1):** thread target pattern geometry into the B payload in `RightPanel.jsx`, then
  rewrite `buildWarpDrape`/`buildDensityDrape` to displace real marks; update `DrapedMarks.jsx` + tests.
- **Tune B legibility:** `reliefColor` (colormap) + `WARP_GAIN`/`WARP_MAX_FRAC`/`DENSITY_*` (drape
  magnitudes, untuned vs. real gradient ranges — run log residual risk).

---

## 9. Decision index (D1–D16 → where encoded)

D1 mount/sub-modes → `subModeReducer.js`,`Scene3D.jsx`,`RightPanel.jsx` · D2 entry points →
`ColorViewControl.jsx`(A),`Inspector.jsx`(B) · D3 operation fidelity → `markTexture.js`·`treatmentForProcess`
· D4 camera → `cameraFit.js`,`CameraRig.jsx` · D5 B = relief+drape → `heightSurface.js`,`drape.js` · D6
hybrid ribbon/texture → `markTexture.js`,`ribbonGeometry.js` · D7 materials per kind → `sheetSpecs.js`,
`Sheets.jsx` · D8 PNG export → `snapshotExport.js` · D9 perf/code-split → §2, `Canvas3DHost.jsx` · D10 B
presentation → `heightSurface.js` · D11 spacing → `sheetSpecs.js` · D12 look/bloom → `SceneEnvironment.jsx`,
`EmissiveBloom.jsx` · D13 persistence → `preview3dPersistence.js` · D14 snapshot transition →
`designSnapshot.js`,`use3DLensEntry.js` · D15 test strategy → §7 · D16 run policy → run log.

Full rationale for each decision is in `docs/3d-preview-plan.md` §1.
