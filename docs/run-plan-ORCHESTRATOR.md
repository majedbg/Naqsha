# Run Plan — Orchestrator Prompt

> **STATUS: EXECUTED 2026-07-08 → branch `feat/run-plan`** (10 lane commits, 43 files,
> +5,022 lines, 4,102 tests green, E2E spine verified). **Do not re-run.**
> Remaining pre-merge work (gap-closing pass, run on Fable 5, 2026-07-09): file-crop
> three-way agreement in svgExport; overlap basis excludes Reorder + surfaces
> truncation; locate highlight ring; optimizeDeltas readout; Pen Swap markers.
>
> **Generated:** 2026-07-08 12:03 EDT
> **Spec:** PRD [#73](https://github.com/majedbg/Naqsha/issues/73) · `CONTEXT.md` · `docs/adr/0001` · `docs/adr/0002`
> **Usage (historical):** paste everything below the divider into a fresh session as the opening prompt.
> **Pre-condition (already satisfied as of generation time):** `main` == `origin/main` at `5815fe8`, working tree clean.

---

You are the ORCHESTRATOR for implementing the Run Plan feature in Naqsha. You and every subagent you spawn run on Opus. Work autonomously; only stop for the pre-flight check below or a genuine spec contradiction.

## Pre-flight (do this before anything)
1. `git status` — if the working tree is dirty, STOP and ask me (there may be in-flight svg-motif work; do not mix it in).
2. Create branch `feat/run-plan` off main.
3. Read, in order: `gh issue view 73` (the PRD — canonical scope), `CONTEXT.md` (canonical vocabulary — use it in code comments, UI copy, and test names), `docs/adr/0001-two-path-export-with-receipt.md`, `docs/adr/0002-run-plan-destination-and-boundary.md` (binding decisions — do not relitigate), and skim `docs/UX-REVIEW-mental-model-2026-07.md` for background. Any agent doing UI must also read `.impeccable.md` and `src/styles/tokens.css` (paper ground, hairline frames, saffron = the single load-bearing accent reserved for "Export run", patient motion, reduced-motion respected).

## Ground rules (give these to every subagent verbatim)
- TDD is mandatory: write failing vitest tests FIRST, implement to green, refactor. Test files colocate next to source, matching repo convention.
- Use CONTEXT.md vocabulary exactly: Run Plan, Sheet (not canvas/work area), Export Receipt, Pen Swap, Machine Profile, Operation, Optimization.
- ADR-0002's boundary rule governs all UI placement: the plan edits HOW the machine executes, never WHAT the design is.
- File ownership is EXCLUSIVE per lane. A lane may only create/edit its listed files. If you discover you need a file another lane owns, report back instead of editing it.
- Match surrounding idiom: header comments explaining WHY, same density, same RTL test patterns as the existing shell suites.
- One conventional commit per lane on green: `feat(run-plan): <lane summary>`.
- `npm test` and `npm run lint` must be fully green at every wave boundary before the next wave starts.

## WAVE 1 — pure modules, spawn 5 subagents IN PARALLEL (zero file overlap)

### Lane A — clipToSheet (new: `src/lib/plotter/clipToSheet.js` + `.test.js`)
Segment-level polyline clipping against the Sheet rect → `{ kept, dropped, croppedPathCount }`. Paths are the point-array shape used by `src/lib/plotter/pathOps.js`. No boolean region ops. TDD cases: fully-inside, fully-outside (culled), crossing (split at boundary), closed path crossing (becomes open), degenerate (<2 points), path exactly on the edge, path crossing multiple times (multiple kept fragments).

### Lane B — runEstimate (new: `src/lib/plotter/runEstimate.js` + `.test.js`; also owns `src/lib/plotter/constants.js` this wave)
Profile-aware time model per ADR-0002: laser = per-operation drawMm × passes ÷ op.speed (mm/s, from the operation's own params — see `src/lib/machineProfiles.js` schemas) + travel at a new per-profile rapid constant; plotter/drag = existing DRAW_SPEED/TRAVEL_SPEED constants; plus flat PEN_SWAP_SEC × swap count (pen swaps = adjacent operation groups with different pens, plotter only). Add the new constants to constants.js with the same documentation style. Output: `{ totalSec, perOp: [{opId, drawMm, travelMm, passes, sec}], penSwaps }`. TDD: laser math responds to speed/passes changes, plotter uses constants, swap counting, unknown profile falls back safely.

### Lane C — exportSettings (new: `src/lib/exportSettings.js` + `.test.js`)
The `export` namespace (`{ cropToSheet: boolean }`, default true) in profiles.settings jsonb. CRITICAL: `src/lib/settingsService.js` documents a last-write-wins hazard — a second writer MUST re-read the row before writing or it clobbers the patternPicker namespace. Implement read-before-write merge; do not modify settingsService's existing exports' behavior. Guest fallback: localStorage. TDD: default, merge preserves sibling namespaces, read-before-write round-trip, guest path, unconfigured-supabase no-op.

### Lane D — P0-3 history fix (owns: `src/lib/history/snapshot.js`, `src/lib/history/documentSnapshot.js`, `src/pages/Studio.jsx` this wave)
Machine-profile switch becomes a recorded, undoable batch: add activeProfileId to the document snapshot; remove the `history.clear()` call in Studio's profile-switch path (~line 532); route the switch through recordBatch like Document Setup apply does. Integration test modeled on `src/lib/history/recordSites.integration.test.jsx`: switch profile → undo restores prior profile AND prior operations; history is never cleared.

### Lane E — appliedOptimizations persistence (owns: `src/lib/hooks/useOptimizations.js` + the persistence blob modules it must extend)
Applied optimize values (enabled + appliedTolerance per step) persist with the document — localStorage AND the cloud design blob — with migration default "none applied" for old blobs. They stay OUTSIDE the undo snapshot (ADR-0002: their way back is the plan's Revert). If Studio.jsx wiring is needed, note it for Wave 3 Lane I instead of editing. TDD: apply → reload → applied values survive and export math uses them; preview values never persist.

## WAVE 2 — the keystone, ONE subagent (needs A + B merged)

### runPlanModel (new: `src/lib/plotter/runPlanModel.js` + `.test.js`; may extend `src/lib/plotter/fabricationPipeline.js`)
The single assembler every consumer reads (ADR-0002 "agree by construction"): compose extraction (fabricationPipeline) → clipToSheet → applied optimizations → overlapCheck on POST-applied geometry → runEstimate → warning taxonomy (sheet-exceeds-bed, cropped paths, overlaps, layers-with-no-resolvable-operation) → route (buildRouteFromLayers) + ghost-crop data. Add the clip stage to fabricationPipeline ordered extract → clip → optimize, as an opt-in option so existing callers are byte-identical until wired. TDD: warning taxonomy cases; the agreement guarantee (a receipt consumer and a panel consumer of the same model read identical minutes/counts — extend the spirit of `fabricationDivergence.test.js`); crop honors the cropToSheet preference; unassigned layers resolve through the document-default operation before warning.

## WAVE 3 — UI. Spawn F, G, H IN PARALLEL (disjoint files), then I alone.

### Lane F — RunPlanPanel + shell morph (new components under `src/components/shell/`; owns `src/components/shell/AppShell.jsx` and `src/components/shell/OptimizeControls.jsx`)
Plan open/close state; right column swaps Inspector → Run Plan panel via the existing slot/portal pattern; Esc + "Back to design" exit. Panel top-to-bottom: machine-qualified title ("Run Plan: Laser cutting" — profile label from machineProfiles), sheet+bed line, "Estimated · N min" (display face), per-operation breakdown rows in execution order (color cell, name, process, layer count, draw length, passes, est time; click → locate on canvas), the Optimize stack MOVED in (relocate OptimizeControls' CommitSlider UI here; retire its bottom-left mount) with live travel/time deltas, warnings section (click → locate), saffron "Export run" primary action. RTL tests: rows in execution order, estimate updates when an operation's speed changes, warnings locate, Esc exits, optimize apply updates the estimate.

### Lane G — machine-view canvas (owns `src/components/canvas/PlotOverlay.jsx` and its mount plumbing in `src/components/RightPanel.jsx`)
Evolve PlotOverlay into the plan's canvas state: paths tinted by operation color, travel moves as faint dashed lines, cropped segments ghosted at the sheet edge, sheet + bed rects, two-way highlight (canvas path click → op row, via a callback prop), Play button animation — a dot runs the route in execution order time-scaled to ~15s (the legacy PlotPreviewSection animated this; reuse buildRouteFromLayers), prefers-reduced-motion → static trace. Tests assert the route/tint MODEL (which paths get which op color, scale math), not pixels.

### Lane H — ExportReceipt + PreferencesModal (new components; owns the quick-export handler extension)
Receipt: transient, calm, auto-dismissing, paper idiom (NOT a stock toast — hairline frame on paper, tokens.css motion), one line: "Exported — Estimated · 34 min · 3 paths cropped at sheet edge · 2 warnings → Run plan", variants (clean / cropped / warnings), link opens the plan. Quick export runs runPlanModel for its numbers and honors cropToSheet. Preferences modal: left tab rail, single Export tab, "Crop paths overflowing the sheet" toggle wired to exportSettings (Lane C). Brief principle 7 copy: no exclamation marks, no alarm glyphs, actions not warnings. RTL: wording variants, toggle round-trips, receipt link.

### Lane I — entry wiring, runs LAST, alone (owns `src/components/shell/MenuBar.jsx`, `src/components/shell/StatusBar.jsx`, `src/pages/Studio.jsx`)
File menu: "Export SVG…" ⌘E and "Run plan…" ⇧⌘E adjacent; StatusBar machine cluster becomes a button opening the plan; the Export Receipt link wired; View ▸ Overlays toggle RETIRED (its display is absorbed by the plan); global ⌘E/⇧⌘E keydown handlers following the existing useSaveHotkey pattern (guarded against text-entry targets); any Studio.jsx wiring deferred from earlier lanes. RTL: menu items + shortcuts fire, status-bar entry opens plan, Overlays item gone.

## Final gate
1. Full `npm test` + `npm run lint` green.
2. Drive the real flow end-to-end in the dev server: seed layers → open Run Plan from the status bar → change an operation's speed and watch minutes move → apply Reorder and watch travel shrink → Esc → quick export → receipt appears with correct numbers → toggle cropToSheet off in Preferences → export → receipt shows no crop line.
3. Report per lane: what shipped, test counts, any deviation from PRD #73 (flag it — never silently decide), and a short list of anything needing human eyes (especially visual polish against `.impeccable.md`).

Do not merge to main; leave `feat/run-plan` pushed with the PRD linked in the final commit body (`Closes #73` goes in the eventual PR, not yet).
