# Topographic Modulation — Build Spec / TDD Runbook

Companion to `topographic-modulation-prd.md`. Work items are TDD (write the failing test,
then the implementation). **Slice 1 (WI-1…WI-6) must be fully green — `npm test` +
`npm run build` — before Slice 2 (WI-7…WI-9) begins.** Commit per green WI.

Branch: `feat/topographic-modulation` (worktree at `.claude/worktrees/topographic-modulation`).

---

## Slice 1 — the modulation link (Phase 1)

### WI-1 — Inline Simplex sampler (shared, seeded)
- **New:** `src/lib/fields/simplexNoise.js` — `makeSimplex(seed) → (x, y) => number` in
  `[-1,1]` (2D simplex; seed permutes the gradient table deterministically). No npm dep.
- **Test** `simplexNoise.test.js`: deterministic for a fixed seed; different seeds differ;
  output bounded ~`[-1,1]`; smooth (neighboring samples close); mean ≈ 0 over a grid.
- **No consumer wired yet** — pure module first.

### WI-2 — Shared fBm sampler; `TopographicContours.generate()` uses it
- **New:** `src/lib/fields/fbm.js` — `fbm(noise2D, wx, wy, { baseFreq, octaves, warp,
  longest })` replicating the pattern's existing octave + domain-warp math, parameterized
  by an injected `noise2D`.
- **Refactor** `TopographicContours.generate()` to sample via `fbm(makeSimplex(seed), …)`
  instead of `ctx.noise`. (Keep the existing field-build/marching-squares/stitch loop
  byte-identical in structure; only the noise source changes.)
- **Tests:** existing `TopographicContours.test.js` + `.modulation.test.js` stay green
  (they are relational — determinism, seed-sensitivity, level/resolution counts, canvas==SVG
  under warp). Add: output is deterministic across runs and seed-sensitive under the new
  sampler.
- **Note:** this is the intentional one-time appearance change (PRD D2). No golden test
  breaks.

### WI-3 — `topographicField()` producer
- **New:** `src/lib/fields/topographicField.js` — `topographicField(params, { seed,
  resolution = 128 }) → ScalarField`. Samples the **same** `fbm(makeSimplex(seed), …)` over
  the unit grid, normalizes to `[0,1]` by sampled extent, remaps to signed `s = 2·elev − 1`,
  builds via `ScalarField.fromGrid`/`fromFunction`. LRU memo keyed on
  `seed|noiseScale|octaves|warp|resolution` (mirror `chladniField`'s cache).
- **Test** `topographicField.test.js`: returns a `ScalarField`; signed, ~`[-1,1]`,
  mean ≈ 0; deterministic per key; **independent of `levels`/`levelBias`/`strokeWeight`**;
  changes with `seed`/`noiseScale`/`octaves`/`warp`. Iso-line agreement: the field's zero
  crossings line up with a mid-level contour from `generate()` at the same seed/params
  (sample a handful of points).

### WI-4 — Register topographic as a source
- **Edit** `fieldRegistry.js`: `canProduceField` true for `chladni || topographic`;
  `fieldForLayer` dispatches — chladni → `chladniField(layer.params,…)`; topographic →
  `topographicField(layer.params, { seed: layer.seed, resolution: 128 })`.
- **Test** `fieldRegistry.test.js`: a topographic layer produces a field; a grainfield/etc.
  still produces none; seed flows through.

### WI-5 — Device-level range remap (model)
- **Edit** `modulation.js` (or a small `rangeRemap.js`): apply the affine output range
  **before** the rest of the transfer. `applyRange(s, {min,max}) = min + (s+1)/2*(max-min)`.
  Wire into the resolved-modulation cfg consumed by `modulationTransfer`.
- **Edit** `resolveModulationForTarget.js`: read `dev.range` (default `{min:-1,max:1}`);
  drop per-map `polarity` from the resolved object; surface `range` instead. Keep per-map
  `amount`.
- **Migration:** when reading a legacy modulator, map per-map `polarity` → device `range`
  (`unipolar→{0,1}`, `bipolar→{-1,1}`); a one-shot in the resolver/normalizer is fine
  (no persisted schema migration needed — params are in-document JSON).
- **Tests:** `[-1,1]` identity; `[0,1]` ⇒ no negative output (attract-only); `[-1,0]` ⇒ no
  positive (repel-only); legacy `unipolar`/`bipolar` map to the right ranges; `amount` still
  scales.

### WI-6 — Modulator device UI: two-thumb range slider + live plot recolor
- **Edit** `Inspector.jsx` `ModulatorDevice`:
  - Add a **vertical dual-thumb slider** left of the 140×140 field plot, spanning −1…1, two
    independent thumbs writing `modulator.range = {min,max}` via `patchModulator`. Gradient
    track uses `signedColor` anchors (garnet→parchment→sapphire); captions "max" (top),
    "neutral" (middle, gray), "min" (bottom).
  - **Remove** the per-map polarity control; keep per-map amount.
  - **Live recolor:** `FieldOverlay`/`colormap` consumption clamps/maps the field through
    the current `range` so the heatmap reflects attract-only/repel-only as thumbs move.
- **Tests** (`Inspector` test or a focused `ModulatorRange.test.jsx`): moving thumbs writes
  `range`; whole modulator preserved on write (no map loss); polarity control gone; plot
  data reflects range. Accessibility: each thumb has an aria-label + min/max bound.

**Slice 1 gate:** `npm test` + `npm run build` green; browser-verify a topographic layer
driving a grainfield, and the range slider flipping attract↔repel with live plot recolor.

---

## Slice 2 — the git-graph rail (Phase 3)

### WI-7 — Relationship edge model (pure)
- **New:** `src/lib/fields/modulationGraph.js` — `buildModulationGraph(layers) →
  { edges: [{ guideId, targetId, channel, polaritySign, active }], byGuide, byTarget }`.
  `polaritySign` from the guide's range midpoint (or dominant pole); `active` true for the
  first edge into a target (single-source), false for the rest (Phase-2b forward-compat).
- **Test:** counts (`→N`/`←N`) correct; multi-guide target marks 1 active + rest inactive;
  ignores self-maps; cross-panel edges present (graph is panel-agnostic).

### WI-8 — Rail rendering in `LayerTree`
- **New:** `src/components/shell/ModulationRail.jsx` — an 18px-wide absolutely-positioned
  left gutter that measures row positions (refs) and draws SVG bezier edges guide→target,
  colored by `polaritySign` (garnet/sapphire). Dim by default; brighten edges incident to
  `selectedLayerId`.
- **Edit** `LayerTree.jsx`: reserve the gutter; pass `layers` + `selectedLayerId`; render
  the rail behind/beside the rows. Edges span panels (one continuous gutter).
- **Test** (`LayerTree.rail.test.jsx`): renders an edge per map; edge count matches graph;
  selected layer's edges get the emphasis class; cross-panel edge renders.

### WI-9 — Connection badges + "stacked" affordance
- **Edit** `LayerRow` (LayerTree): small `→N`/`←N` badges from `byGuide`/`byTarget`. A
  target with >1 incoming guide shows a "N sources · 1 active" affordance.
- **Test:** badge text matches counts; stacked affordance appears only when >1 incoming.

**Slice 2 gate:** `npm test` + `npm run build` green; browser-verify the rail draws
guide→target edges, selection emphasis works, badges count correctly, and a cross-panel
relationship routes the gutter.

---

## Test/verify commands
- `npm test` — vitest unit/component suite.
- `npm run build` — production build must succeed.
- Browser-verify each slice gate (the app's run skill).
