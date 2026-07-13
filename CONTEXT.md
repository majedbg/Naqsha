# Naqsha

A design studio for pen plotters and laser cutters: a maker composes generative
patterns as layers, routes modulation between them, assigns fabrication settings, and
exports a file their machine faithfully reproduces. Named for the *naqsheh* — the
painted grid-sheet a carpet designer hands to a weaver.

## Language

### Fabrication

**Run Plan**:
The pre-flight destination where the maker sees exactly what the machine will do —
route, order, time, warnings — typically with the laptop at the machine. Titled with
the active machine at a glance ("Run Plan: Laser cutting", "Run Plan: Pen plotting").
Export does not require passing through it (see Export Receipt).
_Avoid_: Cut Plan (laser-biased; plotters draw), Preview (overloaded — 3D preview and
color-view preview already exist), Prepare tab (removed in #16)

**Sheet**:
The physical material the machine works on; the canvas work-piece maps to it. Distinct
from the Bed (the machine's reachable area, shown as an overlay).
_Avoid_: Canvas (the on-screen surface), work area

**Pen Swap**:
The manual pause on a pen plotter to change pens between operations that use different
pens. Surfaced in the Run Plan as markers between operation groups and as a flat time
allowance per swap.
_Avoid_: Tool change (CNC-ism)

**Export Receipt**:
The calm one-line summary that accompanies every export — estimated run time, anything
cropped, warning count — linking into the Run Plan. Export always succeeds; the
receipt makes it never silent.
_Avoid_: Toast (implementation word), alert

**Run**:
One execution of the design on a physical machine. A maker plans a run, then exports
it; small-batch makers perform many runs of one design.
_Avoid_: Job, print

**Machine Profile**:
The kind of machine the document targets (laser, pen plotter, drag cutter). Determines
which operation parameters exist and how export colors resolve.
_Avoid_: Output mode (legacy persistence name), device

**Operation**:
A named fabrication recipe in the document's library — process (cut / score / engrave /
pen) plus machine parameters (power, speed, passes; pen, pressure). Layers reference
one operation by id; order in the library is machine execution order.
_Avoid_: Cut setting (LightBurn-ism; operations also drive plotting), effect

**Optimization**:
A geometry-conditioning step applied to extracted paths before the machine runs
(simplify, merge, reorder-for-travel). Preview and applied values are distinct; export
uses only applied values.
_Avoid_: Transform (reserved for layer move/rotate/scale)

### Motifs

**Glyph**:
The reusable vector artwork a motif renders — paths, viewRadius, root. Built-ins ship
with the app; custom glyphs live in the document (`customGlyphs`); promoted glyphs live
in the user's global motif library.
_Avoid_: icon, symbol

**Binding**:
How a motif attaches to its host layer's paths — anchor selection (roles, rate) plus
placement (sizing, orientation, flip). Reserved for that attachment only.
_Avoid_: using "bind" for document writes (that is a Glyph Commit)

**Glyph Commit**:
Writing a glyph into the document's `customGlyphs` and pointing a layer's `glyphRef` at
it — always one undo entry. The only way glyphs enter the document: Save, Save as copy,
import, and library copy/use all commit.
_Avoid_: bind, stamp, rebind (legacy comment language)

**Draft Glyph**:
A transient glyph owned by the edit session alone — never in the document until Save
commits it; Cancel discards it with zero document mutation (rule D6).
_Avoid_: temp glyph

**Motif Edit Session**:
The pen-editor lifecycle from open to Save / Save as copy / Cancel / Promote. Owns the
open decision: custom glyph → edit in place; built-in → fork a Draft Glyph; new → blank
Draft Glyph.
_Avoid_: editor state, modal state (implementation words)

**Chain**:
The ordered list of Blocks a motif's anchors flow through before stamping — the
maker adds, reorders, bypasses, and repeats Blocks freely, like instrument effects
in a rack. Order is part of the document: the same Blocks in a different order are
a different design.
_Avoid_: pipeline (implementation word for the fixed engine stages), graph (chains
are linear; there is no splitting or merging)

**Block**:
One unit in a Chain — it filters the anchor stream (every-Nth, skip rhythm,
density, field mask) or annotates it (Sequencer). A Block can be bypassed without
being removed.
_Avoid_: node (implies a graph), device (reserved for inspector panels like the
Motif device), effect

**Sequencer**:
The Block that deals Slots to surviving anchors — in cycling order (the x‑o‑x‑o
rhythm) or as a weighted random draw — making one motif layer alternate flowers,
leaves, and rests along a stem.
_Avoid_: arpeggiator, randomizer (inspirations, not names), pattern (hopelessly
overloaded)

**Route**:
The Block that scopes a motif to part of its host — by anchor role and by path
(all, closed loops, open strands, or specific paths picked on canvas). "Flowers
on the border ring, leaves on the inner tendrils" is two motifs with two Routes.
_Avoid_: filter (every selection Block filters), target (modulation word)

**Slot**:
One step in a Sequencer — a glyph plus light modifiers (size scale, rotation
offset, flip, optional randomized rotation with a chosen spread shape), or a Rest.
Modifiers ride on top of the layer's base placement, so the layer's size still
scales the whole run.
_Avoid_: step (visual/UI word), frame

**Rest**:
A Slot that stamps nothing — a deliberate silence in the rhythm, distinct from a
skip rhythm upstream because it occupies a step in the cycle.
_Avoid_: null slot, gap

### Material Preview

**Mark**:
The visible trace an operation leaves on a sheet — a frosted engraving, a charred
score, a kerf-thin cut seam. In the 3D preview a mark looks the way the physical
process leaves it; process-color coding is a 2D-canvas concern (in 3D it appears
only as a hover annotation).
_Avoid_: Glow, groove texture (implementation words)

**Reaction**:
How a substrate responds to a process — laser frosts clear acrylic, chars plywood,
polishes a cut edge. A mark's appearance is the reaction of its sheet's substrate to
its operation's process; reactions are physical, not stylistic.
_Avoid_: Treatment (vague), emissive (implementation; unlit materials do not emit)

**Material Archetype**:
The calibrated optics recipe a preview material resolves to (clear acrylic,
fluorescent acrylic, plywood…). The single source of truth for how a material
renders; grounded in measured properties of the physical stock.
_Avoid_: Material descriptor (identity only — kind, color, thickness — not optics)

### Raster Etch

**Etch**:
A layer that turns an imported photograph into a laser engraving by mapping its
tonal values to a 1-bit dot field — the raster counterpart to the vector layers
(pattern / import / text / motif). An Etch always resolves to the engrave role and
exports as an embedded bitmap, never as vector geometry. What renders on screen is
exactly what etches (WYSIWYG); the laser threshold-passes the bitmap, it never
re-dithers it.
_Avoid_: Image (overloaded — SVG `import` is also an image), Raster (implementation
word), Photo (the source, not the layer)

**Etch Stack**:
The ordered, reorderable rack of Stages an Etch's image flows through before it
becomes the exported 1-bit bitmap — tone first, then value-to-dot mapping, then
optional texture. Order is part of the document: the same Stages in a different
order are a different Etch (paper-texture before vs after dithering reads
differently). The rack model mirrors the motif Chain but is a distinct subsystem
operating on pixels, not anchors.
_Avoid_: Chain (reserved for motif anchor-streams), pipeline (the fixed internal
engine), effect chain (overloaded)

**Stage**:
One unit in an Etch Stack — it transforms the pixel field (tone/levels), maps value
to dots (dither, halftone), or textures it (paper). A Stage can be bypassed without
being removed and reordered freely, like a device in an audio rack.
_Avoid_: Block (reserved for motif Chains), Pass (collides with the Operation
machine parameter), Effect / Filter (glossary-forbidden), Device (reserved for
inspector panels)

**Highlight Hold**:
The guarantee that highlights above a cutoff produce zero etched dots — the "err on
the side of NOT etching" floor that protects irreversible surfaces like mirror
acrylic. Applied AFTER screening (a fixed terminal clamp, never a reorderable
Stage), so no dither error-diffusion can violate it; the held region is shaded in
the preview. Defaults on for mirror stock, off for forgiving stock.
_Avoid_: White clamp / white-point (that is a Tone-Stage Levels control, which
shapes but does not guarantee), Threshold (the screening cut, a different thing)
