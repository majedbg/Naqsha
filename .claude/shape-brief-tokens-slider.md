# Design Brief — Light-mode token system + Slider primitive

Output of the /shape discovery interview. Hand this to `/impeccable craft`
(or any implementation approach) to build. Principles come from
`.impeccable.md`; decisions come from `docs/design/decisions.md` and the
answers recorded in `.claude/shape-slider-answers.md`.

---

## 1. Feature Summary

Replace the app's dark, teal-accented visual language with a two-theme
(light + dark) token system rooted in the naqsheh metaphor — warm-bone
paper, iron-gall indigo ink, saffron-gold primary accent, saffron-flower
violet ornamental secondary — and ship two Slider components that consume
those tokens: a neutral `<Slider>` primitive used throughout the app, and
a `<CommitSlider>` variant used in `OptimizeSection` that visualizes
preview vs. applied value side-by-side.

## 2. Primary User Action

Adjust a numeric parameter and feel the cell under your hand become a
diamond and then settle back to a square — a physical enactment of the
naqsheh craft the product is named after.

## 3. Design Direction

**Anchor.** The naqsheh: ruled warm-bone paper, iron-gall indigo ink,
generous empty ground, color placed as rare painted cells.

**Themes.** Ship both from day one. Light default on systems with
`prefers-color-scheme: light`; dark default on dark-preferring systems;
visible toggle overrides and persists (`localStorage: sonoform-theme`).

**Chrome palette (8 tokens — light / dark, OKLCH):**

| Token         | Light                        | Dark                          | Purpose                                       |
|---------------|------------------------------|-------------------------------|-----------------------------------------------|
| `paper`       | `oklch(0.98 0.008 85)`       | `oklch(0.22 0.03 265)`        | Dominant ground                               |
| `paper-warm`  | `oklch(0.96 0.012 85)`       | `oklch(0.25 0.035 265)`       | Inset surfaces (modals, Prepare working area) |
| `ink`         | `oklch(0.24 0.05 270)`       | `oklch(0.96 0.008 85)`        | Primary text, strokes, thumb fill at rest     |
| `ink-soft`    | `oklch(0.45 0.04 270)`       | `oklch(0.80 0.008 85)`        | Secondary text, muted labels                  |
| `hairline`    | `oklch(0.88 0.01 85)`        | `oklch(0.34 0.03 265)`        | 1px borders, dividers, slider track           |
| `muted`       | `oklch(0.92 0.008 85)`       | `oklch(0.28 0.025 265)`       | Hover wash, dormant backgrounds               |
| `saffron`     | `oklch(0.78 0.15 75)`        | `oklch(0.75 0.13 75)`         | Load-bearing interactive fill (active/drag)   |
| `violet`      | `oklch(0.48 0.17 305)`       | `oklch(0.68 0.18 305)`        | Ornamental outline, focus rings               |

**Jewel palette (7 tokens, reserved for user-drawn layers — NEVER chrome):**
`cobalt`, `madder`, `saffron-deep`, `rose`, `olive`, `bone`, `burgundy`.
Seeded into `ColorPicker.jsx` as the default suggested swatches.

**Typography.** Body + display pair chosen in the craft pass. Body: warm
humanist grotesque with OpenType `tnum` + `lnum` (for slider value
readouts). Display: hand-painted-manuscript-caption feel. Both must reject
the reflex list in `.impeccable.md`.

**Type scale.** Consolidate current 9/10/11/12px mess into three UI steps
with a ≥1.25× ratio. Proposal: `12 / 15 / 19` for body UI, display steps
`24 / 32 / 48` fluid-clamped for marketing surfaces (not in this feature's
scope but seeded in the token system).

**Motion.** Exponential easing everywhere. Thumb rotation 240–280ms,
graticule fade 240ms, both `cubic-bezier(0.22, 1, 0.36, 1)`. No bounce, no
elastic. Respect `prefers-reduced-motion` — under that setting, rotation
cross-fades instead of animating.

## 4. Layout Strategy

This feature is foundation-level, not layout-level. Two outputs:

1. **Token layer.** Install CSS custom properties at the `:root` and
   `[data-theme="dark"]` scopes. Replace every hard-coded hex literal
   across `index.css`, `tailwind.config.js`, and component files with
   token references. The existing Tailwind theme extension moves into a
   CSS-variable-backed structure so classes like `bg-paper`,
   `text-ink`, `border-hairline`, `text-saffron`, `text-violet` become
   available without touching every file.

2. **Slider components.** Two files:
   - `src/components/ui/Slider.jsx` — neutral primitive (replace
     existing).
   - `src/components/ui/CommitSlider.jsx` — new variant, composes
     `Slider`, adds ghost-thumb overlay.

## 5. Key States

### `<Slider>` primitive

| State                          | Track                                 | Thumb                                                | Value readout                           |
|--------------------------------|---------------------------------------|------------------------------------------------------|-----------------------------------------|
| Rest                           | 1px `hairline`, no graticule          | ~10px `ink` square, 0° rotation                      | `ink-soft`, tabular lining figures      |
| Hover (anywhere on row)        | 2px `hairline`, faint graticule fades in (opacity 0.4, `muted` ticks) | Animates 0° → 45° (diamond), thin `violet` 1px outline appears | `ink`, faint `paper-warm` wash        |
| Focus (keyboard)               | Same as hover                         | Diamond, `violet` focus ring 1.5px at 2px offset     | Unchanged                               |
| Active (drag / arrow key held) | Same as hover, ticks within ±30% of thumb become `ink-soft` | Diamond, filled `saffron`, `violet` outline 1.5px | Unchanged                              |
| Editing readout                | Unchanged                             | Unchanged                                            | 1px `violet` border, `saffron` text     |
| Disabled                       | 1px `muted`                           | `muted` square, no outline                           | `muted`                                 |

### `<CommitSlider>` additional states

| State                             | Ghost thumb                                        | Tie-line                                |
|-----------------------------------|----------------------------------------------------|-----------------------------------------|
| `value === committedValue`        | Not rendered (identical to primitive)              | Not rendered                            |
| `value !== committedValue`        | ~10px `ink-soft` outlined square at committed position, 0° rotation, opacity 0.7 | 1px dashed `ink-soft` between ghost and live thumb |
| Hover over ghost thumb            | Tooltip: `"Current applied value: X"`              | Line becomes solid                      |

## 6. Interaction Model

### Keyboard (both components)
- `ArrowLeft` / `ArrowRight`: 1 × `step`
- `Shift + Arrow`: 10 × `step` (coarse — motif-scale jumps)
- `Option/Alt + Arrow`: 0.1 × `step` (fine — sub-cell precision)
- `Home` / `End`: jump to `min` / `max`
- `Enter` on value readout: enter edit mode
- `Enter` commits edit, `Escape` cancels, both remove focus after
- Double-click value: select-all-and-edit (preserve existing behavior)

### Pointer
- Click track: jump thumb to position (preserve native `<input
  type="range">` behavior)
- Drag thumb: update value live; animate thumb rotation in on mousedown,
  out on mouseup (irrespective of cursor hover state at release)
- Click value: enter edit mode (preserve existing)

### Tooltips
- Label region: optional `tooltip` prop shows on hover (existing pattern,
  restyled in paper-ink language — hairline border, no drop shadow)
- Thumb `title` attribute contains the modifier reference: `"Shift =
  coarse (×10), Option = fine (×0.1)"` — discoverable but unobtrusive

### `<CommitSlider>` specific
- No apply button inside the slider; apply / revert live at the
  `OptimizeSection` level (existing pattern — keep)
- `committedValue` is informational; the slider doesn't know about
  "applying," only about "here's the number that export will use right
  now"

## 7. Content Requirements

All existing copy kept verbatim. The UX writing was audited in the critique
pass and is already in the Naqsha voice.

New strings introduced:

| Surface                        | Copy                                                    |
|--------------------------------|---------------------------------------------------------|
| Slider thumb `title` default   | `Arrow: step · Shift: coarse · Option: fine`           |
| `CommitSlider` ghost tooltip   | `Applied: {committedValue}` (parent-provided formatter) |
| Theme toggle tooltip           | `Toggle theme` (existing; stays unchanged)              |

No error, empty, or loading states apply to the slider — values are always
bounded, and the parent handles gate/locked UI around the primitive.

## 8. Recommended References

In priority order for the craft pass:

1. **`reference/color-and-contrast.md`** — the OKLCH token installation is
   the biggest body of work; AA contrast on `saffron` (the trickiest pair
   given its low-contrast behavior on cream) needs verification.
2. **`reference/motion-design.md`** — thumb rotation, graticule fade,
   reduced-motion fallback.
3. **`reference/typography.md`** — body font selection (avoiding the
   reflex list); OpenType `tnum` + `lnum` activation; type scale
   consolidation.
4. **`reference/interaction-design.md`** — focus management, keyboard
   discoverability, the click-vs-drag gesture on the thumb.
5. **`reference/spatial-design.md`** — only lightly; the slider itself is
   a primitive, but the token system's `--space-*` scale lands in the
   same pass.

## 9. Open Questions

These aren't blockers — they're decisions for the craft pass to make with
the real layout in front of it.

- **Final font picks.** Body + display, both from outside the reflex list.
  Audition in craft, verify on the real panel with 10+ stacked sliders and
  tabular numbers.
- **Graticule density.** 4pt tick marks? Aligned to the actual value grid
  (so `step` = one tick)? If so, a slider with `step: 0.01` range `0–1`
  would render 100 ticks — too many. Possible answer: the graticule is
  decorative (cosmetic 8-tick subdivision) unless the `step` count is in
  a visible range (say, 3–20), in which case ticks align to real values.
- **Light/dark toggle placement.** The toggle is new UI — likely in the
  top-right header near `AuthButton`, but placement is layout work, not
  token work. Confirm during craft.
- **Thumb hit area.** Current `<input type="range">` natively gets a
  10–14px thumb. Accessibility asks for ≥24px touch targets on mobile.
  Solution likely: the visible diamond is ~10px, the invisible hit area
  is 24–28px (achieved via a transparent pseudo-element or an outer
  wrapping button).
- **Theme flash on load.** Need a small inline `<script>` in
  `index.html` that sets `data-theme` before the first paint, otherwise
  users preferring dark will see a flash of light mode. Standard move but
  calls for a small implementation detail.

---

## Status

Brief confirmed by user through decision-by-decision Q&A. Ready to hand to
`/impeccable craft` for implementation.
