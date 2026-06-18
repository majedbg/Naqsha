# Product Requirements Document — Studio Redesign (Pro Fab-Tool Layout)

> **Status:** Proposed · 2026-06-18
> **Author note:** Derived from `docs/studio-redesign-plan.md` (the GRILLED & LOCKED
> source-of-truth spec, 15 locked decisions). This PRD is intended to carry full
> context independently of the issue tracker. Where it restates a locked decision
> it does so faithfully; where it found a tension it is flagged in **§11 Open
> Questions**, never silently resolved.
> **Stack reality check:** The app is **React + Vite + Tailwind + Supabase**. It is
> **NOT** Next.js and does **NOT** use Vercel storage. Any tooling auto-suggestion
> to the contrary is a false positive and must be ignored.

---

## 1. Summary

Naqsha is a parametric generative-art studio whose real output is fabrication-ready
vector geometry (SVG sized in millimeters) for laser cutters, pen plotters, and
drag (blade) cutters. Today it is a two-pane editor: an overloaded left "control
dock" (`LeftPanel.jsx`, Design/Prepare tabs) and a canvas surface confusingly named
`RightPanel.jsx`. This redesign restructures the app into a professional vector/fab
tool layout modeled on the **Adobe/Inkscape skeleton** (left tool strip + top
contextual control bar) with **Figma's left object-tree column**, splitting the
overloaded dock into a left layer tree and a right inspector, and wrapping the
canvas in pro chrome (mm rulers, machine bed as artboard, status bar). The
conceptual reframe driving the whole effort: **stroke color is not color — it is the
operation** (cut / score / engrave / pen), each carrying machine parameters. The
work ships as three lanes — **A: data spine**, **B: shell migration**, **C:
features** — under an incremental strangler strategy that keeps the build and tests
green at every issue. A bundled **ITP Camp Kit** (theme skin + 7 preset SVG assets +
NYU-ID-gated submission flow) rides on the new import + theme infrastructure.

---

## 2. Background & Problem Statement

### 2.1 What the current app is
- React + Vite + Tailwind under `generative-art-studio/`, with a Supabase backend
  (`supabase/`), Supabase auth (`src/lib/AuthContext`), and tier gating
  (`src/lib/useGate`). ~450–583 passing tests; a working fabrication/export
  pipeline. The main route is `src/pages/Studio.jsx`.
- The layout is already two-pane, but the names are misleading:
  - **`LeftPanel.jsx` is the all-in-one control dock** — Design/Prepare tabs that
    stack the layer list, the parameter inspector, export, optimize, and examples
    all into one left column.
  - **`RightPanel.jsx` is actually the canvas** — the p5/SVG drawing surface, tool
    handling, background, and live text editing.
- Objects are not drawn. Every object is a **generated pattern** (22 pattern types
  in `src/constants.js` `PATTERN_TYPES`, added via `PatternPickerModal` — the
  "periodic table"), a **text node**, or (future) an imported SVG. There is **no
  freehand drawing** anywhere; `src/lib/tools/toolRegistry.js` registers only
  `select` (V) and `text` (T).

### 2.2 Why redesign — the "stroke = operation" reframe
The app's closest functional analog is **Inkscape**: vector output for fabrication.
In a graphics tool, stroke color is aesthetic. In a fab tool, **each stroke color
maps to a named machine process** (cut = red, score = blue, engrave = black on a
laser; a real pen color on a plotter). That reframe governs where "color" lives and
what it means throughout the app.

The reframe **half-exists today** and is buried/awkward:
- `src/lib/fabrication.js` defines `LASER_ROLES` (`cut`=`#FF0000`, `score`=`#0000FF`,
  `engrave`=`#000000`) and `roleColor(role)`, plus `applyOutputMode(layer, outputMode)`
  which, in `'laser'` mode, overrides `layer.color` to the role color.
- Role lives **per-layer** (`layer.role`, e.g. the examples serialize `"role": "cut"`),
  is gated behind a **global `outputMode`** toggle (`'plotter' | 'laser'`,
  `OUTPUT_MODES`), and is hidden inside the Prepare tab.
- Export applies one color per layer group: `instance.toSVGGroup(layer.id,
  layer.color, layer.opacity)` (`src/lib/svgExport.js`) emits **one `stroke` color**
  for the whole group, even though it already emits **per-element `stroke-width`**.

### 2.3 Why this layout
A parametric tool needs the **layer list** and the **parameter inspector** to each
own a full vertical column instead of fighting for one right dock. Inkscape gives
the fab-tool skeleton (tool strip + contextual top bar + bed-as-artboard + mm
rulers + cut-settings panel, LightBurn-style). Figma gives the left object tree.
Combining them resolves the overloaded-dock problem while making "stroke = operation"
a first-class, document-level concept (an **operation library**) rather than a buried
per-layer flag.

### 2.4 What is already in place (do not rebuild)
- **Scene graph** (`src/lib/scene/`): `SceneNode` base, `PatternNode` (wraps a
  layer + live pattern instance), `TextNode`, `SceneGraph.fromLayers(...)`. Export
  already routes through it (`buildCombinedSceneSVG`).
- **Per-element stroke weight** is real and exported. Patterns push
  `{ pathD, strokeWeight }` elements (see `src/lib/patterns/FlowField.js`
  `this.svgElements.push({ pathD, strokeWeight })`) and `contentFor(color)` emits
  `<path … stroke-width="${el.strokeWeight}" stroke="${color}" …/>`. The canvas
  already previews variable thickness. **Per-element color is the new thing** —
  `stroke` is still a single group color today.
- **Units** (`src/lib/units.js`): clean px↔mm/in at 96 PPI (`PX_PER_MM`, `PPI`),
  `UNIT_OPTIONS`, `pxToUnit`/`unitToPx`/`formatDim`. Chrome/bed already support a
  unit selector. **But pattern params are untagged** px/abstract numbers in
  `DEFAULT_PARAMS` (`spacing=40`, `strokeWeight`, `R/r/d`) mixed with genuinely
  unitless ones (`cols`, `symmetry`, `revolutions`, `noiseScale`, `angle°`).
- **Text** has outline/single-line/engrave machinery already (`TextNode`, `lineMode`,
  `renderMode`); surfacing it is the task, not building from zero.
- **History** (`src/lib/history/useHistory`, wired in `Studio.jsx`): snapshots only
  the pair `{ transforms, textNodes }` — **not** layer/operation state.
- **No SVG import** exists; the app only exports (`src/lib/svgExport.js`).
- **No schema versioning** in any load path; layers serialize a raw `role` field
  (e.g. `src/examples/orbit.json` → `"role": "cut"`, `"penSlot": 1`).

---

## 3. Goals / Non-goals

### 3.1 Goals
1. Restructure the two-pane editor into a pro fab-tool layout (tool strip, menu bar,
   contextual control bar, left object tree, right inspector + operations panel,
   bed-as-artboard canvas with mm rulers, status bar).
2. Promote "stroke = operation" to a first-class **document-level operation library**;
   each layer references an operation by `operationId`.
3. Replace the global `outputMode` toggle with a **document-level machine profile**
   (Laser / Pen Plotter / Drag Cutter) pinned at the top of the object tree.
4. Show **mm/in** for all chrome and object geometry now; tag pattern params with
   units **incrementally** (a parallel drip stream).
5. Add **SVG import** as place-as-artwork (one import = one layer, operation-assignable).
6. Add **auto-generated variable-weight operation bands** (laser spectrum / plotter
   pen slots), advanced + off by default + capability-gated.
7. Ship an **ITP Camp Kit** (reversible theme/bed mode, 7 preset SVG assets, NYU-ID
   unlock + server-validated submission) on the new import + theme infra.
8. Migrate via an **incremental strangler**, green build + green tests at every issue.

### 3.2 Non-goals (the explicitly-OUT list — see also §12)
- **Pattern boundary/mask clipping** (clipping generative output to imported geometry).
- **Primitive drawing tools** (rect/ellipse/pen/freehand). The tool strip is
  navigation + existing tools only; pattern boundaries come from imported SVG, not
  drawn shapes.
- **Full mm param coverage** — unit tagging is the incremental C5 drip, not one-shot.
- **Multi-select** — single-select drives the inspector.
- **Fully responsive mobile editing** — desktop-first editor; phones get a simplified
  "best viewed on desktop" view; existing `ShareView` stays mobile-viewable.
- **S1 direct machine-code generation** (laser G-code / plotter HPGL / direct-to-machine
  output) — separate stretch issue.

---

## 4. Users & Key Use Cases

### 4.1 Primary users
**Parametric-pattern designers** producing fabrication output. They pick a generated
pattern from the picker, tune parameters, place/transform/add text, assign each layer
to a cut/score/engrave/pen operation, set the machine + bed, optionally enable
variable-weight banding, and export SVG (or, future, dispatch to a machine).

**The ITP Camp workshop cohort** — NYU ITP Camp participants who enter the app in ITP
Camp Mode (Laser profile), unlock via their NYU ID (no account), drop a preset SVG
asset (logo, coaster, keychain, tags, ornament, badge, bookmark) as artwork, customize
with generative patterns/text, and **submit** their design for instructor download.

### 4.2 Key use cases
- **U1 — Design a cuttable pattern:** pick pattern → tune → assign layers to Cut /
  Score / Engrave → set bed → export laser-convention SVG.
- **U2 — Plotter pen art:** pick pattern → set machine = Pen Plotter → assign layers
  to pen slots (real colors editable) → export.
- **U3 — Variable-weight engrave/cut:** enable variable-weight on a weight-varying
  layer → tune N bands → export with per-element operation assignment (laser speed
  spectrum or plotter pen slots).
- **U4 — Place imported artwork:** File>Import / drag-drop / paste an SVG → it becomes
  one layer → assign an operation → export with everything else.
- **U5 — ITP Camp submission:** enter ITP Camp Mode → unlock with NYU ID → drop a
  preset asset → customize → Submit → instructor downloads from admin view.

---

## 5. Requirements (by lane)

Work is organized into three lanes matching the source spec. **Lane A** (data spine)
is headless and gates the operation UI. **Lane B** (shell migration) is a strictly
sequential strangler. **Lane C** (features) is parallel — each C issue depends on the
shell + data, not on the other C issues. The **dependency joins** are stated
explicitly in **§5.4**.

> **Decision traceability** (so no locked decision is dropped):
> D1→§9 strangler · D2→A2/C1/C6/C7 (dissolve Prepare) · D3→A1/C1 (operation library)
> · D4→A2/C6/§7 (machine profile) · D5→B4/C5 (units) · D6→B6 (tool strip) ·
> D7→C4 (SVG import) · D8→B7/§7 (responsive) · D9→B5/B6 (two top rows) ·
> D10→A5/C8 (variable-weight band) · D11→A5/C8/§11 (per-machine realization) ·
> D12→B2/§7 (machine selector top of tree) · D13→C9/§7 (ITP Camp Kit) ·
> D14→C10/§6/§8 (NYU-ID access) · D15→C10/§6/§8 (server-side RPC validation).

---

### 5.1 Lane A — Data spine (headless; gates the operation UI)

#### A1 — Operation-library model + layer `operationId` reference
**User-facing description.** The document owns an ordered list of named operations.
Each operation is a colored process (Cut/Score/Engrave/Pen) carrying machine
parameters. A layer no longer carries a raw `role`; it references one operation by
`operationId`. The stroke swatch picks which operation a layer uses.

**Functional requirements.**
- A1-F1. Define an operation shape: `{ id, name, color, process, machineParams, order }`
  where `process ∈ { 'cut', 'score', 'engrave', 'pen' }`. (See §6.1 for the canonical
  field definitions.)
- A1-F2. The document holds an **ordered** operation list; `order` is the cut order.
- A1-F3. Each layer gains an `operationId` reference (replacing the per-layer `role`
  semantics at the data level; the migration shim A3 performs the actual rewrite).
- A1-F4. Seed a new document with **Cut / Score / Engrave** operations (laser
  convention: red / blue / black). Users may add (e.g. a second cut setting),
  rename, recolor, and reorder.
- A1-F5. Pure data + unit tests; **no UI in this issue** (headless).

**Acceptance criteria.**
- A1-AC1. Operation-library helpers (create/seed/add/remove/reorder/recolor; resolve
  `operationId`→operation; resolve a layer's color+process via its operation) exist
  with unit tests, and the build + full test suite stay green.
- A1-AC2. A layer can be assigned an `operationId`, and its export color/process can be
  derived purely from the library (no `applyOutputMode` dependency in the new path).
- A1-AC3. No visible UI change ships in this issue (data only).

#### A2 — Machine-profile model (retires `outputMode`)
**User-facing description.** The document targets exactly one machine. The machine
profile decides which processes and which parameter fields each operation row exposes
and supplies the default bed size (bed = artboard). It replaces the global
`outputMode` toggle.

**Functional requirements.**
- A2-F1. Define three profiles: **Laser**, **Pen Plotter**, **Drag Cutter** (Silhouette,
  via `naqsha-cutter-bridge`).
- A2-F2. Each profile declares: available `process` set, the `machineParams` field
  schema per process, and a **default bed size**.
- A2-F3. The document stores one active profile (replacing `outputMode`).
- A2-F4. **Switching profile re-maps the operation library** (available processes,
  available/locked colors, default bed). Laser colors are **locked to convention**
  (cut=red/score=blue/engrave=black); plotter & drag-cutter colors are **editable**
  (= the real pen color).
- A2-F5. Pure data + tests; retires `OUTPUT_MODES`/`applyOutputMode` reliance in the
  new path (old path stays until B7/A4 land).

**Acceptance criteria.**
- A2-AC1. The three profiles exist with process sets, param schemas, and default beds,
  unit-tested; build + tests green.
- A2-AC2. Switching profiles deterministically re-maps the operation library per
  A2-F4, verified by tests (including laser color-lock vs plotter color-editability).
- A2-AC3. The new model exposes the default bed used by Document Setup / status bar.

#### A3 — Versioned migration shim
**User-facing description.** Old documents (examples, cloud designs, share links) that
carry the legacy `role` + `outputMode` shape are migrated forward to the operation +
profile model at every load boundary, so fabrication intent is preserved.

**Functional requirements.**
- A3-F1. Introduce a **schema version** on serialized documents (none exists today).
- A3-F2. A migration function maps legacy `role` → an operation (`operationId`), and
  legacy `outputMode` → a machine profile, applied at **every** load boundary:
  **local** (localStorage), **cloud** (Supabase `designs.config`), **share** (share
  link / `get_shared_design`), and **examples** (`src/examples/*.json`).
- A3-F3. **Migration policy (locked):**
  - **Rewrite** the bundled example JSON (`bloom.json`, `orbit.json`, `drift.json`) to
    the new shape.
  - **Migrate cloud designs forward losslessly** (at load/hydrate).
  - **Accept breakage on the oldest in-the-wild share links** (migrate at hydrate
    when cheap; do not block on full backward compatibility).
  - **Reset-to-default is rejected** — silently dropping to defaults would change
    fabrication intent and is dangerous.
- A3-F4. **A3 lands before B7** in practice via A4 (see joins); migration is in place
  before old-path decommission.

**Acceptance criteria.**
- A3-AC1. Loading a legacy `role`/`outputMode` document from each of the four
  boundaries yields a valid operation library + profile, with the same color/process
  intent, unit-tested per boundary.
- A3-AC2. Bundled examples are rewritten to the new shape and load without legacy
  fallbacks; tests green.
- A3-AC3. A document missing a schema version is treated as the legacy version and
  migrated; reset-to-default is never used as a migration path.

#### A4 — Export + plotter-pipeline rewire
**User-facing description.** Export and the plotter pipeline read color/process from
the operation library instead of `applyOutputMode(role)`.

**Functional requirements.**
- A4-F1. Replace `applyOutputMode(layer, outputMode)` in the export path
  (`Studio.jsx` `handleExportLayer`/`handleExportAll`) with operation-library lookups:
  a layer's export color = its operation's color; process metadata flows to the
  manifest (`buildManifest` in `svgExport.js`).
- A4-F2. Update `buildManifest` so layer lines reflect operation name/process instead
  of (or in addition to) the legacy `role`/`pen` fields, and `output:` reflects the
  machine profile rather than `outputMode`.
- A4-F3. **A4 must land before B7** (the old-path decommission), so the new shell
  never depends on the retired `outputMode` export path.

**Acceptance criteria.**
- A4-AC1. Exported SVG colors are sourced from the operation library; for a laser
  document the per-group `stroke` colors match cut/score/engrave convention without
  `applyOutputMode`.
- A4-AC2. The embedded manifest reflects operations + machine profile; tests green.
- A4-AC3. With identity transforms and seeded operations equivalent to today's roles,
  export output is equivalent to the legacy path for a migrated example.

#### A5 — Variable-weight band model (extends A1 + A4)
**User-facing description.** Enabling variable-weight on a layer quantizes its
per-element thickness into N buckets and creates a linked band of N operations; export
colors each element by its bucket (= its operation).

**Functional requirements.**
- A5-F1. Quantize a layer's per-element `strokeWeight` (the existing
  `{ pathD, strokeWeight }` elements) into **N even buckets** across the layer's
  observed min–max weight. **N configurable, default 5.**
- A5-F2. Create a **linked band of N operations** in the library for that layer.
- A5-F3. On export, assign **per-element** output by bucket:
  - **Laser:** a **red→yellow speed spectrum** (thinner ↔ faster); per-element color.
    This requires emitting **per-element `stroke` color** — new capability, since
    `contentFor(color)` currently uses one group color (per-element `stroke-width`
    already varies). See §11 for the color-collision constraint.
  - **Pen plotter:** weight bands → **pen slots** (band 1 = fine pen, …), reusing the
    existing pen-slot model (`MAX_PEN_SLOTS` in `fabrication.js`); optional per-band
    pressure/Z hint stored as **metadata**.
  - **Drag cutter:** **excluded** (a blade has no line weight).
- A5-F4. A **pattern capability flag** marks which patterns emit weight variation;
  variable-weight is **off by default, per-layer, capability-gated**.
- A5-F5. **Reserved color range:** the laser red→yellow band must get its own reserved
  color range that does **not** collide with reserved cut=red / score=blue /
  engrave=black (see §11 — exact range is an open constraint).

**Acceptance criteria.**
- A5-AC1. Given a weight-varying layer, enabling variable-weight produces N linked
  operations and a deterministic per-element bucket assignment, unit-tested.
- A5-AC2. Laser export emits per-element `stroke` colors from the reserved spectrum
  range; plotter export maps bands to pen slots; drag cutter rejects the feature.
- A5-AC3. The reserved spectrum range provably does not equal `#FF0000` / `#0000FF` /
  `#000000`; tests assert non-collision.

---

### 5.2 Lane B — Shell migration (strictly sequential strangler)

> Every B issue keeps the build + tests green and renders old behavior inside the new
> frames until decommission (B7).

#### B1 — App-shell scaffold
**User-facing description.** The new pro layout appears as empty region frames; the
existing Studio renders inside, unchanged.

**Functional requirements.**
- B1-F1. Scaffold all chrome regions as empty frames: top menu bar, contextual control
  bar, left tool strip, left object-tree column, canvas region, right inspector,
  right-bottom operations panel, bottom status bar (region map per §7.1).
- B1-F2. The current `LeftPanel` + `RightPanel` render inside the scaffold with no
  behavior change.

**Acceptance criteria.**
- B1-AC1. The app renders with all regions present (some empty) and full existing
  functionality intact; build + tests green.
- B1-AC2. No feature regression vs the pre-shell app.

#### B2 — Move layer tree → left column + machine-profile selector header
**User-facing description.** The layer list moves into the dedicated left object-tree
column, one row per object, with the machine-profile selector pinned at its top.

**Functional requirements.**
- B2-F1. Render one tree row per object: **visibility toggle, lock, drag handle, type
  icon, operation chip** (the chip itself is C3).
- B2-F2. Drag reordering maps to layer order (`reorderLayers`).
- B2-F3. Pin the **machine-profile selector** (Laser / Pen Plotter / Drag Cutter,
  segmented or dropdown) at the **top** of the column (decision 12). It **is** the
  decision-#4 profile; switching re-maps the operation library, available colors, and
  default bed.

**Acceptance criteria.**
- B2-AC1. The tree shows all layers with visibility/lock/drag/type-icon rows; reorder
  + visibility + lock work; tests green.
- B2-AC2. The machine-profile selector sits at the top of the column and drives the
  document profile (A2).

#### B3 — Move param inspector → right column (selection-driven)
**User-facing description.** The parameter inspector moves to the right column and is
driven by the current single selection.

**Functional requirements.**
- B3-F1. The inspector renders parameters for the **single selected** object (pattern
  params, text props, or imported-art props) using the existing param-def system
  (`PATTERN_PARAM_DEFS` in `constants.js`).
- B3-F2. With nothing selected, the inspector shows document quick-info / empty state.
- B3-F3. Inspector + operations panel are **both always visible, collapsible —
  not tabbed** (inspector top/scrolls, operations panel bottom/resizable).

**Acceptance criteria.**
- B3-AC1. Selecting a layer/text node populates the right inspector with its editable
  params; edits apply live; tests green.
- B3-AC2. Single-select drives the inspector; multi-select is out of scope.

#### B4 — Canvas chrome: mm rulers + bed-as-artboard + status bar
**User-facing description.** The canvas gains mm/in rulers, draws the machine bed as
the artboard, and reports state in a bottom status bar.

**Functional requirements.**
- B4-F1. Render rulers in the active unit (mm default) using `src/lib/units.js`.
- B4-F2. Draw the **machine bed as the artboard** (bed = the profile's default/active
  bed size).
- B4-F3. Status bar shows **units, zoom, cursor coords in mm, active material/bed**.

**Acceptance criteria.**
- B4-AC1. Rulers + bed + status bar render and update with unit/zoom/cursor changes;
  tests green.
- B4-AC2. The bed reflects the active machine profile's bed size.

#### B5 — Menu bar wiring
**User-facing description.** A top menu bar (File / Edit / View / Object / Help) plus a
right-pinned account cluster; the existing Examples/Load/Cloud/Export/Share buttons
fold into menus.

**Functional requirements.**
- B5-F1. Row-1 menu bar: app name left; **File / Edit / View / Object / Help**;
  account cluster (**Share / Theme / Auth** — `ShareLinkButton`, `ThemeToggle`,
  `AuthButton`) pinned right (decision 9).
- B5-F2. Fold existing **Examples / Load existing / Cloud / Export / Share** entry
  points into the **File** menu (and Edit where appropriate, e.g. undo/redo).

**Acceptance criteria.**
- B5-AC1. All folded actions are reachable from the menu bar and behave as before;
  tests green.
- B5-AC2. The account cluster (Share/Theme/Auth) renders right-pinned.

#### B6 — Tool strip + contextual control bar wiring
**User-facing description.** A left vertical tool strip (Select / Text / Hand / Zoom +
fill/stroke chip at base) and a row-2 contextual control bar whose contents change
with the active tool/selection.

**Functional requirements.**
- B6-F1. Tool strip: **Select (V), Text (T), Hand/Pan (space), Zoom**, plus a
  fill/stroke (operation) chip at the base. Driven by `toolRegistry.js` /
  `useActiveTool`. **No freehand drawing.** "Add pattern" stays the picker modal,
  surfaced as a **`+` in the tree**.
- B6-F2. Row-2 contextual control bar (decision 9):
  - **Text tool** → font / size / align / outline-toggle.
  - **Select tool** → align / arrange.
  - **Nothing selected** → document quick-info.
  - Plus the **stroke/operation swatch** (C2).

**Acceptance criteria.**
- B6-AC1. All four tools work (incl. existing keybindings V/T, space-pan, zoom);
  the control bar swaps contents by tool/selection; tests green.
- B6-AC2. "Add pattern" is reachable as a `+` in the tree and opens `PatternPickerModal`.

#### B7 — Decommission old LeftPanel/RightPanel + Design/Prepare tabs; ship mobile fallback
**User-facing description.** The legacy dock and Prepare tab are removed; phones get a
simplified single-column fallback.

**Functional requirements.**
- B7-F1. Remove the old `LeftPanel` dock + Design/Prepare tabs and the
  `RightPanel`-as-canvas indirection, now that all concerns have moved.
- B7-F2. **Dissolve the Prepare tab — no modes** (decision 2): bed size → status bar +
  Document Setup dialog (C6); output mode + machine params + optimization → the
  bottom-right Operations panel (C1); plot preview + overlap warnings → a canvas
  overlay toggle (C7).
- B7-F3. Ship the **simplified-mobile fallback** (single-column "best viewed on
  desktop"); existing `ShareView` stays mobile-viewable.
- B7-F4. **A4 must already have landed** (export no longer depends on the retired path).

**Acceptance criteria.**
- B7-AC1. The legacy panels/tabs are gone; no functionality is lost (all moved);
  build + tests green.
- B7-AC2. Phone viewport shows the simplified fallback; `ShareView` still renders on
  mobile.

---

### 5.3 Lane C — Features (parallel; depend on shell + data, not on each other)

#### C1 — Operations panel UI (LightBurn-style, bottom-right)
**Description.** A bottom-right panel listing the operation library as tunable rows
with process + machine params and cut ordering. **Needs A1+A2+B1.**

**Functional requirements.**
- C1-F1. Render one row per operation: name, color swatch, process, machine params
  (fields per the active profile), drag-to-reorder = cut order.
- C1-F2. Add / remove / rename / recolor / reorder operations; profile switching
  re-maps rows (A2).
- C1-F3. **History extension surfaces here:** operation-library edits become undoable.
  Today `useHistory` snapshots only `{ transforms, textNodes }`; extending it to cover
  operation state is a real task landing inside C1/C3 (see §11).

**Acceptance criteria.**
- C1-AC1. Operations render as editable rows; reorder changes cut order; recolor/rename
  persist; tests green.
- C1-AC2. Operation edits are undoable via the extended history.

#### C2 — Stroke/operation swatch → operation picker
**Description.** The stroke swatch in the control bar (and tool-strip base chip) opens
an **operation picker**, not an RGB wheel. **Needs A1+B6.**

**Functional requirements.**
- C2-F1. Clicking the swatch opens a picker listing the document's operations.
- C2-F2. With a layer selected, the picker sets that layer's `operationId`.
- C2-F3. With **nothing selected**, the swatch **sets the default operation for the
  next added layer**.

**Acceptance criteria.**
- C2-AC1. The swatch reflects the selected layer's operation and changes it on pick;
  tests green.
- C2-AC2. With nothing selected, picking sets the next-layer default.

#### C3 — Layer-row operation chip
**Description.** Each tree row shows an operation chip (color + name) and can change the
layer's operation inline. **Needs A1+B2.**

**Functional requirements.**
- C3-F1. Render the operation chip per row (the chip from B2-F1).
- C3-F2. Clicking the chip changes the layer's `operationId` (shares the C2 picker).
- C3-F3. Operation assignment is **undoable** (shared history extension with C1).

**Acceptance criteria.**
- C3-AC1. The chip shows the layer's operation; changing it updates color/process and
  export; tests green.

#### C4 — SVG import (place-as-artwork)
**Description.** Import an SVG as a new imported-path object (one import = one layer),
operation-assignable, exported with everything else. **Needs B1+A1.**

**Functional requirements.**
- C4-F1. Add a new **imported-path object class** in the scene graph (a leaf
  `SceneNode` subclass, peer to `PatternNode`/`TextNode`).
- C4-F2. Three entry points: **File>Import, drag-drop, paste**.
- C4-F3. **One import = one layer** in the tree, assignable to one operation, included
  in combined export (`buildCombinedSceneSVG` path).
- C4-F4. **Boundary/mask is explicitly deferred** — imported geometry is artwork, not a
  pattern clip region (see §12).

**Acceptance criteria.**
- C4-AC1. Importing via all three entry points creates one tree layer that renders,
  transforms, exports, and accepts an operation; tests green.
- C4-AC2. No boundary/mask behavior ships.

#### C5 — Per-pattern unit-tagging stream
**Description.** Add a unit tag to pattern params per-pattern; the inspector shows mm
where tagged, raw "design units" otherwise. **Needs B3, else independent.**

**Functional requirements.**
- C5-F1. Extend the param-def schema (`PATTERN_PARAM_DEFS`) so a param can carry a unit
  tag (mm-convertible vs unitless), shipped **one issue per batch of patterns** (a
  parallel drip — decision 5).
- C5-F2. Tagged params display + edit in mm/in (via `units.js`); untagged params show
  raw design units. Genuinely unitless params (`cols`, `symmetry`, `revolutions`,
  `noiseScale`, `angle°`) stay unitless.

**Acceptance criteria.**
- C5-AC1. A tagged param renders in the active unit and round-trips px↔mm correctly;
  untagged params are unchanged; tests green.
- C5-AC2. **Full mm coverage is NOT required** in any single issue (drip per §12).

#### C6 — Document Setup dialog
**Description.** A dialog to set bed size / machine. **Needs A2+B5.**

**Functional requirements.**
- C6-F1. Set the **machine profile** and **bed size** (bed = artboard); reachable from
  the File/Object menu (B5).
- C6-F2. Bed size also surfaces in the status bar (B4); the dialog is the authoritative
  editor (decision 2 — replaces Prepare's bed config).

**Acceptance criteria.**
- C6-AC1. Changing bed/machine updates the artboard, status bar, and operation library
  mapping; tests green.

#### C7 — Plot preview + overlap warnings (canvas overlay toggle)
**Description.** A canvas overlay toggle for the plot preview and overlap warnings
(moved out of the dissolved Prepare tab). **Needs B4.**

**Functional requirements.**
- C7-F1. A toggle overlays the plot preview + overlap warnings on the canvas (decision 2).
- C7-F2. Reuses the existing optimization/preview machinery (`useOptimizations`,
  `src/lib/plotter/`) where applicable.

**Acceptance criteria.**
- C7-AC1. Toggling shows/hides the overlay; overlap warnings render against the bed;
  tests green.

#### C8 — Variable-weight UI
**Description.** A per-layer inspector toggle (capability-gated, off by default, with an
advanced warning), an N control, and the band rows in the operations panel. **Needs
A5+C1+B3.**

**Functional requirements.**
- C8-F1. Per-layer inspector toggle, **off by default**, **capability-gated** to
  patterns that emit weight variation, with a warning.
- C8-F2. **N** control (default 5); even bands across the layer's min–max weight.
- C8-F3. The linked band shows as **N tunable rows** in the operations panel
  ("orange = speed X") so the user can step through bands while cutting manually.
- C8-F4. Realization per machine: laser red→yellow spectrum / plotter pen slots /
  drag cutter excluded (A5).

**Acceptance criteria.**
- C8-AC1. The toggle is off by default and only enabled for capable patterns; enabling
  it materializes N band rows; tests green.
- C8-AC2. N is configurable; band rows are individually tunable; export reflects the
  band (per A5).

#### C9 — ITP Camp Kit
**Description.** A thin reusable **Kit** bundle, with ITP Camp registered as the first
kit. **Needs C4 + theme system + B5/machine selector.**

**Functional requirements.**
- C9-F1. A registered kit config `{ themeSkin, assetManifest, bedPresets }`.
- C9-F2. **Theme-skin system** — a **third named theme** beyond light/dark (palette in
  §7.5), integrated with `ThemeToggle`.
- C9-F3. **7 bundled SVG outlines** in the asset manifest: ITP Camp logo, coaster 4×4",
  keychain, luggage/bag tag (hole + strap slot), ornament/medallion (circle + star
  cutout, top hole), badge/pin backing (round ~2"), bookmark (slim, tassel hole).
- C9-F4. A **floating preset modal** (like `PatternPickerModal`) that drops assets
  through the **place-as-artwork import path** (C4) — **NOT** a new tool-strip tool.
- C9-F5. **Reversible mode** — entering ITP Camp Mode applies theme + bed presets;
  exiting **restores the prior theme + bed**. Surfaced when **machine = Laser**; the
  enter/exit button appears in the Operations panel when machine = Laser.
- C9-F6. **2 bed presets** (the ITP Camp laser-bed dims — placeholder until provided,
  §11).

**Acceptance criteria.**
- C9-AC1. Entering ITP Camp Mode applies the theme skin + bed; the preset modal drops
  any of the 7 assets as a normal imported-art layer; exiting restores prior theme +
  bed; tests green.
- C9-AC2. The kit is config-driven (a future kit is registration, not new code paths).

#### C10 — ITP Camp access + submission
**Description.** NYU-ID unlock + server-validated submission + minimal instructor admin
view. **Needs C9.**

**Functional requirements.**
- C10-F1. Supabase tables `itp_camp_roster` (IDs + names) and `itp_camp_exports`
  (submissions), **RLS: no public read** (§6.5).
- C10-F2. RPC `validate_nyu_id(id)` → `{ ok, displayName }` unlocks the mode.
- C10-F3. RPC `submit_itp_export(...)` **re-checks** the NYU ID against the roster
  **server-side** before inserting into `itp_camp_exports`.
- C10-F4. NYU-ID **unlock gate** (no account) + typed name; a **Submit** button; export
  stored as **SVG text + manifest + thumbnail (data URL)** in the row (move to a
  Storage bucket only if size demands). **Multiple submissions per NYU ID allowed**
  (full history). **Basic rate-limit** on the submit RPC.
- C10-F5. Minimal **instructor admin** list + download view, gated to
  `majed.bg@gmail.com`.

**Acceptance criteria.**
- C10-AC1. A valid NYU ID unlocks via `validate_nyu_id`; an invalid one does not; the
  browser cannot read the roster or exports tables directly.
- C10-AC2. Submit inserts only after a server-side roster re-check; rate-limit blocks
  spam; the instructor view lists + downloads submissions and is gated to the admin
  email.

---

### 5.4 Dependency joins (explicit ordering)

- **A1 + A2 gate C1 / C2 / C3** — the ops UI reads the data model.
- **B1 gates everything in Lane B and all UI features.**
- **C1 / C2 / C3 need both** the data model (A1/A2) **and** the scaffold (B1/B2/B6).
- **A1 and B1 are both "issue #1"** — one headless, one empty frames — started in
  parallel.
- **A4 must land before B7** (old-path decommission).
- **A5 extends A1 + A4 and gates C8.**
- **C9 gates C10; C9 / C10 need C4** (the import path).
- Lane B is **strictly sequential** (B1→B2→…→B7). Lane C issues are parallel to each
  other once their A/B prerequisites are met.

---

## 6. Data Model & Migration

### 6.1 Operation library (A1)
A document-level **ordered** list. Each operation:

```
{
  id:           string,                  // stable id
  name:         string,                  // "Cut", "Score", "Engrave", "Cut (deep)"…
  color:        string,                  // hex; laser = locked convention, plotter/drag = editable
  process:      'cut' | 'score' | 'engrave' | 'pen',
  machineParams: object,                 // fields per the active machine profile (speed/power/passes/penSlot/pressure…)
  order:        number                   // = cut order
}
```
Each **layer** gains `operationId: string` (replacing the per-layer `role` semantics).
Color/process for export and canvas are resolved **through the operation**, not from
`layer.color` + `applyOutputMode`. Seed set: Cut (red `#FF0000`) / Score (blue
`#0000FF`) / Engrave (black `#000000`).

### 6.2 Machine profile (A2)
One active profile per document: **Laser / Pen Plotter / Drag Cutter**. Each profile
declares its available `process` set, the `machineParams` field schema per process, and
a **default bed size** (bed = artboard). Switching re-maps the operation library
(available processes, color lock vs edit, default bed). **Laser colors are locked**
to convention; **plotter & drag-cutter colors are editable** (= real pen color). This
replaces the global `outputMode` (`OUTPUT_MODES`/`applyOutputMode`).

### 6.3 Versioned migration shim (A3)
- Introduce a **schema version** on serialized documents (none exists today; examples
  like `orbit.json` carry a raw `"role": "cut"` with no version).
- Migrate at **every** load boundary — **local / cloud / share / examples** — mapping
  legacy `role` → operation (`operationId`) and `outputMode` → machine profile.
- **Policy (locked):** rewrite bundled example JSON; migrate cloud designs forward
  losslessly; **accept breakage on the oldest in-the-wild share links** (migrate at
  hydrate if cheap); **reject reset-to-default** (it silently changes fabrication
  intent → dangerous). A version-less document is treated as legacy and migrated.

### 6.4 Variable-weight band model (A5)
- Per-element weight comes from the existing `{ pathD, strokeWeight }` element shape
  (confirmed: `FlowField.generate` pushes these; `contentFor(color)` already emits
  per-element `stroke-width` but a **single** group `stroke` color).
- Enabling variable-weight: quantize element weights into **N even buckets** (default
  5) across the layer's min–max → create a **linked band of N operations**.
- Export per element by bucket:
  - **Laser** = per-element `stroke` color from a **red→yellow spectrum** (new
    per-element-color capability; `toSVGGroup`/`contentFor` must accept per-element
    color, not one group color).
  - **Pen plotter** = band → **pen slot** (reusing `MAX_PEN_SLOTS`); optional
    pressure/Z **metadata** per band.
  - **Drag cutter** = excluded.
- **Reserved color range** for the spectrum, non-colliding with cut=red/score=blue/
  engrave=black (exact range — see §11).

### 6.5 ITP Camp Supabase tables + RPCs + RLS (C10)
Follows the existing schema conventions in `supabase/001_initial_schema.sql`
(`security definer` RPCs like `get_shared_design`, per-table RLS, `pgcrypto`):

- **`itp_camp_roster`** — `{ nyu_id (unique), display_name, … }`. Seeded via
  migration/import once the user provides the roster (§11). **RLS: no public read.**
- **`itp_camp_exports`** — `{ id, nyu_id, display_name, svg text, manifest, thumbnail
  (data URL), created_at, … }`. Multiple rows per NYU ID allowed (full history).
  **RLS: no public read** (the instructor admin view reads via an admin-gated path).
- **RPC `validate_nyu_id(id)`** (`security definer`) → `{ ok, displayName }`; unlocks
  the mode. The browser can only call the RPC, never read the roster table.
- **RPC `submit_itp_export(...)`** (`security definer`) — **re-checks** the NYU ID
  against `itp_camp_roster` server-side **before** inserting into `itp_camp_exports`;
  enforces a **basic rate-limit**. The browser cannot insert directly.
- Submissions store SVG text + manifest + thumbnail data URL in the row; move to a
  Supabase **Storage bucket** only if size demands.

---

## 7. UX / Layout

### 7.1 Region map (desired end-state chrome)
- **Top menu bar** (Row 1): app name left; **File / Edit / View / Object / Help**;
  account cluster (**Share / Theme / Auth**) pinned right.
- **Contextual control bar** (Row 2): **stroke/operation swatch** + active-tool
  options (Text → font/size/align/outline-toggle; Select → align/arrange; nothing
  selected → document quick-info).
- **Left tool strip** (vertical): **Select / Text / Hand / Zoom** + a fill/stroke
  (operation) chip at the base. `+` lives in the tree for "Add pattern".
- **Left object-tree column**: one row per object (visibility, lock, drag handle, type
  icon, operation chip). **Machine-profile selector pinned at its top.**
- **Canvas**: mm rulers + the machine bed drawn as the artboard.
- **Right inspector** (top, scrolls): context-sensitive on the single selection — the
  heart of the app.
- **Right-bottom Operations / Cut-Settings panel** (LightBurn-style): process + machine
  params per operation; cut ordering. Inspector + ops panel are **both always visible,
  collapsible — not tabbed** (ops panel resizable).
- **Bottom status bar**: units, zoom, cursor coords in mm, active material/bed.

### 7.2 Contextual control bar
Swaps by tool/selection (decision 9): Text → font/size/align/outline-toggle; Select →
align/arrange; nothing selected → document quick-info; always carries the
stroke/operation swatch (C2).

### 7.3 Operations panel
Bottom-right; rows from the operation library; per-operation process + machine params;
drag-to-reorder = cut order. The **ITP Camp Mode enter/exit button** appears here when
machine = Laser. Variable-weight **band rows** appear here when C8 is enabled.

### 7.4 Machine selector
Pinned at the **top of the left object-tree column** (decision 12) — placed there
because layer colors are gated by the choice. It **is** the document machine profile
(not a separate toggle).

### 7.5 ITP Camp kit/theme skin + reversible mode
- A **third named theme** (beyond light/dark). Palette tokens (extracted from supplied
  images; user may fine-tune): lime/chartreuse accent `~#B5E33C`; deep teal/slate
  `~#2E5C6E`; black `#000`; soft sage background `~#D9E2DD`; white cards. Active
  control = **lime fill + black border + black text** (the "Dashboard" button style).
  Pixel/retro display face for headings (the ITP CAMP logo vibe).
- The preset-SVG palette is a **floating modal** (like the pattern picker) dropping
  assets via the **place-as-artwork import path** — not a new tool.
- **Reversible mode**: entering applies theme + bed presets; exiting **restores the
  prior theme + bed**. Surfaced when machine = Laser.

---

## 8. Security & Privacy

- **NYU-ID-only, no-account flow** (decision 14): participants enter a NYU ID,
  validated against a roster, to unlock ITP Camp Mode. Submissions are saved under NYU
  ID + typed name, with **no sign-in**. (Chosen for lowest camp friction over
  account-required.)
- **Validation is server-side** (decision 15): `validate_nyu_id` and `submit_itp_export`
  are `security definer` Supabase RPCs. `submit_itp_export` **re-checks** the NYU ID
  against the roster server-side before inserting — the client is never trusted.
- **Roster non-exposure**: `itp_camp_roster` and `itp_camp_exports` have **no public
  read** RLS. The browser can only call the RPCs; it cannot enumerate the roster or
  read other participants' exports. This prevents **roster enumeration** and **table
  spam**.
- **Spam prevention**: a **basic rate-limit** on `submit_itp_export`; server-side
  re-validation blocks fabricated submissions; admin views are gated to
  `majed.bg@gmail.com`.
- Consistency: this mirrors the existing pattern in `001_initial_schema.sql`
  (`security definer` RPC `get_shared_design`, per-table RLS, owner-scoped policies).

---

## 9. Rollout Strategy

- **Incremental strangler** (decision 1): scaffold the new shell as empty frames (B1),
  then move **one concern at a time** into it behind existing working code. **Green
  build + green tests at every issue.** No big-bang, no parallel duplicate route.
- **What ships shippable when:**
  - After **B1**: the shell exists with old behavior intact (no regression).
  - After **A1/A2/A3/A4**: the data spine + migration are live behind the existing UI;
    export reads the operation library; legacy documents migrate forward.
  - After **B2/B3/B4/B5/B6**: each region is progressively populated; the app stays
    fully usable throughout.
  - After **A4 (then) B7**: the legacy `LeftPanel`/`RightPanel` + Design/Prepare tabs
    are decommissioned and the mobile fallback ships — only after export no longer
    depends on the retired `outputMode` path.
  - Lane C features (C1–C10) ship independently once their A/B prerequisites are met;
    ITP Camp (C9→C10) ships last, on top of import (C4) + theme + machine selector.

---

## 10. Risks & Mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Big-bang rewrite breaks the working fab pipeline | Strangler with green build+tests per issue (D1); old path renders inside new frames until B7. |
| R2 | Migration silently changes fabrication intent | Versioned shim (A3); reject reset-to-default; per-boundary migration tests; rewrite examples deterministically. |
| R3 | Export regression when retiring `outputMode` | A4 lands before B7; equivalence tests against a migrated example. |
| R4 | Per-element color is genuinely new (`contentFor` uses one group color) | Scope it in A5: extend `toSVGGroup`/`contentFor` to accept per-element color; test against `FlowField`-style elements. |
| R5 | Variable-weight spectrum collides with reserved laser colors | Reserved spectrum range with non-collision asserted in tests (A5-AC3); see §11. |
| R6 | History doesn't cover operation state (only `{transforms,textNodes}`) | Extend `useHistory` inside C1/C3; assert operation edits are undoable. |
| R7 | ITP roster/spam abuse | Server-side RPC re-validation, no-public-read RLS, rate-limit (§8). |
| R8 | Missing data gaps block ITP build | Use documented placeholders (bed dims, roster, logo) until provided (§11); seed roster via import. |
| R9 | Plotter pressure/Z realism may not match hardware | Stored as metadata/hint only, not asserted as exact (see §11). |

---

## 11. Open Questions & Data Gaps

**Data gaps (block implementation, not planning):**
1. **The 2 ITP Camp laser-bed dimensions** — user TBD; placeholder bed presets until
   provided (C9-F6).
2. **The NYU-ID roster** (IDs + names) — user provides later; seeded via
   migration/import into `itp_camp_roster` (C10).
3. **The ITP Camp logo SVG** source — user provides, or bundle a placeholder (C9-F3).

**Open constraints / flagged tensions (not silently resolved):**
4. **Color-collision constraint (variable-weight laser spectrum).** Laser locks
   cut=`#FF0000` / score=`#0000FF` / engrave=`#000000`, but the variable-weight laser
   realization is a **red→yellow spectrum** whose low end is near red. The plan
   mandates a **reserved color range** for the band that does not collide with the
   three reserved colors — **but the exact reserved range is not specified.** This must
   be pinned (e.g. an orange→yellow band excluding pure red) before A5/C8 ship; A5-AC3
   asserts non-collision but does not choose the range. **Flagged, not resolved.**
5. **History extension is real unbuilt work.** `useHistory` today snapshots only the
   pair `{ transforms, textNodes }` (confirmed in `Studio.jsx`). The folded assumption
   that "operation assignment + library edits become undoable" requires extending the
   history snapshot to cover operation state — a task that surfaces inside **C1/C3**.
   This PRD does **not** assert it already works; it is scoped as part of those issues.
6. **Plotter pressure/Z realism.** Per-band pressure/Z is stored as **metadata/hint**
   only (A5/decision 11). How faithfully it maps to real plotter hardware is not
   guaranteed and is out of scope to validate here.

---

## 12. Out-of-scope / Future

- **S1 — Direct machine-code generation** (laser G-code / plotter HPGL / generalized
  direct-to-machine output, building on the existing `naqsha-cutter-bridge` dispatch).
  Separate **stretch** issue.
- **Pattern boundary/mask clipping** — using imported outline geometry to clip
  generative output to arbitrary shapes. A named follow-on, **not** in this redesign
  (C4 ships place-as-artwork only).
- **Primitive drawing tools** (rect / ellipse / pen / freehand). Pattern boundaries
  come from imported SVG, not drawn shapes.
- **Full mm param coverage** — that is the **C5 incremental drip**, not a one-shot.
- **Multi-select** — single-select drives the inspector.
- **Fully responsive mobile editing** — desktop-first editor; phones get a simplified
  fallback; `ShareView` stays mobile-viewable.
