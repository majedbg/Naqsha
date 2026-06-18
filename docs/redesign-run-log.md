# Studio Redesign — Autonomous Run Log

> Orchestrator run started 2026-06-18. Branch `layout-rework` off `main`.
> Baseline before any issue: **594 passed | 4 skipped (598)**; `npm run build` green.
> Order: 1, 2, 3, 6, 8, 9, 12, 4, 5, 7, 10, 11, 13, 14, 15, 17, 16 → then STOP (#18/#19/#20 are HITL).
>
> Commit gate per issue: `npm test && npm run build && npm run lint` green, `git diff --stat`
> scope-checked (no planning-doc edits, no cross-issue files, no quietly-modified existing
> test snapshots), new test count rose ~by the issue's TDD plan size.
>
> ⚠️ **`gh issue comment` is blocked by the harness permission classifier** (outward-facing
> action under the user's GitHub identity). Per-issue SHA comments could NOT be posted. This
> run log + the commit history on `layout-rework` ARE the audit trail. Issues are left OPEN
> (never auto-closed) per hard-rule #4. To enable comments, add a Bash permission rule for
> `gh issue comment`. The HITL parking comments on #18/#19 are likewise blocked — their
> required-data notes are in the morning report instead.

| Issue | Status | Commit | Tests (before→after) | Notes |
|------:|--------|--------|----------------------|-------|
| #1 | ✅ DONE | 0f4fce0 | 594→632 (+38) | A1+A3+A4. operations.js + migration.js; export rewired via resolveExportColor; examples rewritten; equivalence asserted vs literals; no existing test/snapshot touched. |
| #2 | ✅ DONE | 0454300 | 632→640 (+8) | B1. AppShell (8 region frames) + StudioRoute strangler gate behind `VITE_PRO_SHELL` flag; OFF=legacy no-op, ON+desktop=shell w/ Studio in canvas. Only App.jsx modified. |
| #3 | ✅ DONE | a5d9b76 | 640→667 (+27) | A2. machineProfiles.js (Laser/Plotter/Drag Cutter): process sets, param schemas, default beds, remapOperationsToProfile. migration.js strips outputMode; ids `laser`/`plotter`/`dragCutter` align w/ #1. No selector UI (lands #5). |
| #6 | ✅ DONE | 9c97d95 | 667→673 (+6) | B3. Inspector.jsx portaled into shell inspector region (flag-ON only; flag-OFF no-op), reuses PatternTabs/PatternParams; selection=top layer until #5. ⚠️ FOLLOW-UP for #5: wire click-to-select + Moiré role-B partner-A param redirection (findMoirePartnerA). |
| #8 | ✅ DONE | d3fcf18 | 673→685 (+12) | B5. MenuBar.jsx (File/Edit/View/Object/Help + Share/Theme/Auth) portaled into shell menu region; folds Examples/Open/Cloud/Export/Save/Share to real handlers; legacy loose top bar gated `{!menuSlot}` (flag-OFF no-op verified by 2 still-passing gate tests). **Test supersession (advisor-approved):** edited 2 #2 tests — `StudioRoute.test.jsx:53` (now asserts canvas-surface in Canvas region) + `StudioRoute.smoke.test.jsx` (now drives File→Examples → real ExamplesGallery opens); new behavior independently covered by 12 new #8 tests; flag-OFF path stays verified. **Finding for #10/#17:** NO history/undo system exists in `src/` (plan doc's `useHistory` claim is inaccurate) — Undo/Redo are disabled placeholders; #10 must BUILD history from scratch, not extend it. |
