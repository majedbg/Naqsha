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

| ratio | over 62 glyphs |
|---|---|
| **root disc / tight circle** | median **3.42**, p75 **4.00**, max **4.00** (min 1.00) |
| **tight circle / convex hull** | median **1.38** |
| min-area OBB / convex hull | median 1.21 |
| aspect ratio (min-area OBB) | median **1.00** |
| hull vertices | median 39 (max 130), from 171 raw points (max 728) |

Two findings decide most of this document.

**4.00 is a structural ceiling, and a quarter of the library sits on it.**
`rootRadius / tightRadius` cannot exceed 2 (triangle inequality), so the area
ratio cannot exceed 4 — and it *equals* 4 exactly when the root lies **on** its
own minimal enclosing circle with the farthest point antipodal. The 58 vector
built-ins root at bbox bottom-center, which puts them at or near that
configuration by construction. **24 of 62 glyphs are at 4.00 to within 0.005**;
the whole top quartile is pinned there; the median is 3.42.

> ⚠️ **This corrects an earlier reading.** The first pass reported "exactly 4.00
> for all 59 vector built-ins", taken off a top-12 table that was **sorted
> descending by that very ratio** — so it showed the ceiling and was read as the
> population. Independently re-derived above. Also: there are **58** vector
> built-ins, not 59; the 62nd is hand-authored `diamond`, which has no `root` and
> sits at 1.00. No decision moves — decisions 2 and 4 rest on MEC/hull 1.38 and
> aspect 1.00, decision 5's "2× in radius" was always a ceiling claim, and §3's
> degeneracy table is independent and reproduces verbatim.

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

---

## 5. The build, exactly

File by file, in dependency order. Every line reference below was read in the
committed tree on `feat/curved-leaf-glyph` at `3be932e`, not quoted from
memory — see §8 for the citations in the shipped code and in §2 above that have
drifted since they were written.

Two names are used throughout:

```
fc   glyph.footprintCenter   {x,y} in the glyph's LOCAL frame, relative to `root`
fr   glyph.footprintRadius   scalar, same local units as `viewRadius`
u    Rot(θ)·fc               fc turned into world orientation by the placement's rotation
s    R / viewRadius          the placementMatrix scale (instancing.js:77) — unchanged
```

The reserve is the disc `(P + s·u, s·fr)`. At `fc = (0,0)`, `fr = viewRadius`
that is `(P, R)`, today's disc — algebraically, and **not** numerically, which
is the whole content of the correction to 3b.

### 5a. `src/lib/motif/minEnclosingCircle.js` — NEW, pure, no DOM

Welzl's minimal enclosing circle over a point list. Everything downstream of it
is derived data, so this is the only place the definition of "tight" lives.

```js
/** @returns {{x:number,y:number,r:number}|null} null for fewer than 1 point. */
export function minEnclosingCircle(points) { /* move-to-front Welzl */ }
```

A working, already-validated implementation exists at
`scripts/measureGlyphFootprints.mjs:17-46` (`dist` / `inCirc` / `circ2` /
`circ3` / `welzl`) — it produced every number in §1 and §3. **Port it, do not
re-derive it**, and keep its two properties:

- **The shuffle is deterministic, not random.** `:29` permutes with
  `(i * 2654435761) % (i + 1)` — Knuth's multiplicative hash, not `Math.random`.
  Welzl is expected-linear only over a randomised order; a `Math.random` shuffle
  would make the emitted `footprintRadius` differ between two runs of the
  generator, i.e. make the glyph library non-reproducible.
- **`circ3` returns `null` on a degenerate (collinear) triple** (`:22`,
  `|d| < 1e-12`) rather than dividing by zero, and the caller keeps the previous
  circle. Half the vector library is axis-aligned rectilinear art; collinear
  triples are the common case, not the exotic one.

Consumed by the generator (5b) and by `importMotif` (5c). **Not** imported by
`placementEngine.js` — the packer reads a stored number, never re-measures.

### 5b. The 62 built-in glyph records — TWO paths, not one

`MOTIF_GLYPHS` (`glyphs.js:80-131`) is **58 generated + 4 hand-authored
literals**, and only the 58 carry a `root` (verified: `glyphs.js:81-128` defines
`leaf`, `dot`, `diamond`, `rosette` inline with no `root`; the other 58 are
spread in from `VECTOR_MOTIF_GLYPHS` at `:130`). Both halves need the two new
fields and they are reached differently.

**The 58 vector built-ins.** `vectorMotifsGlyphs.js:1-7` names its generator:

> `// AUTO-GENERATED by scratchpad/genVectorMotifs.mjs — do not edit by hand.`
> `// Regenerate: node scratchpad/genVectorMotifs.mjs src/lib/motif/vectorMotifs <thisFile>`

⚠️ **That file does not exist.** `scratchpad/` is not in the tree and
`git log --all -- 'scratchpad/*'` returns nothing — it was a working directory,
never committed. So this is not "add two lines to the generator". It is either
reconstructing the generator from the header's description (flatten the two
nested `<g matrix()>` transforms into the path, then run through `importMotif`)
or writing a one-shot enrichment pass that reads each record's `paths`,
flattens with `flattenPathD`, runs `minEnclosingCircle`, and rewrites the file
with the two extra keys. **The enrichment pass is the smaller, safer job** and
it also keeps the emitted `d` strings byte-identical, which regenerating from
the SVGs does not guarantee. Whichever is chosen, commit the script this time —
`scripts/`, not `scratchpad/`.

The values are stored relative to `root`, so `placementMatrix`'s trailing
`R(−root.angle)·T(−root)` (`instancing.js:96-105`) puts them in the same frame
the reserve is computed in:

```jsonc
// slice100, as actually committed by #201 — measured, not illustrative.
"viewRadius": 64.56422693721346,
"root": { "x": 55.82, "y": 84.38, "angle": 0 },
"footprintCenter": { "x": 0, "y": -28.754999999999995 },  // MEC centre MINUS root
"footprintRadius": 49.096837219926904                     // MEC radius
```

> ⚠️ **An earlier draft of this block carried `fc.y = −32.28` / `fr = 32.28`.**
> Those are just `viewRadius / 2` — the write-up pass assumed the 4.00× ceiling
> case instead of measuring. `slice100` is a wide staircase at `|fc|/fr = 0.586`,
> nowhere near the ceiling. The wrong numbers also reached ticket #201's body.
> **Do not sanity-check a solve against them.** Real values above, verified
> against the committed glyph record; `scripts/measureGlyphFootprints.mjs` is the
> authority for any other glyph.

**The 4 hand-authored ones** are literal objects in `glyphs.js` and get the same
two fields written by hand, each with the same style of measurement comment the
existing `viewRadius` values carry (`glyphs.js:86-99` for `leaf`, `:106-107`,
`:115-117`, `:125-126`). `dot`, `diamond` and `rosette` straddle the origin, so
their `fc` is at or near `(0,0)` and their `fr` is at or near `viewRadius` — the
degenerate-in-the-other-direction case, and the reason they must be measured
rather than assumed: **an absent field is not a safe default**, because a glyph
missing `footprintRadius` under `sizing.footprint: 'tight'` would fall to
`undefined` and poison the quadratic with `NaN`. Decision 2 says derived, never
authored; for these four "derived" means "derived once, by hand, with the
derivation written down".

### 5c. `importMotif.js` — user SVGs

`importMotif` (`:80-133`) already builds the exact point cloud this needs:
`cloud` at `:94-105`, and it already walks it once at `:120-124` to compute
`viewRadius` as the max distance from `root`. Add a second reduction over the
same cloud, after the `cloud.length === 0` guard at `:111-113` and beside the
`viewRadius` computation:

```js
  // 5b. footprint = the MINIMAL ENCLOSING CIRCLE of the same cloud, expressed
  //     RELATIVE TO ROOT so it lands in placementMatrix's post-de-root frame.
  const mec = minEnclosingCircle(cloud.map(([x, y]) => ({ x, y })));
  const footprintCenter = { x: mec.x - root.x, y: mec.y - root.y };
  const footprintRadius = mec.r > 0 ? mec.r : MIN_VIEW_RADIUS;
```

The `MIN_VIEW_RADIUS` fallback (`:43`, `0.5`) is reused deliberately and for the
identical reason it exists for `viewRadius`: a single-point import has a
well-defined centre and a zero radius, and a zero `fr` makes `A = |fc|²` and
`B = 2(a·u)` describe a *point* reserve — legal arithmetic, but it would let a
degenerate import claim nothing and stack on top of its neighbours. Same clamp,
same rationale, adjacent lines.

The returned glyph's `@returns` typedef (`:71-77`) gains both keys. The import
tests assert per-field (`importMotif.test.js` uses `expect(glyph.root).toEqual`
and `expect(glyph.paths).toEqual`, never a whole-glyph deep equal), so adding
keys does not churn them — but see §6.

### 5d. `src/lib/motif/footprintSolve.js` — NEW, the sibling module (decision 7b)

`emptyCircle.js` is **not touched**. §4a of the `hold` doc pinned
`largestEmptyCircleRadius` as a required byte-identity property, and decision 7b
is the ruling that it must keep serving `'root'` layers literally, so the offset
solve lives next to it instead of inside it.

Three exports, and the root selector is shared by all of them:

```js
/**
 * The smallest STRICTLY-POSITIVE root of A·s² + B·s + C, or Infinity when the
 * expression never crosses zero for s > 0.
 *
 * Numerically stable pair (decision 7). NOT the textbook (−B ± √Δ)/2A: `A` is
 * within 1% of zero for 28 of 62 built-ins and exactly zero for 4 (§3), because
 * `root` = bbox bottom-center sits ON the minimal enclosing circle by
 * construction, so |fc| ≈ fr and A = |fc|² − fr² ≈ 0 almost universally.
 */
export function smallestPositiveRoot(A, B, C) {
  const disc = B * B - 4 * A * C;
  if (!(disc >= 0)) return Infinity;         // no real crossing; NaN lands here too
  const sq = Math.sqrt(disc);
  // sgn(B) with sgn(0) := +1. The point of the form is that B and the radical
  // are ADDED, never subtracted, so the catastrophic cancellation the textbook
  // form suffers when 4AC ≪ B² cannot occur.
  const q = -0.5 * (B + (B < 0 ? -sq : sq));
  // Seeded with Infinity and compared with `<`, exactly as emptyCircle.js:119-125
  // already does: `NaN < x` is false, so a NaN root can never displace a good
  // one, where Math.min would propagate it. As A → 0 the q/A root → ±Infinity
  // and drops out of the minimum on its own — no A === 0 branch, no epsilon.
  let best = Infinity;
  const r1 = q / A;
  const r2 = C / q;
  if (r1 > 0 && r1 < best) best = r1;
  if (r2 > 0 && r2 < best) best = r2;
  return best;
}
```

Taking the **min over positive roots** rather than asserting which root is
physical is decision 7's deliberate choice: it costs nothing and means the two
sign-ambiguous glyphs (`slice18`, `slice91`, both at `|A|/fr² ≈ 0`) can only
ever produce a conservative answer, never a wrong one.

**`q === 0` is reachable and is handled by the same idiom.** It happens iff
`B === 0` and `disc === 0`, i.e. `A·C === 0` with `B === 0`. Then `C/q` is
`±Infinity` (or `NaN` when `C === 0` too) and `q/A` is `NaN` when `A === 0`.
Every one of those either drops out (`NaN`) or reports "never binds"
(`+Infinity`). The one case it gets *optimistically* wrong is `A === 0`,
`B === 0`, `C < 0` — a constant negative expression, i.e. the constraint is
already violated at `s → 0⁺`. **Guard it at the caller, not here:**

> ⚠️ **`C < 0` means infeasible at zero and must reject before the root is
> trusted.** This is decision 5c's restatement of the existing
> `hostCap <= 0 → reject 'no-fit'` guard (`placementEngine.js:605-614`) — "no
> positive `R` satisfies the inequality → reject" — and it is the same fact for
> the obstacle term, where `C = |a|² − rⱼ²` is negative exactly when the
> placement centre is inside an already-committed disc. That is today's
> `R <= 0 → no-fit` (`:558-561`) under the new law.

The two callers of the root selector:

```js
/** Max R before the reserve touches obstacle (cj, rj). a = P − cj. */
export function neighbourLimit(a, u, fr, rj) {
  const A = u.x * u.x + u.y * u.y - fr * fr;   // |fc|² − fr² (|u| = |fc|; Rot preserves length)
  const B = 2 * (a.x * u.x + a.y * u.y - rj * fr);
  const C = a.x * a.x + a.y * a.y - rj * rj;
  if (C < 0) return -1;                        // centre INSIDE the disc ⇒ caller rejects
  return smallestPositiveRoot(A, B, C);
}

/** Max R before the reserve leaves a container of radius H centred `v` back from P. */
export function hostLimit(v, u, fr, H) {
  const A = u.x * u.x + u.y * u.y - fr * fr;   // the SAME A
  const B = 2 * (v.x * u.x + v.y * u.y + H * fr);
  const C = v.x * v.x + v.y * v.y - H * H;
  if (C > 0) return -1;                        // centre already OUTSIDE ⇒ caller rejects
  return smallestPositiveRoot(A, B, C);
}
```

The two are the same quadratic with `rⱼ → −H` and the inequality reversed
(`≥ 0` for "stay off the obstacle", `≤ 0` for "stay inside the container"), which
is why one root selector serves both and why decision 5's "a second quadratic"
is not a second piece of algebra.

The boundary term is **linear in `s` per edge**, not quadratic — the reserve's
extreme point along a rect edge normal moves at a constant rate:

```js
/** Rect boundary. Returns the max R; Infinity when no edge ever binds. */
export function boundaryLimit(P, u, fr, rect) {
  // left: P.x + R·u.x − R·fr ≥ 0   ⇒  R ≤ P.x / (fr − u.x)   when fr > u.x
  // right: (W − P.x) − R·u.x − R·fr ≥ 0  ⇒  R ≤ (W − P.x) / (fr + u.x)  when fr > −u.x
  // …and the same pair on y against `height`. Min over the four, Infinity-seeded.
}
```

### 5e. `placementEngine.js` — the sizing branch, dispatched

**The dispatch is on `sizing.footprint`, a two-value field (`'root' | 'tight'`),
and it is explicit.** Decision 7b, correcting 3b: `'root'` must run today's
expressions *literally*, not as the `fc = (0,0)` / `fr = viewRadius` case of the
new ones, because `√(rⱼ² + |a|² − rⱼ²) − rⱼ` does not return `|a| − rⱼ`
bit-for-bit and `Math.hypot` is deliberately not `√(dx² + dy²)` bit-for-bit
either. ADR-0005 is a byte-identity contract, not an algebraic one.

`fixed` mode (`:501-530`) is **untouched** in both footprint modes. It performs
no clearance solve at all — it tests `fitsAt(center, radius, placed, boundary)`
at `:508` — and nothing in decisions 1-8 asks that to change.

The proportional branch (`:531-691`) becomes:

```js
    } else {
      const naturalTarget = size * scaleFactor * sizeScale;   // :553, unmoved

      if (sizing.footprint === 'tight') {
        // …the offset law, below. `parts` is still computed above at :486 and
        // is still what `R <= 0` and `capObstacle` are read from — the OBSTACLE
        // IDENTITY loop does not change, only what is solved against it.
      } else {
        // …lines :555-690 VERBATIM. Not refactored, not extracted, not shared.
      }
    }
```

Inside the `'tight'` arm, in the order the existing code establishes:

**`u` comes free.** Decision 1: the offset rotates with the glyph, and `rotation`
is fully resolved at `:453` (`baseDeg + eff.offset`) through `:467`
(`+= slotRotation`), which is **above** the sizing block at `:477`. No pipeline
reorder. `u = Rot(rotation)·fc`, one `Math.cos`/`Math.sin` pair per survivor.

**The hard tier — boundary AND `hostRadius` together (decision 5).** The hard
cap is the same `min` it is today (`:579-623`), with each term now solved rather
than read:

```js
      const boundaryCap = capOf(boundaryLimit({ x, y }, u, fr, boundary));
      hardCap = Math.min(naturalTarget, boundaryCap);
      let hardCapBy = boundaryCap < naturalTarget ? 'boundary' : 'natural';

      if (hasHostRadius(anchor)) {
        const v = { x: x - anchor.x, y: y - anchor.y };      // the SAME displacement
        const lim = hostLimit(v, u, fr, anchor.hostRadius);  //   d = |v| is :603 today
        if (lim <= 0) { rejected.push({ …, reason: 'no-fit', x, y, rotation, wantedRadius: naturalTarget }); return; }
        const hostCap = margin * lim;
        if (hostCap <= hardCap) { hardCap = hostCap; hardCapBy = 'host'; }   // tie → 'host', :615-622
      }
```

Ruled A because it is **not** a safety tradeoff (decision 5): the root disc and
the tight disc both fully contain the art, so *"disc inside container ⇒ art
inside container"* holds either way, and A is the same guarantee with less
waste. The `<=` tie-break at `:619` and its recorded justification
(`:615-618` — the boundary is already on screen, the host container has no
visual representation at all) carry over unchanged.

Keeping the hard tier conservative was rejected under 5b for two reasons that
both bite here: it would leave the over-reservation unfixed in the one place
with **no visual explanation** — a girih cell is invisible on canvas, so the
overlay would draw a `hostRadius` ring next to a tight reserve ring nowhere near
it — and it would create the genuine mixed model, offset reserve for neighbours
and root-centred reserve for host and boundary, two footprints for one glyph
inside one sizing branch.

**The soft tier — the neighbour term.** One `neighbourLimit` per obstacle where
there is one subtraction today, min-reduced with the same `<` accumulation and
`Infinity` seed `largestEmptyCircleParts` uses (`emptyCircle.js:125-135`), and
tracking the winning obstacle the same way so `capObstacle` (`:685-688`) is
still recorded by the code that lost to it and never re-derived.

⚠️ **`capBy`'s winner is found differently (decision 6b).** Today the captor is
the obstacle minimising `d − r` — one scalar comparison. Now it is the obstacle
yielding the **smallest max-`R`**. Those are not the same ordering once the
reserve is offset: a disc further away in the direction the art leans can bind
harder than a nearer one behind the root. `capBy`'s *meaning* is unchanged — it
still names what bound the radius the user sees (decision 15b) — and `placed`
stays `{x, y, r}` with no back-reference (decision 6).

**`margin` is applied as SOLVE-THEN-SCALE, never inflate-then-solve
(decision 6d).** This is the single most misapplicable line in the build:

```js
      // RIGHT — the faithful port of what capOf does today (:573).
      neighbourCap = capOf(limit);              // limit = the tangency maximum

      // WRONG — a different number, silently.
      neighbourCap = neighbourLimit(a, u, fr / margin, rj);
```

They differ because an inflated reserve also **sits further out**: `fr` appears
in `B = 2(a·u − rⱼ·fr)` as well as in `A`, and the offset `s·u` scales with `R`
too, so inflating the radius moves the tangency point rather than just growing
the circle. Solve-then-scale is what `capOf` does today; inflate-then-solve is
not, and it would quietly falsify decision 6c — the overlay's tangency link
rests on the binding condition being `|a + s·u| = s·fr + rⱼ`, distance between
centres equal to the sum of radii, which **is** external tangency by definition
(§4a).

`capOf`'s `Infinity` guard (`:573`, `term === Infinity ? Infinity : margin * term`)
is required verbatim and for the same reason it was added: `0 * Infinity` is
`NaN`, and `boundaryLimit` returns `Infinity` for a null boundary exactly as
`signedBoundaryDistance` does (`emptyCircle.js:67-68`).

**Everything below the caps is unchanged.** `packedRadius = min(hardCap,
neighbourCap)` (`:633`), the `hold` lerp (`:639-646`), the `below-floor` test
against `drawnRadius` (`:650-662`), `capBy`/`saturated` derivation
(`:674-679`), and `placed.push({ x, y, r: packedRadius })` (`:698`). The
footprint change moves what `neighbourCap` and `hardCap` *are*; it does not
touch what is done with them.

> **`placed` keeps storing an ANCHOR-CENTRED radius, and that is deliberate.**
> `{x, y, r: packedRadius}` is the packer's obstacle record, and the next
> survivor's `neighbourLimit` reads it as `(cⱼ, rⱼ)`. Under the tight law the
> obstacle that glyph actually occupies is the offset disc, so this is the
> conservative-but-consistent choice the build must make explicitly rather than
> by accident — see §8, which records it as a question decisions 1-8 do not
> answer.

**`Rejection` gains `rotation` (decision 8).** The typedef at
`placementEngine.js:227-228` becomes:

```js
 * @typedef {{anchorId:string, reason:'junction-skip'|'below-floor'|'no-fit'|'rest',
 *            x?:number, y?:number, rotation?:number, wantedRadius?:number}} Rejection
```

Five push sites, all **sizing-stage**, all below `:467` where rotation is
resolved, so the field is free at the source: `:509` (fixed `no-fit`), `:513`
(fixed `below-floor`), `:559` (proportional `no-fit`), `:606-612` (host
`no-fit`), `:654-660` (`below-floor`). `junction-skip` (`:416`) and `rest`
(`:426`) are **untouched** — they reject above the transform, carry no
coordinates, and draw nothing. The conditional shape stays correct for exactly
the reason `:247-252` already records.

Decision 20 exists so *"the gap-20 mystery becomes four visible circles"*; under
the alternative those four rings would sit in the wrong place, overlapping the
survivors' territory, while every other ring on screen is offset — the mark that
exists to explain a mystery would be adding one. Precedent is decision 15: a
transient render structure, so the cost is **test-golden churn, not
determinism**.

### 5f. `overrides.js` — recompute the world footprint centre (decision 1b)

`applyGlyphOverrides` (`:268-304`) already recomputes `drawnRadius` alongside
`radius` when `scale` changes (`:297`), with the justification recorded at
`:285-288`: *"leaving it stale would make the footprint overlay's dashed ring
stop tracking the glyph the moment an override scale is dragged."* Decision 1b
rules the identical treatment for the angle override, which is A-for-the-packer
and B-for-every-downstream-reader:

```js
    if (angle != null) {
      next.rotation = angle;
      // Decision 1b — the SAME rule as `drawnRadius` above (:297), for the same
      // stated reason: this pass is the last thing that decides the glyph's
      // orientation, and the reserve centre is a function of it. Leaving it
      // stale misreports the glyph the moment the dial is dragged.
      //
      // `packedRadius` and the caps stay untouched — the reserve genuinely did
      // not move, the packer has already run. So an angle override can push art
      // into space nobody reserved AND vacate space it did reserve. It relayouts
      // nothing; it just overlaps, visibly. Same rule :16-21 already states for
      // the scale override.
      next.footprintCenter = worldFootprintCenter(placement, angle, glyph);
    }
```

⚠️ **This is the one place in the build that needs a glyph object where nothing
currently has one.** `applyGlyphOverrides` takes `(placements, byAnchorId)` and
has never resolved a glyph — the world centre needs `fc`, `fr` and `viewRadius`.
Two shapes are available and the choice is a real one:

1. **The engine emits the world centre on `Placement`** (a `footprintCenter`
   world-space `{x,y}` beside `packedRadius`), and `applyGlyphOverrides` rotates
   the already-emitted vector about `(placement.x, placement.y)` by
   `angle − placement.rotation`. Needs no glyph, is pure trigonometry over data
   the placement already carries, and adds one always-present key — which is
   what decision 15 ruled for the `hold` diagnostics, on the same ground
   (`Placement` is transient, so the cost is golden churn).
2. Thread the glyph (or `{fc, fr, viewRadius}`) into `applyGlyphOverrides`,
   which means threading it from both call sites — `placementEngine.js:735` and
   the overlay.

**(1) matches the existing precedent and is what §5g assumes below.** It is not
a locked decision; it is an implementation shape the decisions constrain but do
not choose. Record which one is built.

### 5g. `migration.js` — SCHEMA_VERSION 1 → 2 (decision 3)

```js
export const SCHEMA_VERSION = 2;   // :19
```

`migrateLayer` stamps `sizing.footprint: 'root'` on anything arriving at v ≤ 1;
new layers default `'tight'`. Driven by `migration.js`'s own locked policy at
`:12-14` — *"NEVER reset-to-default — that silently changes fabrication
intent"* — which is squarely on point: a motif layer resizing every glyph on
load **is** a change of fabrication intent, on a machine that cuts material.
Unlike `hold`, there is no absent-⇒-byte-identical fallback available: the
change lives in the glyph library, which is code, not document state.

`sizing` lives at `layer.params.binding.placement.sizing` (the fixed placement
tail — `starterChips.js:54-58`, shared by chain-form and legacy bindings alike,
`motifLayer.js:43-53`), so the stamp reaches three levels into the layer and
must be a no-op on every non-motif layer.

⚠️ **`migrateLayer` cannot currently see a version, and its three real callers
pass one argument.** Its signature is `migrateLayer(layer, operations)` (`:42`)
and `useLayers.js:196`, `:1095` and `:1113` all call `migrateLayer(l)` — bare
layer arrays, no config, no `schemaVersion` in scope. `migrateConfig` (`:65`)
*does* have `cfg.schemaVersion` and computes `alreadyCurrent` from it at
`:67-68`. So the version gate needs the version threaded into `migrateLayer` as
a third argument **and** a decision about what the three version-less call sites
pass. Treat an absent version as **legacy** — `:12-13`'s policy says a
version-less document is treated as legacy and migrated, and the conservative
read is the one that does not resize saved work.

Keep `migrateLayer` idempotent the way `:46-53` already is: `??`-style
preservation, never overwrite an existing `sizing.footprint`.

### 5h. `AnchorGhostOverlay.jsx` and `footprintScope.js` — rings at the offset centre

Both rings move to the offset centre. That is forced — they must match the
reserve — and §4a records the consequence: solid (`packedRadius`) and dashed
(`drawnRadius`) stop being concentric **with each other**, since a larger drawn
radius also means a larger offset. They belong to a homothety about the anchor,
so they nest (`|fc| ≤ fr`, 60 of 62) and are internally tangent at the anchor
for the 4 degenerate ones including `leaf`.

The two `<circle>` elements at `:680-701` take the offset centre instead of
`p.x`/`p.y`; the rejected ring at `:719-744` takes the rejection's own offset
centre, computed from the `rotation` decision 8 adds. The `hostRadius` captor
(`footprintScope.js:401-414`) stays **anchor-centred** — the container never
moved, and `:408-412` already says exactly that.

⚠️ **`AnchorGhostOverlay.jsx:130-139` must be REWRITTEN — it states the old law
verbatim** (decision 6c cites this block as `:129-137`; it is at `:130-139` in
the committed file, see §8):

> `// WHAT LINKS IT TO THE GLYPH IS GEOMETRY, NOT A LEADER LINE. For 'neighbour'`
> `// the engine's own definition puts the two in contact: packedRadius =`
> `// margin × (d − r_obstacle), so at margin: 1 the solid ring is EXACTLY`
> `// tangent to the captor…`

**The tangency property survives; the formula quoted does not.** `packedRadius =
margin × (d − r_obstacle)` is the root-centred law and is simply false under
decision 5. The replacement says the same thing about the new law: the binding
condition is `|a + s·u| = s·fr + rⱼ` — distance between centres equal to the sum
of radii, external tangency by definition — so at `margin: 1` the reserve is
still exactly tangent to the captor and at the default `0.85` it still stands
off by 15% of the gap. Decision 16's mechanism is preserved verbatim and gets
*better*, since the captor disc now hugs the ink it belongs to (decision 6's
whole argument for not adding `anchorId` to `placed`).

Also rewrite: the overlay header's `capBy` mapping note at `:89-116` describes
two concentric rings, and `:131-133`'s "the captor is always the nearest disc"
is no longer true under decision 6b's smallest-max-`R` ordering.

`footprintScope.js`'s selectors (`placementsForScope` `:339-345`,
`rejectionsForScope` `:348-354`) are **unchanged** — they select which
placements and rejections are drawn, not where. `captorDisc` (`:390-415`) is
unchanged for the same reason.

### 5i. `straddleCheck.js` — reads the offset disc

Decision 1b puts `straddleCheck` downstream of the recomputed centre alongside
the overlay, and decision 4 lists it among the readers of the scalar
`placement.radius` a polygon reserve would delete. Under the tight law the disc
it should test is `(P + s·u, s·fr)`, not `(P, radius)`.

⚠️ **It structurally cannot compute that from what it is given, and it has no
production caller.** Its input typedef is
`{anchorId, index, x, y, radius}` (`:9`) and it reads exactly `placement.x`,
`placement.y` and `placement.radius` (`:35`, `:43`). No `rotation`, no glyph, no
`viewRadius`. And `grep -rn straddleCheck src/` returns **only
`straddleCheck.test.js`** — nothing in the app calls it. Under shape (1) of §5f
— the world centre emitted on `Placement` — the change is a one-line centre
swap and a radius read; under shape (2) it needs inputs it has never received.
See §8; this is not a decision to make while porting a distance test.

---

## 6. Determinism and test strategy

The contract (`placementEngine.js:167-178`, ADR-0005): same inputs + seeds ⇒
byte-identical output; **exactly 4 RNG draws per survivor** regardless of
outcome.

**Suite baseline, measured 2026-07-29 on `feat/curved-leaf-glyph` at `3be932e`
(`npx vitest run --reporter=dot`): 7049 passing / 54 skipped / 531 files.**
Matches the number recorded in the `#192` commit, so it is a clean baseline.

### What must stay byte-identical

- **A `'root'` layer must produce byte-identical output. This is exactly why
  decision 7b exists.** Not "the same to within a tolerance" — the same bits.
  The correction to 3b is the whole argument: legacy *is* the `fc = (0,0)`,
  `fr = viewRadius` case algebraically, and is not in IEEE754, because
  `rⱼ² + |a|² − rⱼ²` eats mantissa whenever `rⱼ > |a|`, the trailing `− rⱼ`
  cancels catastrophically on top, and `Math.hypot` is deliberately not
  `√(dx² + dy²)` bit-for-bit. The dispatch runs `:555-690` **literally**, not
  as a special case of a shared expression. The test that proves it is the
  existing suite passing unchanged with `sizing.footprint: 'root'` stamped —
  every deep-equal golden in `placementEngine.test.js` and `sequencer.test.js`,
  not a spot check.
- **`emptyCircle.js` does not move.** §4a of the `hold` doc pinned
  `largestEmptyCircleRadius` as a **required property, not an incidental one**,
  and enumerated the blast radius: two production call sites, both in
  `placementEngine.js` (`:486` `largestEmptyCircleParts`, `:508` `fitsAt`), plus
  `fitsAt` itself at `emptyCircle.js:168-170`, pinned by `emptyCircle.test.js`.
  Decision 7b means the file is not edited at all this time.
- **The four-RNG-draws-per-survivor keystone does not move.** The footprint
  change **draws no RNG.** `fc` and `fr` are static per-glyph data with no
  random component; `u = Rot(θ)·fc` is read from a `rotation` already fully
  resolved at `:453-467`, below all four draws (`:403-406`). No new channel, no
  perturbed stream, and every early return this change adds is still below
  `:406`. `hold` established the same property and the same wording; this change
  inherits it rather than re-arguing it.
- **`placementMatrix` does not move.** `s = placement.radius / viewRadius`
  (`instancing.js:77`) is untouched: decision 2b — different numbers, different
  jobs, never substituted. `viewRadius` stays the scale divisor;
  `footprintRadius` is the packer's reserve and is read by nothing in the render
  path.

### What deliberately moves

- **Every deep-equal `Rejection` golden**, because decision 8 adds `rotation` to
  five push sites. Transient render structure, test-golden churn not
  determinism — decision 15's precedent, restated by decision 8 itself.
- **Every deep-equal `Placement` golden**, if §5f ships shape (1) and the world
  footprint centre becomes an always-present key. Same category, same rule:
  **update them deliberately to the new shape; do not loosen them to
  `objectContaining` to dodge the work.**
- **The glyph records themselves**, which is a golden surface the `hold` PR did
  not touch. `importMotif.test.js` asserts per-field
  (`expect(glyph.root).toEqual(...)`, `expect(glyph.paths).toEqual(...)`) and
  survives new keys; `glyphBounds.test.js:91` builds
  `{...MOTIF_GLYPHS, ...VECTOR_MOTIF_GLYPHS}` and
  `glyphEntries.test.js:11` counts them. Check for any whole-glyph deep equal
  before assuming the enrichment is invisible.

### The acceptance test for decision 7 is a NUMERIC PROPERTY TEST, not a proof

Decision 7 says so in as many words, and it is the load-bearing test of the
whole PR. Run `smallestPositiveRoot` over **all 62 real glyphs** — the actual
`MOTIF_GLYPHS` records, not synthetic triples — crossed with a spread of
obstacle positions, radii and rotations, and assert:

1. **No positive root is missed.** For every case where a positive root exists,
   the returned value is one, and it is the smallest. Cross-check against a
   brute-force scan: step `s` finely and find the first sign change of
   `A·s² + B·s + C`. The two must agree to a stated tolerance — this is the
   assertion the stable pair exists to satisfy, since it is precisely the
   textbook form's failure mode.
2. **No negative root is selected.** `smallestPositiveRoot` never returns a
   value `≤ 0`; the `> 0` tests are strict.
3. **No `NaN` or `Infinity` leaks into a radius.** The final `drawnRadius`,
   `packedRadius`, `hardCap` and `neighbourCap` are finite for every glyph and
   every obstacle configuration. `Infinity` is a legal *intermediate* — it is
   how "this side does not constrain" is spelled, at `emptyCircle.js:125` (the
   obstacle term's seed) and at `capOf` (`placementEngine.js:573`) — but it must
   be consumed by a `min` before it reaches a placement.
4. **The degenerate glyphs specifically.** The 4 at `|A|/fr² < 1e-9` — `leaf`,
   `slice17`, `slice95`, `slice91` — and the 28 at `< 0.01`. §3's whole point is
   that these are the **typical case, not the edge case**: the median glyph sits
   5% from degenerate and nearly half the library within 1%, because `root` =
   bbox bottom-center sits essentially *on* the minimal enclosing circle by
   construction. A test suite that exercises a well-conditioned `A` is testing
   the wrong library.
5. **The 2 sign-ambiguous glyphs** — `slice18` and `slice91`, both `A > 0` at
   `|A|/fr² ≈ 0`, where the sign is noise. Assert the *conservative* outcome
   decision 7 promises: the min-over-positive-roots rule can only under-size,
   never over-size. A wrong answer here is an overlap; a conservative one is a
   slightly small glyph.

Regenerate the measurement (`node scripts/measureGlyphFootprints.mjs`) as part
of the acceptance run and diff its degeneracy table against §3. The numbers in
this document are the contract the test is written against, and if the glyph
library changes underneath them the test should say so rather than the document
going quietly stale.

### What is deliberately NOT tested

The overlay's rendered SVG geometry — ring centres and radii on screen — the
same exclusion the `hold` PRD made and for the same reason: it encodes
presentation detail that is expected to move. §4a's nesting property
(`packed` inside `drawn`, tangent at the anchor for the degenerate glyphs) is
testable **headlessly** off the placement records, and should be, since it is a
geometric claim rather than a rendering one.

---

## 7. Risks

- **Decision 1b's staleness is a real, accepted, visible defect.** An angle
  override recomputes the world footprint centre for the overlay and
  `straddleCheck`, but the packer has already run — so dragging the dial can
  push art into space nobody reserved *and* vacate space it did reserve. The
  glyph does not move anyone; it just overlaps. This is the same rule
  `overrides.js:16-21` already states for the scale override, and the same
  category as the pre-existing `#137` behaviour by which an overridden glyph may
  exceed every cap. **What is new is that it now happens for a control that
  changes no size.** A user who has learned "scale can overlap, angle is free"
  will find that no longer true, and nothing on screen announces it. Mitigation
  is the overlay: the rings visibly slide off the ink as the dial turns.

- **Decision 5c: a glyph may now fit at one rotation and not another.** The
  offset direction is `Rot(θ)·fc`, so containment inside a `hostRadius` cell is
  a function of orientation — impossible before, when the disc was root-centred
  and rotation was irrelevant to containment. **Cell-hosted layouts can
  therefore change under rotation jitter in a way they never did.** A motif with
  `jitter.rotation > 0` on a girih or module-cell host will place a different
  set of glyphs run to run in a way that reads as flakiness rather than as
  jitter, and the `hostCap <= 0 → reject 'no-fit'` guard becomes "no positive
  `R` satisfies the inequality → reject", which fires at some angles and not
  others on the same anchor. Decision 5c calls this correct and expected. It is
  still the change most likely to arrive as a bug report, and the one the
  acceptance run should exercise deliberately: sweep `rotationRange` on a
  cell host and record how the placed count moves.

- **The 2 sign-ambiguous glyphs, `slice18` and `slice91`.** Both report
  `A > 0` — root *outside* its own minimal enclosing circle, which is
  geometrically impossible — at `|A|/fr² ≈ 0`, so the sign is floating-point
  noise in `|fc|² − fr²`, not a fact about the art. Decision 7 handles them by
  never asserting which root is physical, so they can only produce a
  conservative answer. **The residual risk is that the sign is not stable**: a
  regenerated glyph library, a different flattening tolerance, or a different
  Welzl shuffle can flip `A` from `+1e-16` to `−1e-16` and change which root the
  min selects. The output stays correct either way, and it is a byte-level
  difference in a `'tight'` layer's geometry — invisible to the eye, fatal to a
  deep-equal golden. Pin the glyph records; do not regenerate them casually.

- **This is the first change to touch the packing law since `#186`.** Everything
  between `#186` and `#192` — the `emptyCircle` split, the diagnostics on
  `Placement`, the captor, the rejection rings, the four triggers — added
  *readers* of the law and left the law itself alone: `packedRadius =
  min(hardCap, margin × R_obstacles)` is the same expression the engine has
  computed since before any of it. `hold` was explicitly designed not to disturb
  it (decision 1 of the `hold` doc: `placed` keeps receiving `packedRadius`, the
  no-overlap invariant survives verbatim). **This PR changes the law.** Every
  one of those readers was built against the root-centred model and at least two
  encode it in prose (§5h). The blast radius is not the sizing branch; it is the
  sizing branch plus everything that learned to explain it.

- **`hold` and the footprint fix interact, and the interaction is silent.** §9
  of the `hold` doc ruled that `hold`'s semantics need no change: it is defined
  against `packedRadius`, whatever computed it, so a tighter footprint makes
  `neighbourCap` larger, `packedRadius` rises toward `naturalTarget`, and the
  lerp has **less ground to give back** — the control correctly does less
  because there is less wrong. That is the right coupling and it is automatic.
  The risk is what a user with a saved `hold 60%` sees: their slider now does
  visibly less, for a reason the slider cannot express. Decision 3's
  version-gated pin is what keeps this from happening on load; it will happen
  the first time they switch a layer to `'tight'`.

- **The generator does not exist (§5b), so the 58 vector records are edited by a
  script nobody has reviewed.** A one-shot enrichment pass that rewrites a
  997-line committed data file is a single point of failure for the entire glyph
  library, and a mistake in it is a silent geometry change across 58 built-ins
  rather than a crash. Diff the emitted `paths`, `viewRadius` and `root` fields
  and assert they are **unchanged**, byte for byte, before looking at the two
  new keys at all.

---

## 7z. Rulings on the write-up findings (2026-07-29, orchestrator)

§8 below was written by the write-up pass and is kept verbatim as the record of
what it found. Three of its four items needed a ruling before the build could
start; the user was unavailable, and all three are **forced by decisions already
locked** rather than genuine new choices. Ruled here.

| # | Ruling |
|---|---|
| 6e | **`placed` receives the OFFSET disc** — resolves 8c. `{x, y}` becomes the tight-disc world centre `P + (R/viewRadius)·Rot(θ)·fc` and `r` becomes `R·fr/viewRadius`, where `R = packedRadius`. Not a choice: keeping obstacles anchor-centred would size tight discs against root-centred ones, which is precisely the mixed model decision 5b rejects, and it would make the whole fix inert — the reserve the *neighbours* see is the only reserve that matters. Decision 6 (`placed` stays a bare `{x, y, r}`, no identity field) is unaffected and still holds. |
| 1c | **`straddleCheck` is OUT OF SCOPE** — resolves 8b. Verified: nothing outside its own module and test file imports it, so the "warn-only fabrication check" it was built for was never wired up. Decision 1b's mention of it was aspirational; there is no live consumer to keep honest. It gains the offset disc **when someone wires it**, and whoever does that must give it `rotation` + the glyph's `fc`/`fr`, which its current typedef (`straddleCheck.js:9`) cannot carry. Do **not** grow its signature speculatively in this PR. |
| 1a-fix | **§1's headline is corrected in place** — resolves 8a. See the ⚠️ block in §1. The error was mine (orchestrator), not the write-up pass's; it was caught by re-deriving rather than trusting. No decision moves. |
| 7c | **UNITS — `#204` normalises at the glyph, so every limit comes back in `R`.** Raised as an objection by the `#203` build: §5e writes `boundaryLimit`'s constraint in `R` while comparing `hostCap = margin * lim` against a `naturalTarget` that is also in `R` — but `footprintSolve` takes **glyph-local** `u = Rot(θ)·fc` and `fr`, so its root is `s = R / viewRadius`, not `R`. The module is homogeneous (all coefficients degree 2 in length) so either convention is mathematically fine, which is exactly what makes this dangerous: mixing them yields a wrong radius that is plausible, green, and off by a factor of `viewRadius`. **Ruled: `#204` passes `fc / viewRadius` and `fr / viewRadius`**, so the reserve is `P + R·f̂c` with radius `R·f̂r` and every returned limit is directly in `R`. Rationale — every other quantity in the sizing branch (`naturalTarget`, `hardCap`, `neighbourCap`, `margin×`, `min`, `packedRadius`) is in `R`; a returned `s` that must be *remembered* to multiply is precisely the silent-and-green error class §7 warns about. Normalising where the glyph is read confines `viewRadius` to one line. `footprintSolve.js` is NOT to be changed for this — it already accepts whatever frame it is handed. |
| 7d | **`footprintSolve` throwing on non-finite input and on `{type:'polygon'}` is accepted.** Verified: `MotifPattern.js:124` is the only production boundary emitter and always builds a rect, so polygon is a typedef-only capability that is never constructed. Reporting an unhandled boundary as "never binds" would be an unbounded layout on a machine that cuts material; throwing is the right failure. And since #198 established that Welzl silently swallows interior NaN, this module is the first place a glyph missing `footprintCenter`/`footprintRadius` can fail loudly — it must. |
| 5d | ⚠️ **Decision 5's "up to 2× bigger in a cell" is wrong at an undisplaced centre — it is 1.004×.** Measured by the #204 build across all 62 glyphs. Structural, and it falls straight out of the same construction §1 rests on: `\|f̂c\| + f̂r ≈ 1`, so at an *undisplaced* centre the tight disc reaches almost exactly as far toward the container wall as the root disc did. **The 2× needs a DISPLACED centre** — a jittered case measures 2.9×. Decision 5 itself is unaffected: it was ruled on the grounds that containing the tight disc is *the same guarantee with less waste*, which stands. Only the size-of-prize number was overstated. |
| 5e-obs | ⚠️ **Individual glyphs CAN shrink under `'tight'`** — 7 of 174 in the #204 harness. **This is inherent, not a bug**: per obstacle the tight limit is never worse than the root limit, but packing is greedy and order-dependent, so an earlier glyph that now claims only what it actually occupies grows a lot, and a later one consequently sees less room. The redistribution is what moves, not the law. **This invalidates #207's stated acceptance criterion** ("a golden that shrank is a bug") — see the ruling below. |
| 7e | **#207's acceptance criterion is REPLACED.** "Every glyph must get bigger; a shrunk golden is a bug" is false per 5e-obs and would have led its reviewer to either accept a real regression or reject a correct result. The criterion becomes: **the population must improve and no glyph may be lost.** Concretely — total drawn area rises, the count of `below-floor` / `no-fit` rejections does not rise, and every individual shrink is traceable to a specific earlier neighbour that grew. A shrink with no such neighbour IS a bug. |
| 7f | **LANDMINE — `AnchorGhostOverlay.jsx:445` must be fixed BEFORE the default flips.** It calls `resolvePlacements(survivors, placementConfig, { boundary, overrideRecords })` with no glyph, and `placementEngine.js:382/:399` now throws in `'tight'` mode (correctly — decision 7d, loud over silently degrading). So flipping the default in #207 hard-crashes the overlay render path. **Assigned to #206**, which already owns that file; #207 is blocked on it. Verified directly, not taken on report. |
| 8d | **Citation drift: fix the ones in this document, leave the shipped code comments alone.** Correcting stale line references inside `placementEngine.js` / `AnchorGhostOverlay.jsx` comments is unrelated churn in files this PR already touches heavily, and it would bury the real diff. Worth its own tidy-up ticket. |

---

## 8. Found during write-up

Everything in this section was found while writing §5-§7 and is recorded rather
than resolved, per the rule that decisions 1-8 are locked and ruled by Majed.
None of it changes a decision. Two items (8a, 8b) are things a decision assumes
that the code does not support; the rest is bookkeeping.

### 8a. §1's "exactly 4.00 for all 59 vector built-ins" does not reproduce

Re-running `scripts/measureGlyphFootprints.mjs` — the script §1 cites, unchanged,
on the same tree — gives:

```
root/MEC == 4.00 (±0.005) :  24 / 62 glyphs
root/MEC != 4.00          :  38 / 62,  ranging 1.00 … 3.99
median root/MEC over 62    :  3.42          ← §1's own other number, reproduces exactly
```

The two numbers in §1's table are mutually inconsistent by construction: if 59
of 62 glyphs read exactly 4.00, the median over 62 would be 4.00, not 3.42.

**Where the "59" comes from.** The script's own grouping, at
`measureGlyphFootprints.mjs:124`:

```js
const core = ROW.filter((x) => ['leaf', 'star', 'flower', 'dot', 'rosette', 'tendril'].includes(x.id));
const vec  = ROW.filter((x) => !core.includes(x));   // prints "vector built-ins: 59 glyphs"
```

`diamond` is not in that list, so it lands in the "vector" bucket — but it is
one of the four hand-authored glyphs (`glyphs.js:110-119`), has no `root`, and
reads `root/MEC = 1.00`. There are **58** vector built-ins, not 59
(`Object.keys(VECTOR_MOTIF_GLYPHS).length === 58`; the four hand-authored are
`leaf`, `dot`, `diamond`, `rosette`), and they range 1.59 … 4.00.

**What survives, precisely.** The blast radius of this is §1's prose and nothing
else:

- **The structural explanation is right, and 4.00 is its ceiling.** `root` = bbox
  bottom-center sits on the minimal enclosing circle whenever the MEC centre is
  near the bbox centre, giving `rootRadius = 2 × tightRadius` and an area ratio
  of exactly 4. 24 glyphs hit that ceiling exactly — including `leaf`, the glyph
  that started this, matching §1a of the `hold` doc. The rest fall short of it
  because their MEC centre is not their bbox centre, not because they are
  well-centred.
- **A median of 3.42× over-reservation is the fix's motivation and it is
  measured.** Nothing about decisions 1-8 depends on the ratio being uniform.
- **Decision 5's "up to 2× bigger in radius"** is a ceiling claim (`√4 = 2`) and
  the 24 hit it; the median is ≈1.85×. Stands as written.
- **Decisions 2 and 4** rest on `MEC/hull 1.38` and `aspect 1.00`. Both
  reproduce exactly.
- **Decisions 7 and 7b** rest on §3's degeneracy table — `|fc|/fr` min 0.0000 /
  median 0.9481 / max 1.0000, 28 of 62 near-degenerate, 4 exactly degenerate,
  `slice18` and `slice91` sign-ambiguous. **All of it reproduces verbatim.** The
  entire numerical argument for the stable root pair is unaffected.

### 8b. `straddleCheck` cannot read the offset disc, and nothing calls it

Decision 1b: *"The overlay and `straddleCheck` therefore read the post-override
disc."* Decision 4 lists `straddleCheck.js` among the readers of the scalar
`placement.radius`.

Both assume it reads a disc it can construct. It cannot:

- Its input typedef is `{anchorId, index, x, y, radius}` (`straddleCheck.js:9`)
  and it reads exactly those three geometry fields (`:35`, `:43`). It receives no
  `rotation`, no glyph, and no `viewRadius`, so `s·u` and `s·fr` are not
  derivable inside it.
- `grep -rn straddleCheck src/` returns **only `straddleCheck.test.js`**. There
  is no production caller anywhere in the app.

Neither fact contradicts a decision — a decision about what a module reads is
still coherent when the module is dormant — but the build cannot "make
`straddleCheck` read the offset disc" without first deciding what feeds it. §5f
shape (1) (world centre emitted on `Placement`) makes it a one-line change;
shape (2) makes it a new parameter on a function with no callers to thread it
from.

### 8c. `placed` stores an anchor-centred obstacle radius, and decisions 1-8 do not say what it should store

Decision 6 rules that `placed` **stays `{x, y, r}`** with no back-reference to
the owning glyph, and gives its reasons (the captor disc now hugs the captor's
ink, so identity is less needed, not more; adding identity pulls toward a leader
line `#190` already rejected).

It does not say **where that disc is centred**. Under the tight law a glyph
occupies `(P + s·u, s·fr)`, but `placementEngine.js:698` pushes
`{ x, y, r: packedRadius }` — the anchor-centred disc. Leaving it there is
conservative and self-consistent (every survivor solves against the same
convention), and changing it to the offset disc would be the more accurate
packer and a strictly larger behaviour change. Decision 6's "`placed` stays
`{x, y, r}`" is compatible with either, since both are `{x, y, r}`.

§5e states the conservative reading as the build's assumption and flags it here.
It is a real choice with a visible consequence — the offset disc packs tighter —
and it belongs to whoever ruled decisions 1-8.

### 8d. Citation drift in the shipped code and in §2

Several `file:line` citations were accurate when written and have moved since.
Cited correctly in §5 above; recorded here once so the next reader does not
re-derive the list.

| citation | written as | actually at |
|---|---|---|
| decision 1, the sizing branch | `placementEngine.js:575` | `:477` (comment), `:486` (`parts`), `:501` (mode dispatch) |
| decision 8, `Rejection` typedef | `placementEngine.js:228` | `:227-228` |
| decision 6c, the tangency comment | `AnchorGhostOverlay.jsx:129-137` | `:130-139` |
| `capObstacle` recorded | `footprintScope.js:367` cites `placementEngine.js:627` | `:685-688` |
| `hasHostRadius` | `footprintScope.js:403` cites `placementEngine.js:294` | `:319-321` |
| the exact `drawnRadius === hardCap` equality | `AnchorGhostOverlay.jsx:103` cites `placementEngine.js:617` | `:675` |
| §4a of the `hold` doc, the two call sites | `:415` / `:422` | `:486` / `:508` |

`#146`'s containment quote in the `hold` doc's rejected-alternatives table cites
`placementEngine.js:456-458`; that comment is now at `:585-594`.
