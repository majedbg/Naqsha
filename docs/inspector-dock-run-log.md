# Inspector Dock — Orchestrator Run Log

Branch: `feat/inspector-dock` (off `main` @ `a98da9d`). One line per WI/phase.

## Preflight
- node v22.14.0 ✓
- Baseline initially RED: 14 test files failed — root cause `jszip` declared in
  package.json + lockfile but absent from node_modules (stale install). Fixed with
  `npm ci`. Re-run baseline GREEN: 203 files / 1715 tests passed, 4/46 skipped.
- Baseline `npm run build` GREEN (exit 0; only non-fatal chunk-size warnings).
- Pre-existing unrelated WIP (`LayerTree.jsx` "+ New Layer" restyle) committed to
  `main` per user choice (`a98da9d`) before branching, so feature commits stay clean.
- Planning docs committed (`1d3125f`).

## Work items

| WI | Status | Commit | Test delta | Notes |
|----|--------|--------|-----------|-------|
| WI-1 useInspectorDock | ✅ green | `dfb2735` | +18 (1715→1733) | imperative writes, no effect; portrait→bottom default; saved pref wins. Verified independently: suite+build green, no mobile touched. |
| WI-2 usePanelHeight | ✅ green | `061f77e` | +14 (1733→1747) | Y-axis twin of usePanelHeight; top-edge sign `clamp(startH-(clientY-startY))` (drag up grows); persist on mouseup+dblclick only. Verified: suite green, no mobile. |
| WI-3 InspectorShelf | pending | — | — | — |
| WI-4 AppShell restructure | pending | — | — | — |
| WI-5 header dock-toggle/chevron | pending | — | — | — |
| WI-6 menu/Studio/shortcut | pending | — | — | — |
| Phase D docs | pending | — | — | — |
