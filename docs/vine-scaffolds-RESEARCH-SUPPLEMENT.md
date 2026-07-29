# Vine Motif Scaffolds — Research Supplement

**Branch:** `feat/motif-lines-updates` · **Date:** 2026-07-29 · **Status:** research only, nothing built

This supplements `docs/vine-scaffolds-RESEARCH.md` (2026-07-25). That doc already covers
space colonization, L-systems, Honda bifurcation, self-organizing trees, Strahler/Tokunaga/
phyllotaxis vocabulary, rinceau/Vitruvian scroll/meander/guilloché/strapwork, and islimi
scroll pairs. This doc adds what a further literature/web pass turned up: things not in the
original doc, plus deeper treatment of two things it only mentioned in passing (leaf
venation, and the "magnetic curves" line underneath islimi). Same scoring frame: every
candidate is checked against the §0 contract in the original doc — **open, directional,
arc-length-ordered, ideally one connected structure with many termini** — before its
aesthetics are even discussed.

---

## 1. Wong, Zongker & Salesin 1998 — the paper the user named directly

*Computer-Generated Floral Ornament*, SIGGRAPH 1998 ·
https://dl.acm.org/doi/10.1145/280814.280948 (abstract/metadata; full text is paywalled —
ACM DL only, no open PDF found; a curated-but-unofficial mirror list is at
https://gwern.net/doc/design/typography/floral/index)

**Verdict up front: the original doc does not cite this paper**, despite Family C (islimi)
being conceptually right next to it. It should be. This is the founding CG paper for
"decorate an open path/region like a historical vine border," and it names the exact
abstraction the codebase already has:

> introduces **"adaptive clip art"** — a representation that "encapsulates the rules for
> creating a specific ornamental pattern" so the *same* pattern can be regenerated to fit a
> **different, arbitrarily-shaped region**. Generation is two-step: (1) synthesize the
> pattern's geometry as 2D curves + filled boundaries, obeying the encapsulated design
> rules; (2) render that geometry in any of several styles.

That is: a **host-shape + rule-grammar separation**, which is exactly what `hostKinds.js` +
a motif's glyph template already are. The paper is the historical/academic grounding for
the architecture, not a new build — cite it, don't reimplement it wholesale.

- **Why it clears/fails the contract:** ambiguous on its own — "adaptive clip art" is a
  *family* of techniques (the paper covers several stem-generation strategies, glyph
  packing, and clip-art reflection/scaling by branch level), not one path-emitting
  algorithm. It's the frame, not the mechanism.
- **Build cost:** high to reimplement faithfully (region-adaptive regeneration is the hard
  part — it is doing shape-matching, not just "draw a stem"). **Do not build this whole
  paper.** Cite it in the UI/copy as the lineage for "islimi scaffold hosts khatai glyphs,"
  and mine its two sub-ideas that *are* cheap (next two entries) instead.
- **Params the paper names:** number of branching levels, clip-art scale-by-level, stroke
  taper (their reference implementation tapers ~15px root → 0 at tip), reflection of
  clip-art across the stem to alternate sides.

### 1a. The "magnetic curves" stem generator — the cheap, concrete part of this family

*Magnetic Curves: Curvature-Controlled Aesthetic Curves Using Magnetic Fields*, Xu & Mould,
Computers & Graphics 2009 · cited 42×, lab page
https://gigl.scs.carleton.ca/sites/default/files/ling_xu/artn-cae.pdf (site now mostly dead,
paper indexed via Semantic Scholar/ResearchGate) — and a hobbyist reimplementation
specifically aimed at floral ornament: Konstantin Lopyrev, *Computer-generated floral
ornament based on magnetic curves* (2016), https://medium.com/@tokudu/computer-generated-floral-ornament-based-on-magnetic-curves-d77a3f206893
(code sold, not open — https://gum.co/floral — but the write-up documents the algorithm in
full, including the numerical-integration details).

**This is a genuinely new, concrete, cheap candidate — not in the original doc at all —
and it is the best available generator for Family C (islimi scroll pairs).** The physical
picture: simulate a charged particle moving through a magnetic field. Its trajectory
naturally spirals and decays — which is exactly the "S-scroll that tightens toward a
terminal palmette" look that hand-tuned Bézier islimi modules are trying to approximate in
the original doc's §3.

**The construction:**

1. Launch a particle with initial velocity; integrate its trajectory under a magnetic-field
   force with **Forward Euler** — trivial to port to JS, no ODE library needed.
2. Charge decays over the curve's lifetime: `q(t) = (T − t)^(−α)` where *T* is total curve
   length in samples and *α* controls how fast curvature decays — this is what turns a
   simple spiral into a *tapering* one that straightens out near the tip (again: exactly
   the islimi terminal-palmette taper).
3. **Branching is recursive, not scripted:** secondary particles are launched from points
   along the parent curve at intervals, with **alternating charge sign**, which is what
   produces counter-rotating scroll *pairs* rather than a single spiral — this is the
   mechanical explanation for why islimi looks like paired opposing scrolls (the original
   doc's §3 calls this out as a manual "repeat rule"; here it falls out of the sign flip for
   free).
4. Four particle "levels" (Lopyrev's term) give four branch-thickness classes; interpolate
   the raw point cloud with Catmull-Rom for a smooth stroke; taper stroke width from root to
   tip.

- **Why it clears the contract:** each particle trajectory *is* an open, arc-length-ordered,
  root→tip path by construction — no post-processing needed, unlike topographic/wave/
  spirograph's closed contours. Branch launch points are real `crossing` anchors; particle
  endpoints are real `tip` anchors. Same three-role shape as space colonization.
- **Build cost: low–medium.** It's an Euler-integrated ODE plus a recursive launch rule —
  meaningfully *cheaper* than space colonization (no attractor bookkeeping, no Voronoi/
  kill-radius state) and cheaper than hand-authoring islimi Bézier modules, while producing
  the family's signature spiral-pair look natively.
- **Params:** *T* (curve length), *α* (curvature decay — low α = tight spiral held longer,
  high α = quick straightening), *B* (field strength — amplitude of the spiral), branch
  launch interval, number of levels, alternating-sign rule, stroke taper curve.
- **Recommendation:** build this **before** hand-authoring islimi scroll modules. It's a
  cheaper, more principled route to the same family than what the original doc scoped as
  "Med–High."

---

## 2. Deeper on leaf venation (Runions et al. 2005) — the original doc undersells this

The original doc mentions the venation paper in one parenthetical under space colonization
("arguably more on-point for arabesque") and never returns to it. It deserves its own
entry because the mechanism is meaningfully different, not just a reskin.

*Modeling and visualization of leaf venation patterns*, Runions, Fuhrer, Lane, Federl,
Rolland-Lagan, Prusinkiewicz, SIGGRAPH 2005 · https://algorithmicbotany.org/papers/venation.sig2005.pdf

Space colonization (already in the main doc) has attractors get **consumed** once a vein
reaches kill-distance. Venation instead runs three coupled processes: (1) veins grow toward
auxin (hormone) sources; (2) the **auxin source distribution is itself modified by vein
proximity** — sources near a vein get displaced/thinned rather than deleted outright; (3)
both the vein graph and the source field deform under a **simulated leaf-growth** step
(the blade itself expands over simulation time, dragging the vein network with it).
Implementation leans on Voronoi diagrams for the spatial competition and keeps
frame-to-frame coherence explicit.

- **Why this matters for Naqsha specifically:** the leaf-growth deformation step is a
  built-in "fill this expanding region" behavior — closer to how a carpet **field** (not
  just a border) actually gets filled with reticulate vine networks than space
  colonization's fixed-envelope fan-out is. It also naturally produces denser, more
  net-like (reticulate) meshes rather than sparse dichotomous trees, which reads as
  "trellis" rather than "single plant."
- **Build cost:** medium-high — a genuine step up from space colonization (you need the
  Voronoi-based competition *and* the source-redistribution rule *and*, if you want the
  signature look, the growth-deformation loop). The growth-deformation part is skippable
  for a v1 (static blade) without losing the reticulate-density character.
- **Params:** initial auxin source density/distribution (again, a shape mask — same lever
  space colonization has), source "kill"/thinning radius, growth rate + duration if the
  deformation step is included, vein-width-from-connection-graph rule (this gives correct
  taper for free, same idea as the pipe model already in the main doc).
- **Recommendation:** not a v1. File as the natural v2 upgrade path once space colonization
  ships and if its output reads as "too obviously one plant" rather than "a filled field."

---

## 3. Agent-based curvature-drift branching (hyphae / mycelium growth)

Not in the original doc. Distinct mechanism from Honda (fixed split angle) and from space
colonization (attractor-seeking): each growing tip is a simple stateful agent — position,
heading, **curvature** — and curvature itself random-walks over time.

Peter Collingridge, *Simple simulation of hyphae growing and splitting*,
https://www.petercollingridge.co.uk/blog/alife/hyphae-simulation/ (Python + a Khan Academy
JS port, code linked from the post) — closest thing to a minimal reference implementation
found. Also: Ryan Alexander's *Mycelium* (Processing, image-driven — hyphae grow toward
brighter/lighter image regions, https://www.creativeapplications.net/project/mycelium-processing/)
and Pentagram/Counterpoint's *Hypha* (https://www.creativeboom.com/news/pentagram-hypha/,
typographic application of the same idea) as higher-production reference points, neither
with public source.

**The construction:**

1. Each active tip has `(x, y, heading, curvature)`.
2. Each tick: heading += curvature (so the path is a continuously-curving arc, not a
   polyline of straight segments); position advances along heading at fixed speed.
3. Each tick, independently: some probability the curvature itself perturbs (a random walk
   on curvature — this is what makes the strand meander rather than settle into a circle),
   and some (usually lower) probability the tip **splits into two children** at roughly
   ±45° with *opposite* curvature sign (again, the alternating-sign trick, same mechanical
   driver as magnetic curves' scroll pairs).
4. Kill a tip when it collides with an existing trail or exits the bounds (avoidance is
   optional — Ryan Alexander's version uses it, Collingridge's minimal version doesn't).

- **Why it clears the contract:** trivially — every tip's history is an open, arc-length
  path, splits are real `crossing` anchors, dead tips are real `tip` anchors. Reads as "many
  fine tendrils forking off a meandering main stem," which is a *different* silhouette from
  Honda's clean symmetric fork or space colonization's fan — closer to the fine secondary
  tendrils in Ottoman/Persian scrollwork than either.
- **Build cost: low.** This is arguably the **cheapest branchy-and-meandering scaffold in
  either doc** — no spatial index needed for the no-collision-avoidance variant, no
  attractor bookkeeping, just per-tip state updated in a tick loop. Strong candidate for a
  first tracer bullet alongside Honda.
- **Params:** curvature-drift step size (how tightly it curls), split probability per tick,
  split angle + sign-flip rule, max tip count / kill conditions, speed (affects sample
  density along arc-length).

---

## 4. Recursive circle-packing growth

Not in the original doc, and it has a genuinely different, useful property: **the scaffold
and the per-node scale channel are the same data structure.**

Kevin Workman's construction, written up by Gorilla Sun: *A Recursive Circle Packing
Algorithm for Organic Growth Patterns*,
https://www.gorillasun.de/blog/a-recursive-circle-packing-strategy-for-organic-growth-patterns/
(pseudocode + walkthrough, no packaged repo — assemble from the post).

**The construction:** starting from a seed circle, recursively place a new child circle at a
random angle/distance in the parent's vicinity; child radius is constrained to some fraction
(the writeup uses 80–95%) of the parent's radius; reject placements that collide
(node–node, node–edge, edge–edge checks) or exceed a max-branch-length / max-depth budget.
Branches terminate naturally wherever a valid placement can't be found or depth caps out —
this **is already an open branching tree with many termini**, same shape as space
colonization's output, by construction.

- **Why it's worth a separate entry, not a footnote on space colonization:** the packing
  *is* a size field. In the current codebase (per the `hostRadius` sizing channel added in
  PRD #143 / #178–182), a scaffold that ships each node with a **meaningful, collision-safe
  radius already baked in** is a rare freebie — no separate glyph-scale-by-branch-order pass
  needed the way Strahler ordering requires for Honda/space-colonization output. The
  natural read is a "beaded"/pearled vine — could be a distinct look from the smooth-stem
  families, closer to strung-rosette borders than leafy rinceau.
- **Build cost: low–medium.** Simpler state than space colonization (no attractor set, no
  Voronoi), but the collision checks (node–edge, edge–edge) are fiddly compared to hyphae's
  no-avoidance variant.
- **Params:** child radius ratio range, branch angle/distance jitter, max depth, collision
  tolerance, seed circle radius.

---

## 5. DecoBrush — the closest published system to "decorate this exact open path," and why it's still a parking-lot item

*DecoBrush: Drawing Structured Decorative Patterns by Example*, Lu, Barnes, Wan, Asente,
Mĕch, Finkelstein, SIGGRAPH Asia 2014 · full PDF (readable):
https://www.connellybarnes.com/work/publications/2014_decobrush.pdf

Confirmed detail (read the actual paper, not just an abstract): given a small library of
hand-drawn decorative exemplar strokes ("floral," "leaves," "curly," etc. — Fig. 2 in the
paper) and a **user-sketched path**, the system (1) splits the query path into segments,
matches each to a similar segment among the exemplars via **dynamic programming**, (2)
**as-rigid-as-possible warps** each matched exemplar segment onto its query segment, (3)
resolves overlaps/misalignment at segment joints with **graph cuts**, (4) runs
structure-preserving hierarchical **texture synthesis** to repair joint artifacts and add
plausible structural variation, (5) **vectorizes** the synthesized raster back to curves.
It literally cites Wong et al. 1998 as a predecessor.

- **Why it clears the contract better than anything else in either doc:** it is *defined* on
  an open user path with a clear direction of travel, and its whole purpose is "make this
  path look like it belongs to a named historical ornament style." That is the vine-mode
  brief almost word for word.
- **Why it's still a parking-lot item, not a build candidate:** the pipeline is a genuine
  research stack — DP segment matching + ARAP warp + graph-cut seam resolution + multi-scale
  texture synthesis + vectorization. This is a multi-month reimplementation, not a param
  change or a new pattern class. Categorically the highest build cost of anything in either
  doc.
- **A cheap partial win worth extracting without building the whole paper:** the
  **DP segment-matching idea alone**, applied to the *existing* motif glyph library instead
  of a learned exemplar corpus — i.e., picking which registered glyph goes at which
  arc-length position by a best-fit search over segment curvature/length rather than by
  even spacing — is a much smaller, self-contained upgrade to the *placement* step, fully
  decoupled from scaffold generation. Flagging as a separate, later idea; not scoped here.
- **Params (for completeness, not because this is getting built soon):** exemplar library
  choice, segment length granularity, ARAP rigidity weight, texture-synthesis patch size /
  refinement passes.

---

## 6. Rejected / marginal candidates (checked, don't build)

Keeping these in per the original doc's skeptical format — worth recording that they were
checked and why they fall short, so nobody re-researches them.

| Candidate | What it is | Why it's marginal here |
|---|---|---|
| **Celtic knotwork / interlace, tile-grammar version** | Concrete, implementable construction: a grid of ~26–28 tile types (rotatable/flippable) chosen to satisfy edge-connectivity, rendered as a ribbon with over/under alternation resolved algorithmically. Working reference implementations exist: https://github.com/dmackinnon1/celtic (JS, SVG output) and the older Boston-Baden "Knotware" writeup, http://www.boston-baden.com/hazel/Knotware3/explain-key.htm | Traditional Celtic interlace is **structurally closed** — the whole point of the weave is that the ribbon returns on itself with no loose ends. That's the exact failure mode §0 already disqualifies `topographic`/`wave`/`spirograph` for. A knotwork *border* (a long braid strip) is arguably "open" but has only **two** termini total (its two ends), not the "many termini" half of the acceptance test. Concretely: this is the closest thing to a real Celtic-vine-interlace algorithm that exists in the literature, and it still doesn't clear the bar. Worth having the citation on file in case a future "closed/braid" host family gets scoped, but reject for vine mode as specified. |
| **William Morris mirrored-tile grid construction** | Historically documented: a single motif tile is mirrored across one axis, then the pair is mirrored again, then the 2×2 block is repeated on a grid — this is how Morris disguised the repeat seam in patterns like *Acanthus*. | Not a scaffold algorithm at all — it's a **tiling-level repeat rule** operating on an already-finished pattern block, not a way to generate an open root→tip path. Relevant to a future border/field-repeat feature, irrelevant to vine-host generation specifically. Recorded so it doesn't get re-suggested as if it were new. |
| **"Anemone" branching-walk system** | Searched because it was named in the task as a candidate technique. Turned out to be a **Grasshopper (Rhino) plugin** for building feedback/recursion loops (used to implement L-systems, growth sims, etc. *inside* Grasshopper) — not itself a distinct branching algorithm. | No new technique here beyond L-systems, which the original doc already covers in depth. Not a separate entry. |

---

## 7. Ranked recommendation (supplementary to the original doc's §5 table)

Same payoff ÷ cost frame as the original. This table is additive — read alongside, not
instead of, `vine-scaffolds-RESEARCH.md` §5.

| # | Candidate | Family | Cost | Roles | Why |
|---|---|---|---|---|---|
| 1 | **Hyphae / curvature-drift agent branching** | A (new) | Low | `tip`, `crossing`, `edge` | Cheapest branchy-and-meandering scaffold found in either doc — no spatial index required. Different, finer-grained silhouette than Honda or space colonization; closest to the fine secondary tendrils seen in Ottoman/Persian scrollwork. Strong co-favorite for first tracer bullet. |
| 2 | **Magnetic curves (Xu & Mould 2009)** | C (deepens islimi) | Low–Med | `tip`, `crossing`, `edge` | The concrete, cheap generator the original doc's Family C was missing — produces the counter-rotating scroll-pair + tapering-terminal look *mechanically* (alternating charge sign, decaying curvature) instead of by hand-tuned Bézier modules. Build this before hand-authoring islimi units. |
| 3 | **Recursive circle-packing growth** | A (new) | Low–Med | `tip`, `crossing`, `edge` | Only candidate anywhere in either doc where per-node scale is a free byproduct of the scaffold itself, not a separate Strahler-order pass. Beaded/pearled look, distinct from smooth-stem families. |
| 4 | **Leaf venation (Runions 2005), full treatment** | A (deepens space colonization) | Med–High | `tip`, `crossing`, `edge` | Reticulate field-fill rather than sparse fan-out — the carpet-*field* look, not just carpet-*border*. v2 upgrade once space colonization ships, not a v1. |
| 5 | **Wong et al. 1998, cited not built** | B/C (frames both) | — (citation only) | — | Grounds the "islimi = host, khatai = glyphs" architecture in its founding academic source. Extract nothing but the citation and the "adaptive clip art" framing for docs/UI copy. |
| 6 | **DecoBrush** | — (new, own category) | Very High | n/a — park it | Best conceptual match to the whole feature brief ("decorate this exact open path like a named historical style") of anything found, and the least buildable. Multi-month research stack. Its DP segment-matching idea, applied to the existing glyph library instead of a learned corpus, is a separable smaller idea for the *placement* step — not scoped here. |
| — | Celtic interlace, William Morris grid, Anemone | — | — | rejected | Checked and recorded so they don't get re-suggested: closed-loop structure, tiling-level not path-level, and "not actually an algorithm" respectively. |

**The one thing this pass changes about the original doc's plan:** if Family C (islimi) is
still on the roadmap, **do not start with hand-authored Bézier scroll modules** — prototype
magnetic curves first (#2 above). It's cheaper than what the original doc scoped ("Med–High,
build as a repeat-module variant of rinceau") and it produces the alternating-scroll-pair
behavior as an emergent property of the charge-sign rule rather than as an authored
alternation script.

## Evidence gaps

- The Wong et al. 1998 and Xu & Mould 2009 papers are both paywalled at the primary source
  (ACM DL / Elsevier-adjacent venue); this doc's algorithmic detail for both comes from a
  secondary source (Lopyrev's 2016 write-up, which explicitly reimplements and documents
  both) rather than the original PDFs. Read the primary sources before committing to exact
  numeric defaults (the charge-decay exponent α, field strength B) if #2 gets built —
  Lopyrev's blog post has worked values but they're his tuning, not the papers'.
- No public source was found for Ryan Alexander's original *Mycelium* (Processing) or
  Pentagram/Counterpoint's *Hypha* — both are documented in prose/video only. Collingridge's
  independent from-scratch write-up is the only one of the three with linked code, and is a
  simpler (non-image-driven) variant.
- DecoBrush's exemplar library (Fig. 2 styles: aboriginal, doodle, curly, floral, leaves,
  palm, rose, wings) is not published as data — only as figure images in the paper — so even
  the "cheap partial win" (DP segment-matching against a library) would need a
  purpose-built exemplar set, not a reused public one.
