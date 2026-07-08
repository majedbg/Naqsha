# SVG Motif — P1 (tracer spine) ORCHESTRATOR — 2026-07-08

> **RESUME RULE:** fresh session reads this first, trusts statuses, skips `done` WIs, continues from
> the first non-`done`. Update BEFORE + AFTER each dispatch. Design: `svg-motif-editor-DECISIONS.md`.

**P1 goal:** import an SVG → normalize to a per-document custom glyph → place as a motif with an
auto root, rendering canvas==export and surviving reload/share. NO editor (that's P2). TDD per WI.

## Architecture (verified in code + advisor-reviewed)
- ONE render seam: `useCanvas` builds `patternInstances` (factory `patterns/index.js` `motif:
  MotifPattern`); Studio, **ShareView**, and in-app export (`svgExport.buildAllLayersSVG(layers,
  patternInstances,…)` reuses baked `svgElements`) all go through it. ⇒ resolve the glyph UPSTREAM in
  `useCanvas` and inject the resolved glyph object into the motif's `renderParams` (like the existing
  `resolveMotifHostParams` injection). MotifPattern then reads `params.glyph` (no store coupling).
- `getGlyph` has only 3 non-test callers (Inspector:644, useLayers:353, MotifPattern:40) → cheap to
  make doc-aware: `getGlyph(id, customGlyphs)` (builtin OR custom; `getGlyph(id)` stays back-compat).
- `customGlyphs` is a NEW document-level field (map id→{paths:[{d,closed}], viewRadius, root:{x,y,
  angle}, name}) owned by `useLayers`, referenced by `motifLayer.params.glyphRef`.

## ⚠ Advisor-flagged risks (fold into briefs; these are the real P1 hazards)
1. **Referential integrity across persistence surfaces.** Unlike ImportedPath's on-layer `pathData`,
   `customGlyphs` is doc-level + referenced. Every surface that serializes layers MUST also serialize
   `customGlyphs`, else a reloaded/shared doc has motif layers pointing at missing glyphs → blank.
   Surfaces to verify/patch (architecture candidate-#5 set): `history/documentSnapshot.js`,
   `useCloudPersistence.js`, `shareLink.js`, `localDraft.js`, org export. Default to `{}` on load
   (no `migrateConfig` hook — zero live callers). **P1 DONE-GATE (WI-3): import → place → RELOAD →
   open a SHARE LINK → motifs still render.** Unit-green ≠ done here.
2. **Root byte-identity test is necessary but NOT sufficient.** `root={0,0,0}→identical matrix` only
   pins the degenerate case. ADD a non-zero `{x,y,angle}` test vs a hand-computed placement point —
   the compose order (`T(px,py)·R(θ)·S·R(−root.angle)·T(−root.xy)`, flip folded into S) passes the
   identity test and can still ship wrong orientation.
3. **P1 adopts `flattenPathD` in MotifPattern ONLY — leave ImportedPath untouched** (rewiring it =
   snapshot churn, no feature gain). WI-1 characterization anchor: `flattenPathD` returns
   BYTE-IDENTICAL vertices to `parsePathD` for M/L/Z (all built-ins are M/L/Z → zero motif output
   change for builtins).

## Waves & work items

### Wave 1 — parallel worktrees (disjoint, pure)
| WI | Description | TDD | Files | Status |
|----|-------------|-----|-------|--------|
| WI-1 | `flattenPathD(d, tol)` — curve-aware (C/Q/A→fine polyline). Anchor: byte-identical to `parsePathD` for M/L/Z. | CHAR then RED→GREEN | `src/lib/plotter/pathOps.js` (+test) | **done** ✅ integrated (31 tests). NOTE: `parsePathD` already handled C/S (fixed-16); only Q/T/A were new. `flattenPathD` = full C/S/Q/T/A adaptive, `tol=0.25`. |
| WI-2 | root-aware `placementMatrix` (pre-translate `T(−root.xy)` + local `R(−root.angle)`); MotifPattern passes `glyph.root`. Byte-identity at root=0 **+ non-zero {x,y,angle} hand-computed test**. | CHAR then RED→GREEN | `src/lib/motif/instancing.js`, `src/lib/motif/MotifPattern.js` (+tests) | **done** ✅ integrated (42 tests green) |

### Wave 2 — sequential on main (foundational store)
| WI | Description | TDD | Files | Status |
|----|-------------|-----|-------|--------|
| WI-3 | `customGlyphs` store in `useLayers` (add/get); doc-aware `getGlyph(id, customGlyphs)`; upstream glyph resolution in `useCanvas` → inject resolved `glyph` into motif renderParams; MotifPattern reads `params.glyph ?? getGlyph(glyphRef)` (back-compat); **serialize `customGlyphs` across ALL persistence surfaces** (risk #1); default `{}` on load. | RED→GREEN + **reload/share done-gate** | `useLayers.js`, `motif/glyphs.js`, `useCanvas.js`, `motif/MotifPattern.js`, `history/documentSnapshot.js`, + shareLink/localDraft/cloud/org as needed (+tests) | **done** ✅ integrated, full suite 3742 green. Traced ALL surfaces (localStorage/snapshot/share/cloud/draft/groups/examples/org) + round-trip tests + missing-glyph degrade + cross-doc replace guard. id=`cg-<n>-<rand>`. Inspector:644 left single-arg (WI-4). Flags: saved-groups no unit harness; share-size guard; addCustomGlyph not yet undoable. |
| | RECON: `documentSnapshot.js` explicitly picks `layers` (capture `layers:` / restore `loadLayerSet(s.layers)`) — add `customGlyphs` sibling. `shareLink.js` spreads `{v,...state}`; `localDraft.js` stashes `draft` — both carry whatever the doc-state assembler includes → trace where `state`/`draft` is built (Studio/useDocument) and add `customGlyphs` next to `layers`. | | | |

### Wave 3 — sequential on main (import + UI)
| WI | Description | TDD | Files | Status |
|----|-------------|-----|-------|--------|
| WI-4 | `importMotif(svgText)` → custom glyph (verbatim `d`, root=bbox bottom-center, viewRadius=max dist from root). | RED→GREEN | new `src/lib/motif/importMotif.js` (+test) | **done** ✅ on main, 3757 green. `{ok,glyph}`; empty-cloud→ok:false (no NaN root); single-point viewRadius clamps 0.5; name from title/aria/id. Path-only limitation documented. |
| WI-5 | Motif device: glyph picker lists built-ins + custom; add **"Import SVG as motif…"** (wires importMotif → `useLayers.addCustomGlyph` → set layer `glyphRef`). Built-ins read-only. Update Inspector:644 `getGlyph` to pass customGlyphs. | RED→GREEN | `components/shell/Inspector.jsx`, `pages/Studio.jsx` (+tests) | **done** ✅ on main, 3761 green. Two `<optgroup>`s (Built-in/Custom); per-row "Import SVG as motif…" → importMotif→addCustomGlyph→rebind glyphRef (auto-selects); reuses Studio's `showImportError` banner. **UX note:** import is per-existing-motif-row (add a motif first, then Import replaces its glyph) — reasonable P1, refine later. |

## ✅ P1 COMPLETE — all 5 WIs on main, UNCOMMITTED. Full suite 3761 passed / 0 fail.

### ⚠ Unrelated pre-existing changes in the tree — NOT P1, leave alone, EXCLUDE from P1 commit
- `src/components/canvas3d/Marks.jsx` — human `FORCE_TEXTURE_MODE=true` 3D-moiré diagnostic ("revert after test").
- `src/components/shell/OperationsPanel.jsx` — human operations-row layout refactor.

### Human-verification gate (`npm run dev` — green tests can't see these)
1. Add a motif layer on a host → Motif device → "Import SVG as motif…" → pick a path-only SVG → it
   stamps + places on the host, sprouting from the root (bbox bottom-center), sized by reach-from-root.
2. Reload the page → the imported motif still renders (persistence).
3. Open a share link of the design → still renders (share round-trip).
4. Curves look smooth on canvas (flattenPathD) and in SVG export.

### Deferred to later phases (recorded)
- P2: pen editor (edit anchors/handles/root+direction, working-copy, live+mini-preview, Save/Cancel/
  Save-as-copy, "used by N" badge), Inspector custom-glyph rename, import-as-NEW-motif entry,
  wire addCustomGlyph into undo history. P3: draw-from-scratch. P4: global library + premium gate.
- Import fidelity: transform/non-path SVG flattening (P1 is path-only).
- Saved-groups custom-glyph round-trip has no unit harness → include in dev-eyeball.

## Guardrails
- Full `npm test` + `npm run lint` after each WI integrates. Known lint baseline ~27 errors in
  untouched files — confirm changed files clean only. Do NOT commit (user confirms).
- Green unit tests do NOT verify the reload/share integrity (WI-3) or visual placement — plan a
  `npm run dev` eyeball (+ a literal reload and share-link open) before P1 is "done".

## Run log
- **2026-07-08 (start):** Grill complete (8 decisions). Recon: getGlyph 3 callers; single useCanvas
  render seam (Studio+ShareView+export); customGlyphs → useLayers. Advisor folded 3 risks. Dispatching
  Wave 1 (WI-1 ‖ WI-2).
- **2026-07-08 (WI-2 done, integrated):** `placementMatrix(placement, viewRadius, root={x,y,angle})`
  — root as 3rd arg (glyph-local, not on placement). Compose `M = T(px,py)·R(rot)·S(sx,sy)·
  R(−root.angle)·T(−root.xy)`, flip stays in core `sx`. Default/absent root SHORT-CIRCUITS to the
  pre-root core (dodges −0→+0 signed-zero drift → true byte-identity). MotifPattern threads
  `glyph.root`. Tests: 7-placement identity char + hand-computed non-zero-root position/orientation +
  flip×root + a wiring test proven RED when the 3rd arg is dropped. Integrated; motif tests 42 green.
  **NOTE for P2 editor (flag from agent):** under flip, the growth *axis* maps to `rotation+180°`
  (flip-in-scale sends +x growth backward); the root *point* survives flip correctly. Fine for P1;
  matters only if a later WI relies on rooted growth-direction-under-flip.
