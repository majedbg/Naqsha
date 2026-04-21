# Naqsha — Design Decisions

> A narrative log of the visual-language decisions behind Naqsha. Written so it
> can seed a portfolio case study, a README, or a talk. Each decision captures
> the question that forced it, the options considered, what was chosen, and
> why.
>
> The product is named after **naqsheh (نقشه)** — the painted grid-sheet a
> Persian carpet designer hands to a weaver. Every decision here is measured
> against that anchor: paper, grid, hand-painted cells, quiet ground, jewels
> for punctuation.

---

## Decision 01 — The load-bearing accent is saffron, with violet as its
ornament

**Question.** A single load-bearing UI accent needs to carry the brand —
hovers, focus, primary buttons, interactive affordances. Which color?

**Options considered.**

- *Cobalt.* The archetypal Persian blue. Trustworthy, serious, survives both
  light and dark modes. The safe, classical choice.
- *Madder red.* Bold and painterly, high-contrast on cream. Risk: on a paper
  ground, madder on every interaction reads alarming instead of inviting.
- *Saffron.* Warm yellow-orange-gold. Optimistic, high-signal. Risk: saffron
  on cream paper is low-contrast on its own — it needs help to meet WCAG AA.

**Decision.** *Saffron as the primary accent, with saffron-flower violet as
an ornamental secondary.*

The choice is rooted in the plant itself. A saffron crocus has deep violet
petals; the orange-red stigma threads inside those petals are what become the
spice. Those two colors are not an arbitrary pairing — they're botanically
inseparable. The palette takes that pair and gives each one a different job:

- **Saffron-spice** (`oklch(~0.78 0.15 75)`) is the warm interactive fill —
  it lights up on drag, shows the active value, marks a current selection.
- **Saffron-flower violet** (`oklch(~0.48 0.17 305)`) is the ornamental
  counterweight — focus rings, outlines, subtle stylistic details (the
  outline of a button, an ornament on a slider track). It provides the
  contrast that saffron-on-cream can't.

**Why this matters.** The product comes from Persian craft heritage; saffron
is the Persian spice. A monolithic accent (one color doing all jobs) would
have been easier to implement but would have sacrificed the one-two rhythm
that the plant already teaches: warm fill, cool outline. The UI inherits that
rhythm.

---

## Decision 02 — A disciplined chrome palette, a separate jewel palette for
user drawings

**Question.** How many named colors should the system expose, and where is
each one allowed to appear?

**Options considered.**

- *Lean (6 tokens).* Force every surface to live off `paper / ink /
  hairline / muted / accent / danger`. Maximum discipline, minimum warmth.
- *Full jewel palette for everything.* Ten or twelve tokens, every surface
  free to reach for cobalt or madder. Maximum warmth, risk of noise.
- *Split.* Chrome tokens handle the interface; a separate jewel palette is
  reserved strictly for user-drawn content.

**Decision.** *Split.*

Two distinct palettes live in the codebase. Neither leaks into the other.

**Chrome palette (8 tokens, drives all UI):** `paper`, `paper-warm`, `ink`,
`ink-soft`, `hairline`, `muted`, `saffron`, `violet`.

**Jewel palette (reserved for layers the user draws):** `cobalt`, `madder`,
`saffron-deep`, `rose`, `olive`, `bone`, `burgundy`. These appear in the
layer color picker as the default suggested swatches, so the user's actual
drawings automatically rhyme with the naqsheh references the product is
built from.

**Why this matters.** A naqsheh is ~80% white ground. The interface has to
protect that ground. If chrome freely reaches into the jewel palette, the
interface becomes a carpet and the carpet becomes an interface — the
metaphor collapses. The split keeps chrome quiet so the user's work can be
loud. When a user picks "cobalt" for a layer, that cobalt means something,
because it's not also the color of the sidebar background.

---

## Decision 03 — The paper is warm bone, tinted toward yellow

**Question.** What does the ground of the interface literally look like?

**Options considered.**

- *Warm bone.* `oklch(0.98 0.008 85)`. The slightly-yellowed paper of an
  actual naqsheh scan.
- *Cooler pure.* `oklch(0.99 0.003 85)`. Nearly pure white. Reads as "modern
  software."
- *Violet-whispered cream.* Paper subtly tinted toward the brand violet so it
  rhymes with the accent.

**Decision.** *Warm bone.*

The naqsheh reference images are unambiguous: the paper has age and
temperature. A cooler pure-white ground would have translated the product
into a generic modern-software aesthetic that every SaaS already occupies.
The violet-whispered option was tempting but started inventing a connection
the references don't actually make — manuscript paper isn't violet, it's
yellowed linen.

A secondary `paper-warm` token (`oklch(0.96 0.012 85)`) deepens the same hue
for inset surfaces like modal sheets and the Prepare-mode working area,
so the eye can still read depth without any token ever reaching for gray.

---

## Decision 04 — The ink is iron-gall indigo

**Question.** What color are the body text and the primary strokes on the
paper?

**Options considered.**

- *Near-black, slightly warm.* Safest, highest contrast, generic
  "well-crafted dark text."
- *Deep iron-gall indigo.* `oklch(0.24 0.05 270)`. The actual ink Persian
  manuscripts were painted with. A subtle move most users won't notice.
- *Ink tinted toward the brand violet.* Ties ink subliminally to the
  ornament.

**Decision.** *Iron-gall indigo.*

The naqsheh framing is the product's soul. If the paper is bone, the ink
should be the ink that naqshehs were actually painted with — iron-gall,
which oxidizes over time toward a deep blue-black-indigo. The move is
quiet by design; a user doesn't have to name it for it to work. What they
notice is that the text has weight without feeling heavy, and that when
cobalt or violet appears on the page, they all read as members of the same
family rather than one-off accents on a neutral ground.

Contrast against the bone paper measures comfortably above WCAG AA at all
body sizes, and the slight blue bias keeps the ink from competing with the
saffron when they sit near each other.

---

## Decision 05 — Ship light and dark modes simultaneously

**Question.** Do we ship the paper-and-ink light mode first and add dark as
a follow-up, or build both into the token system from day one?

**Options considered.**

- *Light-only first.* Safer scope, but every existing user wakes up on a
  different theme — a cold migration.
- *Both at once.* Doubles the surface of one design pass but halves
  migration anxiety and means we never touch the color system again.
- *Dark default with light as opt-in.* Staged rollout. Defers the real
  decision.

**Decision.** *Both at once.*

The expensive part of a theme system is the naming and semantic structure
(`paper`, `ink`, `hairline`, etc.) — that work is being done regardless.
Adding a second OKLCH value to each already-named token is mechanical. The
first-load theme follows `prefers-color-scheme`; an in-UI toggle lets users
override; the choice is persisted locally. Shipping both on day one means
existing dark-mode users aren't surprised, new users on light OS
preferences meet the naqsheh aesthetic immediately, and the palette
question stops costing us attention.

---

## Decision 06 — Dark mode is ink-on-indigo, not ink-on-black

**Question.** What is the dark-mode "paper"?

**Options considered.**

- *Warm deep indigo.* The inverted naqsheh: the ink becomes the light tone,
  the paper becomes the dyed ground.
- *Warm charcoal.* Near-black with a warm tint. Safer, more neutral.
- *Deep violet-ink.* A dark version of the ornamental accent.

**Decision.** *Warm deep indigo — `oklch(0.22 0.03 265)`.*

Dark mode inverts the naqsheh metaphor on purpose: the paper is now indigo
vellum, the text is bone ink on that vellum. Iron-gall indigo stops being
the ink and becomes the paper; the bone that was the paper in light mode
is now the text. The relationship between colors is *preserved*, only the
direction flips. Saffron and saffron-flower violet still read as jewels
against a dyed ground rather than as neon accents on a generic dark
surface — which is what most "dark mode" actually looks like and what this
product explicitly refuses to be.

Chroma drops slightly on saffron and lifts slightly on violet in dark mode
to compensate for how the eye reads color temperature against an indigo
ground. Those adjustments live in the token values, not in component code.

---

## Decision 07 — The slider thumb is a cell that becomes a diamond under
the hand

**Question.** Naqsha is a product named after a grid. Where does the grid
physically show up in the interface, so the name earns itself at the level
of a single interaction?

The slider is the highest-traffic primitive in the app — pattern parameters,
stroke widths, tolerances, counts, seeds. It's the surface the user spends
the most time touching. If one primitive carries the naqsheh metaphor
physically, it should be this one.

**Options considered.**

- *Visible graticule on every slider track at rest.* Most literal, most
  overt; risks turning a panel of twenty sliders into a ruled notebook.
- *Painted-cell-only aesthetic with no grid DNA.* Cleanest at density;
  sacrifices the metaphor.
- *A track made of literal cells.* A row of tiny cells lights up one at a
  time as the thumb moves. Most unforgettable; risks feeling toy-like at
  the precision level plotter users demand.
- *Quiet at rest, painted-cell on interaction.* Defaults to a plain
  hairline + small square thumb; reveals graticule and color on touch.

**Decision.** *Quiet at rest, painted-cell on interaction — with the thumb
itself doing the signature gesture.*

The thumb is a small filled square. At rest it sits axis-aligned — a
painted cell on a ruled page. When the user's cursor arrives, the square
**rotates forty-five degrees** and becomes a diamond. A thin violet outline
appears. A faint graticule fades in along the track. On active drag, the
diamond fills with saffron and a short run of ticks lights up either side
of it. On release, the diamond rotates back to a square, the saffron bleeds
back to ink, and the grid fades out. All easing is exponential,
`cubic-bezier(0.22, 1, 0.36, 1)` — patient deceleration, never bounce.

**Why this matters.** The rotation is the entire story of the product
compressed into one interaction. A naqsheh cell sits still until the
designer handles it. When they do, it becomes live — *a decision being
made*. When they let go, it settles back into the grid — *a decision
committed*. Every time a Naqsha user drags a slider they re-enact the
craft the product is named after. The metaphor isn't decorative; it's
mechanical, and it lives in the primitive they touch the most.

At rest the slider is silent enough to live at density of twenty per
panel without fatigue. The personality only appears where it's earned —
under the user's hand, at the moment of use.

---

## Decision 08 — Keyboard modifiers map to the grid's multiple scales

**Question.** Plotter and laser users are precision workers. Arrow keys on a
slider walk one step at a time. What modifier behavior supports the speed
a skilled user wants without inventing shortcuts nobody will discover?

**Options considered.**

- *Baseline only.* Arrow keys step, value readout is editable. No
  modifiers. Cleanest, slowest.
- *Power-user modifiers.* Shift for coarse jumps, Alt for fine adjust,
  Home/End for extremes.
- *Modifiers plus reset-to-default on Cmd+click.* Adds a hidden reset
  affordance.
- *Drag-to-scrub on the value readout.* Vertical drag nudges the number
  (familiar from Blender, Figma, After Effects).

**Decision.** *Power-user modifiers — `Shift = ×10`, `Option/Alt = ÷10`,
`Home`/`End` for min/max.*

The choice earns its weight from the metaphor. A naqsheh designer works at
three different scales depending on what they're doing: *cell by cell* when
painting a single motif detail, *motif by motif* when laying out a repeat,
*whole-carpet* when balancing color weight across the field. The keyboard
map is literally those three scales.

```
                     ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
  ────────────────  ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤
  Arrow  →  one cell                 ◇
                                     └─┐
  Shift+Arrow  →  ten cells           ·└─────────────┐
                                                     ·└─────────────┐
  Option+Arrow → a tenth of a cell                                 ·└─┐
                                                                      └─·
  Home / End  →  jump to the edges
```

*Arrow* walks one cell. *Shift+Arrow* walks ten — a motif-sized region,
the jump a designer makes when they're balancing the composition rather
than detailing. *Option+Arrow* subdivides the cell, the move a designer
makes when they want precision the grid doesn't natively offer.

**Why this matters.** The slider isn't a volume knob — it's a tool inside
a craft that already operates at multiple grid scales. The modifier map
acknowledges that instead of inventing shortcut semantics from first
principles. Users who ignore the modifiers get a perfectly usable slider;
users who discover them through the tooltip inherit the precision
vocabulary their craft already uses.

Reset-to-default is deliberately not on this primitive. It belongs on a
right-click menu or a dedicated ↺ action affordance at the parameter row
level, where discoverability doesn't have to compete with the slider's
more fundamental gestures.

---

## Decision 09 — The human-in-the-loop principle is drawn into the slider
itself, but only where it earns its cost

**Question.** Naqsha commits to a human-in-the-loop principle: every
transformation shows preview → apply → revert; the product never silently
changes the user's work. The Prepare tab makes this visible at the section
level with explicit Apply and Revert controls. Should the slider itself
also visualize that "unapplied" state — and if so, everywhere or only
where it matters?

**Options considered.**

- *Keep the slider primitive neutral.* The parent renders dirty state on
  its own. The slider is a dumb precise input reusable across every
  parameter in the app.
- *Every slider understands dirty.* Outline goes dashed, value turns
  violet when the value diverges from the last applied one. Consistent
  across the app; costs visual weight on sliders that don't have an
  apply step at all.
- *Slider shows both values side by side.* The live thumb sits at
  `value`, a ghost thumb sits at `committedValue`, and a hairline ties
  them together. Literally draws the preview→apply distinction.

**Decision.** *Two components. A neutral primitive, and an opt-in variant.*

```
  primitive (Slider) — used everywhere

    ├────────── ◼ ─────────────────────────┤
                ▲
                thumb at current value


  variant (CommitSlider) — used in Prepare > Optimize

    ├────── ◻ · · · · · ◼ ─────────────────┤
             ▲             ▲
             committed      live preview
             value          value
                 └─ hairline tie-line ─┘
```

The primitive `<Slider>` stays dumb: value, min, max, step, label. Every
pattern parameter, every universal control, the canvas margin — all of
them consume the primitive and never pay for an apply-state they don't
have.

The variant `<CommitSlider>` takes an extra `committedValue` prop. When
the live value diverges from the committed value, a ghost square thumb
appears at the committed position, outlined but not filled, and a thin
line ties the two positions together. The user can literally see *where
they came from and where they are now* — the transformation the product
performs rendered directly into the control that performs it.

**Why this matters.** A principle that only lives in written docs drifts
out of the product with the first missed review. A principle rendered
into the physical shape of the primitive that carries it cannot drift —
if the ghost thumb disappears, the feature is visibly broken. The
optimize section is the one place in Naqsha where the loop — *preview,
apply, revert* — is load-bearing for correctness (not just ergonomics):
the exported SVG reads `appliedTolerance`, not the live slider value, so
the dissonance between the two must be impossible to miss.

A second lesson is negative: this variant is **not** appropriate for
every slider in the app. Most parameters update the canvas live and there
is nothing to "commit." Rendering a ghost thumb for them would invent a
distinction that doesn't exist — a decorative touch posing as meaning.
The split into two components protects the meaning of the ghost thumb by
keeping it rare.

---

## Decision 10 — Body sets in Commissioner, display sets in Ibarra Real Nova

**Question.** The brief called for a warm humanist grotesque body paired
with a display face that evokes hand-painted manuscript captions. Which
specific faces, given that the usual reflexes — Inter, IBM Plex, Fraunces,
Space Grotesk — all lead to AI monoculture?

**Decision.** *Body: **Commissioner**. Display: **Ibarra Real Nova**.*

**Commissioner** is a humanist grotesque designed by Kostas Bartsokas for
an indie literary magazine. It's a variable font with optical sizing and a
wght axis from 100 to 900. Its letterforms carry subtle calligraphic
flair — slightly flared terminals, mild humanist proportions — that keep
the UI from feeling corporate without tipping into decorative. Tabular
lining figures hold numeric columns in alignment. Commissioner is free
via Google Fonts and underused in tech contexts, which matters: the whole
point of the font selection procedure was to escape the monoculture fonts
my training data would reach for by reflex.

**Ibarra Real Nova** is a transitional serif based on a specimen cut by
the Spanish printer Joaquín Ibarra in 1780. It carries genuine letterpress
warmth — ink bloom, varying stroke weights, a slight imperfection — without
any artificial distress filter layered on top. The historical ballpark
matters: the same 18th–19th-century workshop era produced the Persian
carpet naqshehs the product is named after. Ibarra wasn't making Persian
typography, but the two traditions share the same moment in the history of
handmade making — a moment this UI wants to belong to rather than pretend
to transcend.

**Why this matters.** The body sets in a grotesque, the display sets in a
serif — proven contrast on multiple axes (structure, era, voice). Neither
face appears in the procedure's banned-reflex list. A user sitting down to
adjust sliders for an hour sees Commissioner's tabular numbers and feels
they're looking at a tool, not a marketing page. When they switch to the
marketing surface or the section header, Ibarra Real Nova quietly says
"this tool was made by someone who cared."

---

## Decision 11 — AI-generated patterns get a dot, not a uniform color wash

**Question.** The app distinguishes AI-generated patterns from built-in
ones. The current implementation paints every AI tab purple — both fill
and hover — which makes AI *feel* like a different kind of object than
regular patterns. Do AI tabs stay visually categorical, or become
indistinguishable from built-ins?

**Decision.** *AI gets a small violet dot before its label. That's it.*

An AI-generated pattern isn't a different kind of pattern; it's a pattern
with a different origin. The interface should reflect that. The 1.5×1.5px
violet dot — sized to match a naqsheh cell — is a marker of origin, not a
category. Active tabs (AI or otherwise) get the standard saffron fill.
Inactive tabs all sit on the same paper-warm ground. The only place the
dot appears is before the label itself, like a printer's mark in the
margin of a manuscript.

**Why this matters.** Color differentiation for AI features is one of the
most recognizable AI design tells of 2024–2026: purple-everything,
purple-to-blue gradients, "✨" emoji, aurora effects. Naqsha refuses to
advertise the AI. A user picks a pattern because of what it looks like on
paper, not because the app painted it a different color to say *look, I
used a language model*. The dot preserves the information that the
pattern is AI-generated without turning origin into spectacle.

The "New" button that opens the AI chat keeps a dashed violet outline
instead of a full saffron fill — the outline signals *"this is where
something is invented"* without paying the saturation cost of purple fill.

---

## Decision 12 — Ship the theme toggle wired, with a mirror-migration of
97 hex literals in the same commit

**Question.** The brief called for light and dark themes shipped
simultaneously with the theme system honoring `prefers-color-scheme`. But
the existing codebase had 97 hex-color literals hard-coded across 28
component files — all of them dark-mode-only. Ship the toggle immediately
(but see a broken light mode full of black islands) or stage the work?

**Decision.** *Ship in a single commit. Toggle mounted in the global
header; every hex literal migrated to a semantic token in the same pass.*

An honest system ships honestly. A theme toggle that reveals broken
surfaces teaches users the product isn't finished. The migration was
mechanical — four rounds of semantic sed passes catching `bg-[#111]` →
`bg-paper`, `text-gray-400` → `text-ink-soft`, `bg-purple-500` →
`bg-saffron`, `text-green-400` → `text-tone-ok`, and so on — with two
pockets of manual care: PatternTabs (where the AI-purple logic needed to
be rewritten) and OptimizeSection (where the plain `<input type="range">`
needed to become the new `CommitSlider` with its ghost thumb).

The shipped commit: one new token file, one new theme hook, one new toggle
component, two Sliders (primitive + commit), a revised global CSS,
Tailwind config, and `index.html` (for flash prevention), and 28 migrated
component files. Every surface in the app now reshapes when the user
flips the toggle — there are no dark islands, no stranded gray text, no
purple AI tells. The product looks like the same product in either
theme, which is the only way a theme system earns the word "system."

---

*More decisions will be appended as the design conversation continues.*
