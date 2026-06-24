# Pattern Modulation — Session Handoff

> Resume doc for the "patterns modulate other patterns" feature. Written mid-build;
> everything described as **shipped** is implemented, tested, and (where noted)
> visually confirmed, but **NOT committed** (working tree changes only).
> Repo: `generative-art-studio` · branch: `main` · stack: Vite + React 19 + p5 + Vitest (React Compiler ON).

---

## 1. The concept (what we're building & why)

The Chladni pattern produces a smooth scalar field; its drawn nodal lines are just the zero-set.
Idea: expose any pattern's underlying **field** and let it **modulate** another pattern's parameters
(density, later warp/weight/etc.) — one pattern guiding another.

**Load-bearing architectural constraint:** modulation must be consumed at **geometry-build time**
inside each pattern's `generate()`, NOT via a DrawingContext decorator. Reason: SVG export
**bypasses `ctx`** — every pattern builds geometry once into arrays, then emits it twice (canvas via
`ctx.line/vertex`, SVG via string-templating into `this.svgElements`). A ctx decorator would warp
canvas only and silently break the byte-identity invariant. (An Opus review caught this; the original
"universal warp decorator" idea was wrong.) So all channels live before the dual emit.

**UI principle (established with the user):** pull Ableton/DAW UX patterns so creatives get a unified
mental model. Modulation UI mirrors Ableton's LFO device. Key reframe: Ableton LFO is *temporal*; ours
is *spatial* — **the guide field IS the "waveform"** (static output, no time).

**Human-in-the-loop:** every binding is a live, undoable param edit (preview/apply/revert via the
existing `onUpdateLayer` path) — no silent automation. The user values this highly.

---

## 2. What's shipped (3 slices)

### Slice 1 — Field primitive + heatmap overlay (read-only)
- `src/lib/fields/ScalarField.js` — sampled scalar field over unit domain [0,1]². `sample(u,v)`,
  `sampleSigned`, `sampleNorm`, `sampleGradient`, grid accessors. `data` (Float32Array) doubles as a
  heightmap for a FUTURE 3D NURBS-style surface preview (no three.js in repo yet — user wants this later).
- `src/lib/fields/chladniField.js` — `chladniField(params,{resolution})` → cached ScalarField; closed
  form replicated VERBATIM from `src/lib/patterns/extras/Chladni.js` (kept in sync intentionally; DRY
  later). `chladniFieldFn(params)` exposes the pure closure.
- `src/lib/fields/colormap.js` — `signedColor(s)` jewel-tone diverging map; neutral band at 0 (=nodal lines).
- `src/components/FieldOverlay.jsx` — renders a ScalarField heatmap into an absolutely-positioned canvas
  (paint at grid res → bilinear upscale). Props: `field, canvasW, canvasH, opacity`.
- `src/components/RightPanel.jsx` — "Field" toggle (bottom-left, shown only when a chladni layer selected)
  + renders FieldOverlay in the scaled canvas wrapper.
- Test: `src/lib/fields/ScalarField.test.js` (9).

### Slice 2 — GrainField density consumer (TDD)
- GrainField is the first consumer. Density via **weighted Lloyd**: cell weights in the centroid sum
  pull points toward high-field regions. **Gentle by design** (relaxation resists clumping) — the test
  proof is a center-of-mass (mean-x) shift, not dramatic clustering.
- `src/lib/patterns/GrainField.js` — reads `params.modulation`; `count` changed Uint32Array→Float64Array
  (bit-identical for weight=1). When modulation absent/null/unknown-channel → byte-identical (existing
  snapshot guards this). GrainField patternType id = **`grainfield`** (lowercase). Chladni id = `chladni`.
- Test: `src/lib/patterns/__tests__/GrainField.modulation.test.js` (3): density responds, off-path
  byte-identity, canvas==SVG parity. Existing `GrainField.test.js` snapshot = the byte-identity golden master.

### Slice 2.5 — Depth & shape, Ableton-LFO model, MODULATOR-CENTRIC (TDD)
- **Transfer chain** in `src/lib/fields/modulation.js`:
  `modulationTransfer(s,cfg)` = `s → +offset → polarity → shapeEase → steps quantize → ×amount`.
  - `cfg = { amount, offset, polarity:'bipolar'|'unipolar', shape, steps }`
  - `shapeEase(v, shape)` — bend, exponent `3^shape`, endpoints+sign preserved (exported for UI readout).
  - `densityWeight(s,cfg)` = `max(0, 1 + modulationTransfer(s,cfg))` → GrainField unchanged (passes cfg through).
- **Modulator-centric binding** (Ableton model — guide owns the device, maps OUT to targets):
  - Stored on guide layer: `layer.modulator = { offset, shape, steps, maps:[{ targetLayerId, channel:'density', amount, polarity }] }`
    (device-level offset/shape/steps shared across maps; amount/polarity per-map — Ableton's split).
  - Runtime injected into consumer: `params.modulation = { field, channel, amount, polarity, offset, shape, steps }`.
  - `src/lib/fields/resolveModulationForTarget.js` — `resolveModulationForTarget(targetLayer, layers)`:
    scans for a guide whose `modulator.maps` includes this target, merges device+map+resolved field;
    forbids self-modulation; **first-match wins** (multi-modulator combine = future). Guide need NOT be
    visible to modulate (field is math).
  - `src/lib/fields/fieldRegistry.js` — `fieldForLayer(layer)` (chladni only), `canProduceField(layer)`.
- **Wiring:** `src/lib/useCanvas.js` calls `resolveModulationForTarget(layer, layers)` after the moiré
  block; non-null → `renderParams = {...renderParams, modulation: result}`; null → NO modulation key
  (byte-identity). Applies to both visible + hidden generate paths (shared renderParams).
- **UI:** `ModulatorDevice` in `src/components/shell/Inspector.jsx`, shown when `canProduceField(layer)`:
  FieldOverlay heatmap "waveform" display (140×140) + Offset/Shape/Steps device controls + Targets list
  (per-map Amount slider 0–3, Bipolar|Unipolar toggle, × unmap) + "Add target" dropdown (grainfield
  layers). All writes via `onUpdateLayer` (undo/autosave free). The old target-centric "Density guide"
  dropdown was REMOVED.
- `src/components/ui/ShapeCurve.jsx` — generic bend control; plots `shapeEase(x,shape)`, drag sets
  `shape∈[-1,1]`; mirrors `CurveEditor.jsx` interaction (CurveEditor itself untouched).
- DELETED (replaced): `src/lib/fields/resolveModulation.js` + `.test.js` (old target-centric resolver).
- Tests: `src/lib/fields/modulation.test.js` (13), `resolveModulationForTarget.test.js` (5).

---

## 3. Current state / verification

- **Full suite: 545 pass, 4 skipped** (`npx vitest run`).
- Lint clean except one PRE-EXISTING warning: `react-hooks/exhaustive-deps` on the p5-init effect in
  `useCanvas.js` (confirmed on HEAD via git stash — not ours; intentional `renderAll` omission).
- `npm run build` ✓ (only pre-existing >500kB chunk advisory).
- Visually confirmed via Playwright (dev server on :5173): heatmap overlay, GrainField density A/B,
  and the full Modulator device → map → Amount → canvas. Doc state restored after each.

### Working-tree changes (NOT committed; on `main`)
```
 M src/components/RightPanel.jsx          (slice 1: Field toggle + overlay)
 M src/components/shell/Inspector.jsx     (slice 2.5: ModulatorDevice; removed old dropdown)
 M src/lib/useCanvas.js                   (inject resolveModulationForTarget)
 M src/lib/patterns/GrainField.js         (weighted Lloyd; count→Float64Array)
 M src/lib/patterns/__tests__/GrainField.modulation.test.js
 M src/lib/fields/modulation.js           (transfer chain)
 M src/lib/fields/modulation.test.js
 D src/lib/fields/resolveModulation.js          (deleted)
 D src/lib/fields/resolveModulation.test.js     (deleted)
?? src/components/ui/ShapeCurve.jsx
?? src/lib/fields/ScalarField.js  ScalarField.test.js  chladniField.js  colormap.js
?? src/lib/fields/fieldRegistry.js  fieldRegistry.test.js
?? src/lib/fields/resolveModulationForTarget.js  resolveModulationForTarget.test.js
?? src/components/FieldOverlay.jsx
```
(Plus untracked `supabase/.temp/*` — unrelated, pre-existing.)

**Frozen core (import only, do NOT edit):** ScalarField.js, chladniField.js, colormap.js,
modulation.js, fieldRegistry.js, resolveModulationForTarget.js, GrainField.js, FieldOverlay.jsx.

---

## 4. How to verify quickly in a new session
```bash
cd generative-art-studio
npx vitest run src/lib/fields src/lib/patterns/__tests__ src/components   # modulation + consumers + UI
npm run build
# Visual: npm run dev → http://localhost:5173
#   layer1 → Chladni (set Mode m=2, n=1 for big lobes) = guide
#   layer2 → Grain Field = target
#   select Chladni → "Modulator" panel in Inspector → Add target "Pattern (Gn)" → raise Amount
#   ALWAYS restore the doc afterward (switch patterns back; unmap) and stop the dev server.
```
Playwright notes: screenshots land at repo root — move them to scratch and `rm -rf .playwright-mcp`.
The 2 console errors in-app (nested-`<button>` hydration in ParamGroup; Supabase 400 user_id=undefined)
are PRE-EXISTING, not ours.

---

## 5. Decisions locked (don't re-litigate)
- Modulation consumed at geometry-build time (NOT a ctx decorator) — SVG bypasses ctx.
- Binding is modulator-centric (guide owns device, maps out) — user chose this over target-centric.
- Slice-2.5 control set: Amount + Polarity + Shape + Steps.
- Field sampled in pre-symmetry BASE coords (mandatory for radial-symmetry coherence).
- Weighted-Lloyd density is intentionally gentle; mean-x shift is the test metric.
- Workflow: TDD (red→green per behavior, vertical slices) for pure core; subagents for separable
  integration/UI; user does NOT want the tested core touched by agents (import only).

---

## 6. Next options (pick up here)
1. **Commit** slices 1+2+2.5 — we're on `main`, so branch first (e.g. `feat/pattern-modulation`).
   Suggested commits: (a) field primitive + overlay, (b) GrainField density consumer, (c) LFO transfer
   chain + modulator-centric device UI.
2. **Round out the LFO** toward Ableton parity (independent, additive): Smooth + Jitter (field-level
   ops), Min/Max + Remote-control mode, click-to-map gesture, multi-modulator combine semantics, a
   master Depth. Spatial analogs of Rate/Phase = field Scale / u-v offset.
3. **Slice 3 — build-time warp** on vertex-list patterns only (Chladni, Topographic, FlowField);
   EXCLUDE ellipse/rect patterns until they have a tessellation path (anchor+size shapes can't warp via
   vertex displacement). Reuse `sampleGradient` for the displacement vector field.
4. **More consumers** of the density channel (hatch patterns: FlowHatch, RadialEtch, PhyllotaxisDash).
5. **Distance-transform adapter** so mark/curve patterns (Voronoi, Hilbert, Spiral) can also be guides
   (`fieldForLayer` currently chladni-only).
6. **3D surface preview** — the user's idea: render `ScalarField.data` as a NURBS-like height mesh in a
   future 3D view (would need three.js / r3f added).
- Reconcile with existing `src/lib/variableWeight.js` (overlaps a future "weight" channel).

---

## 7. Persistent memory
A condensed version of this lives at
`~/.claude/projects/.../memory/project_pattern_modulation.md` (auto-loaded each session via MEMORY.md).
This file is the fuller handoff.
```
