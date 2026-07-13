# Motif Chain (#79) — Fresh-Session Handoff

> Generated 2026-07-12. Paste the "COPY-PASTE PROMPT" block below into a new session.
> The feature is **engineering-complete**; what remains is close-out (merge + PR + designer pass)
> and optional polish. Full record: `docs/motif-chain-ORCHESTRATOR.md` slice log + GitHub issue #79.

---

## COPY-PASTE PROMPT (paste this into the fresh session)

You are picking up the **Motif Chain** feature (issue #79, repo `majedbg/Naqsha`) in the checkout
`/Users/jadembg/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio`. The feature is
**already built and engineering-complete** — do NOT rebuild it. Read `docs/motif-chain-ORCHESTRATOR.md`
(the full slice log) and issue #79 first; they are the source of truth.

### Current state (as of 2026-07-12)
- **All phases done:** A (pure engine: hashRng, chain executor, legacy compile, sequencer) · B (render
  integration: multi-glyph dual-emit, arbitrary-edge host capture, chain wired end-to-end) · C (rack UI:
  chain plumbing, Block rack, Sequencer card, Route card, starter chips) · D (hardening: export/undo/
  persistence goldens, AnchorGhostOverlay chain-form redirect, whole-diff honesty battery).
- **Full test suite: 4650 passed / 0 failed. Build: green.** Every slice was independently opus-reviewed
  (or orchestrator-verified for the two sonnet data slices); the D2 honesty battery (determinism,
  survivor-stability/ADR-0005, byte-identical legacy compile/D9, dual-emit per-slot parity, no-input-
  mutation, chain invariants) all PASS with mutation-verified integration tests.

### Where the commits are (IMPORTANT — two branches, worktree isolation)
- Slices through **C5** are on `feat/motif-chain` (HEAD `aa18711`).
- **Phase D** (D1 `1bff198`, D1 docs `372f46f`, overlay fix `8b11688`, overlay docs `07b8ea5`, D2
  `55f3dd8`) is on a SIBLING branch **`feat/motif-chain-d`**, built in a separate git worktree at
  `../naqsha-motif-d`. `feat/motif-chain-d` is a **strict fast-forward** ahead of `feat/motif-chain`.
- WHY the worktree: a CONCURRENT session is building an unrelated "Raster Etch" subsystem in the SAME
  main checkout (its uncommitted files: `CONTEXT.md` mods, `docs/adr/0006`, `docs/adr/0007`,
  `docs/etch-raster-layer-ORCHESTRATOR.md`). To avoid clobbering it, Phase D was isolated in the
  worktree. **Do NOT touch those Etch files; stage only motif paths, NEVER `git add -A`.**

### To LAND the feature (do this once the Etch session's checkout is clean/committed)
From the main checkout, on `feat/motif-chain`:
```
git merge --ff-only feat/motif-chain-d
git worktree remove ../naqsha-motif-d
git branch -d feat/motif-chain-d
```
Then open the #79 PR: `feat/motif-chain` → `main`.

### Remaining work (pick up any of these)
1. **Close-out (mechanical):** the ff-merge above + open the PR. Blocked only on the Etch checkout being clear.
2. **Designer UX pass (HITL):** the rack + Sequencer card + starter chips were browser-verified per-slice
   but never driven end-to-end by a human at 390px / iPad portrait. A designer should sit with it once.
3. **Non-blocking polish (recommend spinning out to their own issues — NOT #79 blockers):**
   - Edge-ghost **decimation**: the Route-card canvas path-picker renders ~13k pointer-events dots on a
     dense flowfield (only when "Pick on canvas" is armed). Decimate to a few markers per path (only
     `meta.pathIndex` matters, not glyph-aligned spacing). File: `src/components/canvas/AnchorGhostOverlay.jsx`.
   - Guard the `sampleEdgeAnchors` memo behind `armed` (it currently runs on mere selection).
   - Per-slot ghost **tinting** (dots colored by which slot glyph lands there).

### Key architecture you must respect if you touch this
- **Two binding shapes, mutually exclusive (D9, C1):** LEGACY `{selection, placement}` vs CHAIN-FORM
  `{chain:[...blocks], overrides?, placement}`. Chain-form is detected by `binding.chain` PRESENCE
  alone (no version stamp). A chain-form binding NEVER carries a `selection` key.
- **The chain-form helpers (`src/lib/motif/motifLayer.js`):** `readChain(binding)` (lazy-compile-on-read
  for display), `ensureChainForm(binding)` (first-edit rewrite, drops `selection`), `deepMergeBinding`.
  `normalizeBinding` PRESERVES `.chain`.
- **THE one-undo pattern for any chain edit:** `const base = ensureChainForm(old); const next =
  deepMergeBinding(base, patch); onUpdateLayer(id, {params:{...layer.params, binding: next}})` — a SINGLE
  updateLayer call = one undo entry. NEVER `deepMergeBinding` the raw legacy binding (it resurrects the
  dropped `selection`). Pure chain ops live in `src/lib/motif/chainEditor.js` (same-ref-on-no-op contract).
- **Sequence-terminal invariant:** the `sequence` block is at-most-one and LAST; `chainEditor` enforces it.
- **Overrides:** chain-form → `binding.overrides` (top-level, threaded via `resolveSelection` opts);
  legacy → `binding.selection.overrides`. An anchor include/exclude toggle is NOT a block edit → never
  force-migrate a legacy binding to chain-form.
- **Render seam:** `MotifPattern.generate` reads `p.binding`, runs `resolveSelection(binding, anchors,
  {overrides})` → `resolvePlacements` → dual-emits canvas + SVG from ONE matrix per instance.
- **Edge hosts (B2):** any polyline-emitting formula pattern (flowfield/wave/spirograph/topographic/
  phyllodash/diffgrowth/dendrite) is a legal edge-mode host via generic `capturePolylines` capture;
  semantic anchors stay exclusive to grid/recursive/spiral/voronoi.

### Process rules (unchanged, from the runbook)
Subagents sonnet/opus only (never fable); ONE at a time; TDD; every non-trivial slice gets an INDEPENDENT
opus reviewer; commit per green slice with EXPLICIT paths only; update the slice log after every slice;
do NOT use the Workflow tool; scoped dev-server teardown (own PID, never unscoped `pkill`).

### Out of #79 scope (own future grills — in the runbook's Deferred section)
Vine/rinceau HOST pattern (WI-2), save-chain-to-library presets, node-graph routing (rejected ADR-0004),
migrating legacy jitter to hash (rejected ADR-0005), #67 straddle badge + paint-order.
