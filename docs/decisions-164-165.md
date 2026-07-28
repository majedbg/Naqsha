# #164 and #165 — investigation, options, recommendations

Measured against `main` @ `3297332`, canvas 800×600, spacing 24, seed 7. Every
placement count is `placements.length` (accepted placements), never
`placementStats`. Scratch measurement scripts are preserved outside the repo;
nothing here is committed as code.

---

# #164 — glyph orientation on closed paths

## The ticket's premise needs one correction

#164 says outward-from-centroid is "clearly right" on iso-contours and only
questionable on self-intersecting figures. **Measured, it is the other way
round.** The rule is discontinuous on *any* closed path that is not star-shaped
about its own centroid, and topographic contours are the worst case found:

| host | anchors | rule-induced 180° flips | rate |
|---|---|---|---|
| **topographic** (defaults) | 554 | **47** | **8.5%** |
| topographic (levels 6) | 206 | 16 | 7.8% |
| lissajous 3/2 (defaults) | 1834 | 24 | 1.3% |
| lissajous 3/4 | 2546 | 24 | 0.9% |
| lissajous 5/4 | 3262 | 24 | 0.7% |
| lissajous 1/1 (a simple ellipse) | 754 | **0** | 0% |
| lissajous 2/1 | 1115 | 0 | 0% |

A "rule-induced flip" is a **normal** that jumps more than 90° between
consecutive samples **while the tangent does not** — i.e. the `outwardNormal`
branch swapping, not the curve doubling back. Tangent-driven jumps are counted
separately and excluded, so this is the rule's own contribution.

**The decisive measurement.** Step 3px along each anchor's normal and test
whether you left the polygon:

| host | anchors | current rule points OUT | proposed rule points OUT |
|---|---|---|---|
| topographic rings | 554 | **505 (91%)** | **554 (100%)** |
| lissajous 1/1 ellipse | 754 | 754 (100%) | 754 (100%) |

So on the case the ticket calls clearly right, the current rule points the glyph
**into the hill** at 49 of 554 anchors. It is correct only where the ring is
convex; 46 of 50 default topographic rings carry at least one reversal.

The Lissajous story in the ticket is confirmed exactly: signed area −1.295e−9
against `EPS = 1e-6`, so `polygonCentroid` does take its vertex-average
fallback, landing on (400.12, 300.00) — the figure's centre. Stable, not
fragile: sweeping `phase` from 0 to 0.5 never lifts |area| above ~2e−9, so the
fallback fires reliably rather than sitting near a cliff. The 24 flips it
produces are **perfectly periodic** (gaps of 73/80/73/80… samples) — a regular
ring of reversed glyphs, not noise.

Closure changes rotation and not position, as the ticket says: max positional
delta 1.66px over 1834 anchors, while **55%** of anchors change orientation.

## This is really TWO decisions, and they can get different answers

The defect splits cleanly along the degenerate/non-degenerate line, and the two
halves are independent:

- **Correctness.** On a ring with a real area (topographic, and any future
  simple closed host), the current rule points 9% of glyphs **into** the shape.
  That is a bug by any reading.
- **Aesthetics.** On a degenerate-area figure (every Lissajous measured), there
  is no "outward" to be right about. The current radial-from-centre look is an
  accident of the fallback — but it is also a coherent look, and 24 of its 1834
  glyphs being reversed is the price of it. Changing it is a taste call, not a
  fix.

Bundling them into one option would force a taste call to ride on a bug fix.

## The rule, and the two scopes it can be applied at

**Proposed rule.** `normal = tangent + sign · π/2`, where `sign` is decided
**once per path** from the polygon's winding (the sign of the signed area);
degenerate area ⇒ `+π/2`, which is exactly today's open-path rule.

- Continuous by construction — the normal is the tangent plus a per-path
  constant, so it can only jump where the curve itself jumps. **Zero**
  rule-induced flips on every host measured.
- On a simple closed polygon it **is** the outward normal — 100% outward on
  topographic, versus 91% today.
- Winding-robust, like today's rule: reversing the point order adds π to the
  tangent and flips the area's sign, and the two cancel.
- Identical to today's answer wherever today's answer is right: the convex
  ellipse case changes **0 of 754** anchors.

That answers all three of the ticket's questions with no new classification step:

1. *Is outward-from-centroid the intended rule for all closed paths?* — No.
   Replace it with the winding-signed normal, which agrees with it on convex
   rings and fixes it elsewhere.
2. *What should a degenerate near-zero-area polygon do?* — Fall through to
   `tangent + π/2`. Under the proposed rule this is not a special case: a
   degenerate polygon simply has no winding to read.
3. *Should a self-intersecting closed path be treated as closed for
   orientation?* — The question dissolves. The proposed rule gives the same
   continuous answer either way, so nothing needs to detect self-intersection.

## Blast radius — FULL vs HYBRID

**HYBRID** applies the winding sign only when `|area| ≥ EPS`, and leaves a
degenerate polygon on today's radial-from-vertex-average rule untouched.
**FULL** applies it everywhere. All changes are exact 180° reversals; nothing
rotates partially, nothing moves.

| host | anchors | degenerate rings | **FULL** changed | **HYBRID** changed | HYBRID flips left |
|---|---|---|---|---|---|
| lissajous 3/2 (defaults) | 1834 | 1/1 | 962 (52%) | **0** | 24 |
| lissajous 3/4 | 2546 | 1/1 | 1210 (48%) | **0** | 24 |
| lissajous 5/4 | 3262 | 1/1 | 1574 (48%) | **0** | 24 |
| lissajous 2/1 | 1115 | 1/1 | 557 (50%) | **0** | 0 |
| lissajous 1/1 (ellipse) | 754 | 0/1 | 0 | **0** | 0 |
| topographic (defaults) | 554 | 0/50 | 49 (9%) | **49 (9%)** | **0** |
| topographic (levels 6) | 206 | 0/17 | 23 (11%) | **23 (11%)** | **0** |

Every Lissajous ring measured is degenerate, and no topographic ring is. So the
two scopes separate the decision perfectly:

- **HYBRID delivers 100% of the correctness fix at 49 anchors of blast radius
  instead of ~2,700.** Outwardness on topographic goes 91% → **100%** and
  rule-induced flips go 47 → **0**, identical to FULL.
- The only thing FULL adds on top is changing the Lissajous look — which is the
  aesthetic question, not the bug.

## Options

### Decision 1 — the correctness bug (non-degenerate closed rings)

| | Option | Effect |
|---|---|---|
| **1a** | **Winding-signed normal when `\|area\| ≥ EPS`** (recommended) | Topographic goes 91% → 100% outward, 47 flips → 0. Changes 49 of 554 anchors (9%) — precisely the ones currently pointing into the hill. Convex rings byte-identical. |
| 1b | Leave it | No churn. Glyphs keep pointing into the hill on 46 of 50 default topographic rings. |

**Recommendation: 1a.** It is a strict generalisation — identical wherever the
current rule is already correct, correct where it is not — and no existing test
locks the old behaviour (`anchors.test.js:97`'s winding guardrail uses a convex
square, where both rules agree, so it stays green).

### Decision 2 — the Lissajous look (degenerate-area figures)

Independent of Decision 1. See the two pictures.

| | Option | Effect |
|---|---|---|
| **2a** | **Keep today's radial-from-centre** (recommended) | 0 anchors change. Keeps the coherent "radiating from the centre" look. Keeps its 24 periodic reversed glyphs, clustered near the middle where the curve passes closest to the centre. |
| 2b | Extend the winding rule to degenerate figures too | 0 reversals — glyphs become a continuous comb along the curve. Reverses ~50% of glyphs on every existing Lissajous document. |

**Recommendation: 2a**, weakly — it is pure taste and it is your call. The
current look is defensible and free; 2b is cleaner but repaints every Lissajous
in the library. If you take 2b, note the 24 reversals it removes sit in the
middle of the figure, which is where they are least visible anyway.

Answering the ticket's three questions under **1a + 2a**:

1. *Is outward-from-centroid the intended rule for all closed paths?* — No, not
   for paths with a real area; the winding-signed normal replaces it there.
2. *What should a degenerate polygon do?* — Keep the vertex-average fallback
   (2a), or fall through to `tangent + π/2` (2b). Your call.
3. *Should a self-intersecting closed path be treated as closed for
   orientation?* — No separate answer needed, and no detection either. No host
   measured produces a genuinely self-intersecting **non-degenerate** closed
   path, so the winding sign is never asked to interpret one. If a future host
   does, that is when the question gets a real answer — and the rule degrades
   gracefully meanwhile, since it stays continuous either way.

## Pictures

`docs/decisions-164-165-figures/` — dark red ticks are glyph normals, orange
ticks are glyphs rotated 180° from their neighbour on a smooth stretch of curve.

- `topographic-levels6-current` (13 reversals) vs `-proposed` (0) — **this is
  Decision 1**, and the orange ticks are visibly pointing into the contour.
- `lissajous-default-3-2-current` (24 reversals, radial) vs `-proposed` (0,
  comb) — **this is Decision 2**, and it is a look, not a bug.

---

# #165 — girih tips land off-canvas

## Premise confirmed

| params | anchors | tips | crossings | edges | **tips placed** | crossings placed | closest tip |
|---|---|---|---|---|---|---|---|
| defaults | 794 | 24 | 146 | 624 | **0** | 134 | 53.0px off |
| density 2 | 208 | 20 | 36 | 152 | **0** | 24 | 36.2px off |
| density 8 | 3268 | 84 | 628 | 2556 | **0** | 478 | 37.5px off |
| contactAngle 30 | 794 | 24 | 146 | 624 | **0** | 134 | 53.0px off |
| contactAngle 80 | 814 | 20 | 146 | 648 | **0** | 134 | 40.7px off |
| irregularity 0.9 | 794 | 24 | 146 | 624 | **0** | 132 | 46.5px off |

Zero tips placed at every params set sampled; 0 of 24 tips inside the canvas at
defaults, where all 24 sit at exactly 53.0px beyond the sheet.

The sweep samples `density`, `contactAngle`, `irregularity` and `render`, but
not `tiling` — so it is corroboration, not proof. The universal claim rests on
the ticket's structural argument, which is tiling-independent: the crop keeps an
edge when **either** endpoint is inside a box 10% larger than the canvas, so a
vertex that were itself in bounds would keep every incident edge and could not
be degree-1. A degree-1 vertex is therefore necessarily outside that box, and
the box is larger than the canvas. That holds for any tiling.

## Option 2 is not actually an option

Relaxing the placement boundary for `tip` anchors does place them — and every
one lands where nobody can see it:

| boundary relaxed by | tips placed | **centres on-canvas** |
|---|---|---|
| +0px | 0 | 0 |
| +40px | 0 | 0 |
| +60px | **24** | **0** |
| +100px | 24 | **0** |

The tips are 53px outside the sheet, so a glyph centred on one is 53px outside
the sheet. On screen it is invisible; on a plotter or laser it is off the
material. This converts "0 glyphs placed" into "24 glyphs placed where they
cannot be seen", which reads as success and is not. **Rules Option 2 out.**

## Option 1 measured exactly

The crop is monotone (a tighter box keeps a subset of the edges a looser one
keeps), so re-filtering the stashed graph is byte-identical to re-running the
pattern at that crop factor.

| crop | surviving edges | tips | tips on-canvas | **tips placed** | **placed radius** (layer size 12) | painted extent from centre |
|---|---|---|---|---|---|---|
| **0.55 (shipped)** | 624 | 24 | 0 | 0 | — | 450, 353 — bleeds 50/53px past the sheet |
| 0.52 | 584 | 40 | 0 | 0 | — | 432, 318 |
| 0.50 | 584 | 40 | 0 | 0 | — | 432, 318 |
| 0.48 | 508 | 32 | 20 | 16 | **2.7px** (22% of intended) | 406, 300 |
| **0.46** | 460 | 36 | 36 | **36** | **12.0px** (full size) | 375, 282 |
| 0.44 | 424 | 20 | 20 | 20 | 12.0px | 375, 282 |
| 0.40 | 348 | 48 | 48 | 48 | 12.0px | 353, 256 |

Two things this settles:

- **0.48 looks like the sweet spot and is not.** Girih still reaches the sheet
  edge (406×300 against a 400×300 half-extent), but the 16 tips that place sit
  3px from the boundary, and proportional sizing shrinks them to **2.7px** — 22%
  of the intended glyph. They are specks.
- **0.46 is the first crop factor that delivers visible tip glyphs**: all 36
  place at full 12.0px size, 18px clear of the sheet edge.

The cost at 0.46, measured: girih loses **26% of its straps** (624 → 460 edges),
and its painted extent retracts from *bleeding 50px/53px past the sheet* to
*sitting 25px/18px inside it*. That converts girih from a full-bleed field into
an inset panel with a blank border on all four sides — which is precisely the
"designed border" the PRD says the ragged crop exists to avoid.

Worth noting: the tip count is wildly non-monotonic across the sweep (24, 40,
40, 32, 36, 20, 48, 28). Which vertices end up degree-1 depends on exactly where
the cut lands, so the tip ring is an artifact of the cut and not a stable
feature of the pattern — evidence for the PRD's framing, and a caution that any
chosen crop factor is tuned to one canvas aspect.

## Options

| | Option | Effect |
|---|---|---|
| 1 | **Narrow the crop to 0.46** | 36 tips place at full size. Costs 26% of girih's straps and removes its full bleed, in every existing document. |
| 2 | Relax the placement boundary for `tip` | ~~Ruled out~~ — places 24 glyphs entirely off the sheet. |
| **3** | **Accept it as a structural role that places nothing** (recommended) | No change to any shipping pattern or document. Girih Tips remains offered and honest — it just has nothing on-canvas to adorn. |

**Recommendation: 3**, with the caveat that it is the option PRD #143 set out to
remove, so it is a genuine trade rather than a free win.

The reason to prefer it: Option 1's price is not "girih looks slightly
different" — it is a quarter of the straps and the loss of full bleed, applied
retroactively to every document, to gain 36 glyphs on a ring that only exists
because of where the cut fell. Girih already places **134 crossings and 624
edge anchors**; Tips is the smallest of its three roles and the only one whose
positions are an artifact.

If you would rather have the tips, **0.46 is the number** — not 0.48.

### A fourth option, if neither appeals

Make the crop factor a **girih param** (default 0.55, unchanged). Existing
documents are byte-identical, and a maker who wants placeable tips dials the
crop in and accepts the tighter field as a deliberate choice. It costs a param
in the Inspector and turns a global decision into a per-document one.
