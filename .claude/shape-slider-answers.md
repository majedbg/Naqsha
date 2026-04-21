# Shape session — light-mode tokens + Slider primitive

Scratchpad for the /shape discovery interview. Questions get answered one at a
time; each answer is recorded below before moving to the next.

Date started: 2026-04-21

---

## 1.1 Load-bearing accent
> cobalt / madder / saffron / cobalt+madder split / other

**Answer:** Saffron primary, with saffron-flower purple as ornamental secondary.

- Saffron-spice (warm yellow-orange/gold) — the interactive fill. Roughly
  `oklch(~0.78 0.15 75)` on light, shifts deeper on dark.
- Saffron-flower violet (the petals) — ornamental outlines, focus rings,
  subtle stylistic details (e.g. outline of a button, ornament on a slider).
  Roughly `oklch(~0.48 0.17 305)` on light.

Rationale: grounds the palette in the actual saffron plant — Persian craft
heritage, botanical coherence. Solves the saffron-on-cream contrast problem
by pairing the warm fill with a high-contrast violet outline. Two colors
doing distinct jobs rather than one overloaded accent.

## 1.2 Palette breadth
> lean 6 tokens / full jewel 10–12 tokens — and should user-selectable layer
> colors default to the jewel palette as suggested swatches?

**Answer:** C — disciplined chrome + full jewel-palette layer swatches.

- **UI chrome tokens (8):** paper, paper-warm, ink, ink-soft, hairline, muted,
  saffron (primary accent), violet (ornamental secondary).
- **Layer/content tokens (jewel palette, reserved for user drawings — NOT UI
  chrome):** cobalt, madder, saffron-deep, rose, olive, bone, burgundy.
  Seeded into `ColorPicker.jsx` as suggested swatches.

Rule: chrome surfaces NEVER use the jewel palette directly. The jewel palette
is only ever consumed by user-drawn layers (and by the `LayerCard` color
swatch indicator that *reflects* the user's choice).

## 1.3 Paper tint
> warm bone / cooler pure / other

**Answer:** A — warm bone, matching naqsheh reference images.
`oklch(0.98 0.008 85)` as the base paper token. Secondary `paper-warm`
slightly deeper (~`oklch(0.96 0.012 85)`) for inset surfaces like modal
sheets and the Prepare-mode working area.

## 1.4 Ink color
> near-black / deep iron-gall indigo / other

**Answer:** B — deep iron-gall indigo. `oklch(0.24 0.05 270)`. The ink that
Persian manuscripts were actually painted with. Keeps the paper↔ink pair
historically honest without sacrificing AA contrast on the bone paper.

## 2.1 Dark mode scope
> ship light-only first / ship both now

**Answer:** B — ship both simultaneously. Token system carries both value sets
from day one. First-load follows `prefers-color-scheme`; visible in-UI toggle
lets user override. Toggle state persisted in localStorage (key:
`sonoform-theme`). Default on systems set to light = light; default on
systems set to dark = dark.

## 2.2 Dark-mode paper
> warm indigo / warm charcoal / other

**Answer:** A — warm deep indigo. `oklch(~0.22 0.03 265)`. The inverted
naqsheh metaphor: the ink stays iron-gall-adjacent, but the paper is now
indigo vellum and text reads as bone ink on indigo ground. Keeps the saffron
and saffron-flower violet reading as jewels against a dyed ground rather
than neon on black.

Derived dark-mode tokens:
- `paper` = `oklch(0.22 0.03 265)`
- `paper-warm` = `oklch(0.25 0.035 265)` (inset surfaces)
- `ink` = `oklch(0.96 0.008 85)` (bone — the same warm-bone hue that is the
  paper in light mode; symmetry-honest)
- `ink-soft` = `oklch(0.80 0.008 85)`
- `hairline` = `oklch(0.34 0.03 265)`
- `saffron` stays at a similar hue but drops chroma slightly so it doesn't
  glow on indigo (~`oklch(0.75 0.13 75)`)
- `violet` lifts toward a lighter mulberry (~`oklch(0.68 0.18 305)`) so it
  remains distinguishable from the indigo paper.

## 3.1 Slider density
> realistic worst-case sliders visible simultaneously

**Answer:** B — medium (10–20 visible at once).

Implication: the slider defaults to quiet — hairline track, small ink-square
thumb. Saffron/violet activate only on hover, focus, and drag. At rest,
twenty sliders stacked should read as a calm ruled page, not as a wall of
decoration.

## 3.2 Signature move
> painted cell thumb on visible graticule / quiet default + painted cell on
> interaction / filled square thumb only, hairline track / graticule always
> visible / other

**Answer:** A + custom thumb-rotation gesture.

**Rest state.**
- Track: hairline in `ink-soft` (no graticule visible).
- Thumb: small filled **square** in `ink`, axis-aligned (0°). Violet
  outline is absent.

**Hover.**
- Track: thickens slightly, faint graticule fades in along the full track
  (ease-out-quart, 240ms).
- Thumb: rotates **0° → 45°** (becomes a diamond), grows a thin violet
  outline (1px, saffron-flower violet).
- Value readout becomes interactive (click-to-edit affordance).

**Drag / focus.**
- Thumb remains a diamond, fills with **saffron** (no longer ink).
- A short run of grid ticks lights up either side of the thumb like cells
  being read (rest of track graticule stays faint).
- Violet outline remains, slightly thicker (1.5px).

**Release / blur.**
- Thumb animates **45° → 0°** back to square (ease-out-quart, 280ms, no
  bounce). Fill transitions saffron → ink. Graticule fades out. Violet
  outline fades out.

**Rationale.** The naqsheh cell is a painted square — still, resolved,
settled. When the user reaches for it, it becomes a diamond (rotated
cell): a visual signal that the cell is *active, being read, under the
hand*. When the user lets go, it settles back to a square — the cell is
painted, resolved, committed. The rotation **is** the story of the
transformation the product performs: the designer handles the cell, makes
their choice, and the cell settles into place.

All transitions use exponential easing (`cubic-bezier(0.22, 1, 0.36, 1)`),
never bounce/elastic. Respects `prefers-reduced-motion` (rotation cross-
fades instead of animating).

## 3.3 Numeric readout
> keep click-to-edit / refine / other

**Answer:** A — keep current click-to-edit, restyled.

- Display state: ink on paper (was teal on dark). Uses tabular lining figures
  from the chosen body face (OpenType `tnum` + `lnum`), not `font-mono`.
- Hover (value region): ink-soft → ink, faint paper-warm background appears
  to signal editability. No color change.
- Editing state: border becomes 1px violet (saffron-flower), value turns
  saffron. Returns to ink on commit.
- Keyboard: Enter commits, Escape cancels (already implemented — keep).

Unit is shown in the label once per row, never duplicated on the value
readout itself.

## 3.4 Keyboard & precision
> arrow step, shift=×10, alt=×0.1, cmd+click reset? visible focus ring?
> other shortcuts?

**Answer:** B — power-user modifiers.

- `ArrowLeft` / `ArrowRight` = 1 × `step`
- `Shift + Arrow` = 10 × `step` (coarse — jump across motif-sized regions)
- `Alt/Option + Arrow` = 0.1 × `step` (fine — sub-cell precision)
- `Home` = `min`, `End` = `max`
- `Enter` on value readout = edit; `Escape` cancels (already works — keep).
- Double-click on value readout selects-all-and-edits (already works via
  `.select()` call on the ref — keep).
- Visible violet focus ring (saffron-flower, 1.5px, offset 2px) around
  whichever element holds focus (thumb or value readout).

Modifiers are shown on the slider's native tooltip (title attribute) for
discoverability, e.g. `"Shift = coarse (×10), Option = fine (×0.1)"`.

Reset-to-default deliberately NOT on this primitive. Belongs on right-click
menu or the "↺" action column (if we add one at the param level later).

## 3.5 Preview/apply semantics
> slider primitive needs dirty/unapplied state or left to parent?

**Answer:** A for the primitive + C as a sibling variant for `OptimizeSection`.

Two components, explicitly:

- **`<Slider>` (primitive).** Neutral. Knows value, min, max, step, label,
  tooltip, onChange. Used everywhere in the app (pattern params, universal
  params, canvas margin).

- **`<CommitSlider>` (opt-in variant).** Takes an extra `committedValue`
  prop. When `value !== committedValue`, renders:
  - The live-value thumb (diamond on interaction, as usual).
  - A ghost square thumb at `committedValue` position — outlined, not
    filled, in `ink-soft`. Literally shows "here's where you came from,
    here's where you are now."
  - A hairline tie-line between the two thumbs (in `ink-soft`).
  When `value === committedValue`, renders identically to `<Slider>`.

`CommitSlider` composes `Slider` internally — shared track, shared keyboard
handlers, shared thumb animation. The only difference is the ghost thumb
layer and tie-line, rendered via an absolutely-positioned SVG overlay on
top of the primitive.

Used in `OptimizeSection` for simplify/merge tolerance sliders where the
preview/apply/revert loop is visible. The Prepare tab becomes the one
place in the app where the human-in-the-loop principle is *physically
drawn* into the slider itself.

---

## Synthesis notes

Design brief written to `.claude/shape-brief-tokens-slider.md`. Portfolio
decisions log updated in `docs/design/decisions.md` with entries 01–09.

## Craft decisions (deferred from shape, answered before implementation)

- **Fonts:** Body = Commissioner (Google, variable). Display = Ibarra Real
  Nova (Google, transitional serif based on Joaquín Ibarra 1780 specimen).
- **Hex-literal scope:** Option B — full cascade in one commit. Migrate
  all 97 hex literals across 28 files to tokens.
- **Theme toggle placement:** Mount in global header next to `AuthButton`
  from day one.
- **Flash-prevention script:** Honor `prefers-color-scheme` from day one.
  Light on light-preferring systems, dark on dark-preferring systems,
  visible toggle overrides and persists to `localStorage: sonoform-theme`.
