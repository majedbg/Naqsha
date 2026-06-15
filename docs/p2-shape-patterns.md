# P.2 "Shape" pattern ports — build log & feedback

Porting 5 patterns from *Generative Design* (Bohnacker et al.) P.2 Shape into naqsha as
slider-driven, seed-deterministic, vector-output generators. Built one at a time, each as a
new tab. Test feedback is captured here per-pattern and **deferred** — we finish all five
before revisiting feedback.

The five (in build order):
1. **Module Grid** — grid of parametric line-modules incl. Diamond, with scale/overflow ✅ built+enhanced
2. **Islamic Star Tessellation (Girih)** — Hankin PIC, 2 tilings (8★, 12★) ✅ built + visually verified
3. **Topographic Contours** — nested iso-contour loops of a noise field ✅ built
4. **Differential Growth** — self-avoiding curve folding into coral/meanders ✅ built
5. **Moiré Fields** — interference of two line/ring layers (P_2_1_5_01)
6. **Circle Packing** — largest-fit outline packing + neighbor links (P_2_2_5_01)
7. **Dendrite (DLA)** — aggregative branching skeleton (re-authored from P_2_2_4)

Build order: easy-first → Topographic, Differential Growth, then Girih; then Moiré/Packing/Dendrite.
(Truchet dropped — too grid-similar to #1.)

Hard constraints for every port: autonomous (no mouse-drawing), seed-deterministic via
`mulberry32`/`ctx.randomSeed`, output is strokeable vector (lines/arcs/outlines) in mm for
the plotter/cutter. PNG-only source sketches are re-authored, never copied.

---

## 1. Module Grid

**Status:** building.

### Locked spec (from grill, 2026-06-14)
- **Scope:** one unified pattern; cell-module selector with 4 motifs — Side Sweep
  (P_2_1_3_02), Converging Fan (P_2_1_3_03), Nested Rings (P_2_1_3_01), Chevron (P_2_1_1_03).
  Stroke-cap (P_2_1_1) and per-cell jitter (P_2_1_2) folded in as universal modifiers.
- **Module selector:** `iconselect` + 4 new hairline glyphs (`sweep`/`fan`/`rings`/`chevron`)
  authored in `paramIcons.jsx` GLYPHS.
- **Grid sizing:** `plot2d` "Grid X × Y", keys `tilesX`/`tilesY`, integer-snapped 2–40.
- **Variation/seed:** one layer seed drives all per-cell randomness. Rotation selector:
  Seeded (random per cell) / Gradient (angle ramps across grid) / Aligned (uniform).
- **Transform tail:** **omit** `SYMMETRY_PARAM`; keep `START_ANGLE_PARAM` + `OFFSET_PAD_PARAM`.
  Draw grid centered-at-origin; call `applySymmetryDraw` with `symmetry`=1.
- **Tier:** Guest-accessible (add `modulegrid` to guest allow-list in `tierLimits`).
- **Minor defaults:** strokeCap Select (round/square/project); lineCount 1–40 (def 10);
  jitter 0–1 (def 0); strokeWeight 0.3–3 (def 0.6). Randomize-roll on for numerics, off for
  the categorical selectors (module, rotateMode, strokeCap).

### Enhancements (grill 2026-06-14, post first build)
- **5th module — Diamond:** nested concentric rhombi (sibling to Nested Rings); own knobs
  `diamondAspect` (tall↔wide) + `diamondNesting` (spacing curve). New `diamond` glyph.
- **Scale/overflow:** universal `scale` (0.1–3× cell, def 1) + `scaleMode` select
  (Uniform / Gradient / Seeded), mirroring the rotation model. **No clipping** — modules draw
  freely into neighbor cells + off-canvas; that overlap is the point (overlap-check flags crossings).
- **Per-module knobs** (shown only for the active module): Side Sweep → `sweepCurve`;
  Fan → `fanSpread` + `fanApex`; Nested Rings → `ringEccentricity` + `ringSpacing`;
  Chevron → `chevronDepth`; Diamond → `diamondAspect` + `diamondNesting`. `scale`/`lineCount`/
  `strokeCap`/`strokeWeight` stay universal.
- **Framework:** new render-time `showIf(params)` on param defs (absent = always show, so all
  other patterns unchanged). Gate index still computed over the FULL def list so the protected
  gate-counting loop + guest gating are untouched; hidden params keep their state values.

### Test feedback
_(none yet — fill in after testing)_

---

## 2. Islamic Star Tessellation (Girih)
**Status:** built (514 tests green; **visually verified via rendered PNGs** — the required gate for this one,
per advisor: green tests ≠ correct geometry). Hankin polygons-in-contact (Kaplan 2005).

### Locked spec (grill 2026-06-14)
- Method: Hankin PIC. Per tile, rays leave edge-midpoints at ±contactAngle, truncated where they meet → stars+polygons.
- Tilings SHIPPED: Square→8★ (khatim), Hex→12★. Render select: Skeleton / Interlaced (default Interlaced —
  per-strand over/under weave via BFS 2-coloring).
- Controls: tiling · contactAngle (default **60**; 50 was too shallow — square8 stars didn't read) · density ·
  render · bandWidth (showIf interlaced) · irregularity (seeded hand-wobble, default 0) · strokeWeight.
- No symmetry control (intrinsically symmetric); Start Angle + Offset kept. Seed drives only irregularity. Guest.

### Known issues / deferred (test feedback)
- **Deferred tilings:** Hex 4.6.12 (filler placement gaps) + Decagonal 10★ (overlapping tiling) — both attempted,
  honestly dropped to avoid shipping broken geometry. Revisit if wanted.
- hex12 junctions have minor cosmetic "tangles" at the 6★ triangle-filler knots (stars correct; weave messy there).
  Slightly more visible at the new default angle 60 than at 50. Candidate fix: drop strapwork on triangle fillers.
- Single global contactAngle default is a compromise; per-tiling default angles would be cleaner. DEFERRED.

### Test feedback
_(none yet — fill in after testing)_

---

## 3. Topographic Contours
**Status:** built (489 tests green). Marching-squares iso-contours of an fBm noise field.

### Locked spec (grill 2026-06-14)
- Field: fBm Perlin noise (`noiseSeed`) — controls Zoom/Feature Size, Detail (octaves), Domain Warp.
- Contours: marching squares, segment-linked into polylines (~1 stroke/level). Levels (count) +
  Level Bias (+1 → toward valleys/low, −1 → toward peaks/high, 0 even).
- Resolution slider (smoothness vs compute); Stroke Weight.
- No symmetry (kept organic, parity w/ Module Grid); Start Angle + Offset kept. Guest-accessible.

### Test feedback
_(none yet — fill in after testing)_

---

## 4. Differential Growth
**Status:** built (500 tests green). Self-avoiding curve sim → brain-coral / fingerprint meanders.

### Locked spec (grill 2026-06-14)
- Topology select: Closed Loop (coral) / Open Line (meander), default Closed.
- Sim: attraction + repulsion (self-avoidance, spatial-hash O(n)) + smoothing; edges split on stretch.
  Deterministic, bounded (~260 rounds). Perf ~119ms default, ~300ms at maxNodes=3000.
- Controls: maxNodes (convolution) · repulsionRadius (spacing) · attraction · repulsion · smoothing ·
  growthStyle (uniform/curvature/scattered) · strokeWeight.
- KEEPS full symmetry tail (like Spiral/Phyllotaxis) → symmetry≥2 = radial-coral bloom. Guest-accessible.

### Test feedback
_(none yet — fill in after testing)_

---

## 5. Moiré Fields
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_

---

## 6. Circle Packing
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_

---

## 7. Dendrite (DLA)
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_
