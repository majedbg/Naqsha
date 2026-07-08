# SVG Motif — P2 (pen editor) PLAN — 2026-07-08

Builds on committed P1 (import→customGlyph→place spine). Directive: **replicate the Illustrator/Figma
pen tool — same hotkeys, appearance, preview; do NOT deviate/invent.** P2 folds in P3 (draw-from-
scratch) per user: the editor does BOTH edit-imported AND draw-new. Design decisions: see
`svg-motif-editor-DECISIONS.md` (D5 live-preview, D6 working-copy + shared-edit, root=point+angle).

## Reference target
**Illustrator is the primary model** (canonical, richer; subsumes Figma). Figma parallels noted where
they add value. One coherent hotkey/behavior set = Illustrator. The ONE motif-specific addition beyond
a standard pen tool: the **root handle** (sprout point + growth direction) — no editor precedent, so
it gets a deliberate, clearly-distinct affordance.

## Architecture

### Spine: editable path model (`d` ↔ anchors)
Glyphs persist as SVG `d` strings (P1). Editing needs control points. New pure module
`src/lib/motif/pathModel.js`:
- `parseDToAnchors(d)` → `{ subpaths: [ { anchors: [{ x,y, in:{x,y}|null, out:{x,y}|null, type:'corner'|'smooth' }], closed } ] }`. Normalize ALL curve types to **cubic** anchors (Q/T→cubic elevation; L→null-handle anchors; A→cubic approximation via existing arc math). `type` inferred from handle collinearity (smooth = in/out collinear & mirror-ish; else corner).
- `anchorsToD(model)` → `d` (emit `M`, `C`/`L`, `Z`). Geometrically faithful (not byte-identical — normalization is lossy on representation, not shape).
- **Fidelity rule:** an UNEDITED glyph keeps its ORIGINAL verbatim `d` (we only serialize the model on Save AFTER an edit). So opening+cancel never rewrites geometry. Round-trip test: `parse→serialize→flatten` matches `original→flatten` within tolerance.

### Editor surface (new `src/components/motif-editor/`)
- **`MotifEditorModal.jsx`** — the large centered Photoshop-style frame. Chrome: title + "used by N
  layers" badge; **Cancel** (discard) / **Save** (commit → updateCustomGlyph → all N layers restamp) /
  **Save as copy** (fork new glyph, rebind current layer); **Preview** checkbox (toggles the mini
  full-canvas preview). Holds the WORKING COPY (a cloned glyph model); real doc mutates only on Save.
- **`PenCanvas.jsx`** — the interactive SVG editing surface: renders the working path (stroke +
  anchors + handles + root), hit-tests, drives drag/draw. Pan (space-drag) + zoom (scroll). Renders
  from the anchor model; a faint flattened preview underlay optional.
- **`penMachine.js`** (pure state) — the tool state machine (active tool, drag state, hover target,
  selection set) reduced over pointer/key events → new working-copy model. Pure = TDD-able without DOM.
- **`useMotifEditor.js`** — hook wiring machine + working copy + hotkeys + throttled mini-preview.

### Live preview (D5)
Editor canvas is live (single glyph, instant). The Preview checkbox shows a **mini full-canvas** render
of the whole pattern with the working-copy glyph applied, **rAF-throttled** (coalesce drags), rendered
from the working copy WITHOUT committing (feed a transient customGlyphs override into the existing
useCanvas seam, or an isolated render). Smooth on dense hosts.

### Store additions (P1 only had add)
`useLayers`: `updateCustomGlyph(id, glyph)` (Save), keep `addCustomGlyph` (Save-as-copy), optional
`deleteCustomGlyph`. Wire `addCustomGlyph`/updates into undo history (P1 left this deferred).

## Hotkey + behavior spec (Illustrator-faithful — LOCK before build)

| Key / gesture | Action |
|---|---|
| **P** | Pen tool. Click = **corner** anchor; click-**drag** = **smooth** anchor (symmetric handles); click the first anchor = **close** path; Esc/Enter = finish path. |
| **A** | Direct Selection — select/move individual anchors & handles. Click anchor to select; drag to move; drag a handle to reshape; marquee to multi-select. |
| **V** | Selection / Move — move the whole path. |
| **+** / Pen over a segment | **Add** anchor on the segment. |
| **−** / Pen over an anchor | **Delete** anchor (rejoins neighbors). |
| **Shift+C** | Convert Anchor — drag an anchor to pull symmetric handles (corner→smooth); click a smooth anchor to retract handles (smooth→corner). |
| **⌥ Alt/Option** (drag a handle) | Break tangent — move one handle independently (smooth→cusp). |
| **⌥ Alt** (click a smooth anchor) | Retract handles → corner. |
| **Shift** (while dragging/drawing) | Constrain to 45° increments. |
| **Space** (drag) | Pan the canvas. **Space** while placing a pen anchor = reposition that anchor. |
| **⌘/Ctrl** (held) | Temporarily switch Pen→Direct-Selection (Illustrator convention). |
| **Delete / Backspace** | Delete selected anchor(s). |
| **⌘/Ctrl+Z / ⇧⌘Z** | Undo / redo (scoped to the editor's working copy). |
| Double-click anchor (Figma-ism, additive) | Toggle corner↔smooth (a quick alt to Shift+C). |

### Appearance (Illustrator-faithful)
- **Anchors:** small squares. Unselected = hollow (paper fill + accent stroke); selected = filled solid accent.
- **Handles:** round dots joined to their anchor by thin **direction lines**; shown for selected/smooth anchors.
- **Path:** thin accent stroke; segment hover highlight; the closing segment previews while pen-drawing.
- **Cursor states:** pen shows add/delete/close/convert badges over the relevant target (or a clear hover highlight if custom cursors are impractical in P1).
- **Root:** a DISTINCT marker (e.g. a small ⊕/crosshair in a contrasting jewel tone) with a short
  rotatable **growth-direction arm**; drag the point to move, drag the arm to set angle. Clearly not an anchor.
- Colors from repo tokens (`styles/tokens.css`, light-mode default, jewel-tone) — Illustrator layout, Naqsha palette.

## Work items (waves; the editor is one coupled component → limited parallelism)

- **WI-P2-1 (parallel, pure):** `pathModel.js` — `parseDToAnchors` / `anchorsToD`, cubic-normalized, corner/smooth inference, fidelity round-trip tests. Independent → dispatch first alongside store.
- **WI-P2-1b (parallel, small):** store — `updateCustomGlyph`/`deleteCustomGlyph` in useLayers + persistence (rides existing customGlyphs surfaces from P1) + wire add/update into undo history. Disjoint from WI-1 files.
- **WI-P2-2 (seq):** `MotifEditorModal` shell — working copy, Save/Cancel/Save-as-copy, used-by-N badge, Preview checkbox, open from Inspector "Edit" button (built-ins → "Duplicate to edit"). No editing yet (renders the path read-only).
- **WI-P2-3 (seq):** `penMachine` + `PenCanvas` DIRECT-SELECTION — render anchors/handles, hit-test, drag anchors + handles (smooth symmetric, alt-break), marquee select, delete. Pure machine tested headless.
- **WI-P2-4 (seq):** Pen tool DRAW + structural edits — click/drag to add anchors, close, add/delete-on-segment, convert (Shift+C / alt), the folded-in draw-from-scratch. Hotkey map.
- **WI-P2-5 (seq):** Root handle (point + growth arm), pan/zoom, Shift-constrain, and the throttled mini full-canvas Preview wiring. Final integration + `npm run dev` gate.

## Guardrails
- Full `npm test` + `npm run lint` after each WI. Keep tree clean each step (auto-committer is ON per
  user — nothing unwanted should ride along). Worktree-isolate parallel WIs.
- Human gate (`npm run dev`): draw a path, edit an imported flower, move the root, watch the mini
  preview update on the real pattern, Save → all placements restamp, Cancel → no change.

## LOCKED confirms (2026-07-08)
1. **Illustrator-primary** hotkey/tool model (separate P/A/V, +/−, Shift+C, Alt-break, ⌘-temp-select,
   Space-reposition) + Figma's double-click-toggle-smooth as an additive bonus. Table above is the spec.
2. **Naqsha-aesthetic chrome via `/impeccable craft`** — Illustrator-faithful *behavior*, but the modal's
   visual skin uses the Naqsha design language (light-mode, jewel-tone, `styles/tokens.css` tokens),
   native to the studio. Run `/impeccable craft` for the chrome (WI-P2-2).
