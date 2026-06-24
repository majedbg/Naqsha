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
| WI-3 InspectorShelf | ✅ green | `f5811ab` | +11 (1747→1758) | Width-driven CSS grid (`columnCount=floor(w/256)`, `repeat(n,minmax(0,1fr))`) — NOT auto-fill, so the 768px→3-col gate is a real passing jsdom test. Atomic grid items (min-w-0). NOTE: one transient flake in an unrelated suite on first verify run; not reproduced in 2 reruns; InspectorShelf tests are deterministic. Resolved real-browser column proof deferred to WI-4 (Playwright). |
| WI-4 AppShell restructure | ✅ green | `4143c2f` | +5 (1758→1763) | Right path byte-unchanged (rule 6 regression test); bottom shelf row + top-edge resize + collapse-to-36px; new null-default InspectorDockProvider wraps {children} (context flows through createPortal → zero Studio edits). DEVIATION (advisor): node-identity test dropped (infeasible; state survives via Studio useLayers); columnization split out to WI-4b. Minor: overflow-hidden clips top half of resize handle (still grabbable) — logged as polish. |
| WI-4b PatternParams columnize | ✅ green | `8c07d03` | +4 (1763→1767) | NEW WI (advisor split): PatternParams consumes dock context → wraps groups in InspectorShelf when bottom (groups byte-identically extracted to groupEls; gate/guest logic untouched). Delivers the real 2-3 columns (spec build-sketch item 5). Known pre-existing flake: AdminPage.test.jsx (`await findByText` ~1s timeout under parallel load) — passes in isolation + reruns, unrelated to feature. |
| WI-5 header dock-toggle/chevron | ✅ green | `efcb934` | +5 (1767→1772) | DockToggle inside portaled Inspector (consumes context) → visible both modes, right-dock shell byte-unchanged. Toggle names destination; chevron bottom-only (mirrors PanelHeader). Null-safe (no provider → null). Minor: in empty-state branch the header centers rather than top-right — cosmetic. |
| WI-6 menu/Studio/shortcut | ✅ green | `bacc1e7` | +10 (1772→1782) | MenuBar (portaled) consumes context → checkable "Dock Properties to Bottom" View item. Shortcut Ctrl/Cmd+Alt+P in useInspectorDock (one guarded window listener, e.code KeyP, ignores text-entry, removed on unmount). Menu+header+shortcut converge on one hook's toggleDock. ZERO Studio.jsx edits (advisor: portal-context + listener-in-hook). |
| Browser proof (§0) | ✅ MET | (live) | — | Playwright @ 768×1024 portrait, cleared storage: smart-default → **bottom**; shelf full-width 768px, height 280; `inspector-shelf-grid` resolved to **2 columns × 360.625px** (≥240 floor); 5 ParamGroups columnized; 5 range sliders render; **no horizontal overflow**; DockToggle header (chevron+glyph) present; collapse → 36px bar observed. Visual: STRUCTURE \| STROKE columns, Pad2D intact, sliders full-width. The load-bearing risk is met live, not assumed. |
| Phase D docs | ✅ done | `f9ecb09` | — | `docs/inspector-dock-FEATURE.md` written (what/why, usage, architecture + portal-context insight + ASCII of both layouts, persistence table, file map, manual QA incl. the live 768px proof, deferred list). |

## Post-build audit notes

- **Stray localStorage values during browser verify — NOT a bug.** Mid-session Playwright showed
  `ui.inspectorDockCollapsed="true"` + `ui.inspectorDockHeight="428"` (values that require a chevron
  click + a drag-end). Audited every `persist()` call site: in BOTH hooks persistence is interaction-only
  — `usePanelHeight` persists only in the `mouseup` handler + `onDoubleClick`; `useInspectorDock` only in
  `setDockPosition`/`toggleDock`/`toggleCollapsed`. The only effects are listener cleanup + the keydown
  handler; NO mount/effect/render write path exists (and WI-1/WI-2 unit-test no-write-on-mount). The values
  were a Playwright harness artifact (a stray synthesized event on the resize handle/chevron), cleared
  before the canonical proof.
- **"Byte-unchanged (rule 6)" scope:** holds at the SHELL/column level (the `w-72` right column — what the
  `AppShell.dock` regression test guards). The right-dock *inspector content* does gain `<DockToggle/>` (spec
  Q4 wants the header icon in both modes) — that is intended, not a rule-6 violation.
- **Pre-existing suite flake (not ours):** `AdminPage.test.jsx` (`await findByText` ~1s timeout under
  parallel load) flaked once during WI-3 and WI-4b verification; passes in isolation + on reruns; unrelated
  to this feature. A future CI red there is not from this branch.
