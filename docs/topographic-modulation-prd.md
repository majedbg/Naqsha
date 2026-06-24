# Topographic Modulation + Track Relationships — PRD

**Status:** Grilled & locked 2026-06-24. Branch `feat/topographic-modulation` (worktree).
**Author:** Jade + Claude (grill-me session).
**Supersedes/extends:** the existing field-modulation subsystem (`src/lib/fields/*`, the
Ableton-LFO `ModulatorDevice` in `src/components/shell/Inspector.jsx`).

---

## 1. Summary

Two connected upgrades to the pattern-modulation system:

1. **Topographic contours become a modulation _source_.** A topographic layer's
   elevation heightfield is a ready-made signed scalar field; the drawn contour
   rings are literally its iso-lines. Exposing that field lets a topographic layer
   *drive* other layers (grain density, warp, …) through the existing
   modulator-centric ("Ableton-LFO") device — the same way Chladni already does.

2. **The "track" mental model + a relationship visualization.** Each pattern is a
   track; modulation is the first kind of inter-track relationship ("the first of
   many"). A git-graph-style rail in the layer tree draws guide→target edges so the
   routing is legible at a glance.

A new **device-level output-range control** (two-thumb slider) generalizes the old
per-map polarity toggle into continuous attract-both / attract-only / repel-only.

---

## 2. Background — what already exists (verified in code)

- **`ScalarField`** (`src/lib/fields/ScalarField.js`) — sampled 2D field over the unit
  domain `[0,1]²`; `fromFunction(fn, {nx,ny,meta})`. Pure, headless, never draws from a
  pattern's RNG. Doubles as a height-map for preview.
- **`fieldRegistry`** (`src/lib/fields/fieldRegistry.js`) — `canProduceField(layer)` and
  `fieldForLayer(layer)`. **Today only `chladni` produces a field.**
- **`channelConsumers`** (`src/lib/fields/channelConsumers.js`) — which channel a target
  type consumes. `grainfield→density`; `chladni/topographic/flowfield/recursive→warp`.
  **So `topographic` is already a valid _target_.**
- **`resolveModulationForTarget`** (`src/lib/fields/resolveModulationForTarget.js`) —
  modulator-centric resolution. A **guide** layer owns `layer.modulator = { offset,
  shape, steps, maps: [{ targetLayerId, channel, amount, polarity }] }`. Returns the
  **first** modulator mapping to a given target (single-source today).
- **`modulation.js`** — `modulationTransfer(s, cfg)` (signed `s∈[-1,1]`, `amount/offset/
  polarity/shape/steps`), `densityWeight(s)=max(0, 1+transfer)`.
- **`colormap.js`** — diverging signed colormap. **positive → garnet-magenta**, **zero →
  parchment**, **negative → sapphire-teal**. This is the house convention the UI must
  match.
- **`TopographicContours.js`** — already _consumes_ `params.modulation` (channel `warp`):
  warps its final contour vertices along the guide field. Samples its fBm field via
  `ctx.noise` (**p5 Perlin live / mulberry32 value-noise headless** — byte-identity is a
  within-context canvas==SVG property, never live==headless).
- **`ModulatorDevice`** (Inspector) — renders for any layer where `canProduceField` is
  true: a 140×140 field heatmap (`FieldOverlay`), device controls (offset/shape/steps),
  and per-map rows (amount + polarity). Candidate targets come from `channelForTarget`.

No golden/absolute snapshot test pins `TopographicContours` output — its tests are
relational (determinism, seed-sensitivity, level/resolution counts). This de-risks the
noise refactor below.

---

## 3. Locked decisions

### D1 — Topographic is a modulation **source** (and remains a target)
Add `topographic` to `canProduceField`. The existing `ModulatorDevice` then appears for a
topographic guide with **no UI rewiring**. (It is already a `warp` target via
`channelConsumers`; that stays.)

### D2 — Unify on one inline **Simplex** sampler
There is no standalone seeded-noise utility today, and the field producer must run
headless/pure. We extract a single **inline 2D Simplex** noise module (seeded, no npm
dependency, ~80 lines) and route **both**:
- `TopographicContours.generate()`'s fBm, and
- the new `topographicField()` producer

through it. This guarantees the guide field's iso-lines **exactly track the drawn
contours** (the whole point), and makes the headless preview match the live render for
the first time.

- **Quality:** Simplex is isotropic — equal-or-better than p5 Perlin (no axis-aligned
  artifacts). The fBm octave structure (`octaves`, amplitude falloff, domain `warp`) is
  unchanged and stays in the pattern.
- **Cost (accepted):** existing topographic layers render with new (equally organic)
  terrain. No golden test pins them; topographic is a seeded generative pattern, so this
  is not a regression of a hand-tuned asset.
- **Rejected alternatives:** (b) independent noise in the producer → heatmap wouldn't line
  up with contours (kills the magic); (c) pattern caches its field as a render
  side-effect → violates the ScalarField "resolve at render time, never store" contract +
  forces guide-before-target ordering.

### D3 — Field value semantics: signed, sea-level-neutral
- Producer returns elevation normalized to `[0,1]`, then remapped to signed
  **`s = 2·elev − 1`**. Mid-elevation ("sea level") = neutral **0**; **peaks attract (+)**,
  **valleys repel (−)**. Consistent with how Chladni's signed field behaves and with the
  `modulationTransfer` bipolar contract.
- **Field keyed on:** `seed`, `noiseScale`, `octaves`, `warp`. **Not** `levels`,
  `levelBias`, `strokeWeight`, draw `resolution` (those only move where contour lines are
  drawn, not the terrain). Field grid **128²** (matches `chladniField`).
- **Seed threading:** `fieldForLayer(layer)` passes `layer.seed` into
  `topographicField(layer.params, { seed: layer.seed, resolution: 128 })`. (Chladni is
  seedless/closed-form; topographic is not — this is the one wiring difference.)

### D4 — Device-level two-thumb output **range** control (replaces polarity)
A vertical dual-thumb slider, spanning **−1…1**, sets `modulator.range = { min, max }`
(floats, `min ≤ max`). The field's full `[-1,1]` is **affine-remapped** onto `[min,max]`:

```
s' = min + (s + 1) / 2 * (max - min)
```

- `[-1, 1]` = identity (attract + repel) · `[0, 1]` = attract-only · `[-1, 0]` = repel-only
  · any float band in between.
- **Replaces per-map `polarity`.** Migrate existing data: `unipolar → [0,1]`,
  `bipolar → [-1,1]`. Per-map keeps only `amount`. Default `range = [-1, 1]`.
- **Tradeoff (accepted):** all targets of one guide share the same attract/repel band. To
  attract A while repelling B from one guide, add a second guide. (Per-map range could
  return in a later phase if needed.)
- **Color + behavior convention (matches `colormap.js`):**
  - 🔴 **garnet** = positive `+1` = **attract** (densify / pull toward) = magnet **"+" pole**
    = **top** thumb (max).
  - ⚪ **parchment** = neutral `0` = middle (label "neutral", gray).
  - 🔵 **sapphire** = negative `−1` = **repel** (thin / push away) = magnet **"−" pole**
    = **bottom** thumb (min).
  - Faithful to consumers: `densityWeight = max(0, 1+transfer)` → positive packs denser
    (attract), negative thins (repel).
- **Slider gradient** uses the garnet→parchment→sapphire `signedColor` anchors (NOT literal
  red/white/blue) so it matches the adjacent field plot.
- **Live plot re-color:** the 140×140 field heatmap re-colors as the thumbs move — set
  `[0,1]` and the plot loses all blue (attract-only); `[-1,0]` loses all red.

### D5 — Single-source compute now
`resolveModulationForTarget` stays single-source (first matching modulator). Multi-source
stacking is **Phase 2b** (§5).

### D6 — Visualization: git-graph left rail
A continuous **~18px left gutter** in `LayerTree` draws git-style bezier edges from a guide
row down to each target it modulates:
- Edge color = field polarity (garnet attract / sapphire repel).
- **Selection-scoped emphasis:** all edges drawn dim; the selected layer's edges brighten.
- `→N` / `←N` **connection badges** per row (drives N / driven by N).
- **Cross-panel:** the gutter is one continuous column, so a guide in Panel 1 modulating a
  target in Panel 2 simply routes its edge further down the same rail — cross-panel
  relationships render naturally, not hidden.
- The modulator **device** stays in the Inspector; the rail is purely the *relationship*
  view. (The modulator is a device owned by the guide layer, not a separate object — there
  is no standalone "modulator row" to stack.)

### D7 — Scope & process
- **One worktree** `feat/topographic-modulation`, **two gated slices**:
  - **Slice 1 (Phase 1):** the modulation link + range UI. Must be green (tests + build)
    before Slice 2.
  - **Slice 2 (Phase 3):** the git-graph rail.
- **Phase 2b:** PRD-only (this doc, §5). Not built now.
- **TDD** build (red/green per work item), orchestrator-driven. Field producer, affine
  remap, and rail edge-model are all pure → highly testable.

---

## 4. Non-goals (this build)

- Multi-source modulation compute (Phase 2b).
- Per-target output ranges (device-level only for now).
- Other relationship *types* beyond modulation ("first of many" — later).
- 3D height-surface preview of the topographic field (ScalarField already supports it; out
  of scope here).
- Making other pattern types into sources (flowfield/recursive could follow the same
  recipe later).

---

## 5. Phase 2b — multi-source stacking (FUTURE, documented now)

**Goal:** one target accumulates several incoming modulations (guide A's elevation *plus*
guide B's Chladni field), like stacking LFOs/devices on an Ableton track.

**Changes required:**
1. **Resolver:** `resolveModulationForTarget` returns an **array** of resolved modulations
   (every guide that maps to the target), not the first.
2. **Consumers compose** the stack per channel:
   - **warp:** **vector-sum** the per-source displacements `(dx,dy)`, then apply.
   - **density:** **multiply** the per-source weights (`Πᵢ max(0, 1+transferᵢ)`), then
     clamp ≥ 0. (Multiplicative so a neutral source = ×1 = no-op; sum is the alternative if
     additive feel is preferred — decide at build time with a quick A/B.)
3. **Every modulation consumer + test** updates: `TopographicContours`, `FlowField`,
   `GrainField`, `RecursiveGeometry`, `Chladni`, and `warp.js` / `modulation.js`.
4. **UI:** the modulator device & rail show **N→1** (a target row lists/*stacks* its
   incoming sources); the rail already renders multiple edges into one target row — Phase 1
   should draw them even though only the first is *active*, with a visible
   **"stacked — N sources, 1 active"** affordance so single-source compute is not silently
   lossy.

**Why deferred:** the visual/mental "tracks" payoff is most of the value and is low-risk;
true composition touches every consumer + its tests and deserves its own slice.

---

## 6. Acceptance criteria (Phase 1 + Phase 3)

**Phase 1 — the link**
- [ ] A topographic layer shows the Modulator device in the Inspector (`canProduceField`).
- [ ] `topographicField(params, {seed, resolution})` returns a `ScalarField`; signed,
      sea-level-neutral; deterministic for fixed seed/noiseScale/octaves/warp; independent
      of `levels`/`levelBias`.
- [ ] The same Simplex sampler drives `TopographicContours.generate()`; the rendered
      contours are the iso-lines of the produced field (within-context canvas==SVG
      preserved; existing relational tests still green).
- [ ] A topographic guide can modulate a grainfield (density) and a warp target; output
      changes accordingly.
- [ ] `modulator.range = {min,max}` affine-remaps the field; `[0,1]`/`[-1,0]`/`[-1,1]`
      give attract-only / repel-only / both.
- [ ] Existing `polarity` data migrates (`unipolar→[0,1]`, `bipolar→[-1,1]`); polarity UI
      removed; per-map keeps amount.
- [ ] The field plot re-colors live with the range thumbs; gradient uses `signedColor`
      anchors.

**Phase 3 — the rail**
- [ ] An 18px left rail draws bezier edges guide→target, polarity-colored.
- [ ] Selecting a layer brightens its edges; others dim.
- [ ] `→N`/`←N` badges reflect actual map counts.
- [ ] Cross-panel edges route the continuous gutter.
- [ ] If a target is mapped by >1 guide, all edges draw with a "N sources, 1 active"
      affordance (forward-compat with Phase 2b).

**Both**
- [ ] `npm test` green; `npm run build` green; browser-verified.
