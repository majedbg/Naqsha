# 3D Preview — Overnight Run Log

**Run date:** 2026-06-27
**Branch:** `feat/3d-preview` (worktree `.claude/worktrees/3d-preview`, off `main`)
**Test baseline floor:** 1949 passed (pre-3D `main`); every slice held ≥ this and ended at **2135 passed / 0 failed / 46 skipped**.
**Lint baseline:** `30 problems (24 errors, 6 warnings)` — held exactly at baseline through every slice; zero new lint introduced.

## FINAL gate numbers (re-verified by the scribe on the final tree)

| Gate | Result |
| --- | --- |
| `npm run test` | **2135 passed / 0 failed / 46 skipped** (240 files passed, 4 skipped) |
| `npm run build` | **GREEN** — three.js code-split into `Scene3D-*.js` (1,171.42 kB / gzip 360.45 kB); main `index-*.js` = 2,249.25 kB / gzip 664.38 kB. three.js / @react-three confirmed absent from the 2D main bundle (boundary intact). |
| `npm run lint` | **30 problems (24 errors, 6 warnings)** — exactly the pre-existing baseline, zero new. |

The "chunk > 500 kB" build notice is expected and intentional: the 3D bundle is meant to be a single lazy async chunk loaded only when the 3D lens is opened.

## Per-slice results

| Slice | Status | Commit | Tests (pass/fail) | Build | Lint | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| S1 — Foundation | green | `8b4185e` | 1970 / 0 | green | 30 | Dynamic-import boundary + sub-mode state machine (`off`/`panel-stack`/`height-surface`). three.js proven code-split: 0 `WebGLRenderer`/`@react-three` refs in the main entry, all in the lazy `Scene3D-*.js` chunk. p5 is hidden (visibility), not unmounted; 2D path byte-identical when off. |
| S2 — Camera + lighting + bloom | green | `13c7b2b` | 1992 / 0 | green | 30 | Pure zoom-to-fit math (`cameraFit.js`, 22 tests) + CameraRig (damped OrbitControls, 3/4 default, reset), SceneEnvironment (studio IBL, dark bg #0b0b10), selective bloom on emissive only (SelectiveBloom over luminance Bloom for HDR+transmission robustness). |
| S3 — 3D-mode lens entry + transition | green | `944021f` | 2013 / 0 | green | 30 | Surface A added as an always-on 3D lens peer of Operation/Material. Active lens is DERIVED (not stored) so closing 3D restores prior 2D/lens state by construction. Snapshot-on-enter via pure `buildDesignSnapshot()` (deep-clone + deep-freeze); "↻ Rebuild" re-snapshots. |
| S4 — A sheets + materials | green | `0e84ace` | 2032 / 0 | green | 30 | Pure `buildSheetSpecs()` (19 tests): visible panels → ordered extruded slabs, z-stack from cumulative thickness + per-gap spacing, material-per-kind (D7: acrylic→transmissive, plywood/mdf/cardstock→opaque tinted). `Sheets.jsx` renders MeshTransmissionMaterial/meshStandardMaterial. |
| S5 — A texture-mode marks (MIN SHIPPABLE CORE) | green | `887abf9` | 2053 / 0 | green | 30 | Pure `markTexture.js` (21 tests): D6 routing contract + process→treatment tint/intensity. Per-process emissive SVG → CanvasTexture floated in front of each sheet, wrapped in `<Select>` so bloom glows ONLY marks (transparent field, D12). |
| S6 — A spacing + PNG export | green | `e6335af` | 2065 / 0 | green | 30 | Stack-spacing slider (0–60mm, default 12, `clampSpacing`) drives z-relayout. Pure `buildSnapshotFilename()` (timestamp injected). "Save image" PNG via `preserveDrawingBuffer:true` + onCreated gl ref, captures the composited bloom/transmission frame. |
| S8 — B relief from field (D5/D10) | green | `06d59bf` | 2085 / 0 | green | 30 | Pure `heightSurface.js` (17 tests): `buildHeightmap` vertex-colored relief at field res, segments capped 256² (D9), elevation = sampleSigned × exaggeration, diverging warm/cool colormap. `Relief.jsx` lit (kept OUT of bloom Select). Exaggeration slider; "Preview in 3D" button in ModulatorDevice. |
| S9 — B per-channel drape + target toggles (§3.4) | green | `dc3c786` | 2103 / 0 | green | 30 | Pure `drape.js`: `resolveActiveTargets` (modulationGraph "first edge wins"), warp = in-plane +∇f displacement clamped to ~4% of domain, density = inverse-CDF tick spacing with constant stud height (Y always raw field). `DrapedMarks.jsx` emissive LineSegments per target + per-target on/off toggles + empty-state. |
| S10 — A ribbon geometry under cap (D6) | green | `32a1bc6` | 2119 / 0 | green | 30 | Sparse panels (≤1500 paths, DPR≥1.5, non-mobile) render true vector ribbon geometry (`SVGLoader.parse → pointsToStroke → mergeGeometries`); texture (S5) is the routed fallback + per-process no-geometry fallback. SVG→world transform baked (unit-tested handedness/center). ExtrudeGeometry intentionally unused (flat ribbons; depth imperceptible under bloom). |
| S11 — Persistence (D13) + self-review | green | `8965bb5` | 2135 / 0 | green | 30 | Pure `preview3dPersistence.js` (14 tests, key `sonoform-3d-preview`): validates/clamps spacing [0,60], rejects bad sub-mode/exaggeration, swallows malformed JSON. Cross-mode persist clobber fixed (each effect gated to its owning sub-mode). Added Surface-A empty-state hint. Camera NOT persisted (always zoom-fits, D14). |

## Scene smoke (S7 — SOFT gate, Playwright MCP)

### S7a — Surface A (panel-stack) — **PASS**
- Commit: `9d59693`. Screenshot: `docs/3d-shots/A-panel-stack.png` (1448x683, ~294KB).
- Entered the 3D `panel-stack` lens via the "3D" radio in `[data-testid=color-view-control]` on `npm run preview` (http://localhost:4173/).
- WebGL confirmed: live `webgl2` context (1702x1366 drawing buffer). Non-blank readback — luminance range 159, 133 distinct color buckets, nonZeroFrac 1.0.
- Eyeball: 3/4-framed translucent acrylic slab with red emissive cut-marks (flowfield/spirograph) glowing under selective bloom on a dark studio bg; 12mm Spacing slider (D11) bottom-left. Matches the spec look.
- **Console:** 0 errors. ~199 warnings, all the identical three.js message **"Layer out of range, resetting to 2"** from the code-split `Scene3D-*.js` chunk, firing per render frame (count grows unbounded). Warning only — does not trip the 0-error gate; bloom remains selective. Likely the S2 selective-bloom layer setup.

### S7b — Surface B (height-surface relief + drape) — **PASS**
- Commit: `bc8a284`. Screenshot: `docs/3d-shots/B-height-surface.png`.
- Entered via the real UI path: set the selected layer's pattern to Chladni (a field-producing guide), added Flow Field as a warp modulation target, clicked "Preview in 3D" (`data-testid=modulator-preview-3d`) in the Inspector MODULATOR section.
- WebGL confirmed: WebGL2 acquired via readback, `contextLost=false`, renderer "ANGLE (Apple, ANGLE Metal Renderer: Apple M3)", "WebGL 2.0 (OpenGL ES 3.0 Chromium)". "Building preview…" cleared; scene fully built. NOT blank.
- Eyeball: Chladni field relief with diverging warm/cool colormap (pink peaks / cyan valleys, D10), Flow Field warp target draped as crisp red LineSegments riding the relief (§3.4 per-channel drape); Reset view / Save image buttons + MODULATOR inspector present.
- **Console:** 0 errors. 184 warnings, all identical: **"Layer out of range, resetting to 0"** from the `Scene3D-*.js` chunk (the selective-bloom layer assignment in Surface B), ~once per frame. Non-fatal — scene renders fine.

## Overall state

**Complete and viewable.** The 3D preview ships end-to-end on `feat/3d-preview`. Surface A (stacked acrylic panel preview: transmissive/opaque sheets per substrate, emissive process-tinted marks under selective bloom, spacing slider, PNG export, and vector ribbon geometry for sparse panels) and Surface B (field relief with diverging colormap, exaggeration slider, and honest per-channel warp/density drape with per-target toggles) both build, both render in a real browser with a live WebGL2 context, and both passed the scene-smoke soft gate with non-blank readback and 0 console errors. The dynamic-import boundary holds: three.js / @react-three live only in the lazy `Scene3D-*.js` async chunk and are absent from the 2D main bundle, so the 2D path is unchanged (placement regression green). All 11 build slices plus both scene smokes are green; the final tree is **2135 passed / 0 failed, build GREEN, lint 30 (= baseline)**.

**Partial / disclosed-by-design (not blocked).**
1. **Surface B drape is a disclosed approximation (§3.4):** the drape renders a representative deterministic lattice (warp = deformed grid, density = spacing ticks/studs) that shows each channel's EFFECT FIELD, not the target pattern's literal mark geometry. This is defensible and disclosed, not silent.
2. **S10 ribbon = vector crispness, not depth:** ExtrudeGeometry is intentionally unused; ribbons are flat (z-depth imperceptible under bloom). The win over texture mode is crispness only — relevant to the merge decision.
3. **S5 engrave tint is neutral near-white (#f0f0f0), not "engrave≈black"** as PRD §9 reads — pure black cannot glow as an emissive. Intentional deviation, flagged for the §9 veto window.
4. **Persistence nuances (D13):** exaggeration is persisted as an absolute mm value (not bounds-relative), so reopening B on a differently-sized design may read near-flat/over-spiky until nudged. Sub-mode is recorded-only (never auto-restored, per D14). Both faithful to the locked spec.

**Residual risks for the morning.**
- **Console warning ("Layer out of range, resetting to N"):** fires ~once per frame on BOTH surfaces (A: "…to 2"; B: "…to 0"), count grows unbounded. It's a warning, not an error — the scene renders correctly and bloom stays selective — but it points at the selective-bloom layer-index config (S2) and is worth a fix before merge to stop the log spam.
- **Drape magnitude constants (S9) untuned against real raw-gradient ranges** — on high-frequency chladni the warp may saturate at the clamp; direction still varies per node (reads correctly) but legibility-vs-flat is unverified without a live eyeball. Tune `WARP_GAIN`/`WARP_MAX_FRAC`/density spacing if needed.
- **GPU-render correctness items that jsdom cannot self-verify** (covered by the screenshots, worth a human eyeball): bloom confined to grooves and acrylic body NOT blooming (D12 trap); marks not mirrored / text not backwards; exported PNG non-black and actually showing bloom/transmission.

## AM checklist (human)

- [ ] Open 3D lens → eyeball stacked acrylic look (transmission, grooves, bloom, spacing).
- [ ] Open a guide layer's Modulation → "Preview in 3D" → relief + drape reads correctly; toggle targets on/off.
- [ ] PNG snapshot looks right for both surfaces (non-black, shows bloom/transmission).
- [ ] Review S10 ribbon outcome (shipped: vector crispness only, no baked depth — texture mode is the routed fallback).
- [ ] Confirm veto-window defaults (PRD §9): path cap = 1500; emissive process tints (note: engrave is neutral near-white #f0f0f0, NOT black, by necessity — pure black can't glow); per-channel drape semantics (disclosed lattice/tick approximation, §3.4).
- [ ] Investigate the per-frame **"Layer out of range, resetting to N"** console warning (A→2, B→0) — selective-bloom layer-index config from S2; warning only, but it spams the log every frame. Fix before merge if cheap.
- [ ] Confirm D12 by eye: bloom is confined to grooves/marks and the acrylic body + background do NOT bloom.
- [ ] Confirm marks are not mirrored and text is not backwards (CanvasTexture flipY default).
- [ ] Eyeball/tune Surface B warp & density magnitude on a real chladni/topographic field (S9 constants untuned vs raw-gradient ranges).
- [ ] Decide on D13 exaggeration persistence: keep as absolute mm (current) vs persist per-design vs persist as a fraction of bounds (reopening B on a differently-sized design can read near-flat/over-spiky).
- [ ] **`main` has ADVANCED since this branch's base (`feat/cloud-save-ux` merged + pushed to origin 2026-06-27) — rebase/merge `feat/3d-preview` with care, watching `Studio.jsx` / `RightPanel.jsx` for conflicts before merging.**
- [ ] If approved: merge `feat/3d-preview` → main yourself, then push (no merge/push was done by the overnight run, per D16).
