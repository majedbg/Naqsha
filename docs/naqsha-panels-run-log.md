# Naqsha Panels v1 — Run Log

Integration branch: `feat/naqsha-panels` (off `da8a4b0`).
TDD orchestration per `docs/naqsha-panels-ORCHESTRATOR.md` against locked spec `docs/naqsha-panels-plan.md`.

## Preflight (§2)
- Node v22.14.0 ✓ · npm 11.1.0
- `npm ci` clean
- Baseline `npm test`: **GREEN** — 1611 passed, 46 skipped (190 files passed, 4 skipped)
- Integration branch `feat/naqsha-panels` created off HEAD `da8a4b0`.

### Deviation: Phase-1 sequential, not parallel worktrees
The runbook (§3) prescribes WI-2…WI-5 as parallel `isolation:'worktree'` subagents merged
back sequentially. A fresh git worktree branches from `origin/main` (at `ef428c8`, **behind**
local HEAD — so it would **lack WI-1's `src/lib/panels.js`** that all four import) *and* has no
`node_modules` (gitignored → never populated by `git worktree add`), forcing a slow `npm ci`
per worktree. Parallel-then-merge and sequential-direct yield the **identical end state**
(every WI cumulative on `feat/naqsha-panels`, suite green after each, one commit per WI); no
§1 hard rule mentions concurrency. **Decision:** run each WI as its own TDD subagent
**sequentially in this worktree** — still one subagent per WI, red→green→refactor, orchestrator
verifies + commits between each. Files-disjoint claim still enforced (no subagent edits another's
files). Watch the WI-3/WI-4 `svgExport.js` boundary: WI-4 lands first so WI-3 builds on it.

## Work items

| WI | Title | Status | Commit | Test delta | Notes |
|----|-------|--------|--------|-----------|-------|
| WI-1 | Panel model + helpers + persistence + migration | ✅ green | `da21cba` | +35 (1611→1646) | foundation. Seam: `loadLayerSet` not panel-normalized → handle on cloud/example load (WI-2/WI-6). |
| WI-2 | Cloud config blob: persist + load panels | ✅ green | `f4f75fa` | +5 (1646→1651) | hook gains `panels`+`setPanels` props; load normalizes (also fixes WI-1 loadLayerSet seam for cloud). No new table/RLS. |
| WI-3 | Per-panel + combined SVG export, ZIP, timestamped | ✅ green | `090212e` | +10 (1663→1673) | new panelExport.js: pure `buildPanelExportFiles` + `exportPanelsZip` + `formatTimestamp`; reuses buildAllLayersSVG + effectiveVisibleLayers. +jszip ^3.10.1 (lockfile committed). |
| WI-4 | effectiveVisible wiring into canvas + export | ✅ green | `5141123` | +12 (1651→1663) | useCanvas `panels` param wires effectiveVisible at 4 filter points; new shared `effectiveVisibleLayers` in panels.js. svgExport/buildAllLayersSVG untouched (WI-3-safe). |
| WI-5 | LayerTree grouped tier (UI) | ✅ green | `06bb857` | +13 (1673→1686) | new PanelHeader.jsx; grouped tier gated on panels?.length (flat path preserved); HTML5 drag-assign; ConfirmDialog gains optional `children` (additive). Substrate editor inline. |
| WI-6 | Mode-gate + Studio wiring | ✅ green | `9d150be` | +8 (1686→1694) | Studio wires panels/setPanels; persistence UNGATED, canvas/tree/export laser-gated; dormancy by construction (handleProfileChange never touches panelId); dragCutter tested. RightPanel forwards panels (default []). KNOWN GAP below. |

## §8 Done criteria — met
- WI-1…WI-6 each committed on `feat/naqsha-panels`, one commit per WI, suite green after every WI (baseline 1611 → **1694 passed | 46 skipped**, +83 tests). `npm run build` green throughout.
- No WI blocked; 2-attempt cap never hit. No mobile file touched in any WI.
- Branch left **unmerged** on `feat/naqsha-panels` for review (not merged to `main`).

## §9 Acceptance (v1) — verification
- **Laser create/name/substrate/drag/hide/export** — WI-5 (tier, rename, substrate editor, drag-assign, visibility) + WI-3 (per-panel + combined ZIP) + WI-4 (hidden panel ⇒ excluded from canvas + export). ✓
- **Plotter/dragCutter zero visible change** — WI-6 route tests assert neither the panel tier nor the per-panel export render off-laser; flat export path untouched. ✓
- **Legacy design ⇒ single auto-seeded "Panel 1" holding all layers** — proven by composition: WI-1 `useLayers.panels` test (absent `sonoform-panels` ⇒ mount seeds Panel 1 + sets every layer's `panelId`) + WI-6 laser gating renders that header with its layers. ✓
- **Signed-in cloud save/load round-trips `panels`, no new table** — WI-2 (config whitelist both seams; legacy seeds Panel 1; owner-only RLS unchanged). ✓
- **`npm test` + `npm run build` green; mobile untouched** — verified independently after every WI. ✓

## Deviations & known gaps (for review)
- **Sequential integration, not parallel worktrees** (see decision note above): identical end state; chosen because fresh worktrees lack WI-1 + `node_modules`.
- **`ConfirmDialog` gained an optional `children` slot** (WI-5, additive) to host the "delete layers too?" checkbox — every existing caller byte-identical (full suite green).
- **KNOWN GAP — new-layer-joins-panel (§6) deferred.** A layer added *while in laser mode* gets `panelId: null` (createLayer default) and won't appear under any panel header until a reload/normalize reassigns it. Spec §6 says new layers should join the *selected/expanded* panel. Deliberately not auto-normalized in WI-6 (a first-panel hammer would be spec-divergent; a selected-panel implementation needs its own TDD slice). **Recommend a follow-up slice** before laser ships to users.

## Out of scope (§7) — NOT implemented (file as issues only if requested)
- v2 R3F 3D stacked-acrylic viewer + inter-panel spacing slider.
- `materials`/`org_materials` catalog bridge (org-scoped; v1 is inline substrate).
