# Naqsha — Portfolio Narrative & Build Context

> **Audience.** A portfolio-page builder (human or agent) turning this project into a case study.
> Everything here is **raw natural-language context** — pull from it to write descriptions, generate
> diagrams, and plan screenshots. It is deliberately verbose and prose-first.
>
> **Two bodies of work, kept distinct:**
> - **§A — SHIPPED.** Real, in `main`, screenshottable today. This is the *design-centric* proof.
> - **§B — PLANNED.** An architecture rework (test harness, headless pattern engine, fabrication
>   consolidation, god-component decomposition). This is the *technical-depth* narrative — **in progress,
>   not done.** Write it in future/intent tense; do not claim it as shipped.
>
> One honest framing line for the whole piece: *"Naqsha began as a generative-art toy and grew into a
> craft-grade studio for pen-plotter and laser output. After a wave of UX features, I commissioned an
> architecture review and am executing a test-first rework to make the engine headless-testable and the
> codebase AI-navigable."*

---

## 0. The one-paragraph pitch

**Naqsha** is a browser-based generative-art studio for **physical fabrication** — pen plotters and
laser cutters, not just screens. You compose layered algorithmic patterns (16 of them: phyllotaxis,
spirographs, flow fields, Voronoi cells, recursive geometry…), tune each through **purpose-built
controls** instead of generic sliders, then *prepare* the result for a real machine: size it to the bed,
optimize the toolpath, check for overlaps, estimate plot time, and export clean SVG. It has cloud save,
share-by-link, tiered access, and an **AI pattern generator** that writes new pattern code on demand.
The whole interface is built on a deliberate visual language — *paper and iron-gall ink, one saffron
accent, no glow, no bounce* — that treats a digital tool like a handmade manuscript (a **naqsheh**).

**Stack:** React 19, Vite 8, p5.js 2, Supabase (auth + Postgres + edge functions), react-router 7,
Tailwind with a custom oklch token system. ~13.6k LOC across 97 files.

---

## §A — SHIPPED (the design proof — screenshot these)

> Lead the case study with this section. It's real and it's the strongest material. Each feature below
> gives you: **what it is · the design intent · the files · where the screenshot lives.**

### A1. Semantic parameter controls — *"the right knob for the meaning"*
**What.** Generative parameters are not all alike, so they shouldn't all be sliders. Naqsha ships a
**control dispatcher** (`ParamControl`) that maps each parameter to a control matched to its *meaning*:
- **AngleDial** — a circular knob for angles (`startAngle` 0–360° wrapping; phyllotaxis divergence as a
  clamped arc with a **magnetic detent at the golden angle 137.5°**).
- **Pad2D** — a single draggable nub that collapses an `offsetX`/`offsetY` pair into one 2D gesture.
- **ParamPlot** — a 2-axis scatter plot for *relational* parameters (spirograph outer/inner radii `R`/`r`),
  because what matters is the relationship, not two isolated numbers.
- **IconSelect** — a glyph grid for enumerated choices: **symmetry** renders as **programmatically
  generated N-arm SVG rosettes** (1–11 radial copies); shapes/fill-modes as little geometric marks.
- **CurveEditor** — a live falloff curve that *honestly mirrors the engine's own math*, draggable to set a
  single non-linearity scalar.
- **Slider** — the deepened numeric default (dual-mode edit, full keyboard).

**Design intent.** A slider forces you to interpret a number; a semantic control *shows the meaning*. The
dial answers "what angle am I at?"; the plot answers "how do these two radii relate?"; the rosette grid
makes symmetry legible at a glance. Every control obeys the same craft contract (below) and the same
**keyboard-first** behavior (Arrow = one step, Shift+Arrow = coarse, Home/End = bounds), with
`role="radiogroup"`/`role="radio"` semantics on the icon grids and `aria-valuetext` readouts on the
dial/pad — accessibility as a first-class design constraint, not an afterthought.

**Files.** `src/components/ui/ParamControl.jsx` (the dispatcher — an exemplary deep seam),
`AngleDial.jsx`, `Pad2D.jsx`, `ParamPlot.jsx`, `IconSelect.jsx`, `CurveEditor.jsx`, `Slider.jsx`,
`paramIcons.jsx` (the generated glyphs); wired through `constants.js` param definitions.
**Screenshot.** Open a **Spirograph** layer's params: one panel shows a circular dial for start angle, a
2D R/r plot, and the symmetry rosette grid — side by side where a conventional UI would show three
identical horizontal tracks. A second shot: the symmetry rosette grid with the saffron-filled selected
cell. A third: the golden-angle detent on the phyllotaxis dial.

### A2. The craft design system — *paper, ink, one saffron accent*
**What.** A two-tier oklch token system. **Chrome palette** (paper / paper-warm grounds, ink / ink-soft,
hairline, muted, **saffron** as the single load-bearing accent, violet as focus ornament) is kept
strictly separate from a **jewel palette** (cobalt, madder, saffron, rose, olive, bone, burgundy) used
*only* for user-drawn art — so UI chrome never competes with the artwork. **Dark mode is a true
re-tuning, not an `invert()`:** paper→indigo vellum, ink→bone, and every jewel color *gains* chroma to
stay legible on the dark ground (a naïve invert would turn indigo yellow and betray the metaphor).
**Motion** is "patient" — ease-out-quart/quint, 240–360ms, **no bounce, no elastic**, and
`prefers-reduced-motion` drops transforms while keeping the state change.

**Design intent.** The governing metaphor is a *naqsheh* — a handmade sheet where paper and ink are the
ground. Both light and dark are "equally handmade"; neither imitates the other. Color is *punctuation*:
exactly one accent does work at a time, rendered as a **painted cell** (solid fill), never a glow or
gradient. The explicit anti-reference is "AI slop" — no cyan glow, no purple→blue gradients, no neon
chrome.
**Files.** `src/styles/tokens.css`, `tailwind.config.js` (a custom `token()` helper emitting
`oklch(from var(--x) l c h / <alpha-value>)` so opacity modifiers work against live CSS variables),
`src/lib/useTheme.js`, `ThemeToggle.jsx`.
**Screenshot.** A light/dark side-by-side of the same design (toggle in the top bar) showing the re-tuned
inversion. A close crop of a saffron painted-cell selected state next to a hairline-bordered unselected
one.

### A3. Examples gallery — *start from somewhere, not from blank*
**What.** A curated card grid (paper ground, hairline cells, staggered rise-in animation) that loads a
representative design onto the canvas in one click, with unsaved-work confirmation.
**Design intent.** A blank canvas plus a hundred options is paralysis; the gallery *shows the design
space* and lets you begin from a good seed and diverge.
**Files.** `src/components/sidebar/ExamplesGallery.jsx`, `src/examples/index.js` (+ json/png assets).
**Screenshot.** Top-bar "Examples" button → the card grid filling the left panel → a hover state showing
the "Load" affordance.

### A4. Layered composition with a progressive-randomize workflow
**What.** A layer stack (top = front); each layer is an independent pattern with its own type, params,
seed, color, visibility. The signature interaction is **per-parameter randomize locks**: start with
everything re-rolling, *freeze* the parts that work (count, symmetry), keep re-rolling the rest — plus
per-layer "Randomize Params" and all-layer "Randomize Seeds".
**Design intent.** This *is* the generative practice made into UI: you converge by progressively freezing,
not by hand-tuning every field. Reorder, duplicate, hide, name, export-per-layer round it out.
**Files.** `LayersSection.jsx`, `LayerCard.jsx`, `ParamGroup.jsx`, `PatternParams.jsx`, `useLayers.js`.
**Screenshot.** Three stacked layers, one expanded into grouped params, with several randomize-lock
checkboxes toggled; ideally a before/after of one "Randomize Params" press where only the unlocked params
moved.

### A5. Prepare workflow — *grounding infinity onto a finite machine*
**What.** A dedicated **Prepare** tab with three stages: **(a) Canvas** — bed presets (A4/Letter/AxiDraw)
or custom dims with live mm/in/px conversion and a margin overlay; **(b) Output mode** — plotter (pen
strokes as-is) vs. laser (per-layer **role tags**: cut / engrave / score / ignore); **(c) Optimize** —
simplify (vertex reduction), merge (weld touching paths), reorder (fewer pen lifts), each with a
**preview-vs-applied** slider so dragging never silently mutates the export. Plus **overlap warnings** and
a **plot-preview with time estimate**.
**Design intent.** A generative design is infinite; a plotter is finite. Prepare is where you *size and
ground* the art for a real machine, oscillating between Design and Prepare. The preview/applied split is a
deliberate guard against "slider drift" sneaking into exports.
**Files.** `prepare/PrepareTab.jsx`, `CanvasSection.jsx`, `OutputModeSection.jsx`, `OptimizeSection.jsx`,
`OverlapWarnings.jsx`, `PlotPreviewSection.jsx`; `lib/plotter/*`, `fabrication.js`, `svgExport.js`,
`units.js`, `BedOverlay.jsx`.
**Screenshot.** The Prepare tab with all three sections visible; the canvas showing the bed-margin
overlay; a laser-mode shot with per-layer role dropdowns; the plot-preview with its estimated time.

### A6. Cloud save & share-by-link
**What.** Identity-based **cloud save** (designs + thumbnails to Supabase, with Pro-tier version history
and collections) and token-based **share links** (`/share/:token` renders a read-only design, no account
needed). Two deliberately separate flows: save = ownership; share = ephemeral.
**Files.** `CloudSaveModal.jsx`, `designService.js`, `collectionService.js`, `shareLink.js`,
`ShareLinkButton.jsx`, `pages/ShareView.jsx`, `AuthContext.jsx`, `tierLimits.js`.
**Screenshot.** The cloud modal listing saved designs (Pro: a Collections tab); a copied share link → the
read-only ShareView it opens.

### A7. AI pattern generation (gated)
**What.** A "+ New" affordance (violet dashed marker — "this came from elsewhere, not the shipped
library") opens a chat; describe a pattern in words, an edge function returns pattern *code*, the app
compiles and registers it as a live layer. Revise-by-prompt to iterate. Metered by an **AI-credit** system
per tier.
**Design intent.** The shipped catalog is finite; imagination isn't. The violet origin-marker and the
credit meter keep the feature honest and legible.
**Files.** `AIPatternChat.jsx`, `aiPatternService.js`, `patternRegistry.js`, `PatternTabs.jsx`,
`useGate.js`.
**Screenshot.** The chat modal mid-prompt; the resulting AI pattern tab with its violet dot; the canvas
rendering the generated pattern.

---

## §B — PLANNED (the technical-depth narrative — *in progress*, write as intent)

> This is the architecture rework executed via `REWORK-PLAN.md`. Frame as engineering judgment and
> approach, **not** as completed/"fixed." It demonstrates: reading a large codebase architecturally,
> commissioning a review, and driving a **test-first** remediation.

### B1. The starting condition (honest, and the reason for the rework)
A 13.6k-LOC studio with **zero automated tests**, where the recent UX wave — though well-designed — added
structural debt: pure logic tangled inside React components, a pattern engine that couldn't render without
a live p5 canvas, and three independent re-implementations of the same fabrication math. The rework is
organized as a **blocking-seam → parallel-fan-out** plan so the work can be dispatched to many agents
safely.

### B2. The five deepening moves (each "deletion-test positive" — delete the new seam and complexity
reappears across many callers)
1. **Stand up a test harness** (Vitest + jsdom). Precondition for everything; turns an untested codebase
   into a test-first one.
2. **Extract pure-logic seams** from components into testable modules — `paramOps` (param randomize/
   reset/gate logic, currently duplicated and *drifted* across five files), a single plotter-geometry
   test surface, `shareLink` hardening, a `creditModel`. *Engineering story:* the same logic existed in
   multiple copies that had quietly diverged; consolidating behind one interface both removes the drift
   and makes the behavior unit-testable for the first time.
3. **Make the pattern engine headless-renderable** behind a `DrawingContext` seam: patterns currently
   draw straight to p5 globals, so none can be tested without a canvas. Injecting an abstract drawing
   context (with a production p5 adapter and a recording adapter for tests) lets every pattern be verified
   headlessly with golden-master output, documents the previously-implicit pattern contract, and removes
   16× copy-pasted boilerplate behind a base class. *(Highest-risk move — 16 files — staged: define the
   seam + migrate 3 reference patterns, then fan out the rest one-per-agent.)*
4. **Consolidate the fabrication pipeline** into one `buildPlottableLayers` model. Today optimize-stats,
   overlap-counts, and plot-timing each extract paths in a *different coordinate space*; unifying them
   behind one canonical extraction makes the three numbers agree by construction and makes the algorithmic
   core node-testable.
5. **Decompose the `Studio` god-component** (~700 lines, ~30 hooks, 7 concerns) into focused domain hooks,
   and **collapse the 8-hop param prop-chain** into a layer-scoped hook/context. Smaller surface, testable
   units, far better AI-navigability.

### B3. Method
A subsystem-by-subsystem architecture review (using a depth/shallowness/seam/deletion-test lens), then a
**TDD** remediation: **characterization tests** lock current behavior before each refactor (so behavior is
provably preserved), with **classic red-green** reserved for genuinely new modules. The plan is authored
for **parallel multi-agent execution** with an explicit file-ownership matrix to prevent collisions —
itself a demonstration of orchestrating AI agents on a real codebase.

---

## §C — Diagram suggestions (for the page builder to generate)

1. **System architecture** (flowchart): Browser app → {Pattern engine (p5) ↔ Layer state} → Prepare/
   Fabrication pipeline → SVG export; side rails to Supabase (auth/designs/history) and the AI edge
   function. Good as a Mermaid `flowchart LR`.
2. **The render→plot data flow** (sequence/flow): pattern `generate` → `svgElements` → `toSVGGroup` (SVG
   string, symmetry as transform groups) → extraction → optimize (simplify/merge/reorder) → export.
   Annotate the "one canonical coordinate space" the rework introduces.
3. **Control-dispatch map**: `def.type → {Slider, AngleDial, Pad2D, ParamPlot, IconSelect, CurveEditor,
   Select}` — illustrates the deep dispatcher seam (A1).
4. **Design-token system**: chrome vs. jewel palette split, light↔dark re-tuning. A two-column swatch
   diagram, not Mermaid.
5. **Before/after (rework)**: "logic tangled in components" vs. "pure seams + thin components"; and the
   "8-hop chain" vs. "3-hop". Editorial before/after, hand-drawn boxes.
6. **Phase/dependency graph**: reuse the ASCII graph in `REWORK-PLAN.md §3` as a Mermaid `graph TD`.

## §D — Screenshot shot-list (consolidated)
- Spirograph param panel showing dial + 2D plot + rosette grid together (the A1 money shot).
- Symmetry rosette grid with saffron painted-cell selection; golden-angle detent on the dial.
- Light/dark side-by-side of one design (A2 re-tuned inversion); saffron cell vs. hairline crop.
- Examples gallery grid + hover "Load" (A3).
- Layer stack with randomize-locks; before/after of one "Randomize Params" press (A4).
- Prepare tab (all three sections) + bed-margin overlay; laser-mode role dropdowns; plot-preview time (A5).
- Cloud modal with saved designs (+ Pro Collections); a ShareView opened from a link (A6).
- AI chat mid-prompt + the resulting violet-dotted AI pattern tab + its rendered canvas (A7).

## §E — Résumé/blurb seeds (rephrase freely; keep §B in intent tense)
- "Designed and built a craft-grade generative-art studio (React 19 / p5 / Supabase) for pen-plotter and
  laser fabrication: 16 algorithmic patterns, layered composition, machine-prep toolpath optimization, and
  AI-assisted pattern generation."
- "Authored a custom oklch design-token system with a chrome/jewel palette split and a hand-tuned dark
  mode (a true re-tuning, not an invert), plus a family of accessible, keyboard-first **semantic
  parameter controls** (radial dial, 2D pad, relational scatter-plot, generated-glyph selectors)."
- "Commissioned an architecture review of a 13.6k-LOC codebase and am executing a **test-first** rework —
  introducing a test harness, a headless-renderable pattern engine behind an injected drawing-context
  seam, a unified fabrication pipeline, and a decomposed god-component — authored for **parallel
  multi-agent execution**."
