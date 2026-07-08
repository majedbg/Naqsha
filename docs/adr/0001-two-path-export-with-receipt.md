# Export is two-path: quick Export SVG with a receipt, Run Plan as optional pre-flight

The 2026-07 UX review (`docs/UX-REVIEW-mental-model-2026-07.md`, P0-1) recommended a
single export path gated through a machine-preview step. We deliberately reversed that:
**File ▸ Export SVG (⌘E) stays one keystroke and never blocks**, because most users
export the SVG and run it through other software (LightBurn, AxiDraw utility) later —
the Run Plan (⇧⌘E) is the pre-flight for when the laptop is at the machine, not a toll
booth. The silent-failure hole is closed instead by the **Export Receipt**: every export
runs the same `fabricationPipeline` preflight and reports one calm line — estimated run
time, paths cropped, warning count — linking into the Run Plan. Severe problems still
never block export (trust the maker); geometry overflowing the **Sheet** is **cropped at
export by default** (segment-level polyline clipping — no boolean ops needed), controlled
by an app-level preference (`profiles.settings.export`, localStorage for guests) in the
new Ableton-style Preferences modal, and cropping runs as a pipeline stage so plan,
receipt, and file agree by construction.

**Never gated:** the Run Plan, receipt, and preferences are free for every tier
including guests. Policy (Majed, 2026-07-08): fabrication operability is bare-minimum
"operational smoothness" — the design features are what's worth paying for.

Considered and rejected: single-path export-through-plan (punishes the majority
quick-export flow); blocking checks on severe warnings (a modal toll booth);
soft-gate-first-time-only (unpredictable, and predictability is what "reliable" means).
