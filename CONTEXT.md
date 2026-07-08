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
