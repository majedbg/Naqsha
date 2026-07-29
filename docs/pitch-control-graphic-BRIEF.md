# Anchor-pitch control graphic — BRIEF

**Status:** concept, not built. Written 2026-07-28 to be picked up in a fresh session.

**How to use this file:** open a new session and run the `grilling` skill against this
brief FIRST (stress-test the open questions at the bottom — do not assume the answers),
then run the `prototype` skill (UI branch) to build the recommended variations. Both
skills are listed in the session's available-skills. Grill before prototyping: several
questions below change what the graphic *is*, not just how it looks.

---

## 1. What the control is

A per-layer **anchor pitch** control for motif layers — how far apart the anchors are
sampled along a host path. It does not exist in the UI yet. The underlying field is
already plumbed end to end:

- `sampleEdgeAnchors(paths, {spacing})` — `src/lib/motif/anchors.js:315`. Arc-length
  resampling, so `spacing` is genuinely *per unit distance* and self-normalises across
  short and long edges. Also accepts `count`, unused by motifs.
- Default is hardcoded at layer creation: `edgeOpts: edgeOpts || { spacing: 24 }` —
  `src/lib/motif/motifLayer.js:80`. **Nothing in the UI writes it.**
- Floor: `MIN_EDGE_SPACING = 4` — `src/lib/motif/anchors.js:20` (post-crash hardening).
- Read back by the ghost overlay so dots and glyphs agree —
  `src/components/canvas/AnchorGhostOverlay.jsx:216`.

**Reaches only EDGE hosts.** On a semantic host, `MotifPattern.js:105-116` calls
`resolveHostAnchors` WITHOUT `edgeOpts`; density is owned by the extractor through its
own count-based params (`edgeSamplesPerArm = 24` at `semanticAnchors.js:650`,
`edgeSamplesPerArc = 3` at `:1153`). Deliberate — documented at
`semanticAnchors.js:1090-1097`. Consequence: count-not-distance means a long arm and a
short arm get the same number of anchors at different pitches.

**It is ANCHOR pitch, not GLYPH pitch.** Rests, weighted Random deals, junction-skips
and `no-fit` rejections all leave anchors carrying no glyph. At spacing 24 with a 2-slot
sequence where one slot is a Rest, real glyph-to-glyph distance is 48. The label must
not promise "distance between glyphs".

Decided already (2026-07-28, Majed): the control is **spacing**, not density, as the
primary unit — it shares the radius unit system with Size, `min`, `margin` and the
shrink weight, and is monotone in the right direction (bigger = more air).

## 2. The concept to prototype

A control that is **a toggle and a visualization at the same time** — one wide graphic
that both shows what the number means and switches which number you are typing.

### State 1 — DENSITY (rectangle)

- Dots on a horizontal line.
- A **rectangle** spans a run of the line: "this is the unit distance within which the
  glyphs are counted."
- Dragging the number moves the **dots closer together / further apart**. The rectangle
  stays **fixed** — its width IS the unit length. What changes is how many dots fall
  inside it. That fixity is the whole pedagogical point.

### State 2 — SPACING (bracket)

- Same dots on the same line.
- The rectangle becomes a **bracket pointing at the gap between two adjacent dots**.
- The number in the field **swaps to the reciprocal** (`density = 1 / spacing`) —
  mathematically trivial, but the displayed number changes meaning.
- In this state the field must accept and display a **float with more decimal places**
  — e.g. `0.121` needs to be a meaningful, typeable distance.

### The toggle

**Clicking the graphic** flips rectangle ↔ bracket, and swaps the number with it. Click
again to flip back. No separate toggle control, no label switch — the graphic is the
switch.

### Aspect ratio

Deliberately **wider than the house icon norm**. Showing a count of things along a line
is load-bearing visual communication, so up to **5:1 w/h is acceptable, possibly more**.
This is an explicit exemption from the near-square icon convention, not an oversight.

## 3. What it must be built from

- **The numeric field is `DragNumber`** — `src/components/ui/DragNumber.jsx`. Its
  affordance is the **split-diamond thumb**: ink square at rest, rotates to a diamond on
  hover whose halves part into up/down pointers, saffron on drag with the trailing half
  dimmed so the leading half reads direction, violet focus ring. Absolute
  position→value (never velocity), `linear` and `geometric` mappings, `onChange` live +
  `onCommit` once per gesture. Do NOT invent a new numeric input.
  (`DragDial` — `src/components/ui/DragDial.jsx` — is the sibling rotating-needle
  bearing cell used in `GlyphPopover`. Not this.)
- **Tokens only, never hex literals.** `var(--saffron)` is the one load-bearing accent,
  `var(--ink-soft)` for unlit, `var(--hairline)` for rules, violet for focus only. See
  `.claude/shape-brief-tokens-slider.md` and existing usage in
  `src/components/shell/motif-prototypes/prototypeShared.jsx`.
- **Prototype convention already in the repo:** `src/components/shell/motif-prototypes/`
  — variants + a `MotifPrototypeOverlay` mounted from `src/pages/Studio.jsx:2364`, gated
  on `import.meta.env.DEV` and a `?variant=` search param, inert without it, never under
  vitest. Follow this shape; use a DIFFERENT param name so it cannot collide with the
  existing motif-device prototype.
- **Reduced motion:** `usePrefersReducedMotion` exists in `prototypeShared.jsx`. A
  graphic whose whole job is animated dot spacing needs a considered non-animated
  reading, not a disabled one.

## 4. Open questions — grill these, do not assume

1. **Does the stored document field change when you toggle?** Strong default: no —
   `edgeOpts.spacing` stays the stored unit and density is a display transform. If
   toggling writes a different field, round-tripping float reciprocals will drift.
2. **What are the ranges and steps in each state?** Spacing has a hard floor of 4
   (`MIN_EDGE_SPACING`). What is its ceiling? What does that floor become when inverted
   into density, and does the drag mapping stay `linear` in both, or does one want
   `geometric`?
3. **Precision.** How many decimals in each state, and what stops the reciprocal of a
   rounded display value from drifting the stored value on repeated toggles?
4. **Do the dots in the graphic reflect the REAL host**, or are they a schematic? Real
   dots make it a live readout and tie it to the anchor-pitch-vs-glyph-pitch problem
   (should rests/skips show as hollow?). Schematic dots are honest about being a legend.
5. **What does the graphic do on a semantic host**, where the control is structurally
   inert? Hide it, show it disabled with the extractor's effective pitch, or show the
   count-based reality?
6. **Does clicking-to-toggle fight click-to-type-in?** `DragNumber` already uses a
   click-without-drag as its type-in gesture, and `DragDial` uses one as a disclosure.
   Three gestures in one row needs a hit-target answer.
7. **Is one graphic serving two units confusing under a keyboard / screen reader?** The
   toggle has no text label by design. What is the accessible name, and does it announce
   the unit change?
8. **Aspect ratio in situ.** 5:1 in the Inspector rail at real width — does it survive
   the dock's narrow states, or does it need a compact fallback?

## 5. Related, decided elsewhere

This control is one of four interlocking strands from the 2026-07-28 session (the others
are the per-slot shrink weight `w`, the footprint-circle hover overlay, and the
silent-rejection surface). Decisions locked so far live in the grill's plan doc. The
short version relevant here: spacing is the input that decides whether collision
shrinking happens at all — the agent's own sweep showed gap 20 silently drops half the
leaves while gap 22 keeps all of them at 19–42%. Two units apart. This control and the
shrink weight are two halves of one knob.
