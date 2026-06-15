# A Periodic Table of Patterns — Taxonomy for the Pattern Picker

> Design reference for the "create new layer" pattern-picker modal: a grid of cards
> arranged like a periodic table, where **position carries meaning** — neighbours
> relate. The two axes are the two spectra you intuited: **geometric → organic**
> (horizontal) and **spatial form** (vertical, with circular and grid as two rungs
> of a fuller ladder). Generative *family* becomes the **colour** of each card —
> the way metals/non-metals/metalloids are coloured *regions* of the real table,
> not its axes.

---

## 1. The core idea: what makes the periodic table work

The periodic table is powerful because **both axes are real, independent
gradients** (period = electron shell, group = valence electrons), and everything
else — a thing's *appearance*, *family*, *reactivity* — is an **emergent readout
of its position**. The metals/non-metals/metalloids are coloured *regions* that
fall out of where elements land; they are not the axes.

So our table needs **two genuine gradients**, and you already named them:

- **X axis — geometric → organic** (your first spectrum). Left = rule-bound,
  crystalline, fully determined by an equation. Right = seeded, grown, emergent,
  shaped by simulation or chance. This is also the order→chaos progression of
  Wolfram's cellular-automaton classes and the autonomy spine of Shiffman's
  *Nature of Code* (math → fields → agents → CA).
- **Y axis — spatial form** (your second spectrum, broadened). "Circular vs grid"
  is real but only places *some* patterns — a flow field or a Voronoi cell field
  is neither circular nor grid. So we widen it to the full **morphology ladder**
  that every pattern lands on, with your two as rungs:

  `radial/spiral → wave/concentric → grid/woven → nested/self-similar → flowing/directional → cellular/reticulate → branching/dendritic → packed/scattered`

- **Colour = generative family** (the "chemistry"). Patterns made by the same
  mechanism share a colour and therefore cluster into regions — curves pool in the
  geometric-radial corner, growth/agents in the organic-branching corner. Family
  is the *readout*, not an axis, so it can't fight the two gradients.

This works as a 2D table (not a flat list) because the genotype→phenotype map is
**many-to-many**: a honeycomb look can come from Voronoi *or* reaction-diffusion
*or* circle-packing; one Gray-Scott equation yields spots, stripes and labyrinths.
Same form, many mechanisms (read *across* a row); same mechanism, many forms (one
colour spread *down* the table).

Three finer relationships become **per-card badges**, because they refine a cell
rather than position it (see §5):

- **Determinism** ● deterministic · ◐ seeded · ○ stochastic
- **Mark type** (plotter/cutter-relevant) ▬ continuous line · ┈ dash/stipple ·
  ▣ closed region/fill
- **Radial symmetry** ✦ supports n-fold rotation copies

---

## 2. The eight families (the colour legend)

Families are the colour regions, ordered by where they sit on the geometric→organic
axis. Each is a distinct generative mechanism.

| Key | Family | Mechanism | Typical position |
|-----|--------|-----------|------------------|
| **H** | **Harmonic Curves** | parametric equations traced over time | geometric · radial |
| **W** | **Waves & Interference** | superposition of periodic fields | geometric · wave |
| **T** | **Lattices & Tilings** | translational repeat of a motif | geometric · grid |
| **R** | **Recursion & Fractals** | self-similar subdivision | geometric · nested |
| **F** | **Fields & Flow** | trace a vector / noise field | seeded · flowing |
| **P** | **Partition & Packing** | divide or fill space by geometry | seeded · cellular/packed |
| **G** | **Growth & Agents** | self-organising motion over time | organic · branching |
| **C** | **Reaction-Diffusion & CA** | local rules → global pattern | organic · cellular |

---

## 3. The table (current 21 patterns + recommended additions)

`[bracketed]` = recommended new patterns (see §6). The letter on each card is its
family colour (legend above). **X = geometric → organic. Y = spatial form.**
A cell may hold several cards (a meaningful cluster); blank cells are meaningful
*gaps* — there is no such thing as a crystalline branch or an emergent radial
equation.

```
                  GEOMETRIC ─────────── order → chaos ─────────────► ORGANIC
                  (equation)   (parametric)   (seeded/noise)  (field/scatter)  (grown/emergent)
                ┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
 radial /       │ Spirograph H │ Phyllotaxis H│ PhylloDash  H│              │              │
 spiral         │ Spiral     H │ Feather     H│ RadialEtch F·│              │              │
                │[Lissajous] H │ Duality   H· │              │              │              │
                │[Superform] H │              │              │              │              │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 wave /         │ Waves      W │[Chladni /   W│ Topographic F│              │              │
 concentric     │ Moiré      W │ Cymatic]     │ (contours)   │              │              │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 grid /         │ Grid       T │[Penrose /   T│ Truchet    T │ [Maze]     G │[Cellular   C │
 woven / tiled  │ ModuleGrid T │ Quasicryst]  │              │              │ Automata]    │
                │ Girih      T │              │              │              │              │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 nested /       │ Recursive  R │[Quadtree   R]│              │              │              │
 self-similar   │[Hilbert    R]│[Apollonian R·│              │              │              │
                │  curve]      │  gasket]     │              │              │              │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 flowing /      │              │              │[Strange    F]│ Flow Field F │ Grain Field F·
 directional    │              │              │  Attractor   │ Flow Hatch F │ (→ growth)    │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 cellular /     │              │              │ Voronoi    P │              │ Turing     C │
 reticulate     │              │              │              │              │              │
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 branching /    │              │              │              │              │ DiffGrowth G │
 dendritic      │              │              │              │              │[L-System]  G │
                │              │              │              │              │[Dendrite/DLA]G
                ├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
 packed /       │              │              │ CirclePack P │[Poisson /  P]│              │
 scattered      │              │              │              │ blue-noise]  │              │
                └──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
   family colour:  H Harmonic  W Waves  T Tilings  R Recursion
                   F Fields/Flow  P Partition/Packing  G Growth  C RD/CA
   · = bridge pattern (sits between two families/forms — see below)
```

### How to read it (both axes are real)
- **Across a row** (fixed spatial form, left→right): the *same look* getting less
  rule-bound. Radial row: Spirograph (pure equation) → Phyllotaxis → Radial Etch
  (noise-warped rays). Grid row: Grid → Truchet (random tile rotation) → Maze →
  Cellular Automata. This is the "show me everything circular / everything
  grid-like" query — and it answers your geometric↔organic question *within* a form.
- **Down a column** (fixed order-level, top→bottom): the *same degree of
  determinism* across different spatial logics.
- **Colour regions** read like the metals/non-metals split: a warm cluster of
  Harmonic curves top-left, a cool Growth/CA cluster bottom-right, Fields & Packing
  bridging the middle.
- **The empty corners are the point.** Top-right (organic-radial) and
  bottom-left (geometric-branching) are blank because those combinations are
  near-impossible — exactly the kind of forced gap that makes the real table
  predictive. A pattern that filled one would be genuinely novel.

### Bridge patterns (·)
A few patterns honestly straddle two cells; place them on the boundary or let them
appear (dimmed) in both:
- **Duality** — radial curves *and* concentric waves
- **Radial Etch** — Harmonic Curves family, but its noise-warp pulls it toward Fields
- **Grain Field** — Fields & Flow shading into Growth & Agents
- **Apollonian gasket** — Recursion shading into Packing
- **Phyllotaxis** — a radial spiral that is also a packing (radial row, but kin to Circle Packing)

---

## 4. Per-card metadata (the badges)

Each card carries small badges so the grid stays scannable while encoding the
secondary spectra:

| Badge | Values | Why it matters here |
|-------|--------|---------------------|
| **Determinism** | ● deterministic · ◐ seeded · ○ stochastic | sets expectation for the randomize/seed controls |
| **Mark type** | ▬ line · ┈ dash/stipple · ▣ fill/region | predicts cut/score/engrave suitability & plotter time |
| **Symmetry** | ✦ radial n-fold · — none | most patterns support it; Voronoi/Waves/Topographic/Module Grid do not |
| **Density** | sparse ··· dense | rough ink/cut budget at default params |

Mark type is worth surfacing prominently because this is a **fabrication** tool
(pen-plotter / Silhouette/Cameo cutter, cut/score/engrave roles): a maker often
picks by *output medium* as much as by look.

---

## 5. What we deliberately did NOT use as an axis (and why)

These are real, rigorous classification systems — but they break as a *master
axis* for this set, so they live as sub-tables/badges:

- **Wolfram's 4 CA classes / Langton's λ (order→chaos).** Genuinely principled,
  but **single-peaked**: "complexity" sits *between* periodic and chaotic, not at
  the far end, and most of our patterns (Spirograph, Voronoi) have no position on
  a λ axis at all. → used as the **determinism badge** and the loose left→right
  ordering, not a literal axis.
- **The 17 wallpaper groups / 7 frieze groups (crystallographic symmetry).** The
  *most* literally periodic-table-like classification that exists (rows = rotation
  order {1,2,3,4,6}, columns = reflection/glide content; gaps forced by group
  theory). **But it only classifies the periodic/tiling subset** — of our set,
  essentially only Girih/Penrose qualify. → reserved as an optional **drill-in
  sub-table for the Lattices & Tilings family**, not the master grid.
- **Owen Jones, *Grammar of Ornament* (culture/style axis).** Provenance, not
  mechanism; maps many-to-many to algorithms (Moorish, Celtic, Roman interlace all
  reduce to the same groups). Not predictive of output. Only its
  geometric/floral/figurative motif split survives — already captured by our
  family ordering.

### Prior art we *did* lean on
- **Lengler & Eppler, *Periodic Table of Visualization Methods* (2007)** — the one
  real layout precedent: colour = family, one ordered axis = complexity, corner
  badges = metadata, hover = specimen image. We mirror this directly.
- **Philip Ball, *The Self-Made Tapestry* / *Nature's Patterns*** — organises
  nature's patterns by *process* (waves, branches, grains, packings, cracks) with
  morphology as the readout; validates the convergent morphology archetypes
  (spots · stripes · branches · spirals · cells · waves · packings · flows).
- **Bohnacker et al., *Generative Design*** and **Shiffman, *The Nature of
  Code***  — process-family spine ordered by ascending autonomy/complexity.
- **Turing (1952), Pearson (1993, 12 RD classes), phyllotaxis (golden angle
  137.5°), L-systems (Prusinkiewicz & Lindenmayer)** — mechanism grounding for
  individual families.

---

## 6. Recommended additional patterns

Chosen to (a) fill structural gaps in the table, (b) suit a pen-plotter/cutter
(single continuous paths, clean fills), and (c) fit the **Sonoform** sound→form
theme. Roughly priority-ordered.

| Pattern | Family | Fills gap / why | Plotter | Sono-fit |
|---------|--------|-----------------|---------|----------|
| **Hilbert / Peano space-filling curve** | R Recursion | a single unbroken line that fills a region — the ideal one-stroke plotter path; the table has no continuous-line fractal | ★★★ | — |
| **L-System Branch** | G Growth | botanical branching (Lindenmayer) — a glaring gap; nothing in the set branches like a plant/tree | ★★ | — |
| **Chladni / Cymatic nodal lines** | W Waves | standing-wave nodal figures on a vibrating plate — **literally sound made visible**; on-brand for Sonoform | ★★ | ★★★ |
| **Lissajous / Harmonograph** | H Curves | two-axis harmonic oscillation — a **harmonograph** is a pendulum drawing machine; sound/oscillation made line | ★★★ | ★★★ |
| **Truchet tiles** | T Tilings | grid of randomly-rotated arc/diagonal tiles — bridges geometric↔organic *within* a lattice; classic, cheap, beautiful | ★★★ | — |
| **Strange Attractor** (de Jong / Clifford) | F Fields | deterministic chaos → fine dust/veil; the table's purest "edge of chaos" exemplar | ★★ | — |
| **Penrose / Quasicrystal tiling** | T Tilings | 5-fold aperiodic tiling — the non-periodic complement to Girih's periodic stars | ★★ | — |
| **Cellular Automata** (Wolfram / Game of Life) | C RD/CA | the canonical rule-emergence pattern; completes the most "emergent" region | ★★ | — |
| **Apollonian gasket** | R↔P bridge | recursive circle packing — fills the Recursion↔Packing bridge slot | ★★ | — |
| **Maze / Labyrinth** | G Growth | recursive-division or CA maze — a single solvable path; very plotter-friendly | ★★★ | — |
| **Quadtree / recursive subdivision** | R Recursion | Mondrian-like rectangular subdivision; rectangular counterpart to the radial RecursiveGeometry | ★★★ | — |
| **Poisson-disk / blue-noise scatter** | P Packing | even-but-random point/dot fields — a stippling primitive feeding other patterns | ★★ | — |

**Top 4 if you want a tight first batch:** Hilbert curve, Chladni/Cymatic,
Lissajous/Harmonograph, Truchet — they fill real gaps, are plotter-perfect, and
two of them (Chladni, Harmonograph) reinforce the Sonoform identity.

---

## 7. Modal implementation notes

- **Data:** extend each entry in `PATTERN_TYPES` (`src/constants.js`) with
  `family` (H/W/T/R/F/P/G/C → drives card colour), `geomOrganic` (0–4, the X
  column), `spatialForm` (the Y row), `determinism`, `markType`, `symmetry`, and a
  one-line `blurb` — or add a parallel `PATTERN_TAXONOMY` map keyed by id to avoid
  touching the existing array shape. The dynamic `patternRegistry.js` should accept
  the same metadata so AI-generated patterns slot into the grid too.
- **Layout:** CSS grid, **columns = geometric→organic** (5 bands), **rows = spatial
  form** (8 rungs), **card colour = family**. A cell can stack >1 card. Card = mini
  live preview (reuse the pattern's `generate()` at a fixed seed/thumbnail size) +
  label + badges.
- **Interaction:** click a card → `updateLayer(id, { patternType, params:
  DEFAULT_PARAMS[type] })`. Hover → enlarge preview + show blurb. Optional filter
  chips for the badge dimensions ("only continuous-line", "only radial-symmetric")
  and a family-colour legend toggle to highlight one region at a time.
- **Drill-in (later):** the Lattices & Tilings family can open the 17-wallpaper-group
  sub-table for Girih/Penrose; the RD/CA family can expose the order→chaos λ slider.
