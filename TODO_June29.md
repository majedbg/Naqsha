# TODO — Planned-but-never-built audit (2026-06-29)

Cross-referenced all ~40 plan/orchestrator/run-log docs in `docs/` against the
actual code in `src/`. The project is disciplined — nearly everything planned
shipped, and most "missing" things are **explicitly scoped-out non-goals**, not
forgotten work. Below separates genuinely-unfinished work from deliberate
deferrals.

---

## A. Genuine gaps — planned, partially wired, not finished

These have *some* code but the planned capability isn't actually reachable.

### A1. Multi-source modulation stacking (Phase 2b) — highest signal
The PRD planned letting one modulation target blend multiple guide fields. The
UI already renders the affordance — a **"N sources · 1 active"** label — but the
compute layer never implemented it:
- `resolveModulationForTarget.js` returns **first-match only**
- `modulationGraph.js` marks every edge past the first `active:false`

So there's dead-end UI promising something the compute never delivers.
- Doc: `topographic-modulation-prd.md §5` (Phase 2b)
- Code: `src/lib/fields/resolveModulationForTarget.js`, `src/lib/fields/modulationGraph.js`, `src/components/shell/LayerTree.jsx`

### A2. Two built-but-never-wired panel behaviors — orphaned code (cheap fixes)
- **Responsive dice-hide**: `LayerTree` has a `compact` prop (unit-tested) to
  hide the randomize-dice in the 200–240px width band — but no parent passes it,
  so it never triggers.
- **RowMenu upward-flip**: `anchorNearBottom` is implemented and tested, but
  `LayerTree` never computes it → row menu always opens downward (clips at panel
  bottom).
- Doc: `object-tree-panel-plan.md §3.2` (dice), `§4` (menu flip)
- Code: `src/components/shell/LayerTree.jsx`, `src/components/shell/RowMenu.jsx`

### A3. C5 unit-tagging — only 3 of ~22 patterns
The "edit in mm/in" system works, but only `spirograph.d`, `wave.amplitude`,
`wave.lineSpacing` carry `unit:` tags. `strokeWeight`, composite `plot2d/pad2d`
params, and every other length param across remaining patterns are still raw px.
Intended as an incremental "drip," but stalled after batch one.
- Doc: `studio-redesign-PRD.md §5.3 C5`; run-log #13
- Code: `src/constants.js` (only 3 `unit:` tags present)

### A4. ITP Camp submission flow (C10) — data-blocked, parked
Schema/RPCs (`itp_camp_roster`, `validate_nyu_id`, `submit_itp_export`) and the
instructor admin view were specced but never built — blocked on the NYU-ID
roster (needs IDs + display names from user).
- Doc: `studio-redesign-PRD.md §5.3`; redesign run-log #19

---

## B. Known limitations with open TODO follow-ups

- **Variable-weight export loses symmetry** — `realizeVariableWeightElements`
  emits bare paths, dropping `wrapSVGSymmetry`. Off-by-default; follow-up
  unresolved. (redesign run-log #17)
- **Optimized export flattens imported curves** — `parsePathD` is M/L/Z only;
  C/Q curves linearize when optimizer runs. Default/verbatim export is fine.
  (redesign run-log #12)
- **New layer doesn't join active panel (laser mode)** — added layers get
  `panelId:null` and stay orphaned until reload/normalize.
  (`naqsha-panels` run-log §0 "KNOWN GAP"; `src/lib/useLayers.js` `createLayer()`)
- **Bed ≠ canvas** — Document Setup writes both but they remain separate values;
  "bed = artboard" is visual-only by deliberate deferral. (run-log #14/#16)

---

## C. Fully specced, zero code (design-only doc)

- **P3 true cut-through gaps (CSG)** — `material-cut-through-plan.md` is a
  complete spec that states *"design only. No code, no dependency added."* No
  `three-bvh-csg`, no holed geometry. Largest written-but-unbuilt plan.

---

## D. Explicitly out-of-scope (planned-as-future by design — NOT gaps)

Listed so they're visibly conscious decisions, not oversights:
- Drawing tools (rect/ellipse/pen/freehand)
- Multi-select
- Pattern boundary/mask clipping (SVG import = place-as-artwork only)
- Direct machine-code output (laser G-code / plotter HPGL)
- Full mobile editing (desktop-first; phones get simplified `MobileStudio`)
- GLB / model export (PNG snapshot only)
- Live-reactive 3D rebuild (snapshot-based by design, D14)
- Jig/gang layout v2 (post-workshop roadmap #1)
- Org-admin deferrals: billing, self-serve org signup, nesting solver, shared
  gallery, per-member quotas, persistent batches (org-admin-mvp §9)
- Wood texture image assets (procedural grain in v1; `texturePath` reserved)

---

## E. Stale docs/comments to fix (hygiene)

- `src/constants.js:1127` labels **lissajous / chladni / truchet / hilbert** as
  *"PLACEHOLDERS (not yet built)"* — they are all **built** and auto-registered
  via `src/lib/registerBuiltinExtras.js`. Comment is now wrong.
- `redesign-run-log.md #9` says "no text object model exists" — the text tool
  fully shipped afterward (`src/lib/text/`, `src/lib/scene/TextNode.js`,
  `addTextLayer` in `useLayers.js`). Entry is stale.

---

## Bottom line

The only items that read as "planned but genuinely never finished":
**A1–A4** (multi-source modulation, two orphaned panel behaviors, unit-tag
coverage, ITP submission) plus the **P3 cut-through CSG** spec (C). Everything in
section D is a documented out-of-scope non-goal; section B items are known
limitations with open follow-up notes.

### Suggested next actions
- Cheapest wins: A2 (wire the two tested-but-unconnected behaviors) + E (fix two
  stale comments).
- File as issues: `gh` repo `majedbg/Naqsha`, label `ready-for-agent`
  (redesign work groups under `studio-redesign`).
