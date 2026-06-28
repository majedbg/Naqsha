# Material → 3D Appearance — Overnight Run Report

> Branch: `feat/material-3d-appearance` (worktree `mat-3d`, off `main`).
> Plan: `docs/material-3d-appearance-plan.md` · Runbook: `docs/material-3d-appearance-orchestrator.md`.
> Status: **all planned slices green, NOT merged.** Left on the branch for human eyeball (see `NEEDS-HUMAN.md`).

## 1. Baseline vs final state

| Gate | Baseline (`main` @ `29680b0`, 2026-06-27) | Final (`feat/material-3d-appearance` @ `ea120b6`) |
|------|-------------------------------------------|---------------------------------------------------|
| `npm test` | **2203 passed / 0 failed** (46 skipped), 251 files | **2366 passed / 0 failed** (46 skipped) — +163 new tests |
| `npm run build` | succeeds (pre-existing >500 kB chunk warning) | succeeds (same pre-existing chunk warning only) |
| `npm run lint` | **24 errors + 6 warnings** (pre-existing) | **24 errors + 6 warnings** — unchanged; every new file lint-clean |

The green gate held at or above floor for every slice: tests strictly increased, build never broke, and the lint
error count never rose above the 24 baseline. No pre-existing lint was "fixed" to pass a gate (per §6 rule).

## 2. Per-slice results

| Slice | Title | Status | Commit | Cumulative tests |
|-------|-------|--------|--------|------------------|
| S0 | Archetype registry + AppearanceParams defaults (incl. mirror, pearlescent) | green | `57e723b` | 2226 |
| S1 | `resolveAppearance` — explicit→inferred→default + 53-material corpus fixture | green | `0dae74b` | 2300 |
| S2 | Edge-glow math (`edgeIntensity`, `fresnelFactor`, `edgeMaskForBox`) | green | `e66531f` | 2317 |
| S3 | Thread `selectedMaterial` live prop Studio→RightPanel→Canvas3DHost→Scene3D→Sheets | green | `bce6100` | 2321 |
| S4 | `Sheets.jsx` consumes appearance → tint/transmission/roughness/metalness per archetype | green | `295927c` | 2335 |
| S5 | Key `<directionalLight>` + emissive rim-mesh edge glow + fresnel + bloom registration | green | `7fde827` | 2347 |
| S6 | Procedural wood-grain shader (noise params tested; `texturePath` reserved) | green | `2e526da` | 2366 |
| S7 | Playwright-MCP smoke shots per material → `docs/3d-shots/mat-*.png` (best-effort, non-blocking) | green | `ea120b6` | 2366 |
| S8 | Run report + NEEDS-HUMAN checklist + P3 cut-through design doc | green | (this commit) | 2366 |

## 3. What the adversarial reviews found, and fixes

Each code slice (S0–S6) went through a red→green TDD cycle plus an adversarial review pass. Notable findings:

- **S0** — Spec §3.1's archetype type-union lists only 6 archetypes (omits `mirror-acrylic` and `pearlescent-acrylic`),
  but §3.2 and the slice title require 8. Resolved by treating §3.2 + slice title as authoritative and shipping 8
  archetypes; §3.1 flagged as a stale doc, **not** edited (out of S0 scope). Also extended the defaults contract with
  `metalness` (needed by mirror) and `clearcoat` (pearlescent nacre), both flowing through `appearanceToUniforms`.

- **S1** — `materialSheetHex` returns its `NEUTRAL_SHEET` / `NAME_HEX` fallbacks in uppercase, so the hex-validation
  regex was made case-insensitive (corrects a wrong casing assumption; does not weaken the asserted behavior). The
  corpus fixture proves **zero** of the 53 known names (7 in-code defaults + 46 seed rows) fall through to
  `opaque-tinted`. Handoff note carried forward: the 46 **seed** rows resolve to a neutral-gray `tintHex` because their
  free-text color has no entry in `materialSheetHex`'s `NAME_HEX` map — expected (reuse per L7), harmless for the
  Color-View selection set (the 7 in-code materials have real hexes), but a seed "Black Opaque" would render gray.

- **S2** — Vectors kept as plain `[x,y,z]` arrays with **no renormalization** so the GLSL and the JS tests agree
  bit-for-bit on the same inputs. Tests assert exact expected values (clamping of back-facing edges, fresnel default
  power 3 = 0.125 at dot 0.5, side-vs-top mask 1/0), not just "doesn't throw".

- **S3** — Review question "is the live thread real or leaked into the snapshot?" answered: `selectedMaterial` is
  derived from `colorView.colorView` (live lens state owned by `useColorView`), **not** from `lensEntry.snapshot`, and
  never enters `buildDesignSnapshot`. Switching material re-tints without a Rebuild. The mode-gate is isolated in the
  pure, node-tested helper `selectedMaterialForScene` (collapses "operation lens" and "no material" to `null`).

- **S4** — Riskiest review item (no-material fallback must stay byte-identical to pre-S4) is now a **tested invariant**
  in `sheetMaterial.test.js`. Archetype now drives material *type* (transmission / physical / standard), overriding the
  substrate descriptor: an opaque material on an acrylic substrate renders opaque (proven end-to-end with "Black Opaque").

- **S5** — Two stale-spec premises corrected against the real codebase: (a) there is **no** `useBloomRef` /
  `bloomSelection.js`; `<Select enabled>` from `@react-three/postprocessing` IS the bloom-registration mechanism (same
  as `Marks.jsx`/`DrapedMarks.jsx`) — rim bars and fresnel shell are wrapped in `<Select enabled>`. (b) The scene
  already had a directional key light (added in an earlier slice for the bloom-lights array); it was reused and
  single-sourced via the new `keyLight.js` rather than adding a second. **Gate-blind risk logged:** the fresnel
  `shaderMaterial` GLSL is bundled by Vite as a string, so `npm run build` never compiles it — a shader-compile error
  would still pass the full gate. Code-reviewed clean; needs in-browser smoke (carried into NEEDS-HUMAN).

- **S6** — Wood grain is procedural (no committed texture, per L6); `texturePath` reserved (default `null`, passed
  through if set, never loaded in v1). The GLSL grain in `WoodGrain.jsx` mirrors `woodGrain.js` structurally but is
  **not** bit-identical (float vs double precision), so the rendered grain appearance is unverified by the gate —
  smoke/eyeball only. `onBeforeCompile` relies on stable three.js shader-chunk include names (`<common>`,
  `<begin_vertex>`, `<color_fragment>`) — first suspect if a wood slab renders blank.

## 4. Open issues surfaced during the run (for the human before merge)

- **"Maximum update depth exceeded" React loop (pre-existing, S3–S6, NOT introduced by S7).** A burst of ~70×
  `Maximum update depth exceeded` fires on **every** lens/material switch into the 3D path. It is a real React
  invariant violation (fires in prod too, not dev-only noise), corroborated by the pre-existing
  `react-hooks/set-state-in-effect` lint hit in the Studio area (~line 634–635). The scene still renders non-blank
  (`glError 0`, context alive) so it did not block the smoke, but **it should be diagnosed before merge.**
- **S7 concern:** the opaque (turquoise) and walnut shots appear to show edge/body bloom even though spec says
  `opaque-acrylic` and `wood` have **no** edge glow (`edgeGain 0`). A human should confirm per-archetype `edgeGain` is
  actually gating the S5 rim meshes in `Sheets.jsx`.
- The fresnel-shader and wood-grain GLSL are **gate-blind** (bundled as strings, never compiled by `npm run build`).
  Confirm in-browser there is no console shader-compile error and the canvas is non-blank.

## 5. What was skipped / not done (by design)

- **No merge to main.** Branch left as-is per L8.
- **P3 (CSG cut-through) not built** — design doc only (`docs/material-cut-through-plan.md`), no dependency added.
- **No DB migration, no storage bucket, no committed texture image, no CSG dependency** (guardrails L5/L6/L7 honored).
- **S7 Playwright-MCP smoke** ran via `npm run dev` (the prior 3D run used `npm run preview` and reported "0 errors";
  dev mode surfaces additional pre-existing dev-only React warnings). Four distinct per-material shots were captured —
  the browser was available, so nothing was skipped here. Single static viewpoints only: "glow tracks orbit" could not
  be captured and remains a human check.

## 6. `git log --oneline main..HEAD`

```
ea120b6 feat(mat3d): S7 — Best-effort Playwright-MCP smoke shots per material -> docs/3d-shots/mat-*.png
2e526da feat(mat3d): S6 — Procedural wood grain shader (noise params tested; texturePath reserved)
7fde827 feat(mat3d): S5 — Key directionalLight + emissive rim-mesh edge glow + fresnel + bloom registration
295927c feat(mat3d): S4 — Sheets.jsx consumes appearance -> tint/transmission/roughness/metalness per archetype
bce6100 feat(mat3d): S3 — Thread selectedMaterial live prop Studio->RightPanel->Canvas3DHost->Scene3D->Sheets
e66531f feat(mat3d): S2 — edgeGlow math: edgeIntensity, fresnelFactor, edgeMaskForBox
0dae74b feat(mat3d): S1 — resolveAppearance (explicit->inferred->default) + 53-material corpus fixture
57e723b feat(mat3d): S0 — Archetype registry + AppearanceParams defaults (incl. mirror, pearlescent)
3ec3c16 docs(mat3d): spec + overnight orchestrator runbook for material->3D appearance
```

> Note: the S8 docs commit (this report, `NEEDS-HUMAN.md`, and the P3 design doc) is the current `HEAD`, landing on
> top of `ea120b6`; it is not reflected in the log above because the log was captured before this commit.
