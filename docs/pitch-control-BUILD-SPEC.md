# Anchor-pitch control — BUILD SPEC (PRD #184, PR 2)

**Status:** ready to build, 2026-07-29. Everything below is ruled. Nothing here is open.

Read alongside — do not contradict:
- `docs/pitch-control-graphic-decisions.md` — 14 decisions from the grill + prototype.
- `docs/motif-hold-and-pitch-decisions.md` — the sibling control's spec. **§2 table is
  authoritative; its §3/§5/§8c contain stale pre-ratification prose.**
- `docs/pitch-control-graphic-BRIEF.md` — original intent. **Superseded on several points
  (see §0).** Where it disagrees with the decisions doc, the decisions doc wins.

Prototype (primary source, not for main): branch **`proto/pitch-control-graphic`**, and
the T3 build on **`proto/pitch-view`**. Run either in a worktree; do not promote the
code — it was written under prototype constraints (no tests, minimal error handling).

---

## 0. What changed AFTER the decisions doc was written

Four rulings from the 2026-07-29 design session. These **supersede** the numbered
decisions they touch.

| # | Ruling | Supersedes |
|---|---|---|
| A | **The unit switch is a labelled toggle, not the graphic.** A `Density` / `Spacing` two-option control sits top-right of row one. | decision 3 (partially) |
| B | **The graphic is NON-INTERACTIVE** — a plain `aria-hidden` illustration. No click, no button role, no accessible name, no `aria-live` flip announcement. The toggle carries all of it natively. | decisions 3, 9 |
| C | **The "to scale" / "not to scale" badge is REMOVED.** The *behaviour* stays — always draw fitted to the strip — but the graphic no longer claims scale. | decision 5 |
| D | **No eyebrow label on row one.** The three locked terms (eyebrow, 9ch numeral, word pair) are jointly unsatisfiable at the 224px rail floor. Decision 4's "anchors" honesty requirement moves into the caption below the graphic. | — |

Everything else in the decisions doc stands, including decisions 1, 2, 4, 6, 7, 8, 10,
11, 12, 13, 14.

---

## 1. Scope of this PR

One PR, four parts. **All four ship together** — same reasoning as hold-doc decision 22.

1. **`UnitToggle`** — a portable, domain-agnostic two-option control.
2. **`DragNumber` gains `flashSignal`** — an additive prop, default `null`.
3. **The pitch control** — the ruler graphic + toggle + numeral, wired to
   `motif.params.edgeOpts.spacing`, placed beside layer Size in the Inspector.
4. **Tests** for all three.

**Why 2 ships with 3:** the glow exists to announce the unit inversion. Ship the toggle
without it and you ship the exact confusion it prevents — most acutely at
`spacing = 10`, where `density = 100/10 = 10` and **the numeral is byte-identical
across the flip**. Same digits, different meaning, no signal.

---

## 2. `UnitToggle` — portable component

**Portability is a requirement, not a nice-to-have.** It must lift into another repo
with only token names to remap.

- No imports from motif/pitch/domain modules. No Tailwind classes. No global store, no
  context requirement. Styling via an injected stylesheet or inline, keyed off a
  documented list of custom properties.
- API: `{ options, value, onChange, label }` where
  `options: [{ id, label, a11yLabel }]`. Two options is the case to build; do not
  hardcode a two-only assumption where avoiding it is free.
- **Variant to ship: T3 "Travelling rule."** Both words always visible; no fill; a
  **2px saffron underline** slides beneath the active word and resizes to its width.
  The other two prototype variants are not built here.

### Visual law

- Selected word `--ink`; unselected `--ink-soft` **and slightly reduced opacity** —
  ruled 2026-07-29 to reinforce selection. Opacity does not affect layout, so this is
  safe (see the hazard below).
- **The toggle MUST NOT use `font-weight` to mark selection.** Measured in the
  prototype: weighting the selected word made it **1px wider**, shifting every option
  box on flip. Colour and opacity only.
- Tokens only, never a hex literal.

### Motion

- Underline slides and resizes via **`transform` only** (`translateX` + `scaleX`).
  Never animate `width`, `left`, `margin` or `padding`.
- `--motion-medium` (240ms) with `--ease-out-quint`. **No bounce, no elastic, no
  overshoot** — `.impeccable.md` principle 4.
- Reduced motion: lands instantly on target, fully legible, **not disabled**.
  Note `tokens.css` collapses `--motion-*` to 0ms under `prefers-reduced-motion`, so
  anything not expressed as a token transition must also check the JS hook.

### Accessibility

- `role="radiogroup"` with native radios. One tab stop; native `←`/`→`/`Space`;
  `Enter` advances with wrapping.
- `aria-label` on each radio carries **the unit, not just the word** — e.g.
  `"Density, anchors per 100 units"`.
- Violet focus ring (`--violet`) on all four sides of both options. **Do not put
  `overflow: hidden` on the track** — it clipped the ring in the prototype.

---

## 3. `DragNumber` — the `flashSignal` prop

Researched and ruled 2026-07-29. **Trigger, not float.** Rejected alternatives and
full reasoning are in §6.

```jsx
/** Change this to make the thumb flash once — "the number changed for a reason you
 *  didn't cause". ANY changing primitive works, so pass the CAUSE itself and the
 *  parent needs no state and no effect:
 *
 *      <DragNumber value={shown} flashSignal={unit} … />   // 'density' | 'spacing'
 *
 *  `null`/`undefined` never flashes. The FIRST value is latched without flashing —
 *  mount is not a change. Suppressed while dragging, editing or disabled; the latch
 *  still advances, so a change absorbed during those states never fires late. */
flashSignal = null,
```

The parent passes exactly one thing. The toggle knows nothing about the flash — it
reports its own value, which it already did.

### Mechanism

A **dedicated saffron overlay `<g>`** inside the existing `data-thumb-group`, at
resting `opacity: 0`, animated with **WAAPI** (`element.animate()`).

**This makes the precedence rule structural rather than ordered.** The flash never
writes `fill` on anything, so `dragging ? saffron : ink` — React's sole property —
cannot be fought. Two owners, two cascade origins, no overlap in time. Zero React
re-renders per flash.

- No `fill` mode on the animation, so the resting inline style reclaims the element
  on finish. **No `setTimeout` anywhere.**
- Cancel in the effect **cleanup**, not merely at the head of the next flash — this is
  what makes StrictMode's double-invoke collapse to one visible flash.
- Per-keyframe `easing` governs the interval *following* that keyframe. So the attack
  keyframe carries `linear` and the **peak** keyframe carries the ease-out that shapes
  the decay. An ease-in attack reads as a smoulder, not a filament, and violates
  principle 4.
- Timing: **320ms** (80ms attack + 240ms decay), inside the 240–360 band.
- **Durations are JS numbers, NOT `--motion-*` tokens** — the tokens collapse to 0ms
  under reduced motion, which would *delete* the signal. `REDUCED_FADE`
  (`DragNumber.jsx:49-53`) already establishes this precedent and its reasoning.
  Reduced motion gets a **longer, gentler, lower-peak single cycle** (≈600ms, peak 0.6,
  linear). Substitute, never remove — this flash is the only channel carrying "the
  number changed for a reason".
- `cubic-bezier(0.22, 1, 0.36, 1)` must be spelled literally in the keyframes (custom
  properties are not dependably substituted inside `element.animate()` across engines).
  Keep it in one named constant beside `REDUCED_FADE`, commented with the token it
  mirrors, so the two cannot silently drift.

### Precedence rules

1. **Base fill** `dragging ? saffron : ink` — React's sole property. The flash never
   touches `fill`.
2. **Flash-layer opacity** — WAAPI's sole property during a flash; React writes only
   the resting `opacity: 0`.
3. **Rotation / split** — the flash layer lives *inside* `data-thumb-group`, so it
   inherits the 45° rest rotation and the split geometry for free. A flash while
   hovering shows a split saffron diamond. Correct, not a conflict.
4. **Per-half drag dimming** — only exists while dragging; flashes are suppressed while
   dragging. They never coexist.
5. **Suppression** on `dragging` (the user *is* the cause), `editing` (the thumb subtree
   is unmounted — the component returns a bare `<input>`), and `disabled`.
   **The latch still advances in all three cases.** Skipping it ships this bug: open the
   editor → parent flips the unit → close the editor → spurious flash for a change the
   user already caused.
6. **Cancel on drag start** — if `dragging` flips true mid-flash the cleanup cancels, so
   the glow disappears the moment the user takes over.
7. **Only the square glows.** Not the numeral, not the focus ring. The numeral is the
   thing that changed; the square is the marker saying why.

### The principle-2 collision, resolved

`.impeccable.md` principle 2 says **"No glowing accents."** Principle 2 forbids glow as
*decoration* and as a *steady state*; a 320ms saffron punctuation that arrives and
withdraws is principle 2's own positive clause — "rare, saturated, placed… a single
accent at a time, load-bearing."

**Implement as brightness, not bloom.** Concretely prohibited: `filter: drop-shadow`,
any blur halo, any larger translucent shape behind the thumb. The cell is painted
saffron and then unpainted.

### Do NOT gate the flash on `value !== prevValue`

At `spacing = 10`, `density = 100/10 = 10`. The numeral is byte-identical across the
flip. **That is the most confusing state the control can reach**, so it is where the
flash is most warranted, not least.

---

## 4. The pitch control itself

### Layout (stacked — decision 10, amended by ruling D)

```
┌─ 224px rail floor ───────────────┐
│ ◆ 24          Density | Spacing  │   row 1: DragNumber + UnitToggle
│ ┌────────────────────────────┐   │   row 2: the ruler graphic, full width
│ │ • • • • • │ • • • • • • •  │   │
│ └────────────────────────────┘   │
│ → anchor gaps widen              │   caption (carries decision 4's "anchors")
└──────────────────────────────────┘
```

The 9ch numeral slot is what stops row one reflowing on flip. Keep it.

### The graphic — variant A "Ruler / drafting" (decision 13)

Port from `PitchVariantARuler.jsx` on `proto/pitch-view`, **rewritten to production
standard**. Carry across:

- The measuring rule with its decade-stepping tick scale.
- Density mark: a shaded span exactly **100 host units** wide (decision 2).
- Spacing mark: a dimension line with extension lines and slanted end serifs.
- Floor: a **hatched ghost dimension** of the smallest legal gap, drawn the way a
  drawing draws a limit (decision: show the `MIN_EDGE_SPACING = 4` floor, never
  silently clamp).
- `gripPair` force-includes the pair straddling the strip centre; the dimension line
  clamps to the strip edges and a **caret** replaces the end serif on whichever edge
  the gap runs off (§7c).
- **Dot phase locked to a half step** off the window's left edge (decision 12) —
  without it the visible count disagrees with the numeral.
- **THE NUMERAL ON THE MARK IS LOAD-BEARING TWICE** — decision 11 (reduced motion) and
  decision 14 (the empty span above spacing ~100). Move it off the mark and both break
  silently.

Dots are **schematic**, not sampled from the real host (decision 4). No
`resolvePlacements` call, no per-frame resample. This control never reads a placement.

### Numbers

| | |
|---|---|
| stored | `motif.params.edgeOpts.spacing`, integer |
| range | **4 → 512**, step 1, `geometric` (decision 6) |
| density | `100 / spacing`, display only (decision 2) |
| display | **1dp at d ≥ 1, 2dp below** (decision 8) |
| polarity | **up-drag raises the number in BOTH states** (decision 7) |

**Quantization — exactly one rounding, in the parent** (decision 8):

```js
spacing = clamp(Math.round(100 / d), 4, 512)
```

In density state `DragNumber` holds *density* as its `value` with step `0.001` so its
own quantization is transparent. Display density is re-derived as `100 / spacing` every
render, never held as separate state. **The toggle writes nothing** — bit-identity
across N toggles is structural.

### States

- **Disabled with a reason on semantic hosts** (hold-doc §6). `edgeOpts` reaches edge
  hosts only; semantic extractors are count-based and own their own density.
- Writes through the existing `useGestureFlush` path — one undo entry per gesture.

### The footprint reveal trigger

Use `useFootprintRevealTrigger` from `src/components/shell/footprintRevealContext.js`
with the layer-wide scope `{ kind: 'layer', layerId }`.

- The context's scope is **opaque** — no change needed there.
- `kind: 'layer'` already has a branch in `src/components/canvas/footprintScope.js` —
  no change needed there either.
- Wire **`focusProps` as well as `pointerProps`**, or the control is unreachable by
  keyboard.

> ⚠️ **#196 gates this part only.** "What should a LAYER-scope footprint reveal draw?"
> is unruled. Build everything else first and wire the reveal last; if #196 is still
> open, ship without the trigger rather than guessing.

---

## 5. Placement, and a known inconsistency

Beside layer **Size** in the Inspector (hold-doc §8b) — `MotifSizeField`.

**Layer Size is a plain `<input type="number">`, not a `DragNumber`** (it stayed that
way through PR #194; `focusProps` exists precisely because of it). So this PR lands a
drag-thumb control beside a stepper, and "spacing shares the radius unit system with
Size" reads visually false.

**Not in scope to fix here.** Flagged so it is a known state rather than a discovery.
Converting Size is its own change with its own blast radius (`motif-size` is a stable
test id with existing assertions).

---

## 6. Rejected — do not revisit without a ruling

| Rejected | Why |
|---|---|
| **`glow: 0..1` float prop** | Relocates the animation driver into the parent: ~60 re-renders/flash × N controls per panel, and every future parent re-implements the motion policy. Kills portability — a component needing the host to supply a rAF loop cannot be lifted. |
| **"It's just another modulation channel"** | **False friend.** Modulation floats are *persisted, user-authored, and change exported geometry*. A flash is *ephemeral, machine-authored, and changes nothing exportable*. Unifying them invites "can I modulate the flash?" and drags chrome feedback into the document model where undo, serialization and the plotter pipeline would all need opinions. |
| **Self-detection** (atom notices its own `value` changed while not dragging) | Costs the API nothing and is still wrong: this app modulates parameter values continuously, so the thumb would **strobe**. It would also fire on preset loads, undo replays and quantize round-trips — and would *miss* the `spacing = 10` case entirely. Causality lives one level up. |
| **Monotonic counter** `flashNonce` | Works, but forces the parent to invent and store state that exists only to be incremented, plus an effect to bump it — the "you might not need an effect" anti-pattern. `flashSignal={unit}` is derived during render and self-documenting in devtools. |
| **`useImperativeHandle` + `flash()`** | Strictly more machinery than a prop for the same result, and the handle sits on a component whose thumb is unmounted in the editor branch. React 19.2's stable `useEffectEvent` removes its last structural advantage. |
| **`changeReason: 'user' \| 'external' \| null`** | Encodes an *event* as a *level* — someone must set it and someone must clear it, handing timing back to the parent. Classic stuck-state bug shape. |
| **CSS class toggle / `@keyframes`** | Needs a global keyframe in `src/index.css` — a hidden repo dependency that breaks portability — and its durations would come from `--motion-*`, which collapse to 0ms and would delete the signal. |
| **`key` remount** | Destroys the thumb subtree and interrupts in-flight rotate/split transitions to deliver a cosmetic signal. |
| **`font-weight` for toggle selection** | Measured: +1px width, shifting every option box on flip. |
| **Eyebrow label on row one** | Jointly unsatisfiable with the 9ch numeral and the word pair at 224px. |

---

## 7. Testing

- **`flashTiming(reduced)` as a pure exported function** — assert band membership
  (240–360 unreduced), ease-out-only, and the reduced-motion substitution, with no
  WAAPI involved.
- **Stub `Element.prototype.animate` in `src/test/setup.js`**, beside the existing
  `matchMedia` stub and following that file's stated reasoning. jsdom has no WAAPI.
  Also guard `typeof el.animate === "function"` in the component.
- **Spy-based integration:** flipping the unit calls `animate` once; dragging does not.
- **Round-trip:** toggle N times ⇒ stored spacing **bit-identical**. This is a
  data-integrity test, not a display test (hold-doc §11).
- **Typing `4.2` in density state lands on spacing 24** exactly.
- **`flashSignal` absent ⇒ no behaviour change** — existing `DragNumber` consumers
  (`GlyphPopover`, `MotifBlockRack`) must be untouched and their tests unchanged.
- **Floor:** requesting spacing below 4 shows the floor rather than lying.

**Baseline before starting:** run the suite and record the number. Existing lint
baseline is 48 problems (35 errors, 13 warnings) — leave it exactly there.

---

## 8. Known inherited limitation

`DragNumber` reads `prefers-reduced-motion` **once at mount** (`useState(prefersReducedMotion)`),
so a live OS-level change does not propagate. `src/lib/hooks/useTraceSweep.js` shows the
better pattern — inject the signal as a parameter so the unit stays a pure function of
its inputs. Out of scope here; it matters when the component is lifted to another repo.
