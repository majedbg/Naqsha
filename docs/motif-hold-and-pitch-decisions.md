# Motif `hold`, anchor pitch, and the footprint overlay — grilled decisions (2026-07-28)

Three tightly-coupled features, grilled together because they are one knob seen
from three sides: **how big a glyph draws when packing wants it smaller**
(`slot.hold`), **how far apart the anchors are in the first place**
(`edgeOpts.spacing`), and **the reveal that makes both legible**
(the footprint overlay).

Nothing here is built. This is the spec of record for the build.

---

## 1. The framing facts

Everything below was measured headless against the real engine
(`resolvePlacements` + `placementMatrix`), leaf glyph, stock starter-chip
defaults `sizing: {mode:'proportional', size:18, min:3, margin:0.85}`
(`starterChips.js:55`), anchors on a straight path.

### 1a. Glyphs are capped while nowhere near touching

Anchors 25 units apart:

```
leaf 0  radius 18.00 (100%)  drawn x[-5.4,  4.0]
leaf 1  radius  5.95 ( 33%)  drawn x[23.2, 26.3]
leaf 2  radius 16.19 ( 90%)  drawn x[45.2, 53.6]
leaf 3  radius  7.49 ( 42%)  drawn x[72.8, 76.7]

clear air between the DRAWN leaves: 19.2, 18.8, 19.1 units
```

Every other leaf is capped to a third of its natural size with **19 units of
empty air** to its neighbour. The alternating big/small sawtooth is the greedy
order-dependence of `placed`, not a design.

**Cause.** The collision footprint is a circle centred on the glyph's `root`
with `r = placement.radius`. The leaf's root is the blade *base*
(`glyphs.js:34-47`) and the art extends to one side, so:

| | |
|---|---|
| leaf polygon area | 139.5 units² |
| footprint disc at `viewRadius 20.1` | 1269.2 units² |
| **reserved / drawn** | **9.1×** |
| tight circumcircle of the art | centre `(10.0, −0.8)`, `r = 10.03` |
| **root disc / tight disc** | **4.0×** |

### 1b. At tight spacing the glyphs do not shrink — they vanish

8 anchors, sweeping spacing. `FLOOR` = rejected `below-floor`, `nofit` =
rejected `no-fit`:

```
gap 14   100%  nofit   47%   26%   44%   29%   42%   31%   dropped 1/8
gap 16   100%  nofit   66%   19%   59%   25%   54%   30%   dropped 1/8
gap 18   100%  nofit   85% FLOOR   98% FLOOR   87% FLOOR   dropped 4/8
gap 20   100%  FLOOR  100% FLOOR  100% FLOOR  100% FLOOR   dropped 4/8
gap 22   100%   19%   88%   29%   79%   37%   73%   42%   dropped 0/8
gap 25   100%   33%   90%   42%   83%   48%   77%   52%   dropped 0/8
```

At gap 20 **half the leaves are silently deleted** and every survivor reads
100%, so the layer looks correct — just sparse. Two units of spacing separates
"lose half your work" from "keep all of it". Nothing in the UI says so.

### 1c. Three of the four numbers that decide all this have no UI

| number | where | user-facing? |
|---|---|---|
| `sizing.size` | `starterChips.js:55` | **yes** — `Inspector.jsx:1420, 1669` |
| `sizing.margin` (0.85) | `starterChips.js:55` | no |
| `sizing.min` (3) | `starterChips.js:55` | no |
| `edgeOpts.spacing` (24) | `motifLayer.js:80` | no — **no writer anywhere** |
| `MIN_EDGE_SPACING` (4) | `anchors.js:20` | no (a floor, post-crash hardening) |

### 1d. The existing slot **Scale** control is non-monotone and lossy

6 anchors at gap 25, varying only `slot.sizeScale`:

```
Scale 100%   18.00   5.95  16.19   7.49  14.89   8.60      6 placed
Scale 150%   27.00  19.55   4.63  17.31   6.53           5 placed
Scale 200%   36.00  11.90  11.13  11.79  11.23           5 placed
Scale 300%   54.00  17.85   6.08  16.08                  4 placed
```

Asking for bigger leaves gives you one enormous leaf, some random middling
ones, and **fewer of them**. `motif-slot-card-decisions.md` decision 2 sold this
as "Repack — neighbours move," which is true; what it omits is that for any
glyph where `margin×R` binds, raising Scale moves the *neighbours* and does
nothing to the glyph being adjusted. This is very likely why a second control
was reached for at all.

---

## 2. Locked decisions

> **Provenance.** Every decision below was ruled by Majed. Decisions 1–13 and 19
> during the grill; decisions 14–18 and 20–22 in a ratification pass on
> 2026-07-28 **after** the grill had recorded its own recommendations as locked
> without an answer (see §7). **Three changed on ratification** — 15 (fields on
> `Placement`, not an opt-in channel), 16 (hovered slot + its captor, not every
> placement) and 22 (pitch deferred to a second PR). Decision 8 remains the one
> relayed-not-ruled item.

| # | Decision | Verdict |
|---|---|---|
| 1 | **Does a "never shrink" glyph reserve its un-shrunk footprint?** | **No.** `placed` keeps receiving `packedRadius`; only the *drawn* radius grows. The no-overlap invariant on reserved discs survives verbatim, nothing downstream is disturbed by the size change itself, and "who wins when two neighbours both refuse" **dissolves** — nobody claims extra space, both simply overlap. Order-independent. |
| 2 | **Multiplier or weight on the cap?** | **Weight on the cap.** `drawnRadius = min(hardCap, lerp(packedRadius, naturalTarget, w))`. Bounded above, so the control can only recover ground packing took — it can never inflate past the layer's Size. "Full size" stays the *same number* when spacing, layer Size, `sizeScale` or `margin` change. ⚠️ **`hold 100%` means "natural size OR the hard cap, whichever is smaller"** — see decision 2b. |
| 2b | **Saturation** | When `neighbourCap < hardCap < naturalTarget`, the lerp **clips at `hardCap` partway up the drag**: `hold` works, then silently stops, and 100% lands on the boundary/host cap rather than `naturalTarget`. This needs no special setup — just a glyph near the page edge that also has a neighbour. It is a **fourth** inert-ish mode (partially effective, then clipped) and the one users will actually hit. The percent is **linear in radius up to the clip and flat after it**. The diagnostics channel must say so (decision 15b) and the overlay already draws the explanation — the dashed ring pinned to the solid `hostRadius` circle or the canvas edge. |
| 3 | **Polarity** | **`w = 1` is NEVER SHRINK. `w = 0` is today's behaviour** and the migration default. ⚠️ **The original request said the opposite** ("0 = never shrink, 100 = auto"); Majed changed his mind mid-grill to match this formulation. Recorded here so nobody "fixes" it back. There is no inversion layer anywhere — stored, engine and displayed polarity all agree. |
| 4 | **Which constraints does `w` relax?** | **The neighbour term only. Two tiers, not three.** The boundary and `hostRadius` together form a hard cap `w` can never touch. A girih cell stays as inviolable as the page edge. |
| 5 | **Does `w` affect rejection?** | **The `below-floor` test only**, which is retargeted onto `drawnRadius`. `no-fit` (`R ≤ 0`, centre inside a committed disc) stays a hard drop. `fixed` mode stays honestly inert. |
| 6 | **Does a rescued below-floor glyph commit a disc?** | **Yes** — it pushes its `packedRadius` to `placed` like any other placement. No "drawn but invisible to the packer" third state. |
| 7 | **Is `sizeScale` inside `naturalTarget`?** | **Yes.** `naturalTarget = size × scaleFactor × sizeScale`. The pair then reads: **Scale = the size I want; `hold` = how much packing is allowed to take it away.** |
| 8 | **Ceiling on the pair?** | **No ceiling.** `Scale 300% + hold 100%` draws 54-unit leaves straight through each other. Legal output. *(Relayed recommendation, not contradicted — see §7.)* |
| 9 | **Field, label, units** | `slot.hold`, stored **`0…1` float**, absent ⇒ `0`. Label **`hold`**, row reads `hold 50%`. Percent display reusing `SCALE_FORMAT`/`SCALE_PARSE` from `glyphPopoverPlacement.js` — literally the same number machinery as Scale. |
| 10 | **Curve** | **Linear in RADIUS.** Not area, not gamma — every size quantity in this codebase (`radius`, `scale = radius/size`, `margin×R`, `hostCap`) is a radius, and the overlay draws radii. A gamma would make the number and the rings disagree. |
| 11 | **Per-anchor `hold` override?** | **Deferred, not rejected.** Slot-only now. The override record already carries `scale`/`angle`; adding `hold` later breaks nothing. |
| 12 | **Pitch control: spacing or density?** | **Spacing** — "one glyph every N units" — is the stored, canonical unit. Same unit as Size, joins the radius unit system, monotone in the readable direction (bigger = more air), no divide-by-zero. Density is a **display transform** over it. |
| 13 | **Pitch label honesty** | It means **anchor pitch, not glyph pitch**, and must not promise "distance between glyphs". Rests, weighted random deals, junction-skips and `no-fit` all mean some anchors carry no glyph — at Spacing 24 with a 2-slot sequence where one is a Rest, real glyph-to-glyph distance is 48. |
| 14 | **Overlay: what is drawn?** | **Two rings plus the binding term.** Solid = `packedRadius` ("what I reserved"), dashed = `drawnRadius` ("what I drew"). At `hold 0` they coincide; separating as you drag *is* the feature made visible. The binding ring is marked (heavier stroke) so `capBy` reads off the canvas without a legend. |
| 15 | **How the overlay learns `capBy`** | **Four new fields on `Placement`, always present**: `packedRadius`, `drawnRadius`, `capBy`, `saturated`. NOT an opt-in channel. ⚠️ **Ruled against the grill's recommendation**, on the grounds that `Placement` is a transient render structure — saved documents, drawn geometry and export are unaffected, so the cost is test-golden churn, not determinism. One code path instead of two. See §4c. |
| 15b | **`capBy` is defined against `drawnRadius`, not `packedRadius`** | Defining it against the reserve reports `'neighbour'` in the saturation case (decision 2b) — true of the reserve, and **useless to the person dragging**, who needs to know why the drag stopped. `capBy` therefore names what bound the radius **the user sees**, and the record additionally carries `saturated: true` when `lerp(...) > hardCap`. `packedRadius` / `neighbourCap` / `hardCap` all stay in the record so both rings remain drawable. **Ruled 2026-07-28** — no longer open. |
| 16 | **Overlay: whose circles?** | **The hovered slot's glyphs, plus the ONE thing capping each** — the specific neighbour disc or container that `capBy` names, drawn dimmer and visually linked. ⚠️ **Ruled against the grill's recommendation** of ringing every placement: that stays legible on a sparse host but becomes a grey haze at `MAX_PLACEMENTS`. This draws the causal pair, not the population. The captor may belong to another slot — that is the point (the glyph capping yours is almost always a *different* slot's). |
| 17 | **Overlay: boundary rings?** | **Not the canvas rect** (already visible). **Yes to `hostRadius`**, drawn whenever `capBy === 'host'` — a girih strap's or module cell's container is otherwise completely invisible. |
| 18 | **Overlay trigger scope** | **General footprint reveal, several triggers** — layer Size, slot Scale, per-glyph override scale, spacing/density, and `hold`. One hook, one overlay, N triggers. |
| 19 | **Overlay persistence** | **Shared reveal state + pointer capture. Never `:hover`.** Drag-start wins over pointerleave. |
| 20 | **Rejected anchors** | The overlay draws a **dotted empty ring** at every `below-floor` / `no-fit` anchor, at the size it wanted. The gap-20 mystery becomes four visible circles. |
| 21 | **Inspector rejection counter** | **Separate ticket.** Different surface, different design questions. |
| 22 | **Ship coupling** | **PR 1 = `hold` + the overlay** (emptyCircle split, sizing branch, `slot.hold` + card row, the `Placement` diagnostic fields, overlay with all five triggers). **PR 2 = the pitch control** and its wide density/spacing graphic. The locked constraint is *never ship `hold` without the overlay* — `hold` is visibly inert whenever the boundary or host cell binds, and shipping it alone means shipping a control that does nothing with no way to find out why (the same category as the invisible `margin`/`min` defaults that started this). Pitch is outside that constraint and its graphic is not designed yet — see `docs/pitch-control-graphic-BRIEF.md`. |

---

## 3. Rejected alternatives

| Rejected | Why |
|---|---|
| **Reserve the un-shrunk radius** (decision 1, option A) | The refusal becomes *contagious*: a `hold`-1 glyph at index 3 reserves 18 instead of 5.95, so every downstream survivor sees a smaller `R` and shrinks **harder**. "Don't shrink me" silently means "shrink everyone after me." Packing is greedy in sequence order, so a `hold`-1 glyph placed 10th still meets 9 committed circles and cannot undo them — making it honest requires **two-pass placement**, which also breaks the "placement order = toolpath order" property `MAX_PLACEMENTS` leans on. |
| **A priority in the greedy ORDER** (place high-priority glyphs first so they claim space) | Same two-pass cost, plus it silently reorders the toolpath and makes `placementStats`' "deterministic leading prefix" cap meaningless. Never seriously in contention once decision 1 landed. |
| **Pure post-placement multiplier** (decision 2, option a) | Has no knowledge of natural size, so **"never shrink" is not expressible as a number**: undoing the measured caps needs 302%, 240% and 111% for three leaves in the same run, and every one goes stale when layer Size or spacing changes. Also lets you exceed natural size, so one number does two unrelated jobs with no landmark between them. Cheapest possible build (one line in `overrides.js`) and rejected anyway. |
| **`naturalTarget` excludes `sizeScale`** (decision 7, option b) | `sizeScale` would become **meaningless at `hold 100%`** — a Scale control that silently stops existing as you drag its neighbour. Worse than either control alone. |
| **Three tiers — `hostRadius` escapable separately from the boundary** | `#146` already declares containment inviolable (`placementEngine.js:456-458`: "can only ever shrink a glyph… a Slot's size scale can never break containment"). Escaping a cell has never been asked for. If a future need appears it should be **its own decision, not a silent consequence of this one**. |
| **`w` relaxes everything including the boundary** (decision 4, option i) | This is a plotter and laser tool. A glyph overlapping its neighbour is an aesthetic choice you are entitled to make — the head cuts that stroke twice, which may be wanted. A glyph crossing the region boundary is a **cut outside the material**. Those must not sit behind the same control. |
| **`w` overrides all rejection incl. `no-fit` and `fixed` mode** (decision 5, option C) | `no-fit` at `R ≤ 0` means the centre is *inside* an already-committed disc — not "capped by a neighbour", coincident with one. And `fixed` mode has no cap to relax, so making `w` mean "accept anyway" there gives one slider two unrelated meanings switched by a setting on a different panel. Better honestly inert with the UI saying so. |
| **`w` is a pure size control, rejection untouched** (decision 5, option A) | Most conservative, and defensible — but it makes the gap-20 case (half the leaves deleted) **unfixable by the control that exists precisely to fix it**. `below-floor` is the shrink outcome objected to, taken to its limit. |
| **Density as the stored unit** (decision 12, option b) | It is the *reciprocal* of Size, so the drag direction inverts relative to every other size control, and there is a divide-by-zero at the bottom of the range. Every other number on the panel is in radius units; density is the one you would have to convert before it means anything. |
| **Naming it `weight`** | `slot.weight` already exists (`sequencer.js:47`) for the Random-mode weighted deal, and the card already renders a `wt 1.5` row (slot-card decision 12). Two rows both called weight, one controlling how often a glyph is *dealt* and one how big it *draws*. |
| **Naming it `shrink`** | After decision 3, `Shrink 100%` says the opposite of what it does. |
| **`resist` / `firm` / `keep`** | `resist` is 6 chars in a 124px chip already noted as snug, and `resist 0%` reads as broken rather than default. `keep` collides audibly with `rest`. |
| **New fields on `Placement` for the overlay** | `Placement` shape is guarded hard (`glyphRef` "present IFF sequenced" exists solely to keep unsequenced output byte-identical) and many tests deep-equal these objects. See decision 15. |
| **Overlay draws one ring** | Under decision 1 the reserved and drawn radii diverge — that divergence *is* the feature. One ring draws the circle that is **not** the packing circle and teaches the wrong model at exactly the moment you are learning the control. |
| **Overlay draws only the hovered slot's circles** | The capping neighbour is usually a different slot's glyph, so this hides the actual cause. |
| **Overlay triggered by `hold` alone** | The smallest useful version of something wanted everywhere. Slot Scale is chaotic (§1d) and needs the same explanation; spacing decides whether packing binds at all. |
| **`:hover` for the reveal** | A DragNumber's vertical drag walks the cursor far outside the field; the reveal must survive the whole gesture. |

---

## 4. The engine change, exactly

### 4a. `emptyCircle.js` — split the two terms

`largestEmptyCircleRadius` currently fuses the boundary distance and every
obstacle distance into one min (`emptyCircle.js:99-109`). Decision 4 needs them
apart.

```js
export function largestEmptyCircleParts(center, obstacles = [], boundary = null) {
  // boundary: signedBoundaryDistance(center, boundary)   — Infinity when null
  // obstacles: min over obstacles of (dist - obstacle.r) — Infinity when empty
  return { boundary, obstacles };
}

export function largestEmptyCircleRadius(center, obstacles = [], boundary = null) {
  const p = largestEmptyCircleParts(center, obstacles, boundary);
  return Math.min(p.boundary, p.obstacles);
}
```

> **REQUIRED PROPERTY, not incidental:** `largestEmptyCircleRadius` must remain
> **byte-identical** for every existing caller and every existing test. It is
> reduced to `Math.min()` of the two parts and nothing else. `fitsAt` is
> untouched. This is load-bearing under ADR-0005 — the whole determinism story
> below rests on this function's output not moving by one ULP.
>
> **Enumerated (verified 2026-07-28):** exactly **two production call sites**,
> both in `placementEngine.js` (`:415` `largestEmptyCircleRadius`, `:422`
> `fitsAt`), plus `fitsAt` itself in `emptyCircle.js:121`. No other module
> imports either. Pinned by **`emptyCircle.test.js`** (12 assertions incl. an
> explicit determinism case at `:113-114`). Every other hit in the repo is a
> comment. So the blast radius of the split is one file plus one test file.

The split is also bit-exact rather than merely algebraically equal:
`min(a, min(b, c)) === min(min(a, b), c)` holds under IEEE754 because `min` is
selection, not arithmetic, and multiplying both terms by the same positive
`margin` is monotone — so the same operand is selected either way. NaN paths
match too.

### 4b. `placementEngine.js` — the proportional sizing branch

Replacing lines ~430-480. `fixed` mode is **untouched**.

```js
// naturalTarget — what the glyph WANTS (decision 7: sizeScale is inside it)
const naturalTarget = size * scaleFactor * sizeScale;

const parts = largestEmptyCircleParts(center, placed, boundary);
if (Math.min(parts.boundary, parts.obstacles) <= 0) {
  rejected.push({ anchorId: anchor.id, reason: 'no-fit' });   // decision 5: hard drop
  return;
}
const margin = Math.min(1, Math.max(0, sizing.margin));

// HARD CAP — boundary + hostRadius. `hold` can NEVER relax this (decision 4).
let hardCap = Math.min(naturalTarget, margin * parts.boundary);
if (hasHostRadius(anchor)) {
  const d = Math.hypot(x - anchor.x, y - anchor.y);
  const hostCap = margin * Math.max(0, anchor.hostRadius - d);
  if (hostCap <= 0) { rejected.push({ anchorId: anchor.id, reason: 'no-fit' }); return; }
  if (hostCap < hardCap) hardCap = hostCap;
}

// SOFT CAP — the neighbour term, the only thing `hold` negotiates.
const neighbourCap = margin * parts.obstacles;

const packedRadius = Math.min(hardCap, neighbourCap);   // === today's `radius`
const w = clamp01(assignment ? assignment.hold : 0);
const drawnRadius = Math.min(hardCap, packedRadius + (naturalTarget - packedRadius) * w);

// decision 5: the floor tests the DRAWN radius, so `hold` can rescue a glyph.
if (drawnRadius < min) {
  rejected.push({ anchorId: anchor.id, reason: 'below-floor' });
  return;
}

// decision 1 + 6: `placed` always receives packedRadius — including a rescue.
placed.push({ x, y, r: packedRadius });
radius = drawnRadius;                  // placement.radius, and scale = radius / size
```

Four invariants to pin with tests:

1. `placed` never receives `drawnRadius`. The reserved-disc no-overlap invariant
   is exactly as strong as it is today.
2. `drawnRadius <= hardCap` always. A glyph can never cross the boundary or
   escape its `hostRadius` container at any value of `hold`.
3. `drawnRadius >= packedRadius` always, and `=== packedRadius` at `w = 0`.
4. **Saturation** (decision 2b): with `neighbourCap < hardCap < naturalTarget`,
   `drawnRadius` is strictly increasing in `w` until `hardCap`, then constant.
   At `w = 1` it equals `hardCap`, **not** `naturalTarget`. Pin this explicitly —
   it is the case the first draft of this doc got wrong.

### 4c. The `diagnostics` channel

**RULED 2026-07-28 — this section is the reverse of what the grill proposed.**
Majed chose the fields on `Placement`, always present, over an opt-in channel.

```js
// Placement gains four keys, ALWAYS present:
{ anchorId, role, index, x, y, rotation, scale, radius,
  packedRadius,      // what was reserved into `placed`
  drawnRadius,       // what was drawn (=== radius)
  capBy,             // 'natural' | 'neighbour' | 'boundary' | 'host'
  saturated }        // boolean
```

`capBy` names what bound **`drawnRadius`** — the radius the user sees — not
`packedRadius` (decision 15b, ruled). `saturated` is `true` iff
`lerp(packedRadius, naturalTarget, w) > hardCap`, i.e. the drag has hit the hard
cap and further `hold` does nothing (decision 2b). Both ring radii stay on the
placement so the overlay never re-derives them.

Why the opt-in channel was rejected, and what it actually costs:

- **`Placement` is a TRANSIENT render structure, not persisted.**
  `resolvePlacements` runs inside `MotifPattern` at draw time and in
  `AnchorGhostOverlay`. Saved documents, drawn geometry and SVG export are all
  unaffected by extra keys. ADR-0005's real content — same inputs and seeds
  produce the same *geometry* — holds either way. The grill's framing ("every
  document's output changes") overstated this.
- **The real cost is test churn**: the deep-equal goldens in
  `placementEngine.test.js` and `sequencer.test.js` all move. Update them
  deliberately; do not loosen them to `objectContaining` to dodge the work.
- **And a trivial compute cost**: `capBy` is derived on every placement whether
  or not anything is watching — a few comparisons inside a loop that is already
  O(n²) and capped at `MAX_PLACEMENTS`.
- **In exchange**: one code path instead of two, no conditional shape, and the
  data is always there when a caller wants it. `capBy` stays computed by the
  code that did the capping, never re-derived by the overlay from geometry it
  would have to guess at.

### 4d. `sequencer.js` — thread the field

`makeAssignment` gains `hold: slot && slot.hold != null ? slot.hold : 0`, and a
Rest's placeholder assignment gets `hold: 0` alongside its existing
`sizeScale: 1`. `Slot` typedef (`sequencer.js:46`) gains `hold?: number`.

### 4e. Pitch — `edgeOpts.spacing`

The engine side is **already built**. `sampleEdgeAnchors` (`anchors.js:315`)
takes `spacing` and arc-length-resamples via `resampleByArcLength`. It is
hardcoded once at layer creation (`motifLayer.js:80`, `{ spacing: 24 }`) and
**no UI writes it**. Both the render (`MotifPattern.js:118,121`) and the ghost
overlay (`AnchorGhostOverlay.jsx:216`) route through the same
`resolveHostAnchors` call, so they agree by construction.

This feature is therefore **a UI surface over an existing engine input**, not an
engine change. Two constraints:

- `MIN_EDGE_SPACING = 4` (`anchors.js:20`, post-crash hardening) silently clamps
  the request. It is a fourth invisible default (§1c) and the control must show
  the floor rather than let the number lie.
- Arc-length spacing is **already** per-unit-distance and self-normalises across
  short and long edges. The "short edges get crowded" worry does not exist on
  edge hosts. It is real and structurally unsolvable on **semantic** hosts —
  see §6.

---

## 5. Determinism and migration

The contract (`placementEngine.js:167-178`, ADR-0005): same inputs + seeds ⇒
byte-identical output; exactly 4 RNG draws per survivor regardless of outcome.

- **`hold` draws no RNG.** It is read in the sizing branch, below all four
  draws. The four-draws-before-any-early-return keystone is untouched; the
  `below-floor` return still happens after them.
- **Slot fields already ride `hashRng` channels `slot`/`rot`**, never the jitter
  stream. `hold` is a static per-slot value with no random component at all, so
  it adds no channel and perturbs no stream.
- **Absent `hold` ⇒ `0` ⇒ `drawnRadius === packedRadius`**, the floor test sees
  the same number it sees today, and nothing is rescued so nothing new is
  committed to `placed`. **Every existing document renders byte-identically.**
  That is the migration guarantee, and it needs no migration — the field is
  optional and absent everywhere.
- **`largestEmptyCircleRadius` must not move** (§4a). Required property.
- **`opts.diagnostics` defaults false** and the render never passes it, so the
  return shape on the render path is unchanged.

### The one real behaviour change, stated plainly

With `hold > 0`, **raising the weight on one slot can change the SIZES of glyphs
placed after it along the same host.** A `below-floor` glyph rescued by `hold`
now commits its `packedRadius` disc to `placed` (decision 6), and that disc is
an obstacle the followers must size around.

Measured: at gap 20, leaf 1's `packedRadius` is `0.85 × (20 − 18) = 1.70`.
Rescued and committed, leaf 2 then sees `R = 18.30` and draws at **15.55 (86%)
instead of 18.00**.

Small, real, and non-local. At `hold = 0` nothing is rescued and nothing new is
committed, so existing documents are unaffected.

---

## 6. Semantic hosts — where pitch structurally does not reach

`edgeOpts.spacing` reaches **edge hosts only** (`hostAnchors.js:118-129` —
flowfield / wave / single-axis grid, plus the semantic-resolve-failed fallback
at `MotifPattern.js:118`).

**Semantic hosts are count-based, and the counts differ wildly:** spiral
`edgeSamplesPerArm = 24` (`semanticAnchors.js:650`), Truchet
`edgeSamplesPerArc = 3` (`:1153`). Both feed `count:` into
`resampleByArcLength`, so a long arm and a short arm get the **same number of
anchors at different pitches** — exactly the "short edges get crowded, long
edges get sparse" failure anticipated.

This is documented as deliberate at `semanticAnchors.js:1090-1097`: consuming
`edgeOpts` there would make the ghost dots and the glyphs disagree, because
`MotifPattern` calls `resolveHostAnchors` **without** `edgeOpts` in the semantic
branch while `AnchorGhostOverlay` passes the motif's own.

**Decision: inert and say so.** The pitch control is disabled with a reason on a
semantic host, the same way `hold` is disabled with a reason in `fixed` mode
(decision 9). Converting the extractors from count to distance would change the
anchor set — and therefore the anchor **ids** — for every existing semantic-host
document, which is a determinism break of a completely different magnitude and
belongs in its own PRD.

---

## 7. Provenance notes

- **Decision 3 reverses the original request.** The idea as first stated was
  "0 = never shrink, 100 = auto". Majed changed his mind mid-grill to the
  formulation in decision 3. Recorded so it is not "fixed" back.
- **Decision 8 (no ceiling)** was relayed as a recommendation Majed did not
  contradict, rather than a direct ruling. The reasoning he was consistent with:
  overlap is already legal output under decision 1, and an invisible clamp is
  exactly the class of hidden default (`margin`, `min`, `spacing`) that caused
  this investigation. **If a ceiling is ever wanted, it needs an explicit
  ruling — do not add one silently.**
- **Decisions 14–18 and 20–22 were recorded before they were answered, then
  ratified afterwards.** Grill rounds Q8 (what the overlay draws, the mechanism,
  the silent-rejection surface) and Q9 (whose circles, container rings, trigger
  scope, persistence, ship coupling) were relayed to Majed and he did not reply;
  the grill recorded its own recommendations as locked and continued. They were
  put to him one at a time on **2026-07-28** and every one is now ruled. **Three
  came back different from what the grill wrote — 15, 16 and 22** (see their
  rows). Decision 19 was never in doubt: it restates a requirement he stated
  himself when he first asked for the overlay ("even if user un-hovered by
  dragging up or down beyond the original location of the input field"), so the
  pointer-capture-not-`:hover` rule was always his.
- **Decisions 2b and 15b were found in review, after the grill closed**, and
  were **not put to Majed**. Decision 2b (saturation) is a mathematical
  consequence of decisions 2 + 4 as he ruled them, not a new choice — it is
  recorded because the first draft of this doc asserted the opposite and the
  tooltip copy would have inherited the lie. Decision 15b (`capBy` against
  `drawnRadius`, plus `saturated`) **is** a real contract choice; it was put to
  Majed in the 2026-07-28 ratification pass and **ruled as written** — `capBy`
  names what stopped the user's drag, not what bound the reserve. The rejected
  alternative was `capBy` against `packedRadius` with `saturated` alone carrying
  the fact. No longer open.

---

## 8. UI surface

### 8a. Slot card — the `hold` row

Extends `SortableSlotChip` (`MotifBlockRack.jsx`), variant D, which both the
flat Sequencer and every Zone section (ADR 0008) render.

```
┌──────────┐
│◉   ⠿   …│   eye · grip · overflow
│    ✚    │   thumb → glyph browser
│ wt 1.5  │   Random mode only  (the EXISTING weighted-deal control)
│ 100%  ⇄ │   Scale + flip
│ hold 50%│   ← NEW, directly under Scale
│  +0°  ≋ │   rotation + angle-rnd
│ ±30° ▬▲ │   disclosed when ≋ on
└──────────┘
```

- DragNumber, percent, `SCALE_FORMAT` / `SCALE_PARSE` from
  `glyphPopoverPlacement.js` — the same number machinery as Scale.
- Directly under Scale because it **modifies** Scale, and adjacency says so.
- **Disabled with a reason** in `fixed` mode, not hidden. A control that
  vanishes teaches nothing; `lerp` is identically a no-op there because
  `packedRadius === naturalTarget`.
  > **Currently unreachable in-app (verified 2026-07-28):** nothing outside
  > tests writes `sizing.mode: 'fixed'`, and the Inspector exposes only
  > `sizing.size`. Build the disabled state for correctness, but **do not spend
  > design time on a state that cannot be seen** — it exists to keep the engine
  > honest, not to be looked at.
- Writes through the existing `useGestureFlush` path — one undo entry per
  gesture, same as every other slot control.
- Card width is already noted as snug at 124px (slot-card decision 9 /
  "still open"). `hold` is four characters for exactly this reason. If the row
  reads tight, widen to ~136px per that doc's deferred note.

**Tooltip copy — the honesty constraint.** `50%` means **"half the ground
packing took, given back"**, NOT "half size". The same 50% yields **67%** of
natural on one leaf and **95%** on another (measured: packed 5.95 → 11.98, and
packed 16.19 → 17.10, both against natural 18.00). Anyone writing this copy
without that sentence in front of them will write the lie.

**Second honesty constraint — saturation (decision 2b).** "Given back" is only
true **up to the hard cap**. Where the boundary or `hostRadius` binds tighter
than `naturalTarget`, 50% and 100% can give back the *same* amount and the
number goes flat mid-drag. Copy must not promise `100% = natural size`. The
`saturated` diagnostic is what the UI reads to explain it — the honest reading
of `hold 100%` is **"natural size, or the hard cap, whichever is smaller."**

### 8b. Pitch control — per-LAYER, not per-slot

Unlike `hold`, spacing is a property of the **layer** (`motif.params.edgeOpts`),
so it belongs beside layer Size in the Inspector (`Inspector.jsx:1420, 1669`),
not on the slot card.

- **Stored and canonical unit is `spacing`** (decision 12). Density is a pure
  display transform, `density = 1 / spacing`.
- Label against **anchors**, never "distance between glyphs" (decision 13).
- Must show the `MIN_EDGE_SPACING = 4` floor rather than silently clamping.
- **Disabled with a reason on semantic hosts** (§6).

**The control's graphic is a separate design, already briefed.** A wide animated
dots-on-a-line graphic that is simultaneously a visualization and a unit toggle
— rectangle-as-unit-window in density state, bracket-between-dots in spacing
state, clicking flips both the mark and the number. Full brief:
**`docs/pitch-control-graphic-BRIEF.md`**. Not duplicated here, and taken to its
own grill + prototype session.

> **Constraint that survives into this doc:** because the panel shows both units
> one click apart, decision 12's "spacing shares the radius unit system"
> reasoning has to hold with a density reading adjacent. It does — spacing
> remains the stored value. **Round-tripping hazard the implementation must not
> violate:** taking the reciprocal of a *rounded display* value and storing it
> back drifts the stored value on repeated toggles. Toggle N times, the stored
> spacing must be bit-identical to where it started. Convert for display only;
> never write back through the transform.

### 8c. The footprint overlay

Hosted in `AnchorGhostOverlay.jsx`, which already re-runs
`resolveSelection → resolvePlacements` with the canvas rect as boundary and
already has a **pre-registered TODO for exactly this** (line ~285):

> `overrideRecords` is deliberately NOT threaded here: this overlay reads only
> `anchorId` off the placements… **Thread it if this overlay ever starts drawing
> footprints at their real radius/rotation.**

It passes `{ diagnostics: true }` and draws, per placement:

| mark | meaning |
|---|---|
| solid ring at `packedRadius` | what this glyph **reserved** — this is what pushes neighbours |
| dashed ring at `drawnRadius` | what it **drew**. Coincident at `hold 0`; separating as you drag is the feature made visible |
| heavier stroke on the binding ring | `capBy` read off the canvas, no legend needed |
| circle at `hostRadius` when `capBy === 'host'` | the container is otherwise completely invisible |
| **dotted empty ring** at every `below-floor` / `no-fit` anchor | at the size it wanted — the gap-20 mystery becomes four visible circles |

- The canvas rect is **not** drawn (decision 17) — it is the canvas edge.
- **Every placement on the layer** is drawn; the hovered slot at full opacity,
  the rest dimmed (decision 16).

**Trigger and persistence.** A shared `useFootprintReveal` context with
`reveal(scope)` / `release()`:

- Raised by layer **Size**, slot **Scale**, per-glyph override **scale**,
  **spacing/density**, and **`hold`** (decision 18).
- `reveal` on `pointerenter` **and** on drag start; `release` on `pointerleave`
  **and** on drag commit, with **drag-start winning over pointerleave**
  (decision 19). This is why `:hover` cannot do it — a DragNumber's vertical
  drag walks the cursor far outside the field.
- Hangs off `useDragValue`'s existing lifecycle, which already owns a
  `pointerup` guard and already detaches on unmount (`useDragValue.js:120`).
  **A slot deleted mid-drag must release the reveal** — the same failure mode
  the gesture-flush guard already handles.

---

## 9. Relationship to the deferred footprint fix

An orthogonal fix for the *invisible frame* itself has been proposed on the main
thread and is **not decided here**: an optional per-glyph `footprintCenter` +
`footprintRadius`, defaulting to `{0,0}` / `viewRadius` so existing glyphs stay
byte-identical. For the leaf that would be centre ≈ `(10, −0.75)`, radius
≈ `10.03` (§1a).

**They fix different halves of the same problem.**

| | fixes |
|---|---|
| **footprint** | **automatic** packing — leaves stop capping at half-spacing **with no control touched**. Attacks the 4× over-reservation at its source. |
| **`hold`** | lets you **draw over** a cap you disagree with, for reasons the packer can never know. |

**Does `hold`'s semantics need to change if the footprint fix lands later?
No.** `hold` is defined against `packedRadius`, whatever computed it. A tighter
footprint makes `neighbourCap` larger, so `packedRadius` rises toward
`naturalTarget`, so the `lerp` has **less ground to give back** — the control
correctly does less because there is less wrong. That is the right coupling and
it is automatic. No formula in §4b references `viewRadius`.

Two consequences worth writing down:

1. **The footprint fix would make `hold` less necessary, not redundant.** Even
   with a perfect footprint, greedy order-dependence still produces the sawtooth
   at genuinely tight spacings, and overlapping on purpose remains a legitimate
   design choice.
2. **It changes what the overlay teaches.** With root-centred footprints the
   solid ring is visibly, absurdly larger than the ink — which is itself the
   best possible argument for the footprint fix. Ship the overlay first and the
   footprint bug becomes something you can *see* rather than something measured
   headless in a doc.

---

## 10. Adjacent gaps and deferred items

| item | status |
|---|---|
| **Inspector rejection counter** — a layer silently losing 4 of 8 anchors should be surfaced numerically the way `placementStats` surfaces the `MAX_PLACEMENTS` cap. The overlay only helps while hovering a control. | **Separate ticket** (decision 21) |
| **Per-anchor `hold` override** on the override record | **Deferred, not rejected** (decision 11) |
| **`sizing.margin` (0.85) and `sizing.min` (3) have no UI.** Both are invisible defaults that materially decide output. `min` is what deletes half the leaves at gap 20. | **Not in scope.** Flagged — `hold` makes `min` *survivable*, it does not make it *visible*. |
| **`MIN_EDGE_SPACING = 4` as a fourth invisible default** | In scope only insofar as the pitch control must **show** the floor rather than let the number lie (§4e) |
| **Semantic extractors count→distance** | **Own PRD** (§6) — changes anchor ids on every existing semantic-host document |
| **Pitch control graphic** | **Own grill + prototype session**, `docs/pitch-control-graphic-BRIEF.md` (§8b) |
| **Per-glyph `footprintCenter`/`footprintRadius`** | **Undecided, main thread** (§9) |
| **Pitch control + its graphic** | **PR 2**, not this one (decision 22) |
| **Decision 8 — no ceiling on `Scale × hold`** | Relayed recommendation, never explicitly ruled. A ceiling would need its own decision; do not add one silently (§7) |

---

## 11. Risks

- **Two size controls on one card that behave differently by design.** Scale
  repacks (and is non-monotone, §1d); `hold` never repacks. The slot-card doc
  already flagged this hazard for Scale vs the popover's post-placement scale
  ("these two look identical and behave differently by design"). This is a
  **third** member of that family. The overlay is the mitigation — it is the only
  surface on which the difference is visible — which is the substance of the
  ship-coupling ruling (decision 22).
- **`hold` is visibly inert or clipped in four separate situations**:
  `fixed` mode (disabled with a reason — and currently unreachable in-app),
  boundary-bound, `hostRadius`-bound, and **saturated** (decision 2b: works,
  then silently stops mid-drag). Only the first is a disabled control; the other
  three are a live control that does nothing or stops doing something.
  Saturation is the one users will actually hit — it needs no special setup,
  just a glyph near the page edge that also has a neighbour. `capBy` +
  `saturated` on the overlay are the entire answer, and if the overlay is ever
  descoped this risk becomes a bug report.
- **Live preview repacks per drag frame.** The slot-card doc already logs this
  as unmeasured on dense modules. `hold` adds `largestEmptyCircleParts` (same
  O(n) loop, one extra min tracked) and, when revealed, a per-frame
  `diagnostics` array of length `placed`. Measure on a dense host before
  shipping.
- **The rescue is non-local** (§5). A test must pin that raising `hold` on slot
  A changes downstream sizes, so it is a documented behaviour rather than a
  future bug report.
- **Round-trip drift on the pitch unit toggle** (§8b) is a data-integrity bug,
  not a display bug. Pin it with a test that toggles N times and asserts the
  stored value is unchanged.
