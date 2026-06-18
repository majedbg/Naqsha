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
| #9 | ✅ DONE | adb3737 | 685→722 (+37) | B6. ToolStrip + ControlBar portaled into shell regions; fresh tool registry (select/text/hand/zoom, keymap V/T/space) + useActiveTool + useCanvasView (controlled zoom/pan to RightPanel, flag-OFF byte-identical). **CODEBASE-REALITY FINDING (affects #12/#5):** NO scene graph (`src/lib/scene/`, SceneNode/TextNode/PatternNode, buildCombinedSceneSVG all ABSENT — plan doc's "current state" describes unmerged arch-rework + text-tool branches). Real object model = `layers` array (useLayers); real export = `buildAllLayersSVG(layers, patternInstances,…)`. Text-tool controls + operation chip are presentational/local-state only (no text model exists; pending Text Tool Plan & #11). #4 premises DO hold (FlowField `{pathD,strokeWeight}`, contentFor/toSVGGroup/MAX_PEN_SLOTS real). |
| #12 | ✅ DONE | e2a4736 | 722→740 (+18) | C4. SVG import place-as-artwork, reframed to real `layers` model (NO scene graph): svgImport.js parser + ImportedPath synthetic instance (toSVGGroup verbatim `d`) + useLayers.addImportedLayer + useCanvas typed branch + useSvgImport (drag-drop+paste) + live File>Import (MenuBar onImport). Operation color via resolveExportColor (op-cut default). Existing pattern-layer export byte-stable (svgExport.js untouched). ⚠️ KNOWN LIMITATION: optimized export flattens imported C/Q curves (parsePathD M/L/Z only); default export (opts off) verbatim & correct. Boundary/mask deferred per spec. |
| #4 | ✅ DONE | f357510 | 740→760 (+20) | A5 (headless). variableWeight.js: quantizer (N even buckets, default 5, deterministic), reserved laser spectrum **orange→yellow** (R=FF,B=00,G=80→FF; proven disjoint from #FF0000/#0000FF/#000000), band gen (bandId/bandLayerId/bandIndex markers), plotter bucket→penSlot (MAX_PEN_SLOTS cap) + pressure metadata, dragCutter excluded. Capability flag `hasVariableWeight` honestly gated: only **`recursive`** (RecursiveGeometry's strokeAtLevel varies per-element); FlowField pushes CONSTANT weight (PRD's exemplar premise WRONG — verified). Existing export byte-stable (svgExport untouched). ⚠️ FOLLOW-UPS for #17: (1) wire `realizeVariableWeightElements` into buildAllLayersSVG gated on a `layer.variableWeight` enable flag; (2) exempt band ops from laser color-lock (remapOperationsToProfile would clobber spectrum colors). |
