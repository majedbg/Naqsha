# Vine Motif Scaffolds — Research

**Branch:** `vine-motif-scaffolds` · **Date:** 2026-07-25 · **Status:** research only, nothing built

The vine motif is a chain of glyphs distributed **along a host curve**. Today only
`flowfield` reads well — it looks like stems with flowers at the tip. This doc names the
established techniques for producing *other* kinds of line scaffolds a vine can ride, from
two directions: **algorithmic botany** (branchy, sprouting-from-a-point) and **ornamental
tradition** (serpentine, arabesque, carpet-border). Each candidate is scored against the
host contract the codebase already enforces.

---

## 0. The acceptance test (why flowfield works and dendrite doesn't)

Before any candidate is worth building, it has to clear the EDGE-host contract in
`src/lib/motif/hostKinds.js:30-49`. The vine-specific version of that contract is stricter
than the comment says:

1. **An OPEN, directional path with a root end and a tip end** — long, smooth, and
   arc-length-ordered. FlowField works because one particle trail = one continuous root→tip
   path: arc-length sampling reads as "positions up a stem," and the last sample reads as
   "the tip." *Openness is the part that actually discriminates.* A closed loop has no
   terminus, so there is nowhere for a flower to sit.
2. **Reseed at the top of `generate()`** (`randomSeed`/`noiseSeed`) so the capture probe in
   `capturePolylines.js` does not perturb the painted output.
3. **A meaningful anchor role.** Edge hosts fall back to `edge`
   (`defaultRolesForHost`, `hostKinds.js:69-81`). "Flowers at the tip" is really `tip`
   semantics — a rooted skeleton has *real* tips and *real* junctions, so the strongest
   candidates want to be **semantic** hosts (`tip` + `crossing` + `edge`), not just another
   edge host. That is a bigger build than an edge host; decide it up front.

**This test explains all six of the other registered edge hosts, not just one.** Walking
`EDGE_MOTIF_HOSTS`:

| Host | Emits | Verdict |
|---|---|---|
| `flowfield` | open particle trails | ✅ the one that works |
| `topographic` | marching-squares iso-contours that close back on their start (`TopographicContours.js:22,307`) | ✗ closed — no tip |
| `wave` | contour `beginShape`/`endShape` loops (`WaveInterference.js:81`) | ✗ closed |
| `spirograph` | one closed `endShape` curve (`Spirograph.js:46`) | ✗ closed |
| `phyllodash` | short disconnected dash segments | ✗ fragments, not paths |
| `diffgrowth` | `topology` defaults to `'closed'` — a grown ring (`DifferentialGrowth.js:28,44,61`) | ✗ closed *by default only* — see below |
| `dendrite` | one `<line>` per DLA bond at `nodeSpacing = 6` (`Dendrite.js:5-10,45-59`) | ✗ fragments |

Two of these are already-paid-for near-misses:

> **`diffgrowth` with `topology: 'open'` is already a vine spine.** It is a registered edge
> host today and it has an open-path mode that seeds a strand instead of a ring
> (`DifferentialGrowth.js:61,99-102`). An open differential-growth strand is a long, smooth,
> meandering, arc-length-ordered path — the wandering-tendril look, available with a param
> change and no new code. **Try this first, before building anything.**

> **`dendrite` root→tip path extraction.** Verified: bonds are stored as
> `{ p, c }` — parent index → child index (`Dendrite.js:67,212`), so the tree *is* walkable.
> Walking each leaf node back to the root and emitting one polyline per root→tip path turns
> DLA fragments into real stems with no new pattern class. A build option, not a research
> finding — flagging it, not scoping it.

---

## 1. Family A — Rooted branching skeleton ("a plant sprouting from one point")

This is the family the user described first. All of these emit long root→tip paths
natively, so they satisfy the contract with no post-processing.

### Space colonization — **strongest fit**
Runions, Lane & Prusinkiewicz, *Modeling Trees with a Space Colonization Algorithm*,
EG Workshop on Natural Phenomena 2007 · https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf
(Same authors' earlier **leaf-venation** paper is arguably more on-point for arabesque —
venation networks are exactly the "vine filling a shape" look.)

Scatter attraction points in the region to fill; each growing tip steps toward the mean
direction of the attractors within its *attraction radius*; attractors within the *kill
distance* of a node are consumed. Growth naturally fans into a tree that fills the
envelope.

- **Params that control the look:** attractor count & distribution (this is what sets the
  silhouette), kill distance, attraction radius, step length, branching-angle jitter.
- **Anchor roles:** `tip` (branch termini — the flower positions), `crossing` (bifurcation
  nodes), `edge` (arc-length along each root→tip path). All three are real.
- **2D JS feasibility:** easy–moderate. Reference 2D implementations:
  https://jasonwebb.github.io/2d-space-colonization-experiments ·
  https://github.com/nicknikolov/pex-space-colonization
- **Key lever for Naqsha:** the attractor *distribution* is a shape mask. Scatter attractors
  in a lozenge, a medallion, or a border strip and the vine grows to fill exactly that —
  which is how carpet field-fills actually behave.

### L-systems
Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants* ·
https://algorithmicbotany.org/papers/modeling-plant-development-with-l-systems.pdf

A rewrite grammar expanded N times, then run through a turtle with a push/pop stack.
Deterministic and highly controllable — the opposite end of the dial from space
colonization's emergent look.

- **Params:** production rules, divergence angle, internode length + contraction ratio,
  recursion depth, tropism/gravity vector, stochastic rule weights.
- **Feasibility:** moderate. Trivial to write; the work is in authoring good rule sets and
  exposing them as sliders rather than as a text field.
- **Note:** shallow depth (3–6) and small angles give the slender, vine-like read; deep
  recursion reads as "tree," which is a different aesthetic.

### Honda's geometric tree model
Honda (1971) — recursive bifurcation governed by branching angle + length ratio;
see https://link.springer.com/article/10.1007/BF02344260 for the lineage.

The cheapest possible rooted skeleton: recursively split a segment by (angle, length
ratio). Two or three sliders and you have a controllable ramified vine. Good candidate for
a **first tracer bullet** before committing to space colonization.

### Self-organizing tree models
Palubicki et al., SIGGRAPH 2009 · https://algorithmicbotany.org/papers/selforg.sig2009.pdf

Local competition for light/resource produces balanced branch distribution emergently —
apical dominance falls out rather than being dialed in. Highest fidelity, highest build
cost. Park it.

### Structural vocabulary worth exposing as params

These are the terms that turn a branching skeleton from "noise" into "a plant," and they
map directly onto controls:

- **Strahler / Horton–Strahler number** (Horton 1945; Strahler 1957) ·
  https://en.wikipedia.org/wiki/Strahler_number — a per-segment branch *order*: unbranched
  tips are order 1; two order-*k* branches meeting make order *k+1*; an order-*k* meeting an
  order-*j*<*k* stays *k*. **This is the single most valuable idea in this doc for the
  motif system**: it lets the sequencer place *different glyphs by branch depth* — big
  palmettes on the trunk, buds on first-order twigs — which is what makes the result read
  as a plant instead of a scatter. It also composes with the existing Apex/Stem zoning
  (ADR 0008).
- **Tokunaga side-branching** (Turcotte et al. 1998,
  https://pdodds.w3.uvm.edu/research/papers/others/1998/turcotte1998a.pdf) — extends
  Strahler to describe how many order-*j* branches hang off an order-*k* branch. Leaf
  venation and river networks share nearly identical statistics; a useful realism dial.
- **Monopodial vs sympodial branching** (Britannica,
  https://www.britannica.com/science/sympodial-branching): *monopodial* = terminal bud keeps
  leading, laterals stay subordinate → pyramidal, one dominant spine. *Sympodial* = terminal
  bud stops (often because it became a flower) and an axillary bud takes over → candelabra,
  zig-zag. **Sympodial is the "stems with a flower at the tip" look** the user already likes,
  formalized. *Dichotomous* = both tips equal at every split. One three-way enum here would
  produce three visibly different plants from one algorithm.
- **Pipe model / da Vinci taper** (Shinozaki; review at
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5906905) — a branch's cross-section is
  proportional to the foliage it supports. Gives principled stroke-weight taper per segment
  and per-glyph scale falloff toward the tips.
- **Phyllotaxis** (137.5° divergence, Vogel's formula;
  https://algorithmicbotany.org/papers/modelling-spiral-phyllotaxis.pdf) — already a pattern
  in the registry, but relevant here as a *rule for placing glyphs around a stem*, not as a
  scaffold.
- **Tendril / twining mechanics** — helical coiling with perversion points
  (https://physics.hmc.edu/~gerbode/wppriv/wp-content/uploads/2013/02/ScienceTendrilPreprintReduced.pdf).
  A 2D projection is just a decaying sine wrapped on the stem. Cheap, and it's the detail
  that makes a vine read as a *climbing* vine rather than a tree.

---

## 2. Family B — Undulating / serpentine stem (the "sine-like" one)

The user's second description, and it has an exact name: **rinceau**, a.k.a. the
**running scroll** or **undulating vine border** (https://en.wikipedia.org/wiki/Rinceau).
It is the single most common carpet-border and frieze construction in the world, and it is
trivially compatible with the polyline contract.

**The construction, precisely:**

1. Centerline is a serpentine spine — `y = A·sin(kx + φ)` on a strip of width *W*, or a
   chain of cubic-Bézier S/C modules. Practical default amplitude `A ≈ 0.06–0.12·W`.
2. Parameterize by arc-length *s*; sample attachment points at a fixed Δs. Compute the unit
   tangent **T**(s) and normal **N**(s) at each.
3. **Alternation rule (this is the whole trick):** successive motifs go on *alternating
   sides* of the normal, with the glyph template flipped 180° for the opposite side.
4. Offset the glyph root along **N**(s) by ~`0.02–0.08·W`; rotate so its central vein sits
   within ±10–25° of −**T**(s) so it appears to droop naturally.
5. Optionally add a smaller bud or rosette at the midpoints / inflection points.
6. Repeat by translation for a border; mirror across a central axis for a symmetric one.

Numeric defaults above are pragmatic generator values — the historical literature records
only the qualitative rules (regular spacing, strict alternation).

**Adjacent named borders in the same family**, all sine-or-arc spines and all cheap to add
as spine *variants* rather than separate patterns:

| Term | Geometry | Source |
|---|---|---|
| **Vitruvian scroll** (running dog / wave-scroll) | Repeating wave arcs tangent to a baseline; two-arc module reflected + translated | https://en.wikipedia.org/wiki/Vitruvian_scroll |
| **Meander / Greek key** | One line folding back at right angles on an orthogonal lattice; smooth variant uses quarter-circle fillets | https://en.wikipedia.org/wiki/Meander_(art) |
| **Guilloché** | Two or more sinusoidal ribbon centerlines, phase-offset, winding around evenly spaced centers | https://en.wikipedia.org/wiki/Guilloch%C3%A9 |
| **Strapwork / interlace** | Ribbon offsets from a medial graph on a lattice, with over/under parity resolved algorithmically | https://britannica.com/art/strapwork · https://faculty.washington.edu/moishe/branko/BG187%20Interlace%20patterns.pdf |

**Assessment:** lowest build cost of anything in this doc, highest certainty of looking
good, and it directly answers "mimic what tiling / arabesque / carpets look like." Strong
candidate for the first thing built.

---

## 3. Family C — Counter-rotating scroll pairs (**islimi**) — what arabesque actually *is*

The user didn't name this one, but it is the answer to why arabesque looks the way it does.
Historically, **islimi** (اسلیمی, also *eslimi*) is not "a wavy line with leaves" — it is a
network of **spiralling tendrils**, built from paired counter-rotating scroll units, each
terminating in a palmette.

The Topkapı Scroll (Necipoğlu, Getty, https://www.getty.edu/publications/virtuallibrary/pdf/9780892363353.pdf)
records the seven *asl* ("root") design modes of the Persianate decorator's tradition and
explicitly distinguishes:

- **islimi** — "the ivy-and-spiral / vine-and-tendril pattern": the *spiral scaffold*. The
  structural, connective element.
- **khatai** (khata'i, ختایی) — "the Chinese floral pattern": the *blossoms* — lotus, peony,
  buds — that ride on it. `architecture4design.com` puts it exactly: "*Khatai motifs are the
  stems which are like a string on which the flowers, buds, leaves and branches lie.*"

**This distinction maps 1:1 onto the codebase's own architecture:** islimi is the *host
pattern*, khatai is the *motif glyph set*. That's a strong signal the abstraction is right,
and it's good vocabulary for the UI (an "Islimi" scaffold that hosts "Khatai" glyphs).

Companion terms in the same system:

- **Rumi** — the Seljuk/Anatolian split-leaf: paired comma/kidney lobes with hooked tips,
  built from paired C-scrolls around a small hub. Generative treatment:
  *Re-Generating Continuous Rumî Compositions*, Bridges 2018 ·
  https://archive.bridgesmathart.org/2018/bridges2018-23.pdf
- **Palmette / half-palmette / split-palmette** — the fan terminal that islimi scrolls end
  in; a central triangular hub with radiating petal arcs and paired S-scroll volutes.
  https://en.wikipedia.org/wiki/Palmette (morphology per Riegl, *Stilfragen*)
- **Saz** — 16th-c. Ottoman: long serrated leaves on twisting stems. A glyph-template
  variant, not a scaffold.
- **Moresque** — the European Renaissance reading of the same thing: multi-branched
  rinceau, half-leaves along the stems. Met has a plate:
  https://metmuseum.org/art/collection/search/889737
- **Waqwaq** — rinceau whose tendril terminals are figurative heads. Out of scope, but it
  confirms terminals-as-a-slot is the traditional structure.
- **Continuous stem / "infinite pattern"** — the compositional principle that the tendril
  network is unbroken and implies endless extension.
  https://metmuseum.org/essays/vegetal-patterns-in-islamic-art

Encyclopaedia Iranica on the carpet-border case (https://iranicaonline.org/articles/carpets-iv):
the arabesque (*šāḵa-ye eslīmī*, "arabesque branch") is a stylized vegetal scroll with
bifurcated leaves, and in border patterns occurs "in continuous scrolls, contiguous pairs,
or **alternately reversed contiguous pairs**." That last phrase is a directly implementable
repeat rule.

**Assessment:** highest aesthetic payoff and the most culturally specific to Naqsha, but
the hardest to make *look right* procedurally — a bad islimi looks obviously bad in a way a
bad flowfield does not. Best approached after the rinceau spine exists, by making scroll
units the spine's repeat module.

---

## 4. Reference images (for eyeball calibration, not citation)

`docs/` has no image library for this yet. Worth scraping before building, since "looks
great" gets decided by eye:

- Nazmiyal islimi/arabesque plates — https://nazmiyalantiquerugs.com/area-rug-guide/motifs-symbols/islimi
- Art of Islamic Pattern, islimi primer with the Seljuk/Ottoman motif-family table —
  https://artofislamicpattern.com/resources/introduction-to-islimi
- Met open-access: "Vegetal Patterns in Islamic Art" essay + the Moresque pattern-repeat plate
- Old New House: an islimi lifted *out of woven context* — the cleanest look at the bare
  spiral-vine skeleton — https://oldnewhouse.com/pages/islimi-motif-in-oriental-and-persian-rugs

---

## 5. Recommendation

Ranked by (payoff ÷ build cost), against the §0 contract:

| # | Candidate | Family | Cost | Roles | Why |
|---|---|---|---|---|---|
| 1 | **Rinceau / serpentine spine** | B | Low | `edge`, `tip` | Sine spine + strict alternation. Directly answers the carpet/arabesque ask. Almost certainly looks good on the first try. |
| 2 | **Honda recursive bifurcation** + Strahler order | A | Low–Med | `tip`, `crossing`, `edge` | Cheapest rooted skeleton. Proves out the semantic-host work before spending it on space colonization. Sympodial/monopodial/dichotomous as a 3-way enum. |
| 3 | **Space colonization** | A | Med | `tip`, `crossing`, `edge` | Best-looking branchy scaffold, and attractor distribution doubles as a shape mask (medallion / border fill). |
| 4 | **Islimi scroll pairs** | C | Med–High | `edge`, `tip` | Highest payoff, highest risk. Build as a repeat-module variant of #1, not from scratch. |
| 0 | **`diffgrowth` with `topology: 'open'`** | — | ~zero | existing | Not a new pattern at all — an already-registered host in a mode nobody pointed the vine at. Meandering tendril spine for free. Try before building. |
| — | Dendrite root→tip path extraction | — | Low | existing | Not a new pattern; fixes an existing host (bonds already carry parent pointers). Cheap side quest. |

**The one decision to make before building anything:** whether the branchy scaffolds
(#2/#3) ship as EDGE hosts (fast, `edge` role only, glyphs just distribute along stems) or
as SEMANTIC hosts (`tip` + `crossing` + `edge`, so flowers land on real termini and
junctions get their own glyph). Semantic is what makes Strahler-ordered glyph swapping
possible and is what "flowers at the tip" actually means — but it means writing a new
extractor in `semanticAnchors.js`, not just adding a set entry in `hostKinds.js`.

## Evidence gaps

- No historical numeric ratios exist in the literature for carpet-border leaf spacing or
  leaf angle; §2's numbers are pragmatic generator defaults inspired by the qualitative
  rules (regular spacing, strict alternation).
- The word "arabesque" is a 19th-c. French coinage; modern usage often conflates islimi and
  khatai, which the Topkapı tradition treats as distinct modes.
