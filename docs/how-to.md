# How to use Naqsha

> A naqsheh is the painted grid a Persian carpet designer hands to a weaver.
> Naqsha is that same sheet — the one you compose from — but the weaver is
> a pen plotter or a laser. You work in pixels on paper; the machine works
> in ink or light. The pattern lives in the space between you.

Naqsha is a three-step process: **Design → Prepare → Export.** You move
through them in that order, once per piece. Most of your time is spent in
Design. The other two are short.

This guide walks you through each step, with a particular focus on how the
Design step works — because it's the only step where nothing is right yet
and every move shapes what comes next.

---

## Step 1 — Design

This is where the naqsheh gets made. You start with one pattern generator
and work your way into a composition that feels like it's worth plotting.

### 1. Pick a pattern

The row of tabs at the top of the right-hand panel lists every pattern
generator Naqsha ships with. Click one. The canvas changes. That's it for
the hard part of starting.

You'll see a lock icon on some tabs — those are patterns your current tier
doesn't unlock yet. Hover the lock to see why.

There's also a dashed **New** button at the end of the row marked with a
small violet dot. That opens the AI chat: you can describe a pattern you
can't find in the list and it'll generate one for you. The violet dot is
the mark that travels with AI-generated tabs so you always know which
patterns came from the model and which shipped with the app.

### 2. Start with chaos — hit randomize

Every pattern comes with a set of parameters — things like **count**,
**stroke width**, **seed**, **spacing**, **noise amount**. When you open a
pattern for the first time, Naqsha picks default values that produce
something recognizable but not necessarily interesting.

To get interesting: **hit the randomize button at the top of the Pattern
Params panel.** It re-rolls every parameter marked as *randomizable*, all
at once.

Keep hitting it. The idea is not to find the perfect composition on the
third try — it's to *see the shape of the design space*. What kinds of
things does this pattern make? Where are the extremes? What combinations
surprise you? Randomize ten times, twenty times. The first real act of
design is noticing which version you keep wanting to come back to.

### 3. Narrow the randomization

Now you have a version you like. But if you hit randomize again, you'll
lose it. This is where Naqsha's key idea comes in: **you don't have to
randomize everything at once**.

Every parameter has a small icon next to it that lets you include or
exclude it from the randomize set.

- **Including** a parameter means "randomize this next time I press the
  dice."
- **Excluding** a parameter means "keep this exact value; don't touch it
  next roll."

The workflow is incremental. You're not tuning all parameters by hand;
you're *progressively freezing the ones that matter* and letting Naqsha
keep surprising you with the rest.

A typical flow looks like this:

```
Roll 1:   All params randomize.        Chaos. Explore.
Roll 5:   Lock `count`, the rest roll. Shape feels right, details still moving.
Roll 10:  Lock `count` + `symmetry`.   Mood is set, texture still roaming.
Roll 15:  Lock everything but `seed`.  You've decided the design —
                                        seed just reshuffles the last remaining
                                        variation.
```

By the time you've made a dozen rolls, the design is mostly yours. One or
two parameters are still rolling; the rest are where you want them. Click
any parameter's value to type an exact number if you want pixel-level
control.

### 4. Tune the ones you locked

Once a parameter is excluded from randomize, the slider is yours to move
directly. The slider thumb is a small painted cell; when your cursor is on
it the cell rotates into a diamond and a faint graticule appears along the
track. Drag to set the value; release to commit.

For precision work the keyboard modifiers matter:

- **Arrow left / right** — walk the value one step at a time.
- **Shift + Arrow** — jump by ten steps (the motif scale).
- **Option + Arrow** — move by a tenth of a step (sub-cell precision).
- **Home / End** — snap to the range minimum or maximum.

You can also click the number on the right of the slider to type an exact
value. Enter to commit, Escape to cancel.

### 5. Add more layers

A single layer is a single pattern. A composition is usually layers — a
dense pattern underneath, a sparser geometric lattice on top, maybe a
border frame in a third layer. Each layer has its own color, opacity, and
visibility toggle.

The **Layers** panel on the left lets you:

- Add a new layer (the `+` button at the bottom).
- Reorder layers by dragging — the bottom of the list paints first, the
  top paints last.
- Duplicate a layer if you want to explore a variant without losing the
  original.
- Change a layer's color — the suggested swatches are jewel tones taken
  from Persian carpet naqshehs (cobalt, madder, saffron, rose, olive,
  bone, burgundy). You can use any color, but the suggested palette
  coordinates with the rest of the app's visual language.

Work each layer the same way: start with randomize, progressively lock
parameters, tune the ones that matter.

### 6. Know when to stop

A plotter takes real time. A laser takes real material. The design step
is patient, but it's also bounded: if you've been randomizing for twenty
minutes and nothing feels finished, the design probably isn't the problem
— the pattern you chose might be wrong for what you're after. Try a
different generator. Or open the AI chat and describe what you're
looking for in your own words.

When a composition feels like *"yes, that one"*, move to Prepare.

---

## Step 2 — Prepare

This is where the design becomes a plan for a real machine.

- **Canvas.** Pick a preset size (A4, Letter, AxiDraw V3, custom, etc.)
  and the units your machine uses (millimetres for most plotters; inches
  for AxiDraw). Naqsha shows the canvas at scale so you can tell whether
  your composition actually fits the bed.

- **Output mode.** Switch between **Plotter** and **Laser**. Plotter
  output keeps stroke information (pen paths, per-layer colors). Laser
  output converts strokes into cut paths and colour-codes by cut/score
  intent instead of by layer tint.

- **Optimize.** Three optimizations are available, each previewing before
  it applies: **Simplify paths** removes redundant points using the
  Ramer–Douglas–Peucker algorithm, **Merge lines** joins paths whose
  endpoints are within tolerance (fewer pen-ups), and **Reorder for min
  travel** runs a greedy nearest-neighbour traversal so the pen or
  laser spends less time moving without drawing.

  Each slider in Optimize shows a painted cell at the *preview* value
  and a small outlined ghost at the *applied* value when they differ.
  That's how you can see "here's what export will use right now" versus
  "here's what I'm considering." Click **Apply** to commit the preview,
  or **Revert** to undo.

- **Overlap check.** Reports how many path crossings exist in the current
  plan. Zero crossings is a clean plot. A few dozen usually plots fine but
  can cause double-burns on a laser. Hundreds is a sign the pattern is
  denser than the machine will reproduce cleanly.

- **Plot preview.** Shows an estimated plot time based on AxiDraw V3
  defaults. Your real machine may be faster or slower, but the preview
  gets the order of magnitude right.

If any of these reveal a problem — over the bed size, 800 overlaps, a
plot time of four hours — go back to Design and adjust. Prepare is a
diagnostic step, not a commitment.

---

## Step 3 — Export

When the plan looks right, export.

- **Download SVG** — multi-layer SVG keyed to plotter pen slots or laser
  cut/score intents, depending on your Output mode. This is the file you
  hand to your machine's control software.

- **Save to cloud** — if you're signed in, save the design to your
  library. Returns to the library page where you can load, delete, or
  share past designs.

- **Share link** — generates a URL that opens a read-only view of the
  design in someone else's browser. Recipients can remix from your
  starting point but can't overwrite your saved version.

Each plot is its own decision. The naqsheh is a record of where your
rules led you on that particular day with that particular seed; Naqsha
saves enough to regenerate, never enough to feel finished. Come back
tomorrow and roll again.
