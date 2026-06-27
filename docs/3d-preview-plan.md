# 3D Preview — Locked Spec (PRD)

> Grilled 2026-06-27. Branch `feat/3d-preview` (worktree `.claude/worktrees/3d-preview`, off `main` @ `eb5177b`).
> Companion build runbook: `docs/3d-preview-ORCHESTRATOR.md`.
> Status: SPEC LOCKED — pending dependency/WebGL pre-flight (see §10) before the overnight run launches.

## 0. What this is

A WebGL/three.js (R3F) 3D preview layer for Naqsha studio, delivering **two related surfaces on one
shared three.js foundation**:

- **Surface A — Stacked acrylic viewer** (naqsha-panels v2). Renders the design's panels as stacked,
  thickness-extruded substrate sheets with engraved/cut marks, viewable in 3D with an inter-panel
  spacing slider. The v1 2D panel data model is already BUILT + MERGED (PR #31).
- **Surface B — Modulation height-surface.** Renders a guide layer's modulation ScalarField as a
  3D relief, with the layers it modulates draped on top — launched from the guide's Modulation
  section in the Inspector. Answers "what is this modulator actually doing."

3D is a **preview / communication surface only**. The existing 2D SVG/ZIP laser-cut export remains the
single source of truth for fabrication and is **never touched** by this feature.

## 1. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | **Mount model** | One shared "3D mode" R3F `<Canvas>` that swaps INTO the central canvas region (p5 hidden, NOT unmounted; p5 state preserved underneath). Two sub-modes: `panel-stack` (A) and `height-surface` (B). One foundation, one camera rig. |
| D2 | **Entry points** | A = always-on lens in the canvas lens toggle (peer of ColorView's Operation/Material), targets the whole design. B = NOT in the lens toggle; launched by a "Preview in 3D" button inside a guide layer's Modulation section in `Inspector.jsx` (~lines 272–287, the field-heatmap card). Opening B flips the canvas into 3D focused on that field; closing B restores the exact prior 2D/lens state. |
| D3 | **A operation fidelity** | Distinguish cut/engrave/score via emissive treatment, NO CSG / NO holes. Map existing process depth scores (score 0.45 / engrave 0.72 / cut 0.92, `materialPreview.js`) → groove glow intensity + slight depth-offset; per-process emissive tint echoing the laser color convention (cut≈red, score≈blue, engrave≈black/neutral). `layer.operationId` → `operation.process` (`operations.js`). |
| D4 | **Camera rig (shared)** | Perspective camera + drei `OrbitControls` (rotate/pan/zoom, damped). Default 3/4 framing (~35° elevation). Zoom-to-fit on open; "Reset view" button. Same rig for both sub-modes; only framed bounds differ. |
| D5 | **B — what the surface is** | Source field as relief + target marks draped on it. Relief height = guide's ScalarField; on top, the target pattern marks are draped to show cause (relief) AND effect (marks) together. |
| D6 | **A stroke render tech** | **Hybrid.** Per panel: if stroke-path count ≤ **1500** → ribbon geometry (`SVGLoader.pointsToStroke` → `ExtrudeGeometry` → `mergeGeometries`, true emissive relief). Above 1500 → emissive **texture map** (rasterize that panel's SVG to an offscreen canvas → `CanvasTexture` → `material.emissiveMap`). On mobile / DPR < 1.5 → force texture mode regardless. |
| D7 | **Substrate materials** | Branch on `substrate.kind`. `acrylic` → `MeshTransmissionMaterial` tinted by `substrate.color` (ior≈1.49). `plywood`/`mdf`/`cardstock` → opaque `MeshStandardMaterial` tinted by `substrate.color`, roughness per kind (wood ~0.8, mdf ~0.9, cardstock ~1.0 matte). `other` → opaque neutral. Grooves emissive on every kind. |
| D8 | **Export from 3D** | High-res PNG snapshot only. "Save image" button → renders current framing (bloom/transmission) to PNG `naqsha-3d_<design>_<YYYY-MM-DD_HHmm>.png`. No new fabrication path; 2D SVG export untouched. Works for A and B. |
| D9 | **Perf budget** | Target 60fps orbit on a modern laptop, 30fps floor. Ribbon cap = 1500 paths/panel (D6). B heightmap ≤ 256×256 segments. three.js/R3F bundle **code-split via dynamic import** so the 2D app bundle is unaffected. |
| D10 | **B presentation** | Relief Z = `field.sampleSigned(u,v) × exaggeration` (vertical-exaggeration slider; default ≈ panel-size/4). Surface shaded with a **diverging colormap** (attract/repel = warm/cool, matching the topographic modulation semantics) + soft lighting. Draped target marks = thin emissive **LineSegments** (cheap, crisp), each vertex lifted/displaced per channel (see §3.4). |
| D11 | **Stack spacing (A)** | Gap slider 0–60mm, default **12mm**. Panels stack along view-depth honoring `panel.order`. mm units (consistent with `substrate.thickness`). |
| D12 | **Look & lighting** | drei `<Environment preset="studio">` for acrylic reflections/transmission; **selective bloom on emissive grooves only** (not whole scene); neutral dark background so glow + transmission pop. |
| D13 | **Persistence** | Persist last sub-mode + spacing (A) + vertical-exaggeration (B) to localStorage. Camera is NOT persisted — always reframes via zoom-fit on open (never a lost/black view). |
| D14 | **Transition UX** | Entering 3D builds geometry from the CURRENT design **snapshot** with a brief "Building preview…" indicator; the scene is NOT live-reactive to edits. A "↻ Rebuild" button resyncs. Closing restores the exact prior 2D/lens state. |
| D15 | **Test strategy** | Unit-test all pure WebGL-free logic in vitest (primary gate). Scene render verified via Playwright **MCP** screenshot artifact + morning eyeball — a SOFT gate, not an auto-fail loop (see §6 + advisor note A2). |
| D16 | **Run autonomy** | Orchestrator builds all slices TDD on `feat/3d-preview`, runs gates, self-reviews + fixes, writes run log + AM checklist + screenshots — then STOPS. No auto-merge, no push, no `gh issue create`. Human eyeballs the 3D look and merges. |

## 2. Foundation (shared by A + B)

- **Dependency matrix (PINNED, verified 2026-06-27 against npm + React 19.2.4):**
  - `three@0.185.0`
  - `@react-three/fiber@9.6.1` (peer `react >=19 <19.3` — satisfied by 19.2.4)
  - `@react-three/drei@10.7.7`
  - `@react-three/postprocessing@3.0.4`
  - ⚠️ **Watch-item:** R3F 9.6.1 pins `react <19.3`. The app's `^19.2.4` caret could float to 19.3+ on a
    fresh install and break the peer. Install relies on the existing lockfile react pin; do NOT bump react.
    If npm reports a peer conflict, pin react/react-dom to `19.2.x` exactly (do not use `--force`).
- **Code-split:** all three.js/R3F code behind a dynamic `import()` boundary; the 3D module must not
  enter the main 2D bundle (verify via build output).
- **One `<Canvas>`, one camera rig (D4), one lighting/env setup (D12), one bloom pass (D12).**
- Sub-mode is a prop/state switch deciding which scene content mounts (A vs B).

## 3. Surface specifics

### 3.1 Surface A — content
- Input: `panels` (localStorage `sonoform-panels`), `layers` (with `layer.panelId`), `operations`,
  `patternInstances`, active machine profile.
- Per panel (in `panel.order`): an extruded slab, thickness = `substrate.thickness` (mm → world units),
  material per `substrate.kind` (D7), stacked along depth with the D11 spacing gap.
- Marks per panel: union of that panel's layers' strokes, respecting **effective visibility**
  (`panels.js` `effectiveVisible(layer, panel)` = panel AND layer). Rendered via hybrid D6, colored/lit
  per operation process D3.
- Source SVG: reuse `buildAllLayersSVG` / per-panel builder (`panelExport.js`) for an in-memory SVG
  string per panel — it already emits real-mm dimensions and per-operation stroke colors.
- Degenerate cases: 1 panel → single sheet (valid). 0 panels / all hidden → empty-state hint.

### 3.2 Surface A — known build risk
The `SVGLoader.pointsToStroke → ExtrudeGeometry → mergeGeometries` ribbon pipeline is covered by NO
existing skill (raw three.js docs only) — it is the highest-risk slice and is therefore sequenced LAST
as a non-blocking enhancement (see ORCHESTRATOR §minimum-shippable-core). Texture mode (D6) is the
robust always-works baseline and ships first.

### 3.3 Surface B — entry & source
- Launched from a **guide layer's** Modulation section (`Inspector.jsx` ModulatorDevice, the 140×140
  field-heatmap card ~272–287). The source field is **unambiguous**: `fieldForLayer(guide)` (the layer
  being edited). Already cached (LRU) by the time the button renders.
- Relief mesh: `PlaneGeometry` at field grid resolution (field is 129×129 for res 128), capped at
  256² segments (D9). Z per vertex = `field.sampleSigned(u,v) × exaggeration` (D10).
- Colormap: diverging, attract/repel = warm/cool, matching topographic modulation semantics.

### 3.4 Surface B — drape (per-channel, advisor refinement A4)
A guide can modulate **multiple targets** (`modulator.maps[]`). Drape **all active targets** (honoring
the "first active edge wins" rule from `modulationGraph.js`), each in its layer color, with a per-target
toggle checklist in the 3D panel. Empty state if the guide has no active targets.

**The drape must reflect the actual channel, not a naïve Z-lift** (a Z-lift would misrepresent density
targets entirely):
- `channel === 'warp'` (chladni/topographic/flowfield/recursive targets): displace marks **in-plane (xy)**
  along the field gradient (`field.sampleGradient`), scaled by the map `amount` — this is what warp does.
  Marks then ride the relief surface in Z for visual seating.
- `channel === 'density'` (grainfield targets): vary **mark density / spacing** across the surface per the
  field value — denser where the field drives density up — rather than moving individual marks in Z.
- The relief itself is ALWAYS the raw field (the cause); the drape shows the per-channel effect.

This keeps the "see what the modulation does" promise honest. If a faithful per-channel drape proves too
costly for a channel within the run, fall back to "relief + marks laid on surface" for THAT channel and
say so explicitly in the run log (do not silently ship a misleading visual).

## 4. Out of scope (this build)
- Live-reactive 3D (rebuild-on-every-edit) — D14 is snapshot-based.
- GLB / model export — D8 is PNG only.
- CSG / real cut-through holes — D3 is non-destructive.
- Multi-source modulation compute (Phase 2b, PRD-only upstream).
- Mobile gets texture-only A and is otherwise best-effort, not a first-class target.

## 5. Affected / referenced code (seams)
- Canvas + render loop: `src/lib/useCanvas.js` (p5, `noLoop()`).
- Lens precedent: `src/components/canvas/ColorViewControl.jsx`, `useColorView()` in `Studio.jsx`.
- Canvas host: `src/components/RightPanel.jsx`.
- SVG (in-memory): `src/lib/svgExport.js` `buildAllLayersSVG`; per-panel `src/lib/panelExport.js`.
- Panels: `src/lib/panels.js` (`createPanel`, `effectiveVisible`, `assignLayerToPanel`).
- Operations: `src/lib/operations.js` (`resolveLayerProcess`), `src/lib/materialPreview.js` (scores).
- Field: `src/lib/fields/ScalarField.js`, `fieldRegistry.js` (`fieldForLayer`),
  `resolveModulationForTarget.js`, `modulationGraph.js`, `channelConsumers.js`.
- Modulation UI: `src/components/shell/Inspector.jsx` (ModulatorDevice ~121–406).

## 6. Test strategy (D15 detail)
- **Primary gate — vitest unit tests** on all pure logic, WebGL-free:
  panel→scene-spec mapping, SVG→ribbon-geometry builder (assert vertex/group counts on small fixtures),
  SVG→emissive-texture rasterization decision + cap logic (the 1500 threshold, mobile/DPR override),
  ScalarField→heightmap builder, material-per-kind selector, diverging colormap math, exaggeration math,
  per-channel drape transform (warp gradient displacement; density spacing), camera zoom-fit math,
  process→groove-treatment mapping, persistence read/write.
- **Scene smoke — Playwright MCP (SOFT gate, advisor A2):** launch `vite preview`, navigate, switch to 3D
  (A then B), assert canvas element present + WebGL context exists (readback) + zero console errors, save
  a screenshot artifact per sub-mode. Headless GPU is unreliable — a blank/failed canvas is recorded as an
  artifact + flagged for morning eyeball, NOT treated as an auto-fail that loops the build.

## 7. Acceptance (feature done)
- 3D lens toggle shows A for the whole design; stacked sheets with correct thickness/spacing/material/marks.
- B launches from a guide's Modulation section, shows the field relief + per-channel drape of all active
  targets with toggles; closing restores prior view.
- PNG snapshot export works for both.
- All unit gates green; build green; lint at/under baseline; three.js code-split out of the main bundle.
- Scene screenshots captured as artifacts for both sub-modes.

## 8. Advisor-flagged refinements folded in
- **A1 (dep matrix):** pinned + verified in §2; watch-item documented.
- **A2 (headless WebGL):** scene check is a soft artifact gate, not an auto-fail loop (§6, D15).
- **A3 (slice order / min shippable core):** texture-mode A ships before ribbons; ribbons last & non-blocking (§3.2, ORCHESTRATOR).
- **A4 (honest drape):** per-channel drape, not naïve Z-lift (§3.4).

## 9. User decisions still defaulted (veto window)
These were set by recommendation, not explicitly chosen — flag if any is wrong before the run:
- Ribbon cap = 1500 paths/panel; B heightmap cap = 256².
- Per-process emissive tints follow laser color convention (cut/red, score/blue, engrave/neutral).
- Per-channel drape semantics in §3.4 (this realizes D5/D10 faithfully but is an interpretation).

## 10. Pre-flight gates BEFORE launching the overnight run
1. (DONE) Dependency matrix verified against npm + React 19.2.4 — §2.
2. Confirm the Playwright MCP is reachable in the run context; if not, scene check degrades to
   "morning eyeball only" (still soft).
3. Smoke-install the four deps into the worktree and confirm `npm run build` + a trivial `<Canvas>`
   mounts WITHOUT a peer-dep break, BEFORE the autonomous slices begin (this is the step-1 single point
   of failure; do not let the orchestrator discover the matrix at 2am).
