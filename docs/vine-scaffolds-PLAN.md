# Vine Motif Scaffolds — Build Plan

**Branch:** `feat/motif-lines-updates` (ported from `vine-motif-scaffolds`) · **Date:** 2026-07-26, updated 2026-07-29
**Status:** ALL BUILT on this branch, suite-green (7779): T3 branch, T1 normal-offset+side, T2 rinceau, T4 order filter, S1 dendrite paths, + `magnetscroll` (supplement doc, supersedes-or-derisks T6 islimi). Remaining: T6 proper (islimi repeat modules) if magnetscroll doesn't cover it, R1 warp check, Majed eyeball on everything.
**Companion to:** `docs/vine-scaffolds-RESEARCH.md` (candidates, sources, ranking)

RESEARCH names the techniques and ranks them. This doc turns that ranking into
sequenced tickets against verified seams in the codebase, and records the two
decisions RESEARCH deferred.

---

## 0. Decisions locked

**D1 — Branchy scaffolds ship as SEMANTIC hosts** (`tip` + `crossing` + `edge`),
not as edge hosts.

A rooted skeleton has *real* termini and *real* junctions; "flowers at the tip"
is `tip` semantics, and `zones.js:66-78` already routes `role:'tip'` straight to
the Apex zone. Building them as edge hosts would derive approximate tips from
min-`s`/max-`s` edge samples and would never give junctions their own glyph.
Cost: a new case in the `getSemanticAnchors` switch (`semanticAnchors.js:1081`)
plus tests in a 1923-line suite, per scaffold — paid once if the extractor is
written against a shared skeleton contract (§2).

**D2 — Strahler branch order ships as a new `order` filter in the chain**, not
as a new Zone axis. ADR 0008 is not amended.

Depth selection composes by stacking chain blocks (`route` → `order` → `sequence`)
rather than becoming a third maker-facing zone. Additive to `chain.js`, leaves the
Apex/Stem contract and the zoned-sequencer UI untouched.

---

## 1. Verified ground truth (new since RESEARCH.md)

Each of these was checked against source this session; they reshape the cost table.

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| V1 | **Open diffgrowth emits ONE open polyline.** `topology:'open'` runs `beginShape()` → `vertex()×n` → `endShape()` with no `CLOSE`, over the whole settled node array, and reseeds at the top of `generate()`. | `DifferentialGrowth.js:302-311`, `:40` | The §0 contract is satisfied *today*. T0 is a look-at-it task, not a build task. |
| V2 | **Capture records openness correctly.** `endShape()` with no arg → `closed:false`. | `capturePolylines.js:158` | `zones.js` Apex derivation (min-`s`/max-`s` on open, tip-less paths) genuinely fires for V1. No hidden blocker. |
| V3 | **`FractalTree.js` exists and was NEVER registered.** `git log -S FractalTree -- index.js` is empty; the file was carried through the DrawingContext migration (63882bf) but never entered `PATTERN_CLASSES`. | `patterns/FractalTree.js`, `patterns/index.js:37-59` | No prior removal decision to respect. A head start on Honda bifurcation — but see R3 for what it costs. |
| V4 | **Strahler is not expressible today.** `partitionZones` switches on a fixed `role` enum into a binary Apex/Stem; chain blocks filter on `role`/`pathScope`/count/density/field. Nothing reads arbitrary `anchor.meta`. | `zones.js:66-78`, `chain.js:59-64,262-274` | Confirms D2 is a real (if small) contract change, not a pattern param. |
| V5 | **Alternation is half-built.** `flip` already runs a legacy 2-cycle and `orientation.useNormal` already aims glyphs along the normal. But `orientation.offset` is **degrees of rotation**, not a positional offset. | `placementEngine.js:216,345,355` | The rinceau alternation rule needs exactly one new thing: a *positional* normal offset. That is T1, and it benefits every edge host. |
| V6 | **`hostSeed` is already threaded generically.** All three `getSemanticAnchors` callers pass `hostSeed` regardless of pattern type; only the `grid` case consumes it. | `MotifPattern.js:128`, `Inspector.jsx:949`, `AnchorGhostOverlay.jsx:169` | A new stochastic extractor gets its seed for free. Removes the biggest hidden cost from D1. |
| V7 | **Semantic hosts emit their own `edge` anchors — capture never runs for them.** `spiralAnchors` builds its arm paths and calls `sampleEdgeAnchors` itself; `isEdgeHost` is set-membership plus one hand-written grid special case, with no generic "semantic host also gets captured" route. | `semanticAnchors.js:706-716`, `hostKinds.js:134-138` | T3's extractor must do its own arc-length sampling. Grows T3; sets `spiralAnchors` as the model (§2). |

---

## 2. Architecture — the shared skeleton core

The constraint that shapes every branchy ticket:

> `getSemanticAnchors(patternType, params, canvasW, canvasH, opts)` is a **pure
> function of params**. It never sees the drawn output. (Only `voronoi` takes
> resolved geometry in, via `opts.drawnEdges`.)

So a semantic branchy host must have a skeleton that is computable **twice,
identically** — once by `Pattern.generate()` to draw it, once by the extractor to
anchor on it. The codebase already has the precedent: `gridGeometry.js` is the
shared core that `Grid.js` draws and `gridAnchors.js` anchors against.

**Therefore every branchy scaffold ships as a pair:**

```
src/lib/patterns/<name>Skeleton.js   ← pure. buildSkeleton(params, w, h, rng)
                                       → { nodes[], parent[], paths[], order[] }
src/lib/patterns/<Name>.js           ← Pattern class. draws paths[]
src/lib/motif/semanticAnchors.js     ← new case. reads the same buildSkeleton()
```

Three properties fall out of getting the core's return shape right:

- **`paths[]` = root→tip polylines, not per-segment lines.** Emitting whole
  root→tip paths (rather than one `ctx.line` per segment, which is what both
  `FractalTree.js` and `Dendrite.js` do today) is what makes the pattern read as
  stems rather than confetti for a user who never touches motifs — and it gives
  the extractor the paths it needs to arc-length sample (V7). It does **not**
  route the host through edge capture: `isEdgeHost` (`hostKinds.js:134-138`) is
  membership in `EDGE_MOTIF_HOSTS` plus one hand-written grid special case. A
  semantic host emits its own `edge` anchors.
- **`parent[]` makes Strahler a pure post-pass.** Branch order is computed from
  the parent array in one traversal; it does not belong in the pattern class.
- **`rng` is injected, not created** — mirroring `makeP5Random(opts.hostSeed)` in
  the grid extractor, which V6 confirms is already plumbed.

**The model to copy is `spiralAnchors`, not `gridAnchors`** (V7). Its shape,
verified at `semanticAnchors.js:634-730`:

- builds its own paths, then calls `sampleEdgeAnchors(paths, { count,
  includeEndpoints: false, idPrefix: 'edge' })` — endpoints excluded so `edge`
  samples never duplicate `tip` anchors;
- exposes the sample count as a **host param** (`edgeSamplesPerArm`) — T3 needs
  an `edgeSamplesPerBranch` equivalent;
- gets `meta.pathIndex` for free from `sampleEdgeAnchors`, which is exactly the
  key `zones.js` and `chain.js` group by;
- fixes emission order (crossings, edges, tips) for determinism;
- **refuses to emit** (`return null`) when drawn geometry can't be tied to the
  ideal curve within a finite tolerance — the honesty gate that R1/R2 inherit.

The three-way branching enum from RESEARCH §1 (**monopodial / sympodial /
dichotomous**) is a parameter of `buildSkeleton`, shared by every scaffold that
uses it. Sympodial — terminal bud stops and an axillary bud takes over — is the
"stems with a flower at the tip" look formalized, and should be the default.

---

## 3. The add-a-pattern checklist

Enumerated once from the `diffgrowth` registration surface. **Every new-pattern
ticket below inherits this list**; it is not repeated per ticket.

| # | File | What |
|---|---|---|
| 1 | `src/lib/patterns/<Name>.js` | class w/ `generate()` **and** `contentFor(color)` (SVG parity) |
| 2 | `src/lib/patterns/index.js:37` | import + `PATTERN_CLASSES` entry |
| 3 | `src/lib/patterns/index.js:60`ff | seed-using exclusion list — add **only** if `generate()` is seed-pure |
| 4 | `src/constants.js:45` | `PATTERN_TYPES` — `{ id, label }` |
| 5 | `src/constants.js:80` | `DEFAULT_PARAMS` entry |
| 6 | `src/constants.js:534` | `PATTERN_PARAM_DEFS` — sliders/selects + tooltips |
| 7 | `src/constants.js:1121` | `PATTERN_TAXONOMY` — family/geom/form/det/mark/sym/blurb |
| 8 | `src/constants.js:1169` | `PATTERN_SYMBOLS` — 2-letter code |
| 9 | `src/lib/useLayers.js:139` | randomize `types` array |
| 10 | `src/lib/patternThumbnail.js:45` | thumbnail param overrides (perf cap) |
| 11 | `src/lib/tierLimits.js:10` | tier list (currently commented — check before editing) |
| 12 | `src/lib/motif/hostKinds.js:26` or `:39` | `SEMANTIC_MOTIF_HOSTS` / `EDGE_MOTIF_HOSTS` |
| 13 | `src/lib/motif/hostKinds.js:68` | `DEFAULT_SEMANTIC_ROLE` — must be a role the host emits under **default** params |

---

## 4. Tickets

Sequenced, not parallel. Each proves a seam the next one leans on.

### T0 — Point the vine at open diffgrowth · **zero code · HUMAN GATE**
Set an existing `diffgrowth` layer to `topology:'open'`, host a vine on it, look
at it. V1+V2 confirm it structurally satisfies the contract and that Apex
derivation fires; whether it *reads as a vine* is an eyeball call.
**Outcome decides** whether the meandering-tendril look needs its own pattern at
all, or whether the remaining work is purely rinceau + branchy.
**Acceptance:** Majed's judgment, recorded here. No tests.

#### T0 VERDICT — 2026-07-26 · **REJECTED as a plant scaffold**

Majed, on seeing the evidence: *"diffgrowth is basically just one long squiggle,
not one that can support multiple apexes."* Correct, and **structural — not a
tuning problem**. At `symmetry:1`, `generate()` seeds a single ~8-node segment
and emits one `beginShape`/`endShape` (`DifferentialGrowth.js:88-96,308-311`);
**no parameter can produce a second strand**. `symmetry>1` stamps rotated copies
of the same squiggle around a shared root cluster — a rosette arrangement, not a
plant. So Apex = 2 is a ceiling, and the zoned Vine chip degenerates to 2
rosettes + 47 leaves.

**Consequences:**
- Open diffgrowth is **not** a substitute for the branchy work. It is a meander.
  The F1 `repulsionRadius` preset follow-up is dropped with it — not worth a chip
  for a two-flower host.
- **T3/T5 get MORE load-bearing**, not less: the branchy family is the only one
  that yields *one connected plant with many termini* (see the amended test).
- **T2/T6 are untouched.** A rinceau spine is also 1 path / 2 tips, but its
  payload is the alternating leaves ALONG the body (Stem), not the termini — a
  running scroll is not supposed to flower at its ends. T6 islimi supplies tip
  multiplicity from its many scroll terminals.
- S1 (dendrite root→tip extraction) rises in value: it is the one cheap way to
  get a many-termini host out of existing code.

#### AMENDED ACCEPTANCE TEST — terminus multiplicity

RESEARCH §0 tests for *an* open path with a root and a tip. Necessary, but **not
sufficient**, and T0 is the case that proves it: the test passes on a host that
can never read as a plant. Add a fourth condition — **count the termini, and ask
whether they come from one connected structure or N disconnected ones**, because
"flowers at the tips" is only legible when tips are plural.

| Host | Paths | Tips | Connected | Reads as |
|---|---|---|---|---|
| `diffgrowth` open | 1 | **2** (ceiling) | — | a meander |
| `flowfield` | ~796 | ~1592 | **no** — unrelated trails | a *field* of stems |
| branchy (T3/T5) | 1 skeleton | many | **yes** | **one plant, many flowers** |

This is why flowfield "works" in RESEARCH §0 — not because any single trail is
good, but because there are hundreds of disconnected ones. Neither shipped host
gives one connected plant with many termini. That gap IS the feature.

#### T0 evidence — gathered 2026-07-26

Headless harness drove the real pipeline (`DifferentialGrowth.generate` →
record-mode `P5Adapter` → `capturePolylines` → `sampleEdgeAnchors` →
`partitionZones` → real `STARTER_CHIPS['vine']` → zoned sequencer →
`MotifPattern`) at the app-default 1152×1152. Glyphs are the real
`rosette`/`leaf`, not stand-ins. No app source touched. 21 panels + 42 SVGs in
scratchpad; harness is disposable.

**The contract holds in practice, not just structurally.** All 10 assertions
pass: open ⇒ 1 path per symmetry copy, `closed:false`, 1200 pts, Δs exactly
24.000, **Apex = exactly 2** at s=0 and s=3072. The closed control yields
**Apex = 0**, so the discriminator is real rather than vacuous.

Four findings that bear on the plan:

- **F1 — `repulsionRadius` is the legibility lever; seed and `maxNodes` are not.**
  rr 8: 38% of anchors dropped by the empty-circle solver, 12% of glyphs at the
  3 px sizing floor. rr 40: **0% dropped, none at floor**, median footprint
  10.9–14.5 px. Same algorithm, same strand length, completely different read.
- **F2 — the spine covers ~2% of the canvas at stock defaults** (bbox 203×140 on
  1152²), reaching 22% only at the slider ceilings (`maxNodes` 3000,
  `repulsionRadius` 40). **Not caused by `topology:'open'`** — the closed default
  is equally compact (173×188). This is a `diffgrowth`-at-12″-canvas property,
  so it is not evidence against the open mode.
- **F3 — the worry list came back clean.** Across every variant: 0 self-crossings
  (differential growth is self-avoiding by construction), 0 points off-canvas,
  0.00 px worst footprint overlap. Collisions are resolved by dropping and
  shrinking, never overlapping — the drop % *is* the visible cost.
- **F4 — flowfield is far lossier at the Apex contract than open diffgrowth.**
  Default flowfield (800 particles): 93% of anchors dropped, 135 of 1592 Apex
  rosettes stamped. Open diffgrowth: 2 of 2, every single-copy variant. Worth
  weighing — the host RESEARCH calls "the one that works" is the weaker one on
  termini specifically.

**Revises the follow-up:** discoverability is *not* the only one. A chip that
merely flips `topology` lands the user on a 203×140 px tangle with a third of its
leaves dropped and glyphs near the sizing floor. A usable preset must raise
`repulsionRadius` too (F1). Scope the chip accordingly.

### T1 — Positional normal-offset in placement · **small · unblocks T2**
Per V5, `orientation.offset` is rotation-degrees; there is no way to push a glyph
*off* the spine along its normal. Add a positional offset along `anchor.normal`,
so a 2-slot alternating sequence produces the rinceau side-to-side read without
any pattern-specific code.

**Design decision inside this ticket — do NOT derive side-alternation from
`flip`.** They are two independent controls that the rinceau rule happens to use
together: `flip` mirrors the *glyph template*, side-alternation picks *which side
of the spine* it sits on. Deriving one from the other makes "alternating sides,
same orientation" and "same side, mirrored glyphs" both inexpressible — and
because a specified slot `flip` REPLACES the legacy 2-cycle
(`placementEngine.js:345`), a 2-slot sequence with `flip:false` on both would
silently kill side-alternation too. Give the side its own 2-cycle / slot field.
- **Files:** `placementEngine.js` (~`:216` defaults, `:332-355` resolve loop), its
  1007-line test suite.
- **Acceptance:** offset 0 is byte-identical to today (existing docs must render
  unchanged — the same discipline as ADR-0005's RNG invariants); non-zero offset
  displaces along `anchor.normal`; side-alternation and `flip` are independently
  settable, and all four combinations are covered by tests.
- **Why first:** benefits every edge host, and T2 is a much smaller ticket once
  it lands.

#### T1 SHIPPED — 2026-07-29

`orientation.normalOffset` (magnitude, **canvas px**, per-role overridable) ×
`side` (sign). Side has its own layer 2-cycle `placement.sideAlternate` and its
own per-slot `slot.side` (`+1`/`-1`/`0`, non-finite ⇒ unspecified), gated by its
own `sideSpecified` flag — no coupling to `flip` anywhere.

Three things worth carrying into T2:

- **Units are canvas px because the rule is.** RESEARCH §2 step 4 writes the
  displacement as `0.02–0.08·W` — a fraction of the strip WIDTH. A glyph-relative
  unit would also be unavailable: the drawn radius is not known until the
  empty-circle solve, and that solve consumes the displaced centre.
- **The offset folds into the LATERAL JITTER's coefficient**, not a third term in
  `x`/`y` — same axis (`anchor.normal`), so downstream (packing, `hostRadius`
  containment, `footprintCenter`, SVG export) sees the move for free, and the
  zero case takes the legacy expression literally (`-0 + 0` is `+0`, and
  `lateralDisp` genuinely IS `-0` at default settings).
- **`sideAlternate` indexes the GLOBAL survivor index**, while the sequencer's
  cycle counter restarts per `meta.pathIndex`. On a 1-path rinceau spine they
  coincide; on a multi-path host only the slot route gives per-path x-o-x-o.
  Identical to `flip`'s existing limitation.

### T2 — Rinceau spine pattern · **low · EDGE host · the tracer bullet**
The serpentine spine from RESEARCH §2. A single open path — no junctions — so it
is correctly an **edge** host, not semantic; Apex falls out of terminus
derivation (V2). Sine spine (`A ≈ 0.06–0.12·W`) or a chain of Bézier S/C modules.
- **Files:** §3 checklist, `hostKinds.js:39` (EDGE set).
- **Acceptance:** §3 + emits one open polyline per spine; canvas == SVG; a 2-slot
  alternating sequence with T1's offset produces the running-scroll look.
- **Risk:** low. This is the "almost certainly looks good on the first try" one.

### T3 CONTRACT — `buildSkeleton` (frozen 2026-07-26, before implementation)

**Decision: T3's first implementation is SPACE COLONIZATION**, not Honda
(Majed, 2026-07-26). Rationale: it is RESEARCH's best-looking branchy scaffold,
and it solves canvas coverage *by construction* — attractor distribution IS the
shape mask, so filling a lozenge / medallion / border strip is the same lever.
T0's F2 (diffgrowth covering 2% of a 12″ sheet) made coverage a live concern;
Honda would have required tuning depth/length to fill the page. Honda drops to
an optional later generator behind the same contract; **T5 is absorbed into T3**.

```js
// src/lib/patterns/spaceColonizationSkeleton.js  — PURE. no p5, no DOM.
buildSkeleton(params, canvasW, canvasH, rng) → {
  nodes:    {x, y}[],        // absolute, canvas-centred frame
  parent:   Int32Array,      // parent node index; -1 at the root
  tips:     number[],        // node indices with no children
  junctions:number[],        // node indices with ≥2 children
  order:    Int32Array,      // Horton–Strahler order per node
  paths:    { points: {x,y}[], nodeIds: number[], tipNode: number }[],
  bbox:     { minX, minY, maxX, maxY },
}
```

**Path decomposition is main-branch (Strahler-continuation), NOT one-path-per-tip.**
This is the load-bearing detail. Walking every tip back to the root would put the
trunk in *every* path, so `sampleEdgeAnchors` would stamp the trunk N times and
the vine would pile glyphs on it. Instead: at each junction the highest-`order`
child **continues** the current path and every other child **starts** a new one.
The result partitions the edge set — each edge in exactly one path — and each
path ends at a real tip. Consequences that fall out for free:

- `meta.pathIndex` (which `zones.js` and `chain.js` group by) indexes these
  stems, so **each stem contributes its own Apex flower** — the many-termini
  property T0 proved diffgrowth cannot deliver.
- Paths are long and continuous, which is what a vine needs to ride.

**`order` ships in the core now, wired up in T4.** It is a ~15-line post-pass over
`parent[]` and the decomposition already needs it. Computing it here de-risks T4
to "attach to `meta` + add the filter." Per T4's hard constraint it goes in
`meta`, never in the anchor id.

**Correction to §2:** that section said the monopodial/sympodial/dichotomous enum
is "a parameter of `buildSkeleton`, shared by every scaffold that uses it." With
space colonization first that is wrong — its branching is *emergent* from
attractor competition and the enum does not map onto it. The enum belongs to
Honda/L-system generators. `buildSkeleton`'s contract must NOT require it; it is
a per-generator param.

**Params** (coverage first, since that is why this algorithm was chosen):
`envelopeShape` (circle / lozenge / rect / ring — the shape mask), `envelopeScale`
(fraction of `min(canvasW, canvasH)`, default high enough to fill the sheet),
`attractorCount`, `attractionRadius`, `killDistance`, `stepLength`, `angleJitter`,
`maxNodes` (perf cap), and `edgeSamplesPerBranch` (mirroring spiral's
`edgeSamplesPerArm`, per V7).

**Perf:** naive space colonization is O(attractors × nodes) per step. Use a
spatial hash — `DifferentialGrowth.js` already has a working one (bucket key
`gx*73856093 ^ gy*19349663`, 3×3 neighbourhood) to copy rather than invent.

### T3 — Skeleton core + `branch` pattern · **medium · SEMANTIC host · the keystone**
The §2 architecture, realized once. Honda recursive bifurcation as the first
consumer, salvaging `FractalTree.js` (V3) rather than starting blank.
- **New:** `<name>Skeleton.js` pure core; `getSemanticAnchors` case emitting
  `tip` (termini) + `crossing` (bifurcations) + `edge` (its own
  `sampleEdgeAnchors` pass over the root→tip paths, per V7/§2);
  monopodial/sympodial/dichotomous enum; an `edgeSamplesPerBranch` param
  mirroring spiral's `edgeSamplesPerArm`.
- **Files:** §3 checklist, `hostKinds.js:26` (SEMANTIC set) + `:68`
  (`DEFAULT_SEMANTIC_ROLE` — pick a role the default params actually emit; a
  bifurcator always has tips, so `tip` is safe, but verify against the
  spiral dead-default lesson in that file's comment).
- **Acceptance:** extractor output matches the drawn skeleton exactly under the
  same `hostSeed`; `edge` samples exclude endpoints so they never duplicate
  `tip`s, and respect `MIN_EDGE_SPACING` (`anchors.js:20`); emission order is
  fixed for determinism; `AnchorGhostOverlay` pre-render preview works (semantic
  hosts get this, edge hosts don't); canvas == SVG.
- **Risk:** the two-computations-must-agree seam. Mitigated by the shared core —
  which is the whole reason for §2.

### T4 — `meta.order` + chain `order` filter (Strahler) · **small · needs T3**
Per D2/V4. Strahler number as a pure post-pass over `parent[]`, written to
`anchor.meta.order`; a new filter block that selects on it.
- **Files:** skeleton core (compute), `semanticAnchors.js` (attach to meta),
  `chain.js:59-64` (typedef) + `:262-274` (dispatch), chain UI, tests.
- **Acceptance:** order filter selects the expected subset on a known skeleton;
  absent/legacy anchors with no `meta.order` are unaffected; ADR 0008 untouched.
- **Hard constraint: branch order goes in `meta`, NEVER in the anchor id.**
  `anchorId()` (`anchors.js:168`) builds ids and random-mode slot dealing hashes
  on `anchor.id` (ADR-0005 survivor-stability). Folding order into the id
  re-rolls every random-mode glyph assignment in every existing document — a
  silent regression that only surfaces on old saves.
- **Payoff:** big palmettes on the trunk, buds on first-order twigs — the thing
  that makes the output read as a plant rather than a scatter.

#### T4 BUILT — 2026-07-29

**The rule, one sentence for all three roles:** an anchor carries the Strahler
order of the SEGMENT ARRIVING FROM ITS PARENT — the order of that segment's distal
(child) node, which is the order of the subtree it feeds. So `crossing`/`tip` take
`order[node]` (a node's own Strahler order IS its parent edge's), and an `edge`
sample takes the order of the segment its arc length `s` lands on, upper-inclusive
(`cum[i] < s <= cum[i+1]` ⇒ the distal segment).

**Discovered while building — every tip is order 1, unconditionally.** A terminus
is childless, and `strahlerFromParents` gives every leaf order 1, the trunk's own
terminus included. So the `order` filter differentiates STEM anchors (crossings +
edge samples) and never Apex flowers; a band starting above 1 drops every tip.
Pinned by test and stated in the extractor header + the card's hint line rather
than left as a surprise. The payoff still lands — "palmettes on the trunk" is a
Stem-zone selection — but order-differentiated FLOWERS would need a second,
path-scoped key, deliberately not shipped (one anchor, one order).

**Filter shape:** `{type:'order', min?, max?}`, an inclusive band; absent/null is
unbounded on that side. Anchors with no numeric `meta.order` ALWAYS pass — there is
no `passUnordered` flag, because the requirement is "a misplaced order block must
never empty the selection" and an option is a way to violate it. `min > max` is a
real contradiction rather than a wandering slider, so it is not leniently repaired
(it matches no ordered anchor); the rack clamps its two inputs against each other,
which makes that state unreachable from the UI instead of silently fixed.

**Files:** `semanticAnchors.js` (attach), `chain.js` (typedef + `applyOrder` +
dispatch), `chainEditor.js` (`makeBlock`), `modeMatch.js` (canonicalization),
`MotifBlockRack.jsx` (labels + add menu + `OrderCardBody`). ADR 0008 untouched.
Anchor ids are pinned byte-identical to pre-T4 by a fingerprint test.

### T5 — Space colonization · **medium · reuses T3's seam**
RESEARCH's best-looking branchy scaffold. Once T3 exists, this is a second
`buildSkeleton` implementation behind the same contract — the extractor,
hostKinds wiring, and Strahler pass are already paid for.
- **Extra lever:** attractor *distribution* is a shape mask (lozenge, medallion,
  border strip), which is how carpet field-fills actually behave.

### T6 — Islimi scroll pairs · **medium-high · variant of T2**
Counter-rotating scroll units as the rinceau spine's **repeat module**, not a new
pattern from scratch. Highest aesthetic payoff, highest risk of looking wrong.
Build last, on proven machinery.
- **Naming note:** RESEARCH §3's islimi (scaffold) / khatai (blossoms) distinction
  maps 1:1 onto host-pattern / motif-glyph-set. Worth using in the UI.

### S1 — Dendrite root→tip extraction · **side quest, any time**
Not a new pattern: `Dendrite.js` stores bonds as `{ p, c }` parent→child
(`:67,212`), so the tree is already walkable. Emit one polyline per root→tip path
instead of one `<line>` per bond, and an existing failing host starts working.
Independent of everything above; good filler.

---

## 5. Cross-cutting acceptance criteria

Applies to every ticket that touches a pattern. Not repeated per ticket.

- **Canvas == SVG.** Plotter/laser export is the product. `contentFor()` must
  emit the same geometry `generate()` draws, from the same array.
- **Reseed at the top of `generate()`** (`randomSeed`/`noiseSeed`) — the capture
  probe must not perturb painted output. This is half the edge-host contract.
- **Determinism.** Same seed + params ⇒ identical geometry, in both the draw and
  the extractor.
- **Thumbnail perf cap.** Checklist #10 — branchy scaffolds and space
  colonization are the expensive ones.
- **Byte-identical defaults.** Existing documents must render unchanged; T1 is
  the ticket where this bites hardest.

---

## 6. Risks & open questions

- **R1 — Warp × new scaffolds.** Warp modulation is the known-fragile seam (the
  vine-vanishes case, fixed for grids by Bézier-flatten capture in Phase 2). New
  scaffolds have not been reasoned about under warp. Not a ticket; check it once
  T2 exists and file what you find.
- **R2 — Symmetry replication vs anchors.** `applySymmetryDraw` replays `drawBase`
  N times, so `symmetry > 1` yields N copies on canvas. The precedent is split:
  Grid replicates symmetry through its shared core; **Spiral and Recursive
  deliberately do not**, and document that their anchors describe the single base
  copy at default orientation (`semanticAnchors.js:621-627`). Follow
  spiral/recursive for T3 — describe the base skeleton and say so in the
  extractor header — unless T0/T2 surface a reason not to.
  **T0 supplied data:** on open diffgrowth, `symmetry:3` gives 132 cross-copy
  intersections (Apex still 6/6), but `symmetry:6` gives 552 and only **9 of 12
  expected Apex rosettes survive** — the copies' root ends cluster near canvas
  centre and the empty-circle solver eats three flowers. So symmetry silently
  degrades the Apex contract on a rooted host even without extractor
  replication. Strengthens the case for describing the base copy only.
- **R3 — `FractalTree.js` is a head start, not a gift.** It emits per-segment
  `ctx.line` (fragments, the same failure mode as dendrite), takes
  `symmetry = 'single'` as a **string** where current patterns use a number, and
  draws from `startY = canvasH * 0.3` rather than origin-centered. Expect to keep
  the recursion and rewrite the rest. Price T3 as a new pattern that borrows.
- **R4 — Reference images.** RESEARCH §4 lists sources but `docs/` still has no
  image library for islimi/rinceau. "Looks great" is decided by eye; scrape
  before T6, not during.

**NEEDS-HUMAN:** T0's verdict. Everything downstream assumes the vine still needs
new scaffolds — if open diffgrowth already nails the meandering-tendril look, T2
gets more valuable (it's the *ornamental* one, a different look) and any
"wandering vine" ambition drops off the list entirely.
