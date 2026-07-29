# Per-glyph footprint — grilled decisions (2026-07-29)

The fix deferred as "undecided, main thread" in
`docs/motif-hold-and-pitch-decisions.md` §9 / §10: a glyph's collision footprint
is a circle centred on its `root`, so a glyph whose art hangs to one side
reserves a large empty crescent on the opposite side and caps neighbours it is
nowhere near touching.

**Status: GRILLED AND LOCKED.** All decisions ruled by Majed 2026-07-29. This is
the spec of record for the build. Nothing here is built.

---

## 1. The measurement

All 62 built-in glyphs, flattened through `flattenPathD` (the same tokenizer
`glyphBounds.js` uses, so curves contribute their true swept extent).
`scripts/measureGlyphFootprints.mjs`.

| ratio | median over 62 glyphs |
|---|---|
| **root disc / tight circle** | **3.42** — and exactly **4.00** for all 59 vector built-ins |
| **tight circle / convex hull** | **1.38** |
| min-area OBB / convex hull | 1.21 |
| aspect ratio (min-area OBB) | **1.00** |
| hull vertices | 39 (max 130), from 171 raw points (max 728) |

Two findings decide most of this document.

**The 4.00 is structural, not a leaf quirk.** Every vector built-in carries
`root` = bbox bottom-center, so `rootRadius = 2 × tightRadius` for anything
roughly centred in its box, so the area ratio is exactly 4. §1a of the `hold`
doc measured this on the leaf; it is the universal case across the whole
imported library.

**The glyphs are round.** Median aspect 1.00; only 5 of 62 exceed 2.0× on
circle-vs-hull (`slice43` 3.00, `diamond` 2.51, `slice42` 2.32, `leaf` 2.23,
`slice76` 2.20). For 57 of 62 glyphs the circle already *is* the shape — the
waste is centring, not shape.

> ⚠️ The script also prints an `ink` column (`polyArea` per subpath). It is
> meaningless for open stroke paths — `slice33` reads 12.21× — and no decision
> here rests on it. Quote `root/MEC`, `MEC/hull` and `aspect` only.

---

## 2. Locked decisions

| # | Decision | Verdict |
|---|---|---|
| 1 | **Does the offset rotate with the glyph?** | **Yes** — ruled by Majed up front. The reserve centre is `P + s·Rot(θ)·footprintCenter`, `s = radius / viewRadius`. `rotation` is fully resolved at `placementEngine.js:453–467` (base orientation + `rotationOffset` + `rotationRandom` + jitter) **before** the sizing branch at `:575`, so this needs **no pipeline reorder**. |
| 1b | **What about the per-glyph angle override (#137), which lands after packing?** | **A for the packer, B for every downstream reader.** `placed` keeps the pack-time disc — determinism and ADR-0005 untouched. `overrides.js` writes the recomputed world footprint centre alongside `rotation`, exactly as it already recomputes `drawnRadius` alongside `scale` (`:297`, with the same justification: leaving it stale misreports the glyph the moment the control is dragged). The overlay and `straddleCheck` therefore read the post-override disc. **Accepted cost:** an angle override can now push art into space nobody reserved *and* vacate space it did reserve. It relayouts nothing — the packer has already run — it just overlaps, visibly. This is the same rule `overrides.js:16–21` already states for the scale override. |
| 2 | **What defines the footprint?** | **Minimal enclosing circle (Welzl) over the flattened point set. Derived, never authored.** Emitted by the generator that already produces `vectorMotifsGlyphs.js`, and by `importMotif.js` for user SVGs, so it is derived data on the glyph record rather than a field anyone must remember to fill. Rejected: bbox centre + half-diagonal (can *exceed* `viewRadius` on a root-straddling glyph, so it would make some documents worse with no way to predict which — and §1a's 4.0× headline was measured against the tight circumcircle, so bbox would ship a number the doc no longer claims). Rejected: hand-authoring (62 built-ins by hand, and nothing at all for user imports). |
| 2b | **`footprintRadius` vs `viewRadius`** | **Different numbers, different jobs, never substituted.** `viewRadius` stays the `placementMatrix` scale divisor (`instancing.js:77`, `s = radius / viewRadius`). `footprintRadius` is the packer's reserve. |
| 3 | **Migration** | **Version-gated pin.** `SCHEMA_VERSION → 2`; `migrateLayer` stamps `sizing.footprint: 'root'` on anything arriving at v ≤ 1; new layers default `'tight'`. Driven by `migration.js`'s own locked policy — *"NEVER reset-to-default — that silently changes fabrication intent"* — which is squarely on point: a motif layer resizing every glyph on load **is** a change of fabrication intent, on a machine that cuts material. Unlike `hold`, there is no absent-⇒-byte-identical fallback available: the change lives in the glyph library, which is code, not document state. |
| 3b | ~~**Doesn't that cost two sizing laws?**~~ | ⚠️ **REOPENED AND CORRECTED — see decision 7b.** Originally ruled *"two data values, not two code paths"*, on the grounds that the legacy law is the `fc = (0,0)`, `fr = viewRadius` special case of the new one. **True algebraically, false numerically**, and ADR-0005 is a byte-identity contract. The corrected ruling is 7b: an explicit dispatch on `sizing.footprint`, two modules. |
| 4 | **Circle, capsule, or the actual outline?** | **Circle now; `footprintDiscs[]` (union of 2–3 circles) is the upgrade path, not a polygon.** The shape upgrade is a **1.38× median** refinement sitting behind a **4.0×** fix. A polygon reserve is not computationally intractable — closed-form `s` becomes a 1-D root-find with a GJK probe, and hull verts are cheap at median 39 — but it deletes `placement.radius`, the scalar read by `instancing.js:77`, `straddleCheck.js`, the whole overlay, and `hostRadius` containment (#146, stated as a *distance* rule against a radius). A union of discs keeps every primitive circular, so the clearance math, the overlay rings and all four rulings above survive verbatim. |
| 4b | **Non-convex outlines have an aesthetic failure mode too** | Exact outlines let a 9-pointed star **interlock** with its neighbour — points nesting into notches, glyphs jigsawed together. Geometrically correct, and for a plotter/laser pattern tool almost certainly unwanted. A hull refuses it; the true outline invites it. |
| 5 | **How does `hostRadius` containment (#146) restate?** | **Against the tight disc — and the boundary term with it.** Today `R ≤ margin × (hostRadius − d)` is a one-line cap because `d = \|centre − anchor\|` is already fixed by the time sizing runs. With an offset reserve the disc **inflates and drifts simultaneously**, so `d` becomes a function of `R` and containment becomes `\|v + R·k·û\| + R·m ≤ H` — a second quadratic. Ruled A because **this is not a safety tradeoff**: the root disc and the tight disc both fully contain the art, so *"disc inside container ⇒ art inside container"* holds either way. A is the same guarantee with less waste, and glyphs inside cells get up to **2× bigger in radius**. |
| 5b | **Why not keep the hard tier conservative?** | Two reasons. It would leave the 4× bug unfixed in **the one place with no visual explanation** — decision 17 exists precisely because a girih cell is invisible on canvas, so the overlay would end up drawing a `hostRadius` ring next to a tight reserve ring nowhere near it, i.e. a cap it cannot justify. And it creates the genuine mixed model: offset reserve for neighbours, root-centred reserve for host and boundary — two footprints for one glyph inside one sizing branch. |
| 5c | **New behaviour to expect** | A glyph in a tight cell may now fit at one rotation and not another, since the offset direction is `Rot(θ)·fc`. Correct, and impossible before — rotation was irrelevant to containment when the disc was root-centred. The `hostCap <= 0 → reject 'no-fit'` guard restates as "no positive `R` satisfies the inequality → reject". |
| 6 | **Does `placed` gain a back-reference to the glyph owning each disc?** | **No — `placed` stays `{x, y, r}`.** The premise for adding `anchorId` was that offset discs make the captor harder to identify; the measurement says the opposite. Today the captor is a large disc centred on some *other* anchor with its ink off to one side, so "which glyph is capping me?" is ambiguous on canvas. After the fix the captor disc **hugs the captor's ink**. Adding identity also pulls toward a leader line, which #190 already rejected on mark-count grounds (it doubles elements per frame of a `hold` drag, on a memo that re-runs every frame). Accepted narrow cost: with `hold > 0` glyphs overlap by design, so a captor disc can sit over two glyphs' ink — the case where "which one exactly" matters least. |
| 6b | **Does `capBy` change meaning?** | **No.** It still names what bound the radius the user sees (decision 15b). Only how the winner is *found* changes: today it is the obstacle minimising `d − r`, one scalar comparison; now it is the obstacle yielding the smallest max-`R`. |
| 6c | **Does the overlay's tangency link survive?** | **Yes, exactly.** `AnchorGhostOverlay.jsx:129–137` links captor to glyph by geometry rather than a leader line, resting on `packedRadius = margin × (d − r_obstacle)`. The new law's binding condition is `\|a + s·u\| = s·fr + rⱼ` — distance between centres equals sum of radii, which **is** external tangency by definition. Decision 16's mechanism is preserved verbatim and gets *better*, since the captor disc now lands on the ink it belongs to. |
| 6d | **⚠️ Where `margin` enters, or 6c is false** | **Solve for the tangency maximum, THEN scale by `margin`** — exactly what `capOf` does today. The tempting alternative, inflating `fr → fr/margin` inside the solve, yields a different number, because an inflated reserve also sits further out (the offset scales with `R` too). Solve-then-scale is the faithful port; inflate-then-solve is not. |
| 7 | **How is the quadratic root selected?** | **Stable root pair, no branch, take the smallest strictly-positive root.** `q = −½(B + sgn(B)·√(B²−4AC))`; the two roots are `q/A` and `C/q`. As `A → 0` the `q/A` root goes to `Infinity` and drops out of the minimum on its own — the same idiom `emptyCircle.js:119–125` already uses, seeding with `Infinity` and relying on `NaN < x` being false so bad values never displace good ones. **Rejected:** branching on `A === 0` (noise-floor-zero for half the library) and an epsilon branch (a tuned constant on the determinism-critical path). Taking the min over *positive* roots rather than asserting which root is physical is deliberate: it costs nothing and means the 2 sign-ambiguous glyphs can only produce a conservative answer, never a wrong one. Acceptance is a numeric property test over all 62 real glyphs, not a proof. |
| 7b | **Where does the solve live?** ⚠️ *corrects 3b* | **A sibling module, dispatched on `sizing.footprint`.** `emptyCircle.js` stays the pure glyph-agnostic clearance primitive and keeps serving `'root'` layers byte-identically; the offset solve lives next to it. Forced by the correction below — since `'root'` must run today's expressions **literally**, `emptyCircle.js` has to survive unchanged regardless, so absorbing the glyph into it would mean absorbing it into a module that still has to expose the un-absorbed path. Also keeps `largestEmptyCircleRadius` where §4a pinned it: *"must not move. Required property."* |

### ⚠️ The correction to 3b, stated plainly

3b claimed legacy is the `fc = (0,0)` special case of the new law, so one code
path serves both. Substituting gives

```
R = √(rⱼ² + |a|² − rⱼ²) − rⱼ        algebraically  |a| − rⱼ
```

but `rⱼ² + |a|² − rⱼ²` does not return `|a|²` bit-for-bit — the add-then-subtract
eats mantissa whenever `rⱼ > |a|` — and the trailing `− rⱼ` cancels
catastrophically on top. Today's code also uses `Math.hypot`, which is
deliberately **not** `√(dx² + dy²)` bit-for-bit.

**ADR-0005 and §4a are byte-identity contracts, not algebraic ones.** A `'root'`
layer therefore needs an explicit dispatch that runs today's code literally.
3b's intent survives — no duplicated *logic* — but its letter was wrong.

---

## 3. The solve

Reserve centre `P + s·u` where `u = Rot(θ)·fc`, reserve radius `s·fr`,
`s = R / viewRadius`. Against a committed disc `(cⱼ, rⱼ)`, with `a = P − cⱼ`:

```
|a + s·u| ≥ s·fr + rⱼ
⇒ A·s² + B·s + C ≥ 0,   A = |fc|² − fr²
                        B = 2(a·u − rⱼ·fr)
                        C = |a|² − rⱼ²
```

Closed-form, single-pass, greedy preserved — one quadratic per obstacle where
there is one division today. Rect boundary is linear in `s` per edge.
`hostRadius` containment is a second quadratic (decision 5).

### The degeneracy is the typical case, not an edge case

`A` normalised by `fr²`, across all 62 built-ins:

```
|fc|/fr :  min 0.0000   median 0.9481   max 1.0000

|A|/fr² < 0.01  (near-degenerate)    : 28 / 62
|A|/fr² < 1e-9  (exactly degenerate) :  4 / 62   leaf, slice17, slice95, slice91
A > 0  (root outside its own MEC)    :  2 / 62   both at |A|/fr² ≈ 0 — sign is noise
```

The **median glyph sits 5% from degenerate**; nearly half the library is within
1%. Structural, same cause as the 4.00: `root` = bbox bottom-center sits
essentially **on** the minimal enclosing circle, because the bottom edge is one
of the extreme points determining it. So `|fc| ≈ fr` almost universally, by
construction.

The textbook root `(−B ± √(B²−4AC)) / 2A` therefore divides by a near-zero for
28 of 62 glyphs and by exactly zero for 4. Hence decision 7.

---

## 4. The overlay

### 4a. The two rings nest, tangent at the anchor — decision 14 survives

Both rings move to the offset centre; that is forced, they must match the
reserve. The consequence is that solid (`packedRadius`) and dashed
(`drawnRadius`) stop being concentric **with each other**, since a larger drawn
radius also means a larger offset.

They belong to a homothety about the anchor — centre `P + (R/viewRadius)·Rot(θ)·fc`
and radius `R·fr/viewRadius` **both scale linearly from `P`**. So:

```
packed ring INSIDE drawn ring  ⟺  |fc| ≤ fr   — 60 of 62 glyphs (median 0.948)
internally TANGENT AT ANCHOR   ⟺  |fc| = fr   — the 4 degenerate ones, incl. leaf
```

The rings nest, and for the degenerate glyphs both circles literally pass
through the anchor and grow away from it. Truer than today's concentric pair —
the glyph *does* grow away from the line it is rooted on. Decision 14's core
property is untouched: at `hold 0` the two coincide exactly, and separating as
you drag is still the feature.

Unaffected: the `hostRadius` ring (decision 17) is the container, still
anchor-centred; the overlay's faint **anchor ghost dots** already mark the
anchor independently, so nothing new is needed to keep it visible once the rings
drift off it.

### 4b. Decision 8 — rejected anchors get the offset too

| # | Decision | Verdict |
|---|---|---|
| 8 | **Do rejected anchors' dotted rings (decision 20) get the offset?** | **Yes — `Rejection` gains `rotation`.** `Rejection` is `{anchorId, reason, x?, y?, wantedRadius?}` (`placementEngine.js:228`), so the overlay currently *cannot* offset those rings. Rotation is resolved at `:453–467`, above every rejection push site, so it is a free field at the source. Decision 20 exists so *"the gap-20 mystery becomes four visible circles"* — under the alternative those four rings would sit in the wrong place, overlapping the survivors' territory, while every other ring on screen is offset: the mark that exists to explain a mystery would be adding one. Precedent is decision 15 — a transient render structure, so the cost is **test-golden churn, not determinism**. `junction-skip` and `rest` rejections (`:416`/`:426`) carry no coordinates and draw nothing; untouched. |

---

**Grill complete.** Decisions 1–8 ruled by Majed 2026-07-29. No open questions.
