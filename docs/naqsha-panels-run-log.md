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
| WI-2 | Cloud config blob: persist + load panels | ✅ green | (this commit) | +5 (1646→1651) | hook gains `panels`+`setPanels` props; load normalizes (also fixes WI-1 loadLayerSet seam for cloud). No new table/RLS. |
| WI-3 | Per-panel + combined SVG export, ZIP, timestamped | pending | — | — | depends WI-1; +JSZip |
| WI-4 | effectiveVisible wiring into canvas + export | pending | — | — | depends WI-1 |
| WI-5 | LayerTree grouped tier (UI) | pending | — | — | depends WI-1 |
| WI-6 | Mode-gate + Studio wiring | pending | — | — | depends WI-1, WI-5 (solo) |
