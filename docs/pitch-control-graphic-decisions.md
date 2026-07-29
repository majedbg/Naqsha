# Anchor-pitch control graphic — grilled decisions (2026-07-28)

Outcome of the grill against `docs/pitch-control-graphic-BRIEF.md` §4. This
supersedes the brief wherever they disagree — and they **do** disagree on one
load-bearing point (decision 1).

Companion doc: `docs/motif-hold-and-pitch-decisions.md`. That doc owns the
*control*; this doc owns the *graphic*. Decisions carried in from it are listed
in §3 and were not re-litigated.

Nothing here is built. This is the spec of record for the prototype and the
build.

---

## 1. Locked decisions

| # | Decision | Verdict |
|---|---|---|
| 1 | **Which mark carries which unit** | **The brief had it inverted.** §2 titles State 2 "SPACING (bracket)" and then says the field "swaps to the reciprocal". A bracket spans a **gap** — that is a distance, i.e. spacing, i.e. the stored value. A rectangle is a **window that counts**, i.e. density. Locked: **bracket = spacing, rectangle = density.** |
| 2 | **What "density" means** | `density = 100 / spacing`. The rectangle is **literally 100 host units wide**, so the displayed number counts the dots visibly inside it. Default spacing 24 reads **4.2 per 100u**. Range 25.0 → 0.2. |
| 3 | **Where the graphic lives** | **Sibling of `DragNumber`, never wrapping it.** `DragNumber.jsx` and `useDragValue.js` are **untouched**. |
| 4 | **Dot source** | **Schematic.** Evenly spaced, no host read, no per-frame resample. Label says **anchors**, never glyphs. |
| 5 | **Scale honesty** | Draws at **true canvas scale** when `100 × zoom` fits the strip width — badged **"to scale"**. Otherwise compress to fit and badge **"not to scale"**. |
| 6 | **Range + mapping** | **`geometric`, min 4, max 512, step 1.** Seven clean doublings (`4·2⁷`), ~700px to cross at the 100px/doubling default. |
| 7 | **Drag polarity** | **Up = bigger number, in both states.** `DragNumber` holds *density* as its `value` in density state. The **dots reverse meaning** between states — accepted knowingly. |
| 8 | **Quantization** | **The spacing grid owns it, once, in the parent.** Display **1dp at d ≥ 1, 2dp below**. |
| 9 | **A11y** | Graphic is a real **`<button>`**. Accessible name carries current unit **and** action. `DragNumber`'s `aria-label` + `aria-valuetext` swap with state. A visually-hidden **`aria-live="polite"`** announces the flip. |
| 10 | **Layout** | **Stacked.** Label + number on row one; graphic gets the **full rail width** on row two. ~6:1 at the 224px narrow floor, growing with the rail. No compact fallback. |
| 11 | **Reduced motion** | Dots **jump** with no tween, and a **live count numeral sits inside the rectangle**, so the information never lives in the motion. Not a disabled graphic. *(Stated as an assumption during the grill, not contradicted — see §5.)* |
| 12 | **Dot phase** | The field is **phase-locked to a half step** off the window's left edge, so the visible count is `round(100/spacing)` and exact whenever `100/spacing` is whole. Without it, spacing 24 shows 5 dots against a numeral of 4.2. Found by building — see §7a. |
| 13 | **Which variant** | **A — "Ruler / drafting."** The strip reads as a technical drawing. See §7·0. |
| 14 | **The sparse end** | **Accepted, no mitigation.** Above spacing ~100 the window holds zero dots; the numeral-on-mark reads `0.20 / in 100 u`, which is a true sentence. The window stays literally 100u at every value. See §7b. |

---

## 2. The reasoning that is not obvious from the table

### 2a. Decision 2 — why `100/spacing` and not `1/spacing`

Literal reciprocal density over the locked 4→512 range yields **0.25 → 0.002**.
Two problems, and the second is fatal:

1. Nobody can read or type it.
2. To be honest, the rectangle would have to be **1 host unit wide** — narrower
   than one dot gap at *every* legal spacing. **The mark could never contain a
   dot, so it could never illustrate its own number.**

At a 100-unit window the rectangle measures itself: you can literally count the
dots inside it and get the number in the field.

### 2b. Decision 3 — this is a collision, not a hit-target tweak

`useDragValue` exposes exactly **one** `onClick` slot (`useDragValue.js:53,117`).
It is already fully allocated across the codebase:

| consumer | spends `onClick` on |
|---|---|
| `DragNumber` (`:175`) | type-in |
| `DragDial` (`:137`) | disclosure |

The brief simultaneously requires "clicking the graphic flips" and "do NOT
invent a new numeric input". Those cannot both hold if the graphic sits inside
`DragNumber`'s hit area. Sibling resolves it: three gestures, three targets.

- drag the thumb → change value
- click the numeral → type in
- click the graphic → flip unit

**Cost accepted:** the brief's "the graphic IS the switch" weakens to "the
graphic is the switch, the numeral is the number."

### 2c. Decision 4 — the finding that made this cheap

`sampleEdgeAnchors` (`anchors.js:315`) **arc-length-resamples**. On any single
host path the real anchors are therefore *exactly* evenly spaced — **real dots
are pixel-identical to schematic dots**. "Real" only buys path ends, path-to-
path gaps, and the rest/skip story, at the cost of a resample per drag frame on
a path the hold doc already flags as unmeasured (§11).

The rest/skip story is **already owned by the footprint overlay** (decisions 14
and 20 of the hold doc), which draws it on the canvas at real size. Duplicating
it in a 40px strip is worse in every dimension.

### 2d. Decision 6 — why `geometric` is not a taste call

`density = 100/spacing` is a reciprocal, so under a geometric mapping **×2 of
spacing is exactly ÷2 of density — identical travel, identical feel, in both
states.** A control that flips units mid-session cannot afford a mapping that
feels like two different controls.

Under `linear`, the same 1-unit step is worth:

| at | one step moves density by |
|---|---|
| spacing 4 (the floor) | **25%** |
| spacing 200 | **0.5%** |

Also: `linear` at step 1 across 4→512 is **4064px of drag** to cross the range.
Geometric is ~700px, less under `Shift` coarse gain.

Ceiling of 512 rather than something smaller: at 512 a long host edge on the
default 1152-unit canvas (`constants.js:9` preset 1 = 12×12" @ 96 PPI) still
receives 2–3 anchors, so the top of the range still does something instead of
being a dead zone.

### 2e. Decision 7 — the fork nobody had named

`useDragValue.js:89` computes `dy = lastY - clientY` (up positive) and
`DragNumber`'s `advance` always **increases its `value`** on an up-drag. There
is no inversion prop, and decision 3 locked `DragNumber` as untouched.

Because of the reciprocal, "drag up" cannot mean both "more air" and "bigger
number". Locked: **bigger number**, which means `DragNumber` holds density as
its `value` in density state.

**The consequence, stated plainly:** in spacing state an up-drag *spreads* the
dots; in density state an up-drag *crowds* them. The graphic is the only surface
on which that is legible — which is a substantive argument that it earns its
space rather than a decoration.

### 2f. Decision 8 — a data-integrity guard, not a display choice

Decision 7 makes the §8b round-trip hazard **live**: every drag frame in density
state writes back through `100/d`. The guard is that there is exactly **one**
rounding, and it lives in the parent:

```
drag    → DragNumber (step 0.001, geometric)   ← its own quantization is
        → emits d = 4.1873                        deliberately transparent
parent  → spacing = clamp(round(100 / d), 4, 512) = 24   ← THE ONLY ROUNDING
        → stores 24
display → 100 / 24 = 4.166… → "4.2"
```

Why each piece:

- **`DragNumber` step `0.001` in density state.** If its `step` quantized on the
  *density* scale it would fight the spacing grid: the number jumps to one
  value, the parent snaps it to another, the display shows a third.
- **Display re-derived from the stored spacing every render**, never held as
  independent state.
- **The toggle writes nothing at all.** It swaps the `format`/`parse` pair and
  the mark. Bit-identity across N toggles is therefore *structural*, not a
  property that has to be maintained.

Round-trip checks that must hold:

| action | result |
|---|---|
| toggle N times | stored spacing **bit-identical**, trivially — no write occurs |
| type `4.2` in density state | `round(100/4.2) = round(23.81) = 24` ✓ |
| type `4.1` | `round(24.39) = 24` — the density grid is coarser than what you type, honestly |

### 2g. Decision 10 — the arithmetic

| state | usable row width |
|---|---|
| right rail, minimum | 288px (`AppShell.jsx:179`, also the minimum — the rail only grows) |
| bottom dock module | `min-w-[16rem]` = 256px (`Inspector.jsx:1844`) |
| after padding | ~224px either way |

Stacked gives the strip that full ~224px and it grows with the rail, so the
brief's icon-convention exemption (§2, "5:1 acceptable, possibly more") is
actually *met* — ~6:1 at the narrow floor — rather than being competed away by
the numeral on the same row. No second graphic to design, no fallback mode, no
state in which the dots vanish.

---

## 3. Carried in from `motif-hold-and-pitch-decisions.md` — settled, not re-grilled

The brief listed these as open. They are not; the grill opened by saying so.

| brief Q | where it was already ruled | ruling |
|---|---|---|
| **Q1** — does the stored field change on toggle? | §8b | No. *"Stored and canonical unit is `spacing`… Density is a pure display transform."* |
| **Q3** — round-trip principle | §8b | *"Convert for display only; never write back through the transform… Toggle N times, the stored spacing must be bit-identical."* Only the **decimal count** was genuinely open (→ decision 8). |
| **Q5** — semantic hosts | §6, §8b | **Inert and say so** — disabled with a reason, same pattern as `hold` in `fixed` mode. |

Also standing, from §4e: the control must **show** the `MIN_EDGE_SPACING = 4`
floor rather than silently clamp and let the number lie.

---

## 4. Rejected alternatives

| Rejected | Why |
|---|---|
| **Brief §2 as written** (bracket carries the reciprocal float) | The bracket spans a gap and would read a density — the mark and the number disagree by construction. |
| **`density = 1/spacing` literally** | Range 0.25→0.002, unreadable and untypeable; and an honest 1-unit-wide rectangle can never contain a dot, so the mark cannot illustrate its own number (§2a). |
| **Graphic wraps `DragNumber`** (drag anywhere on the strip) | The most direct feel available, and rejected anyway: it modifies a primitive `GlyphPopover` and every slot card depend on, and leaves type-in without a home. |
| **No click-to-flip at all** (unit toggle as a separate chip) | Safest, kills decision 9's problem outright, abandons the brief's entire conceit. |
| **Real host dots** | Pixel-identical to schematic on a single path (§2c), costs a resample per drag frame, and needs defined behaviour for no-host / semantic-host / multi-path. |
| **Real dots with hollow rest/skip rings** | Maximum honesty, but needs full `resolvePlacements` per frame and **duplicates the footprint overlay** (hold-doc decisions 14, 20) which already draws it on canvas at real size. |
| **`linear` mapping** | Asymmetric under the toggle (25%/step at the floor vs 0.5%/step at 200) and 4064px to cross the range (§2d). |
| **Ceiling 256** | One-decimal density would stay honest across the whole range, but 256 on a 1152-unit canvas is ~4 anchors on a long edge — reads as an arbitrary wall. |
| **Ceiling = canvas width** | No arbitrary constant and "one anchor on this host" becomes expressible — but `max` becomes document-dependent, so the same stored value sits at a different drag position per document and `aria-valuemax` moves under the user. |
| **Up = more air in both states** (density numeral counts down) | Makes round-trip drift structurally impossible and keeps the dots meaning one thing — rejected because a numeral that falls while you drag up is the more surprising of the two surprises. |
| **Density state read-only** | Kills the polarity *and* precision problems outright; contradicts brief §2's explicit requirement that the other unit be typeable. |
| **Density-scale quantization** (step 0.1 on density) | Clean numerals, but 0.1 of density is one spacing unit at the dense end and ~83 at the sparse end, so most of the spacing range becomes unreachable from that state. |
| **Snap on `onCommit` only** | Smoothest drag, but the value visibly jumps on release — exactly the "clamp bug" feel `DragNumber`'s own comments warn about (`DragNumber.jsx:13-17`). |
| **Radiogroup for the toggle** | Natively correct semantics and free announcement, rejected for two tab stops plus arrow keys colliding with the adjacent `DragNumber`'s stepping. |
| **Button with no live region** | Leanest markup and no double-announce risk during a drag, but flipping while focus is elsewhere is completely silent. |
| **Inline with a compact fallback** | Saves vertical space; rejected because it needs two graphics and the informative one disappears in exactly the narrow state where the explanation is most wanted. |
| **Inline, accept the squeeze** | ~3:1 and ~5 dots at the narrow floor — stops being able to show a convincing count, undercutting the reason the brief exempted it from the icon convention. |

---

## 5. Provenance notes

- **Decision 1 reverses the brief.** The brief's §2 is internally inconsistent
  (State 2 is titled SPACING and then reads a density). Recorded so nobody
  "fixes" it back toward the brief.
- **Decision 5 (to-scale badge) came from Majed mid-grill**, in response to the
  dot-source question rather than as an answer to it. It refines decision 4
  rather than competing with it.
- **Decision 7 was chosen against the recommendation.** The recommendation was
  "up = more air, always", on the grounds that it makes round-trip drift
  structurally impossible. Majed chose "up = bigger number". Decision 8 is what
  pays for that choice; **if decision 8 is ever weakened, decision 7 becomes a
  data-integrity bug.** The two are a pair.
- **Decision 11 was stated as an assumption and not contradicted**, rather than
  put as a direct question. Same status as decision 8 of the hold doc — if a
  different reduced-motion reading is wanted, it needs an explicit ruling.

---

## 6. What the prototype must demonstrate

Beyond looking right:

1. **The toggle flipping mid-drag-history leaves the stored spacing unmoved** —
   an N-toggle round trip, visible as a readout.
2. **The polarity reversal in decision 7** — that dragging up crowds the dots in
   density state and spreads them in spacing state, and that the graphic makes
   this legible rather than confusing.
3. **The to-scale / not-to-scale badge flipping with zoom**, not with the value.
4. **The `MIN_EDGE_SPACING = 4` floor being shown**, not silently applied.
5. **The reduced-motion reading** (decision 11) as a considered alternative, not
   a disabled graphic.

Prototype conventions: `src/components/shell/motif-prototypes/`, DEV-gated,
inert without its search param. **Use a different param from the existing
`?variant=`** (brief §3) — that array (`PROTO_VARIANTS` in
`prototypeShared.jsx`) drives `MotifPrototypeOverlay` and must not be extended.

---

## 7. What building it found (2026-07-28, prototype `?pitch=A|B|C`)

Three things the grill did not anticipate. **All three are now closed**
(2026-07-28, Majed), along with the variant choice.

### 7·0. LOCKED — decision 13: variant A "Ruler / drafting" wins

The strip reads as a **technical drawing**. Baseline is a literal measuring rule
with a decade-stepping unit scale zeroed on the window's left edge; the density
mark is a shaded span across that rule; the spacing mark is a proper dimension
line with extension lines, slanted end serifs and a value on a leader. The
`MIN_EDGE_SPACING` floor is drawn the way a drawing draws a limit — a hatched
ghost dimension of the smallest legal gap, sitting beside the live one.

**The bet:** this is a plotter/laser tool, so borrow the authority of the
drawing conventions its users already read. Rejected: B "Score / rhythm"
(noteheads on a staff, density as a bar with its count set inside like a time
signature) and C "Aperture / caliper" (a fading dot field under a fixed
corner-bracket viewport, spacing as a caliper with a stop block).

### 7a. LOCKED — decision 12: dot phase

**The field is phase-locked to a half step off the window's left edge.**

Decision 2's claim — "the number counts the dots you can see inside the
rectangle" — is *false* under an arbitrary phase. With dots sitting on the
window edges, spacing 24 shows **5** dots against a numeral of **4.2**.

Half-step phase makes the visible count `round(100 / spacing)`, and exact
whenever `100 / spacing` is a whole number. Nothing in the grill locked the
phase, so this **serves** decision 2 rather than bending it — but it was a
silent choice and is recorded here so it is not undone.

### 7b. CLOSED — decision 14: the empty span IS the information

Measured, not theorised:

| spacing | density | dots in the 100u window |
|---|---|---|
| 24 (default) | 4.2 | ~4 |
| 100 | 1.0 | ~1 |
| 256 | 0.39 | **0** |
| 512 (ceiling) | 0.20 | **0** |

**This is the same failure §2a used to reject `density = 1/spacing`** — the mark
cannot illustrate its own number — arriving from a different direction. It is
milder (it holds below spacing 100 rather than failing everywhere) but it is
inherent to the locked 4→512 range, not to any implementation choice.

Scope: spacing 100→512 is `log2(5.12)` ≈ **2.4 of the 7 doublings**, so roughly
**a third of the drag travel** sits in the regime where the rectangle is empty.

**Verdict: accepted, no mitigation. Decision 2 stands exactly as written and the
window is literally 100 host units at every value, forever.**

The reframe that settles it: §2a rejected `density = 1/spacing` because the mark
could **never** contain a dot — including at the default, where the true answer
is "about four". Here the span is empty only where the honest answer genuinely
**is** "fewer than one". The emptiness is therefore a correct reading, not a
failure to convey one.

What carries it is variant A's numeral-on-mark (`PitchVariantARuler.jsx:158-178`):
the span reads **`0.20` / `in 100 u`** over empty ground — a true sentence you
can act on. This is the same construct decision 11 requires for reduced motion,
doing double duty. **It is therefore load-bearing twice over: if the numeral is
ever moved off the mark, both decision 11 and this decision break.**

Rejected here:

| Rejected | Why |
|---|---|
| **Decade-stepping window** (100u → 1000u below density 1, numeral states its window) | Native to A's idiom — its rule already decade-steps ticks, and drawings change scale and say so. Rejected because density's meaning becomes window-dependent: the same physical pitch reads as two different numbers, so one control carries two scales. |
| **Lower the ceiling to ~128** (density never below 0.78) | Makes decision 2 true everywhere with no caveat. Rejected: re-opens a grilled decision — 512 was chosen precisely so the top of the range still does something on a 1152-unit canvas — to fix something that turned out not to be broken. |

### 7c. CLOSED — follows 7b

Above roughly spacing 144 (at the 224px narrow floor, zoom 1 — and above ~72 at
zoom 2) the strip holds **fewer than two dots**, so there is no adjacent pair for
the bracket to span. The prototype force-includes the pair straddling the strip
centre and lets the mark draw itself truncated.

Consequence: in the "to scale" state at the sparse end you get a strip carrying
a dimension line and **no visible anchors at all**. That is spec-compliant —
decision 5 keys the badge to `100 × zoom` only, never to the value — and honest,
but it is not informative.

**The prototype's own read** was that if this regime matters, the thing to
revisit is **decision 5's badge rule**, not the graphic.

**Verdict: accepted, same reasoning as 7b — decision 5 is NOT revisited.** The
badge stays keyed to `100 × zoom` only, never to the value, so "to scale" at the
sparse end can legitimately mean a strip carrying a dimension line and no
visible anchors. Variant A's handling is the answer and is the shape to build:
`gripPair` force-includes the pair straddling the strip centre, the dimension
line clamps to the strip edges, and a **caret** replaces the end serif on
whichever edge the gap runs off (`PitchVariantARuler.jsx:67-75, 211-237`). The
mark never stops drawing and never lies about magnitude — it says "this gap
continues past here" in the notation a drawing already uses for it.

### 7d. Smaller findings, no decision needed

- `DragNumber`'s `DEFAULT_PARSE` strips *all* non-numeric characters, so a
  `/100u` suffix would parse `"4.2 /100u"` as `4.21`. Both states must pass a
  **leading-token `parse`**. This is the exact hazard `DragNumber.jsx:76-86`
  warns about, reached by a route that doesn't rescale the value.
- `MotifPrototypeOverlay` registers its window `keydown` listener
  unconditionally in DEV with no param guard, so a second prototype switcher
  must listen in **capture phase** and `stopPropagation()` or the two fight.

---

## 8. Build notes — written after PR 1 landed (2026-07-29)

PRD #184's PR 1 merged to `main` as **PR #194** (`35858fa`, all eight slices
#185–#192). Everything below is the state of `main` this control now builds
against, and it resolves several things this doc previously had to guess at.

### 8a. The reveal hook exists, and its scope is already opaque

`src/components/shell/footprintRevealContext.js`:

```js
export function FootprintRevealProvider({ children })
export function useFootprintReveal()                            // → { scope, reveal, release }
export function useFootprintRevealTrigger(scope, handlers = {}) // → { pointerProps, focusProps,
                                                                //     onChange, onCommit }
```

The context stores whatever scope it is handed and never inspects it — its own
comment names this control as the reason:

> *"CLASSIFICATION IS THE CONSUMER'S (the overlay, #189). Decision 18 lists five
> triggers and the fifth (spacing/density) is being built in a different session
> against this hook; an enum here would mean reopening this file to add to it."*

**So adding the spacing/density trigger needs no change to the context.** Use
`useFootprintRevealTrigger` with the layer-wide scope shape:

```js
{ kind: 'layer', layerId }
```

which is exactly what decision 18 anticipated for spacing/density.

**But note where the real union lives.** `src/components/canvas/footprintScope.js`
*does* switch on `kind` (`placementsForScope`, `rejectionsForScope`). Reusing
`kind: 'layer'` therefore needs **no new branch** there either. Introducing a
distinct `kind` would.

### 8b. `focusProps` exists because layer Size was NOT converted

`Inspector.jsx` on `main` still has layer Size as a plain `<input type="number">`
inside a new `MotifSizeField`, wired through `reveal.focusProps` rather than a
drag lifecycle — described there as *"the degenerate case of the same system…
a bare `<input type="number">` with no drag lifecycle at all, and reachable by
TAB, which fires no `pointerenter` ever."*

Two consequences for this control:

1. **The visual-consistency concern stands.** A `DragNumber` pitch control lands
   beside a stepper Size control, so "spacing shares the radius unit system with
   Size" still reads visually false. Unchanged by PR 1; still a decision for the
   PR 2 build.
2. **`focusProps` is the keyboard path and must be wired here too**, not just
   `pointerProps`. Tab-reaching the pitch control should raise the reveal.

### 8c. Decision 15 of the hold doc ended up REVERSED from what this doc was drafted against

Ratified text on `main` (§2 table, plus a "Ruled 2026-07-28 — no longer open"
15b row):

> **Four new fields on `Placement`, always present**: `packedRadius`,
> `drawnRadius`, `capBy`, `saturated`. **NOT an opt-in channel.**

Confirmed in `placementEngine.js:209-210`, assigned on every path including
`fixed`/no-hold. **This doc has no dependency on it** — decision 4 locked
schematic dots, so this control never calls `resolvePlacements` and never reads
a placement field. Recorded only so nobody re-derives the older text.

> ⚠️ The hold doc's §3 *Rejected* table still carries a stale
> `New fields on Placement for the overlay` row contradicting its own §2
> verdict. §2 + 15b are authoritative; the code agrees with them.

### 8d. Open follow-ups on `main` relevant to this control

- **#193** — "`hold` is silently inert when the page edge binds from the start."
  New, filed during PR 1. Same family as the inertness risks in the hold doc §11.
- **#187, #188, #189, #190** are **still open although their code is merged** —
  bookkeeping gap from PR #194, not missing work.
- **#184 remains open** because this control is its PR 2.
