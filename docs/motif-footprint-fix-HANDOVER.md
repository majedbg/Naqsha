# Footprint fix — overnight build handover (2026-07-29)

Branch `feat/motif-tight-footprint`, off `feat/curved-leaf-glyph`. **Nothing pushed,
no PR, `main` untouched.** Suite green at **7426 passed / 54 skipped / 537 files**
(baseline was 7049 / 54 / 531).

---

## ✅ #207 — the default is ON for new layers

`starterChips.js`, `defaultBinding.js` and `motifLayer.js`'s `normalizeBinding`
all write `sizing.footprint: 'tight'` on a NEW motif layer; the last of the three
never overwrites, so a pinned `'root'` survives it. `PLACEMENT_DEFAULTS` stays
`'root'` and is EXPORTED, and `isTightFootprint` reads it rather than keeping a
second copy. The production render path (`MotifPattern.js`) now threads the base
glyph and the slot map into `resolvePlacements` — without it the flip took the
canvas down on the first motif a maker added — and `RightPanel` passes
`customGlyphs` so a custom-glyph layer still draws its rings.

Measured, not assumed: **+42.4% total drawn area, 372 → 147 lossy rejections, 0
unexplained shrinks** over the 62 built-ins × 4 packing scenarios. See §7z row
`7e-built` — which also corrects `5e-obs`: greedy redistribution explains only
1917 of the 2168 shrinks, and "per obstacle the tight limit is never worse" is
false.

⚠️ **Custom glyphs imported BEFORE `aee1d1a` carry no measurement**, and nothing
re-measures a stored one on load. A NEW layer built on such a glyph throws
(loudly, naming the glyph — ruling 7d). Reachable only from a dev localStorage
predating today, since none of this has merged; worth its own ticket.

---

## ✅ RULED AND BUILT — decision 5 is wrong, and Majed reversed it

**Ruled 2026-07-29 (option b) and BUILT in `2aa964c`.** The hard tier takes
`max(R_root, R_tight)` on both channels; the neighbour term is untouched.
`slice100` in a cell is back to `1.000×` bit-identically, 0 of 62 shrink, and a
jittered `slice100` measures `6.14 → 14.81` with the tight bound winning. See
`docs/motif-footprint-fix-decisions.md` §7z rows `5-rev` and `5-rev-built`. The
section below is kept verbatim as the record of what was found.

Decision 5 restated `hostRadius` and boundary containment against the tight disc,
justified as *"the same guarantee with less waste — glyphs inside cells get up to
2× bigger in radius."* **The direction is backwards.**

By the triangle inequality `rootRadius ≤ |fc| + fr`, so normalised
`|f̂c| + f̂r ≥ 1` **always**. At an undisplaced centre:

```
root law :  R ≤ H
tight law:  R ≤ H / (|f̂c| + f̂r)   ≤ H        ← never better, usually worse
```

Measured over the 62 committed glyph records: **61 of 62 have `|f̂c| + f̂r ≥ 1`**.
Max reach 1.2058 (`slice100`) ⇒ its radius in a cell shrinks to **0.829×**. The
one apparent gainer, `leaf` at 0.9963 ⇒ 1.0037×, is a **data artifact** — its
stored `viewRadius` 20.1 is rounded up from the true 20.025.

**Why the original reasoning failed.** Both discs do contain the art, which is
what Q5 rested on. But for containment measured *from a point*, the root-centred
disc of radius `R` is already exactly the art's reach from the anchor, while the
minimal enclosing circle bulges **past** the art on the far side. As a
containment envelope it is strictly looser. "Same guarantee, less waste" is true
for disc-vs-disc (the neighbour term) and false for distance-from-a-point (the
hard tier).

**This does NOT affect the main win.** The 4× recovery lives entirely in the
**neighbour** term, which is genuinely disc-vs-disc and where the tight disc is
correct. Measured, §1a leaf at 25 apart: **4.25 → 20.00** (4.7×); at 22 apart
**1.70 → 18.77** (11×). That result stands.

**Options for Majed** (not ruled — this is a locked decision being overturned by
measurement, and reversing it is his call):
- **a.** Revert the hard tier to the root law. Neighbour term keeps the tight disc.
- **b.** Hard tier takes `max(R_root, R_tight)` — both are sound containment
  certificates, so the less restrictive one is safe. Costs a second solve.
- **c.** Keep decision 5 as ruled and accept that cell-hosted glyphs shrink ~17%.

Recorded as §7z 5d / 5e-obs; `docs/motif-footprint-fix-decisions.md` §7z is the
running amendment log.

---

## ✅ FIXED in `2aa964c` — a real bug in `5f7a640`, then latent

The composition was derived from `placementMatrix`'s compose order, not guessed:
the reserve offset is `R(θ−φ)·f̂c`, and `R(θ+φ)·(−f̂c.x, f̂c.y)` when flipped, with
`φ = root.angle`. `φ = 0` short-circuits, so no shipped glyph moved; the
regression tests use synthetic glyphs. §7z row `7g` has the derivation and the
before/after numbers. The description below is kept verbatim.

`placementEngine.js:759` computes the reserve offset as `u = Rot(θ)·f̂c`, but
`instancing.js:62` applies `R(−root.angle)` **before** the core transform. When a
glyph carries `root.angle ≠ 0` the reserve rotates differently from the art.

Constructed case — `slice100` with `root.angle: 90`: ink lands **74.9% of the
reserve radius outside** the committed disc. On a laser that is a cut outside the
material.

Dormant **only** because all 62 built-ins are `angle: 0` and `importMotif.js:116`
hard-codes 0 — but `PenCanvas.jsx:433-435` lets the user drag it. Fix before the
default flips.

---

## 🟠 Two more that need doing

**`AnchorGhostOverlay.jsx:445` will crash.** It calls `resolvePlacements` with no
glyph, and `placementEngine.js:382/:399` now throws in `'tight'` mode (correct —
decision 7d). `MotifPattern.js:167` has the same gap. Assigned to **#206**;
**#207 is blocked on it.** Verified directly.

**§5f was not built.** `overrides.js:299` is still `if (angle != null)
next.rotation = angle;`, untouched. Decision 1b (the angle override recomputes
the world footprint centre) is **#205**'s scope — but `5f7a640`'s commit message
claims §5f, which it should not.

---

## What landed

| ticket | commit | what |
|---|---|---|
| #198 | `a11bd65` | `minEnclosingCircle.js` — Welzl, ported from the validated harness |
| #199 | `9caa645` | `SCHEMA_VERSION → 2`, saved layers pinned to `'root'` |
| #200 | `0fd65f7` | `Rejection` gains `rotation` |
| #201 | `578cb27` | all 62 glyph records gain `footprintCenter` / `footprintRadius` |
| #203 | `e336f4e` | `footprintSolve.js` — the stable root pair |
| #204 | `5f7a640` | the `'tight'` arm in `placementEngine` |

Plus doc commits `3be932e`, `965afe9`, `406f343`, `b0ab38a`, `959a0da`.

**Not built:** #202 (importMotif measures its own footprint — note it emits
neither field today, so **every user-imported glyph throws under `'tight'`**),
#205, #206, #207. #208 is deliberately unlabelled.

## Verification that was actually done

- **#203** validated to **4.3e-16** relative against an independent bisection
  reference sharing no algebra with it, across 5952 glyph × rotation × distance
  cases. Mutation-tested: the textbook root form breaks 193 of them.
- **#204** adversarially reviewed. All six primary claims **CONFIRMED by
  independent recomputation**, not code-reading: `'root'` byte-identity (512-config
  sweep against a pre-change worktree, 0 numeric diffs), units normalisation on
  all three paths, `margin` solve-then-scale, `placed` taking the offset disc,
  the four-RNG-draw keystone unmoved, and tangency to 1.4e-14 over 8.5M samples.

## Things the docs got wrong, now corrected

Every one was a plausible number that had not been measured. Treat any figure in
§5 not traceable to `scripts/measureGlyphFootprints.mjs` as unverified.

1. **"4.00× for all 59 vector built-ins"** — read off a top-12 table sorted
   descending by that ratio. Truth: a structural *ceiling*, 24 of 62 sit on it,
   median 3.42, and there are 58 vector built-ins.
2. **`slice100`'s worked example** — `fc.y = −32.28` / `fr = 32.28` are just
   `viewRadius/2`. Real: `{0, −28.755}` / `49.0968`. Had propagated into #201.
3. **"up to 2× bigger in a cell"** — see the blocking item. Backwards.
4. **#207's acceptance criterion** — "a golden that shrank is a bug" is false; 7
   of 174 shrink from greedy redistribution. Replaced with a population test
   (§7z 7e).
5. **#198's worked example** specified an MEC that could not span its own two
   points; **#200's** file list named a test file holding no golden.

## Suggested order when resuming

1. ~~Rule decision 5 (blocking).~~ Ruled and built — `2aa964c`.
2. ~~Fix the `root.angle` bug.~~ Built — `2aa964c`.
3. #206 including the crash blocker, then #205, #202.
4. #207 last, against the replaced criterion.
