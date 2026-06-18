# Studio Redesign Plan — Pro Fab-Tool Layout

> Status: **GRILLED & LOCKED 2026-06-18** (not yet built). Source-of-truth spec for
> the redesign that takes the app from its current two-pane editor to a full
> pro vector/fab-tool layout. `/to-issues` runs against this doc; a PRD is
> generated independently from it. This file is lossless — decisions are recorded
> verbatim, not summarized.

---

## 1. Why / framing

The app's closest functional analog is Inkscape (vector output for fab). The
redesign builds on the **Adobe/Inkscape skeleton** (left vertical tool strip, top
contextual control bar) but borrows **Figma's left-column object tree**, because a
parametric tool needs the layer list and the parameter inspector to each own a
full vertical column instead of fighting for one right dock.

The reframe that separates a fab tool from a graphics tool: **stroke color is not
color — it's the operation.** Each color maps to a named process (cut / score /
engrave / pen) carrying machine parameters. This governs where "color" lives and
what it means throughout the app.

### Desired end-state chrome (regions)
- Top **menu bar** (File / Edit / View / Object / Help) + account cluster right.
- Top **contextual control bar** (stroke/operation swatch + active-tool options).
- Left **tool strip** (vertical: Select / Text / Hand / Zoom + fill/stroke chip at base).
- Left **object-tree column** (one row per object: visibility, lock, drag handle,
  type icon, operation chip). Machine-profile selector pinned at its top.
- **Canvas** with mm rulers and the machine bed drawn as the artboard.
- Right **inspector** (context-sensitive on selection — the heart of the app).
- Right-bottom **Operations / Cut-Settings panel** (LightBurn-style; process +
  machine params per operation; cut ordering).
- Bottom **status bar** (units, zoom, cursor coords in mm, active material/bed).

---

## 2. Current state (as found, 2026-06-18)

- React + Vite + Tailwind app under `generative-art-studio/`. Supabase backend
  (`supabase/`), Supabase auth (`src/lib/AuthContext`), tier gating (`useGate`).
  ~450–583 passing tests; working fab/export pipeline. **NOT Next.js / Vercel
  storage** (skill auto-injections to the contrary are false positives).
- **Layout is already two-pane but confusingly named:**
  - `LeftPanel.jsx` = the all-in-one control dock (Design/Prepare tabs → layer
    list + param inspector + export + optimize + examples, all stacked left).
  - `RightPanel.jsx` = actually the **canvas** surface (tools, bg, text editing).
  - So this redesign **splits the overloaded left dock** (tree left / inspector
    right) and wraps the canvas in pro chrome — it is not building from scratch.
- **"Stroke = operation" half-exists:** `src/lib/fabrication.js` has `LASER_ROLES`
  (cut=`#FF0000`, score=`#0000FF`, engrave=`#000000`) and a per-layer `role`
  field, but it's buried in the Prepare tab, gated by a global `outputMode`
  ('plotter' | 'laser'), and per-layer rather than a shared palette. Export
  applies `applyOutputMode(layer, outputMode)` → one color per layer group.
- **Tools:** `src/lib/tools/toolRegistry.js` has only `select` + `text`. No
  freehand vector drawing anywhere — every object is a *generated* pattern (added
  via `PatternPickerModal`, not drawn), text, or (future) imported SVG.
- **Scene graph exists:** `src/lib/scene/` (`PatternNode`, `TextNode`, `SceneNode`,
  `sceneGraph`). History (`useHistory`) currently snapshots only `{transforms,
  textNodes}` — **not** layer/operation state.
- **Text** already has outline/single-line/engrave machinery (`textToOutline`,
  `engraveCheck`, `lineMode`, `renderMode`). Outline-vs-single-line is a surfacing
  problem, not a build-from-zero.
- **Units:** `src/lib/units.js` (px↔mm/in at 96 PPI) is clean; canvas/bed unit
  selector works. But **pattern params are untagged pixel/abstract numbers** in
  `DEFAULT_PARAMS` (`spacing=40`, `strokeWeight=0.8`, `R/r/d`) mixed with genuinely
  unitless ones (`cols`, `symmetry`, `revolutions`, `noiseScale`, `angle°`).
- **Per-element stroke weight is real and exported:** patterns record
  `{pathD, strokeWeight}` per element; `toSVGGroup` emits per-element
  `stroke-width`. Canvas already previews variable thickness. But export assigns
  **one `layer.color` per group** — so per-element *color* is new.
- **No SVG import exists** — the app only exports (`svgExport.js`).
- **No schema versioning** anywhere in load paths; layers serialize a raw
  `role: "cut"` (examples `bloom/orbit/drift.json`, cloud, share-link state).

---

## 3. Locked decisions (15)

### Architecture
1. **Migration = incremental strangler.** Scaffold the new shell as empty frames;
   move ONE concern at a time into it behind existing working code; **green build
   + green tests at every issue.** No big-bang, no parallel duplicate route.
2. **Dissolve the Prepare tab — no modes.** Bed size → status bar + a Document
   Setup dialog; output mode + machine params + optimization → the bottom-right
   Operations panel; plot preview + overlap warnings → a canvas overlay toggle.
3. **Operation library.** Document-level ordered list of operations, each
   `{ id, name, color, process (cut|score|engrave|pen), machineParams, order }`.
   Each layer references one operation by `operationId`; the stroke swatch picks
   which. Seeded with Cut/Score/Engrave; user can add (e.g. two cut settings),
   recolor, reorder (= cut order). Today's per-layer `role` becomes a reference.
4. **Document-level machine profile.** The document targets ONE machine:
   **Laser / Pen Plotter / Drag Cutter** (Silhouette, via naqsha-cutter-bridge).
   The profile drives which processes + param fields each operation row shows AND
   supplies the default bed size (bed = artboard). **Replaces the global
   `outputMode` toggle.** Switching profile re-maps the operation library.
5. **Units: mm for chrome + object geometry now; pattern-param tags incremental.**
   Rulers, status bar, Document Setup, and object position/size/stroke-width show
   mm/in immediately (px↔mm scale already exists). Pattern-internal params get a
   unit tag added **per-pattern as a parallel drip stream** — shown in mm where
   tagged, raw "design units" otherwise. Not every slider is mm on day one.
6. **Tool strip = navigation + existing only.** Select (V), Text (T), Hand/Pan
   (space), Zoom. "Add pattern" stays the picker modal (a `+` in the tree).
   **No freehand drawing.** Pattern boundaries come from imported SVG, not drawn
   shapes.
7. **SVG import = place-as-artwork now; boundary/mask deferred.** Import via all
   three entry points (File>Import, drag-drop, paste) creates a new imported-path
   object class — one import = one layer in the tree, assignable to an operation,
   exported with everything else. **"Use imported outline as a pattern
   boundary/mask"** (clipping generative output to arbitrary geometry) is a named
   follow-on, NOT in this redesign.
8. **Responsive = desktop-first editor, simplified mobile.** Full pro layout for
   tablet/desktop (≥ a breakpoint). Phones get a simplified single-column
   "best viewed on desktop" view; existing `ShareView` stays mobile-viewable.
9. **Top = two rows.** Row 1 menu bar (app name left; File/Edit/View/Object/Help;
   account cluster — Share/Theme/Auth — pinned right). Row 2 contextual control
   bar (stroke/operation swatch + active-tool options: Text→font/size/align/
   outline-toggle; Select→align/arrange; nothing selected→document quick-info).
   Existing Examples/Load/Cloud/Export/Share buttons fold into File menu.

### Features
10. **Variable line weight = auto-generated operation band.** Enabling
    variable-weight on a layer quantizes its per-element thickness into **N
    buckets** and creates a linked **band of N operations** in the library. Export
    colors each element by its bucket = its operation. The band shows as N tunable
    rows in the ops panel ("orange = speed X") so the user can step through them
    while cutting manually. N configurable (default 5), even bands across the
    layer's min–max weight.
11. **Variable-weight realization per machine.** **Laser** = a red→yellow speed
    spectrum (thinner ↔ faster). **Pen plotter** = weight bands → **pen slots**
    (manual swap; band 1 = fine pen, etc.), reusing the existing pen-slot model
    (`MAX_PEN_SLOTS`); optional per-band pressure/Z hint stored as metadata.
    **Drag cutter excluded** (a blade has no line weight). Feature is **advanced,
    off by default, per-layer, capability-gated** to patterns that emit weight
    variation, with a warning. **Color-collision constraint:** the red→yellow
    spectrum must NOT collide with reserved cut=red / score=blue / engrave=black —
    the band gets its own reserved color range.
12. **Machine selector = all 3 profiles, top of the layer column.** One control
    (segmented or dropdown) pinned at the top of the left object-tree column:
    Laser / Pen Plotter / Drag Cutter. It IS the decision-#4 profile (not a
    separate toggle); switching re-maps the operation library, available colors,
    and default bed. Placed there because layer colors are gated by the choice.
13. **ITP Camp Mode = thin reusable "Kit" bundle.** A registered kit config
    `{ themeSkin, assetManifest, bedPresets }`, entered/exited as a **reversible
    mode** (restores prior theme + bed on exit), surfaced when machine = Laser.
    The preset-SVG palette is a **floating modal** (like the pattern picker) that
    drops assets through the place-as-artwork import path — NOT a new tool-strip
    tool. Only ITP Camp ships now; a future kit is config. Palette seeds with
    **7 assets:** ITP Camp logo, coaster 4×4", keychain, luggage/bag tag (hole +
    strap slot), ornament/medallion (circle + star cutout, top hole), badge/pin
    backing (round ~2"), bookmark (slim, tassel hole).
14. **ITP Camp access = NYU-ID-only (no account).** Enter NYU ID → validated
    against a roster → mode unlocks. Submissions saved under NYU ID + typed name,
    no sign-in. (Chosen for lowest camp friction over account-required.)
15. **ITP Camp validation = server-side Supabase RPCs.** `validate_nyu_id(id)`
    returns `{ ok, displayName }` to unlock; `submit_itp_export(...)` re-checks the
    NYU ID against the roster **server-side** before inserting into
    `itp_camp_exports`. Roster + exports tables have **no public read** — the
    browser can only call the RPCs. Prevents roster enumeration and table spam.

### ITP Camp theme skin (extracted from supplied images; user may fine-tune)
- Lime/chartreuse accent `~#B5E33C` · deep teal/slate `~#2E5C6E` · black `#000`
  · soft sage background `~#D9E2DD` · white cards. Active control = lime fill +
  black border + black text (the "Dashboard" button style). Pixel/retro display
  face for headings (the ITP CAMP logo vibe).

---

## 4. The split — three lanes + stretch

### Lane A — Data spine (headless; gates the operation UI)
- **A1** Operation-library model `{id,name,color,process,machineParams,order}` +
  layer `operationId` ref. Pure data + tests.
- **A2** Machine-profile model (per-machine processes, param fields, default bed).
  Retires `outputMode`.
- **A3** Versioned migration shim. Legacy `role`→operation, `outputMode`→profile,
  applied at **every** load boundary (local / cloud / share / examples). Policy:
  **rewrite bundled example JSON; migrate cloud designs forward losslessly; accept
  breakage on the oldest in-the-wild share links** (migrate at hydrate if cheap).
  Reset-to-default is rejected (silently changes fabrication intent → dangerous).
- **A4** Export + plotter-pipeline rewire: read color/process from the operation
  library instead of `applyOutputMode(role)`. Must land **before** B7.
- **A5** Variable-weight band model (extends A1 + A4): per-element weight → N-bucket
  quantization → linked operation band; pattern capability flag; per-element color
  (laser spectrum) / pen-slot (plotter) assignment on export; reserved color range.

### Lane B — Shell migration (strictly sequential strangler)
- **B1** App-shell scaffold — all regions as empty frames; old Studio renders
  inside. Green.
- **B2** Move layer tree → left column (visibility/lock/drag/type-icon/op-chip
  rows) + machine-profile selector header (decision 12).
- **B3** Move param inspector → right column, selection-driven.
- **B4** Chrome: mm rulers + bed-as-artboard + status bar.
- **B5** Menu bar wiring; fold Examples/Load/Cloud/Export/Share into menus.
- **B6** Tool strip + contextual control bar wiring.
- **B7** Decommission old LeftPanel/RightPanel + Design/Prepare tabs; ship
  simplified-mobile fallback.

### Lane C — Features (parallel; each depends on shell + data, not on each other)
- **C1** Operations panel UI (LightBurn-style, bottom-right): rows from the
  library, machine params, cut order. Needs **A1+A2+B1**.
- **C2** Stroke/operation swatch (control bar + tool-strip base chip) → operation
  picker (not an RGB wheel). Needs **A1+B6**.
- **C3** Layer-row operation chip in the tree. Needs **A1+B2**.
- **C4** SVG import: new imported-path object class in the scene graph + 3 entry
  points + operation-assignable. Needs **B1+A1**.
- **C5** Per-pattern unit-tagging stream (one issue per batch of patterns);
  inspector shows mm where tagged. Needs **B3**, else independent.
- **C6** Document Setup dialog (bed size / machine). Needs **A2+B5**.
- **C7** Plot preview + overlap warnings → canvas overlay toggle. Needs **B4**.
- **C8** Variable-weight UI: per-layer inspector toggle (capability-gated,
  off-by-default, advanced warning), N control, ops-panel band rows. Needs
  **A5+C1+B3**.
- **C9** ITP Camp Kit: kit-bundle infra + ITP Camp registration (theme-skin system
  [3rd named theme beyond light/dark] + 7 bundled SVG outlines + preset modal
  reusing import + 2 bed presets), reversible mode, surfaced in Laser profile.
  Needs **C4 + theme system + B5/machine selector**.
- **C10** ITP Camp access + submission: `itp_camp_roster` table + `itp_camp_exports`
  table + `validate_nyu_id` & `submit_itp_export` RPCs + RLS (no public read) +
  NYU-ID unlock gate + Submit button + minimal instructor admin list+download view
  (gated to `majed.bg@gmail.com`). Needs **C9**.

### Dependency joins (the non-obvious ordering)
- A1 + A2 gate C1 / C2 / C3 (the ops UI reads the data model).
- B1 gates everything in Lane B and all UI features.
- C1 / C2 / C3 need **both** the data model (A) **and** the scaffold (B1/B2/B6).
- A1 and B1 are both "issue #1" — one is headless, one is empty frames, so they
  start in parallel.
- A4 must land before B7 (old-path decommission).
- A5 extends A1 + A4 and gates C8.
- C9 gates C10; C9 / C10 need C4 (import path).

### Stretch / explicitly OUT of this redesign
- **S1** Direct machine-code generation (laser G-code / plotter HPGL / generalized
  direct-to-machine output, building on the existing naqsha-cutter-bridge
  dispatch). Separate stretch issue.
- Pattern **boundary/mask clipping** (clip generative output to imported geometry).
- **Primitive drawing tools** (rect/ellipse/pen/freehand).
- **Full mm param coverage** (that's the C5 incremental drip, not a one-shot).
- **Multi-select.**
- **Fully responsive** mobile editing.

---

## 5. Folded assumptions (accepted unless vetoed)
- Right column = Inspector (top, scrolls) **+** Operations panel (bottom,
  resizable), both always visible, collapsible — **not** tabbed.
- **Single-select** drives the inspector; multi-select out of scope.
- Operation colors: **laser locked to convention** (cut=red/score=blue/
  engrave=black); **plotter & drag-cutter colors editable** (= real pen color).
- Stroke swatch with **nothing selected** = sets the default operation for the
  next added layer.
- **Operation assignment + library edits become undoable** — today `useHistory`
  snapshots only `{transforms, textNodes}`; extending history to cover operation
  state is a real task surfacing inside C1/C3.
- "**One import = one layer**"; imported art is a leaf object assignable to one
  operation.
- Variable-weight: laser + plotter only, off by default, per-layer,
  capability-gated, N configurable (default 5).
- ITP Camp Mode is a **reversible toggle** (restores prior theme + bed on exit);
  the button appears in the Operations panel when machine = Laser.
- ITP submissions: export stored as SVG text + manifest + thumbnail (data URL) in
  the row (move to a Supabase Storage bucket only if size demands); multiple
  submissions per NYU ID allowed (full history); basic rate-limit on the submit
  RPC.

---

## 6. Open data gaps (block implementation, not planning)
1. **The 2 ITP Camp laser-bed dimensions** (user TBD — placeholder until provided).
2. **The NYU-ID roster** (IDs + names) — user provides later; seeded via
   migration/import into `itp_camp_roster`.
3. **The ITP Camp logo SVG** source — user provides, or bundle a placeholder.
(Theme palette extracted above; user may fine-tune.)
