# Motif × Ableton — UI research for the Motif device redesign

*2026-07 · research for the motif-shell follow-ups (issue #91) and the three
`motif-prototypes/` variants (A Rack ledger · B Chain · C Score margin).
All Ableton claims below were checked against the Live 11/12 reference manual
and secondary sources; URLs inline and in the Sources section.*

---

## Executive summary

1. **The screenshot's mental model is real and verified.** Ableton uses **both**
   mechanisms the screenshot shows: a **Style dropdown** *inside* the Arpeggiator
   (18 enumerated patterns — Up, Down, UpDown, Pinky Up, Converge, Chord Trigger,
   Random…) *and* a **browsable directory of presets** ("Ubiquitous" is a genuine
   factory `.adv` preset of the Arpeggiator in the Core Library's MIDI Effects →
   Arpeggiator folder). These are different things at different altitudes: the
   Style chooser is **one enum parameter**; a preset is a **saved snapshot of the
   whole parameter state**, dragged in from the Browser, and the device chrome
   never changes. Naqsha's planned Mode selector is a *third* thing — a preset
   that stays visibly selected and **slides to Custom on edit** — and that is
   arguably better than Ableton, which leaves a stale preset name in the title
   bar after you tweak a knob.
2. **The Ableton analogy holds at the IA level and breaks at the semantics
   level.** The motif chain is genuinely rack-like (serial, reorderable,
   bypassable), but it is a *build-time filter pipeline over spatial anchors*,
   not a real-time signal path — closer to Blender's modifier stack than a
   device chain. "Rhythm" in Naqsha is spatial cadence along a path. The one
   place time genuinely re-enters is the machine: **a plotter draws in order**,
   so the Trace transport is best understood as a *plot-order preview*, not a
   song transport.
3. **Compact controls — the concrete recommendation.** Do not adopt radial
   knobs (NN/g explicitly calls software knobs a poor, skeuomorphic fit for
   mouse input). The native **visual-craft** idiom Naqsha should own is:
   **(a)** the **scrubbable number field** (Figma/Blender lineage) as the
   workhorse for every bounded scalar, **(b)** the **rhythm strip as a direct
   control** (the notation *is* the editor) for Skip/Every N, and **(c)** a
   hairline **compass-arc dial** only for genuinely angular params. Collapsing
   Route/Every N/Density to single-line "block rows" with these controls takes
   the pre-Sequencer rack from ≈270 px to ≈100 px of vertical space (≈60 %
   saving) while keeping type-to-enter precision.

---

## 1 · Ableton's mental model & information architecture

### 1.1 Signal flow and the Device View

The Live manual's core framing ([Live Concepts, ch. 3](https://www.ableton.com/en/live-manual/12/live-concepts/)):

> "the audio signal from the clip reaches the leftmost device in the chain.
> This device processes (changes) the signal and feeds the result into the
> next device."

For MIDI tracks the order is fixed by type: MIDI effects → instrument →
audio effects. The Device View is a **fixed-height horizontal strip** at the
bottom of the window showing the selected track's chain left-to-right. That
fixed height is load-bearing for question 4: every device must fit a ~170 px
band, which is *why* Ableton's parameter idiom is horizontally dense knobs and
tiny dropdowns rather than stacked sliders. The constraint produced the
control vocabulary, not the other way around.

### 1.2 Session vs Arrangement

Session View is "a real-time-oriented 'launching base' for clips… every
Session clip has its own play button"; Arrangement View is "a layout of clips
along a musical and linear timeline." The manual is explicit that you
improvise in one and commit a recorded log of it into the other. This is the
**explore → commit** line Naqsha already borrowed (CONTEXT.md: "a clear line
between exploring (play) and committing (arrange)" → the Run Plan / commit-to-
machine moment). Nothing new to borrow here except reassurance: Ableton also
keeps *all* upstream editing live and reserves ceremony for the commit.

### 1.3 The Browser — the library axis

The Browser ([Live Concepts §the Browser](https://www.ableton.com/en/live-manual/12/live-concepts/)) organizes content as:

- **Core Library** (factory content installed with Live) and **Packs**;
- **Places** — User Library, Current Project, user folders;
- **Collections** — user-defined color-tag groupings;
- devices appear under Instruments / Audio Effects / **MIDI Effects**, each
  device is a *folder* whose children are its presets.

Key preset facts ([Working with Instruments and Effects, ch. 22](https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/)):

- "Every Live device can store and retrieve particular sets of parameter
  values as presets… presets are stored independently from Live Sets."
- Devices/presets are added by **drag-and-drop into the chain** or
  double-click.
- **Hot-Swap** (`Q` or the swap icon in the device title bar) links the device
  to the Browser: "the preset is selected in the browser and its device folder
  is expanded… navigate… and press Enter" — you audition sibling presets *in
  place* without touching the chain.
- Any device state can be saved back to the **User Library** ("Save Preset"),
  and a **default preset** can be set per device via the header context menu.

So the "Ubiquitous" device in the screenshot is exactly what the transcription
says: the *same* Arpeggiator chrome carrying a saved parameter state, its
title bar showing the preset name instead of "Arpeggiator." (Verified:
"Ubiquitous.adv" appears in Live's factory Arpeggiator preset folder —
e.g. it's visible in browser screenshots and named in user walkthroughs:
[reddit r/ableton](https://www.reddit.com/r/ableton/comments/11k4rd5/weekly_no_stupid_questions_thread/),
[icevena track walkthrough](https://www.facebook.com/icevena/videos/ableton-live-tutorial-experimental-techno/340118807388418/).)

**Critical note:** after you edit a knob, Live keeps the preset name in the
title bar with no "modified" indicator. The identity claim goes stale. This is
a known wart, and Naqsha's approved "editing any block slides selection to
Custom" is the *repair* of this wart — keep it.

### 1.4 Racks, Chains, Macros — the curation machinery

From [Instrument, Drum and Effect Racks, ch. 24](https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/):

- "devices are connected serially in a device chain, passing their signals…
  left to right" (§24.1.1); a Rack wraps *parallel* chains and "the entire
  contents of any Rack can be thought of as a single device."
- **Macro Controls** (§24.7): a Rack exposes 1–16 (classically **8**) macro
  knobs; a Map mode lets you bind any inner parameter (with per-mapping min/max
  range) to a macro. This is Ableton's explicit **compression/curation
  mechanism**: the rack builder decides "the important few," and the detailed
  many stay one fold away (show/hide chain and device views, §24.3).
- **Macro Variations** (§24.7.3): "you can store different states of Macro
  Controls as individual presets (or 'variations')" — snapshots *of the
  curated layer only*, recallable per-rack.

This is the deepest IA lesson for Naqsha: Ableton's answer to "device exposes
the important few vs the detailed many" is **layered, not hidden** — macros in
front, full device UI behind a disclosure, browser presets around the whole
thing. Three altitudes: *parameter* (knob) → *curated summary* (macro) →
*saved identity* (preset/variation).

## 2 · The Arpeggiator specifically

### 2.1 Parameter set and grouping (verified against the manual)

From the [Live MIDI Effect Reference](https://www.ableton.com/en/live-manual/11/live-midi-effect-reference/)
(§Arpeggiator; Live 12 keeps the same device, and Live 12's MIDI Tools page
confirms "the same **18 style patterns** known from Arpeggiator"
([MIDI Tools](https://www.ableton.com/en/live-manual/12/midi-tools/))):

| Group | Controls |
|---|---|
| Pattern | **Style** chooser — Up, Down, UpDown, DownUp, Up & Down, Down & Up, Converge, Diverge, Con & Diverge, Pinky Up, Pinky UpDown, Thumb Up, Thumb UpDown, Play Order, Chord Trigger, Random, Random Other, Random Once (18) |
| Groove/Hold/Offset | Groove amount; Hold (latch); **Offset** — rotates the sequence by N steps |
| Rate | **Rate** knob (ms in Free / beat divisions in Sync), Sync/Free toggle, **Gate** (note length as % of Rate — >100 % = legato) |
| Retrigger/Repeats | Retrigger (Off / Note / Beat), **Repeats** count |
| Transposition | Transpose mode (Major/Minor/Shift = key), **Distance** (semitones/degrees), **Steps** (how many transpositions) |
| Velocity | On/off, **Target** velocity, **Decay** time ("the time required to reach the velocity value specified by the Target control"), Dynamics, velocity Retrigger |

The transcription in the brief checks out with two corrections worth logging:
the Style list is 18 entries (the brief's examples are all real; "Sparse"-like
entries are not — the randoms are Random / Random Other / Random Once), and
"Repeats/Retrigger" and the Transpose "key" (Major/Minor/Shift chooser) group
exactly as transcribed.

### 2.2 Style dropdown vs preset directory — the two mechanisms, precisely

- **Style** is *one parameter with an enumerated domain*. Choosing "Pinky Up"
  changes the note-ordering algorithm and nothing else; Rate, Gate, Transpose
  survive. It's a dropdown because 18 mutually exclusive algorithms with no
  meaningful notation preview compress best as a menu.
- **A preset ("Ubiquitous")** is a *point in the whole parameter space*,
  including a Style value. It lives in a browsable, previewable, user-extensible
  directory *outside* the device; applying it overwrites every knob but the
  device identity/chrome is unchanged; hot-swap makes auditioning siblings a
  one-key loop.

The reason Ableton needs both: the Style enum is **closed and structural**
(the device's own axes), the preset directory is **open and cultural** (starting
points, shareable, user-growable). A UI that conflated them — e.g. put presets
in the Style dropdown — would break hot-swap auditioning, saving-back, and the
folder/collection organization.

### 2.3 Why knobs

- **Lineage:** the radial knob quotes analog synth/mixer hardware — Ableton's
  users calibrate instantly, and endless-rotary MIDI controllers map 1:1.
- **Geometry:** a knob encodes a *bounded continuous value* in ~28×28 px with
  the value readout beneath — the densest honest display of "position within a
  range." A slider communicating the same range needs 6–10× the width.
- **Interaction reality:** in Live you don't "rotate" the knob — you click and
  **drag vertically**, double-click to type, or scroll. The knob is a *display*
  glyph; the input is linear scrubbing. This distinction matters for Naqsha:
  what's worth borrowing is the *scrub + type* input and the *compact bounded
  display*, not the radial rendering.
- **The critique:** NN/g's control-selection article notes virtual knobs "are
  physically challenging to manipulate with common input devices… which don't
  have a natural affordance for rotation" and calls audio-style knob
  skeuomorphism "a poor use of skeuomorphism — a horizontal slider would have
  been a more appropriate control… since its values do not map onto a circle"
  ([NN/g, Sliders, Knobs and Matrices](https://www.nngroup.com/articles/sliders-knobs/)).
  Knobs earn their place in Ableton via hardware congruence Naqsha doesn't have.

## 3 · Parallels to Naqsha — where the analogy holds, where it breaks

| Ableton | Naqsha | Verdict |
|---|---|---|
| Device chain (serial, l→r, per-device ⏻, drag-reorder) | `MotifBlockRack` blocks: Route → Every N → Skip → Density → Sequencer, with bypass/reorder, orientation following the dock | **Holds well.** Even the invariant "Sequencer is terminal" mirrors Live's type-ordering (MIDI fx before instrument). |
| Device preset from a Browser directory ("Ubiquitous") | Motif **library** (P4/P5, shell-D drag-apply) and the Mode presets | **Holds, but split it consciously.** The library = Browser (open, user-growable, drag-in). The 4 Modes = closer to **Macro Variations** (§24.7.3): curated snapshots *presented inside the device*, at-most-a-handful, with visible selection state. Don't merge these two shelves. |
| Style dropdown (enum param) | Exclusive Mode selector | **Only partly.** Style changes one algorithm; a Naqsha Mode rewrites the *whole chain* (roles + rhythm + density). Modes are presets-with-a-face, not an enum param. Consequence: the slide-to-Custom behavior is correct and must be loud (Ableton's stale-preset-name is the anti-pattern). Also: Ableton compresses 18 faceless options into a dropdown; Naqsha has 5 options each carrying legible notation — a visible column is defensible, a dropdown would waste the notation. |
| Macro knobs (curate many params into 8) | *Currently missing.* | **The open opportunity.** The collapsed block row (see §4) is effectively the macro layer: one summary control per block in front, full card one fold behind. A future "motif macros" strip (e.g. Density + Cadence + Size as three device-level scrub-fields that write through to blocks) is the literal borrow — worth prototyping *after* the collapse ships. |
| Transport / playhead | Trace sweep | **Breaks, instructively.** Ableton's transport is musical time; motif placement is spatial and computed at build time. But the *machine* is temporal: the plotter lays marks in order. So frame Trace as **"watch the pen's order,"** a plot-order rehearsal — not a loop, no tempo, ink accumulates (already the prototype behavior). Constant mechanical rate is right; a musical transport metaphor (BPM, loop braces) would be chrome. |
| Monitoring: the *sound* is the preview | `HostPreview` mini-canvas inside the device | **Breaks — and this one costs you.** Ableton devices contain no output preview; the monitor (speakers) is outside the device. Naqsha's canvas *is* the speakers. An in-device mock canvas duplicates the real one at worse fidelity. Recommendation: Trace should sweep the **real canvas** (saffron accumulation overlay on the actual motif layer), and the in-device preview shrinks to nothing or to the lit mode's rhythm strip marker (Variant C's `markerFrac` idea). |
| Real-time signal | Build-time anchor filtering | **Breaks.** The chain is a *sieve over a finite anchor set* — more Blender modifier stack / Grasshopper graph than audio path. Practical consequence: blocks can display **counts** ("41 → 18 placements"), which audio devices never can. A per-block surviving-anchor count in the collapsed row is cheap, honest feedback Ableton can't offer — take the advantage. |
| Hot-Swap (`Q`) | — | Worth stealing later for the library panel: select a motif, arrow through library entries, live-apply, Esc restores. Same mechanic, zero chrome. |

## 4 · Compact controls — the core ask

### 4.1 What Ableton actually does

Fixed 170 px device strip → horizontally packed **28 px radial knobs** with
tiny value readouts, small caps section labels, dropdowns for enums, and
number boxes for integers. Input is vertical drag-scrub / double-click-to-type
/ scroll everywhere. Density comes from the *display* (knob glyph), precision
from the *input* (scrub + type).

### 4.2 When knobs beat sliders — and when they don't

- Sliders: good for bounded ranges with **immediate visual feedback**, weak
  for precision (Accot–Zhai steering law), and expensive in one dimension of
  space ([NN/g](https://www.nngroup.com/articles/sliders-knobs/)).
- Knobs: minimal footprint, bounded-value display; but rotation has no mouse
  affordance, they're poor on touch, and outside audio culture they read as
  borrowed hardware ([NN/g](https://www.nngroup.com/articles/sliders-knobs/),
  [UX.SE discussion](https://ux.stackexchange.com/questions/25608/is-there-ever-a-good-use-case-for-a-software-rotary-knob-dial)).
- The **design-tool convergence**: Figma, Blender, After Effects, TouchDesigner,
  and parametric CAD all landed on the **scrubbable number field** — a plain
  numeral that drags horizontally and accepts typing (Figma's "when you hover
  over a value… your cursor turns into a slider. From there you can click and
  drag" — [Figma forum](https://forum.figma.com/suggest-a-feature-11/sliding-values-they-re-fantastic-but-not-always-video-8160);
  Blender's number-field drag is the same idiom, so ubiquitous that input-tool
  bugs against "apps like Blender or Figma" treat it as one pattern —
  [folivora thread](https://community.folivora.ai/t/click-drag-values-stop-working-over-time-in-apps-like-blender-or-figma-requires-restart-to-restore/27698)).
  Grasshopper's canonical param is likewise a compact Number Slider component
  with typed domain. **This — not the knob — is the idiom Naqsha's users
  already know from their design tools.**
- Radial **step sequencers** (Patterning's concentric drum circles —
  [Olympia Noise Co.](https://www.olympianoiseco.com/apps/patterning-3/) —
  and the Euclidean-sequencer family) show the other honest use of the circle:
  when the *data* is cyclic, the ring is semantic, not skeuomorphic. Naqsha's
  Skip mask and Every-N cadence are cyclic — but they cycle **along a path**,
  so Naqsha's flattened ring is the **rhythm strip** already designed for the
  prototypes: same idea, projected onto the naqsheh's ruled line.

### 4.3 A Naqsha-native compact vocabulary (recommendation)

Naqsheh is compass-and-straightedge: the honest instruments are the **ruled
line, the tick, the pin, the compass arc** — not the potentiometer. Concrete
vocabulary, all token-styled (hairline strokes on paper, saffron as the one
lit accent, violet focus ring):

1. **Scrub-numeral** (workhorse — replaces number inputs *and* most sliders).
   A tabular-lining numeral with a hairline underline; the underline carries a
   faint fill proportional to value-in-range (the bounded-display job a knob
   does). Drag horizontally to scrub (`⌥`/`⇧` for fine/coarse), click to type,
   arrow keys step. Implement as a styled `<input type="number">` wrapper with
   pointer-capture scrub → keyboard/AT semantics come free. ~52×20 px.
   Use for: Density, Every N, Offset, Seed, Threshold, slot weight, ±° range.
2. **Cadence strip** (Skip + Every N merged view). The block's rhythm strip
   made *editable*: ticks along a hairline rule, click a tick to toggle
   keep/skip, drag to paint. It is the radial sequencer flattened onto the
   naqsheh rule — notation and control become one surface (this also erases
   the current duplicated notation-here / control-there problem between the
   mode column and the Skip card).
3. **Compass dial** (angle-like params only: angle randomization ±°, future
   rotation/phase). A quarter-arc protractor glyph, hairline arc + saffron
   tick at the value, scrub/type input identical to the scrub-numeral. This is
   the *on-brand* answer to "the knob": drawn like a construction mark, never
   a 3-D pot. Do **not** use it for non-angular scalars (NN/g's exact
   critique of audio-knob skeuomorphism).
4. **Role glyph-toggles** (Route). The existing RoleBadge fragments (grid
   corner with dots at crossings/cells/edge-midpoints) become the checkboxes
   themselves — four 22 px toggle glyphs replacing four labeled checkbox rows.
5. **Count chip** (the build-time advantage, §3): every collapsed block shows
   `in → out` anchors, e.g. `41→18`, in `text-2xs` tabular numerals.

### 4.4 Collapsed block footprint + savings estimate

Each pre-Sequencer block collapses to **one 28–32 px row**: grip · name ·
its one summary control · count chip · ⏻. Click the row (or a ⌄) to unfold
the full card for the rare detailed edit (seed, RNG mode, scope, pick-on-
canvas) — the macro-in-front / detail-behind layering of §1.4.

```
┌ MOTIF · leaf on grid ────────────────────────────── Trace ▸ ──┐
│ MODE            │ BLOCKS                                      │
│ ◲ Alternate x-o │ ⠿ Route    ▦▦▨▨   41→24            ⏻  ⌄    │ 28px
│ ◇ Vine          │ ⠿ Cadence  |·×·×·×·×|  every 2̲     ⏻  ⌄    │ 28px
│ ◌ Sparse scatter│ ⠿ Density  0.60̲ ▁▁▁▂  24→14        ⏻  ⌄    │ 28px
│ ▭ Border march  │ ⠿ Sequencer ▷ [🀰][rest][🀰][🀰] cycle̲       │ (stays tall)
│ ✎ Custom        │                                   ⊕ block   │
└──────────────────────────────────────────────────────────────┘
   ▦ = role glyph-toggles   |·×·| = editable cadence strip
   0.60̲ / every 2̲ = scrub-numerals   41→24 = anchor count chip
```

Current vertical cost (from `MotifBlockRack.jsx`, vertical dock): Route card
≈100 px (header + role row + scope row), Every N ≈80 px, Density ≈90 px →
**≈270 px** before the Sequencer. Collapsed: 3 × ~32 px ≈ **~100 px** —
a ≈60–65 % reduction, and the Sequencer (the actual payload, with its slot
strip) inherits the reclaimed space. In the horizontal bottom-dock, the same
rows become narrow chain cells and the whole rack fits an Ableton-style band
without inner scrolling.

## 5 · Recommendations for the three prototypes

- **Base layout: Variant A (Rack ledger), stealing from B and C.** A's
  mode column (badge + name, strip revealed on the lit row only) is the right
  space/notation trade — B's always-on strips make five rows read as five
  competing rhythms; C's strip-as-row is beautiful but makes the *names*
  secondary, and mode names are how beginners think. Keep A's Trace-in-title-bar.
- **Kill the in-device `HostPreview`** (all three variants). Per §3, the real
  canvas is the monitor; wire Trace to sweep the actual motif layer with the
  accumulate-like-ink overlay. Keep C's `markerFrac` idea: the lit mode row's
  rhythm strip doubles as the Trace scrubber (drag the marker = scrub). That
  deletes ~140 px from every variant and removes a second source of truth.
- **Remake `MockBlock` as the collapsed block row** (§4.4) and prototype the
  three new controls: scrub-numeral, editable cadence strip, role
  glyph-toggles. This is the highest-value next prototype question: *does a
  one-line block still feel editable?* The unfold-to-full-card interaction
  needs testing against the slide-to-Custom rule (an unfold is not an edit;
  only a value change slides to Custom).
- **Mode ≙ variation, library ≙ browser — keep the shelves separate.** Modes
  live in the device (5 rows, snapshot semantics, slide-to-Custom); the motif
  library stays in the library panel with drag-apply. Later: Hot-Swap-style
  arrow-key auditioning in the library panel; later still, a device-level
  macro strip (Density/Cadence/Size) once collapsed blocks prove out.
- **Sequencer stays expanded.** It is the payload (glyph slots are pictorial);
  compressing it would bury the one block that benefits from size. Its slot
  chips can still adopt scrub-numerals for weight/±°.
- **Accessibility guardrails for the new controls:** scrub surfaces must remain
  real inputs (keyboard steppable, typeable, `aria-valuetext`), the cadence
  strip needs a roving-tabindex tick group, and touch (iPad) gets larger scrub
  targets — the known weaknesses of both knobs and scrub fields land on
  keyboard/touch users, so this is where the pattern lives or dies.

## 6 · Borrow the mechanic, refuse the chrome

Per `.impeccable.md`: we take Ableton's **information architecture** — serial
chain with per-block bypass; three altitudes of control (parameter → curated
summary → saved identity); preset-as-directory vs option-as-parameter; the
explore/commit line; hot-swap auditioning — and refuse its **visual language**:
no dark strip, no radial potentiometers, no LED accents, no beveled device
chrome. Naqsha's equivalents are drawn with the naqsheh's own instruments:
hairline rules, ticks, compass arcs, painted saffron cells on paper. A Live
user should feel at home *operating* the Motif device and never mistake a
screenshot of it for a DAW.

---

### Sources

- Live 12 manual — Live Concepts (Session/Arrangement, Browser, device chains): https://www.ableton.com/en/live-manual/12/live-concepts/
- Live 12 manual — Working with Instruments and Effects (drag-in, Hot-Swap, presets, activator, default presets): https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/
- Live 12 manual — Instrument, Drum and Effect Racks §24 (chains, macros, variations): https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/
- Live 11/12 manual — MIDI Effect Reference §Arpeggiator (Style list, Rate/Gate/Transpose/Velocity): https://www.ableton.com/en/live-manual/11/live-midi-effect-reference/ · https://www.ableton.com/en/live-manual/12/live-midi-effect-reference/
- Live 12 manual — MIDI Tools ("the same 18 style patterns known from Arpeggiator"): https://www.ableton.com/en/live-manual/12/midi-tools/
- "Ubiquitous" as factory Arpeggiator preset: https://www.reddit.com/r/ableton/comments/11k4rd5/weekly_no_stupid_questions_thread/ · https://www.facebook.com/icevena/videos/ableton-live-tutorial-experimental-techno/340118807388418/
- NN/g — Sliders, Knobs, and Matrices (steering law; knob-skeuomorphism critique): https://www.nngroup.com/articles/sliders-knobs/
- UX StackExchange — software rotary knob discussion: https://ux.stackexchange.com/questions/25608/is-there-ever-a-good-use-case-for-a-software-rotary-knob-dial
- Figma forum — scrubbable value fields ("sliding values"): https://forum.figma.com/suggest-a-feature-11/sliding-values-they-re-fantastic-but-not-always-video-8160
- Cross-tool scrub idiom (Blender/Figma treated as one pattern): https://community.folivora.ai/t/click-drag-values-stop-working-over-time-in-apps-like-blender-or-figma-requires-restart-to-restore/27698
- Patterning 3 (radial step sequencer): https://www.olympianoiseco.com/apps/patterning-3/

*Naqsha grounding read (not modified): `src/components/shell/Inspector.jsx`
(MotifDevice), `src/components/shell/MotifBlockRack.jsx`,
`src/components/shell/motif-prototypes/*`, `.impeccable.md`.*
