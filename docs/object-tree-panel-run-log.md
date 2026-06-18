# Object Tree Panel — Run Log

Integration branch: `feat/object-tree-panel`
Base: `89f6531` (off `layout-rework`, per runbook "off current HEAD"; conflates with redesign work — conscious call, noted for review).
Baseline before WI-1: `npm test` green — 922 passed, 4 skipped (926).

| WI | Status | Commit | Test delta | Notes |
|----|--------|--------|-----------|-------|
| docs | committed | ae712e5 | — | spec + orchestrator runbook |
| WI-1 | committed | 6d23d96 | +21 (922→943) | autoLayerName module; migration in migrateLayer funnel; all 3 literal sites; no mobile files |
| WI-2 | committed | 062337d | +8 (943→951) | danger prop → existing bg-tone-strong token; saffron default; Esc/Enter/focus parity |
| WI-3 | committed | cd25f84 | +18 (951→969) | usePanelWidth hook; w-56→state-driven; persist on drag-end; dbl-click reset; no mobile |
| WI-4 | committed | 0b27b58 | +16 (969→985) | RowMenu inline popper; OperationPicker convention; kbd+click-away+flip; tone-strong Delete |
| WI-5 | committed | 02caad8 | +11 net (985→996) | row rework; rename; dice+confirm; op-swatch initial+title; RowMenu+ConfirmDialog wired. Ports: chip text→title (LayerTree + StudioRoute.operationPicker test); rand-seed test deleted (§3.1). |

### WI-5 notes / open seams
- **Responsive dice-hide (§3.2):** implemented as a `compact` prop (default false), tested at unit level. No Tailwind container-query plugin is installed, so the spec-preferred `@container` approach was out of scope. **The `compact` prop is currently UNTHREADED** — nothing passes it, so the dice does not actually hide between the 200px min and 240px breakpoint in the live app. Wiring requires either the container-query plugin (dependency/config change) or lifting panel width to Studio. Left as a documented follow-up (low risk; 40px band).
- **Prop-contract delta for WI-6:** `onRandomizeLayer` (rand-seed) removed from LayerTree's signature; Studio still passes it (harmless/unused — WI-6 should drop that line). `compact` added (optional). All other handlers unchanged.
- **Cross-file test touch:** `src/pages/StudioRoute.operationPicker.test.jsx` assertions re-expressed (chip identity via `title`, not inline text) — necessary to keep the suite green; Studio.jsx component untouched.

| WI | Status | Commit | Test delta | Notes |
|----|--------|--------|-----------|-------|
| WI-6 | committed | b900830 | +8 (996→1004) | lock-aware randomize (all 4 fns skip locked) in useLayers; Studio drops dead onRandomizeLayer prop+destructure; rename round-trip already wired (route test). No existing tests touched. |

## Summary
WI-1…WI-6 all committed on `feat/object-tree-panel`, suite green throughout (922 → **1004 passed | 4 skipped**), build green, lint 0 errors. WI-7 = HITL GitHub issue (see §7 of the runbook) — NOT auto-run; surfaced to the user to file. Branch left **unmerged** for review.

Open follow-up: the §3.2 responsive dice-hide (`compact` prop) is unthreaded — see WI-5 notes above.
