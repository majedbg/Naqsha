# P.2 "Shape" pattern ports — build log & feedback

Porting 5 patterns from *Generative Design* (Bohnacker et al.) P.2 Shape into naqsha as
slider-driven, seed-deterministic, vector-output generators. Built one at a time, each as a
new tab. Test feedback is captured here per-pattern and **deferred** — we finish all five
before revisiting feedback.

The five (in build order):
1. **Module Grid** — grid of parametric line-modules incl. Diamond, with scale/overflow (P.2.1.x family)
2. **(NEW non-grid pattern)** — replaces Truchet (dropped: too grid-similar to #1). Identity TBD.
3. **Moiré Fields** — interference of two line/ring layers (P_2_1_5_01)
4. **Circle Packing** — largest-fit outline packing + neighbor links (P_2_2_5_01)
5. **Dendrite (DLA)** — aggregative branching skeleton (re-authored from P_2_2_4)

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

## 2. New non-grid pattern (replaces Truchet)
_Truchet dropped — too similar to Module Grid (both tile-grids). Needs a mechanically distinct,
non-grid pattern. Identity TBD (grill before build)._

### Test feedback
_(none yet)_

---

## 3. Moiré Fields
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_

---

## 4. Circle Packing
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_

---

## 5. Dendrite (DLA)
_Spec TBD (grill before build)._

### Test feedback
_(none yet)_
