# Wrap-up sprint — 2026-07-07 ORCHESTRATOR

> **RESUME RULE:** A fresh session reads this file first, trusts the statuses, skips `done`
> work items, and continues from the first non-`done` WI. Update BEFORE and AFTER each dispatch.

Closing three genuinely-forgotten loose ends before starting a new feature. TDD per WI.
Source: `TODO_June29.md` (A1, A2) + `NEEDS-HUMAN.md` §"pre-existing plotter-extractor gap" (Plotter).
Selection rationale in session; A3 (unit-tag drip) deliberately deferred (soft, declarative, not forgotten).

## Waves (LayerTree.jsx is the only shared surface → serialize around it)

- **Wave 1 (parallel, disjoint files):** WI-P (plotter) ‖ WI-A1 (modulation compute, NO LayerTree)
- **Wave 2 (after Wave 1 green):** WI-A2 (owns LayerTree.jsx exclusively, incl. the label flip)

## Work items

| WI | Description | TDD mode | File locks | Status |
|----|-------------|----------|-----------|--------|
| WI-P | `extractRenderedPaths` emit `<line>` + `<polyline>` (not just `<path>`) so Grid + TopographicContours reach the plotter | CHARACTERIZATION-first, then RED→GREEN | `src/lib/plotter/pipeline.js` (+ test) | **done** ✅ integrated to main |
| WI-A1 | Multi-source modulation stacking (PRD §5): resolver returns array; consumers compose per-channel (warp=vector-sum, density=multiplicative-clamp) | RED→GREEN | `src/lib/fields/resolveModulationForTarget.js`, `modulationGraph.js`, consumers (`TopographicContours`, `FlowField`, …) + tests. **EXCLUDE** `LayerTree.jsx` | **done** ✅ integrated to main |
| WI-A2 | Wire two tested-but-orphaned behaviors: responsive dice-hide (`compact`, 200–240px band) + RowMenu upward-flip (`anchorNearBottom`). Producers are NEW (ResizeObserver). Also flip the `sources · 1 active` label (line ~344) to reflect A1's all-active semantics | RED→GREEN (new producers) | `src/components/shell/LayerTree.jsx`, `RowMenu.jsx` (+ tests) | **done** ✅ on main (survived a mid-stream failure + resume) |

## Guardrails (all WIs)
- Full `npm test` + `npm run lint` after each subagent integrates.
- **Do NOT commit** — user confirms before commit (prior refactor was committed only on confirm).
- Green tests do NOT verify these — plotter output moves, panel behaviors + label are runtime/visual.
  Plan a `npm run dev` human eyeball before "done" (repo's NEEDS-HUMAN discipline).
- WI-P scope: `<line>`/`<polyline>` ONLY this pass; note `<rect>`/`<ellipse>` as follow-up.
  Warped grid already emits `<path>` — fixtures must distinguish warped vs unwarped grid.

## Run log
- **2026-07-07 (start):** Orchestrator doc created. Targets re-verified post-refactor:
  plotter `pipeline.js:179` handles `path` only; `resolveModulationForTarget.js:25-65` first-match;
  `LayerTree.jsx:344` label hardcodes "1 active"; `compact`/`anchorNearBottom` exist, no producer.
  Dispatching Wave 1.
- **2026-07-07 (WI-P done, integrated):** Subagent added `<line>`/`<polyline>` handling to the
  DOMParser `walk` branch of `extractRenderedPaths` (2-pt polyline for `<line>`; points list for
  `<polyline>`; `<rect>`/`<ellipse>` left as noted follow-up). 6 new jsdom tests
  (`extractRenderedPaths.polylines.test.js`), incl. `<path>` safety-rail + warped-vs-unwarped-grid
  distinction + end-to-end `buildPlottableLayers` (0→2 paths). Characterization confirmed RED before
  fix. **No snapshots moved** (no snapshot test runs a real Grid/Contours pattern through extraction).
  Integrated to main via patch; `npx vitest run src/lib/plotter` = 105 green. Lint: changed files
  clean; 27 pre-existing errors in untouched files = known baseline. Worktree removed. NOT committed.
  Process note: agent co-wrote the 4 new-behavior tests then implemented both branches in one edit
  (not strict per-element vertical slices) — disclosed, characterization discipline preserved.
- **2026-07-07 (WI-A1 done, integrated):** Added plural `resolveModulationsForTarget` (returns array);
  kept singular as back-compat wrapper (`plural[0] ?? null`) → Inspector/drape/existing suites
  untouched. Injection builds a COMPOSITE modulation param (first source's object + `sources[]`) so
  `.channel`/`.field` readers (semanticAnchors/gridAnchors refusing warped grids) are unchanged.
  Compose: warp=`stackWarpDisplacement` (vector-sum), density=`stackDensityWeight`
  (`Πᵢ max(0,1+transferᵢ)`, clamp≥0). Consumers updated: TopographicContours/FlowField/Chladni/
  RecursiveGeometry/Grid (warp), GrainField (density); Spiral(distort)/ExtractedPatternGenerator
  (lattice)=first-source (no PRD rule). `modulationGraph.active` DELIBERATELY unchanged (consumed by
  wave-2 LayerTree + drape.js + ModulationRail). N=1 pinned bit-identical first. Integrated to main;
  **FULL combined suite (WI-P+WI-A1): 3653 passed / 0 fail.** Worktree removed. NOT committed.
  **Follow-ups flagged (NOT fixed):**
  - (F1) **2D/3D divergence** — `three3d/drape.js:68` still gates on `active`, so a target modulated
    by A+B shows both in 2D but only A in the 3D Surface-B drape. Legit deferral (3D out of scope);
    fix = drape stacks via `resolveModulationsForTarget`.
  - (F2) **`sources · 1 active` label now stale for 2D** — 2D compute stacks ALL sources; label at
    `LayerTree.jsx:344` still says "1 active". WI-A2 flips it (note the 3D-still-first-source caveat).
  - (F3) distort/lattice multi-source undefined by PRD (first-source shipped); single guide→same
    target on two channels contributes one source (preserved prior `maps.find` semantics).
- **2026-07-07 (WI-A2 — first run FAILED mid-stream, RESUMED, done):** First dispatch died on an API
  stall during Slice-2 GREEN (had `shouldCompact` green + test file written). No work lost — it ran on
  main directly. Resumed the same agent via SendMessage from the verified on-disk state; it completed
  all 3 items. Pure helpers `shouldCompact(width)` (band `[200,240)`, 240 exclusive per plan §3.2) +
  `shouldFlipMenu(rowBottom, panelBottom, menuHeight)` (guard `panelBottom>0` so jsdom 0-rects don't
  spuriously flip). Wired via ResizeObserver (compact, mirrors InspectorShelf seam;
  `effectiveCompact = compact || measuredCompact` preserves the prop override) + getBoundingClientRect
  on menu-open (menu-height est 160px, over-estimate = safe direction). `RowMenu.jsx` needed NO change
  (it already consumed `anchorNearBottom`; gap was purely the missing producer). Label → `N sources ·
  N active`, title scoped to 2D canvas + notes 3D drape still first-source (F1 kept honest). 9 new
  tests. **FINAL FULL SUITE (all 3 WIs): 3662 passed / 0 fail.** Changed-files lint-clean (LayerTree
  keeps its 2 pre-existing `refs-during-render` baseline errors; 2 co-located-helper-export
  `react-refresh` disables match repo precedent). NOT committed.
- **2026-07-07 (orchestrator cleanup):** Fixed the now-stale `modulationGraph.js:16` doc comment
  (referenced the old "1 active" label as a pending wave-2 item — now shipped). Full suite re-run:
  **3662 passed / 0 fail.**

## SPRINT COMPLETE — all 3 WIs done, on main, UNCOMMITTED (awaiting user)

### Human-verification gate (green tests can't see these — `npm run dev`)
1. **Plotter:** add a **Grid** layer (unwarped) + a **TopographicContours** layer → open plot preview/export → both now show geometry (were silently blank before). Confirm a *warped* grid is unchanged.
2. **Multi-source modulation:** point TWO guides at one target (e.g. two warp guides) → 2D canvas shows BOTH stacked (vector-sum), not just the first. Density: two guides multiply. **Known:** the 3D Surface-B drape still shows only the first source (F1, deferred).
3. **Panel dice-hide:** drag the LayerTree panel narrower into 200–239px → 🎲 dice disappears; ≥240px → returns.
4. **RowMenu flip:** open a row menu on a row near the panel's bottom → menu opens UPWARD (no clip).
5. **Label:** a target with N guides reads "N sources · N active" (hover title mentions 2D canvas + 3D caveat).

### Remaining follow-ups (recorded, NOT done this sprint)
- F1: make `three3d/drape.js` stack via `resolveModulationsForTarget` (2D/3D parity).
- WI-P: `<rect>`/`<ellipse>` plotter extraction (this pass did `<line>`/`<polyline>` only).
- A3 (unit-tag drip) still deferred; E (stale-comment hygiene) — 2 from June-29 audit still open elsewhere.
