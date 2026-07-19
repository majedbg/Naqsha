# Motif flow audit + UX research — July 2026

Full review of the motif feature (bugs + UX), the research behind the redesign
direction, and the three placement prototypes. Prototypes live in
`src/components/shell/motif-prototypes/` (throwaway, DEV-only, `?variant=A|B|C`
on the studio route).

## 1. Bugs found (code audit)

Ordered roughly by severity. File refs are as of commit `443fe82`.

1. **Selecting a motif layer yields a near-empty, dangerous Inspector.**
   No `motif` entry in `PATTERN_PARAM_DEFS`/`PATTERN_TYPES` (`src/constants.js`),
   so a selected motif layer shows only the PatternSelect chip — and picking a
   pattern there calls `changeLayerPattern` with no motif guard
   (`useLayers.js:708`): the layer keeps `type:'motif'` but renders as e.g. a
   grid with junk params. Trigger: click a motif row in the tree → pattern chip
   → pick anything.
2. **Deleting a host orphans motif layers silently.** `removeLayer`
   (`useLayers.js:652-673`) has no cascade; orphaned motifs render nothing and
   show no warning anywhere.
3. **`usedByCount` ignores Sequencer slots** (`useMotifEditor.js:32-34` counts
   only `params.glyphRef`) — an in-place Save restamps sequencer slots the
   badge claimed weren't affected.
4. **Stale `motifPick.blockIndex` after chain edits** — the armed canvas-pick
   target stores a positional index (`Studio.jsx:640`); removing/reordering
   blocks while armed can write picks into the wrong route block.
5. **Dangling `glyphRef` misrepresents the row** — select shows the wrong
   option, and Edit silently forks `MOTIF_GLYPHS.leaf` instead of the user's
   glyph (`useMotifEditorSession.js:109`).
6. **Library promote has no dedupe and no management UI** — duplicate inserts
   accumulate; `deleteUserMotif` is exported but never called; no rename.
7. **`deleteCustomGlyph` is dead code** (`useLayers.js:988`) — orphan glyphs
   bloat the document, localStorage, share links, and cloud saves forever.
8. **No feedback when `addMotifLayer` hits the layer cap** — chips and "+ Add
   Motif" ignore the `{ok:false}` return; taps do nothing silently.
9. **Motif editor modal**: incomplete focus trap (Tab escapes), and overlay
   click / Escape discard all pen edits with no dirty-state confirmation.
10. **Migration-not-applied hazard**: if `user_motifs` migration is unapplied,
    `useGlobalMotifLibrary` swallows the load error into state no UI reads —
    library silently empty, "Couldn't save" with no cause.
11. *(Minor)* refused `removeLayer` records a phantom no-op undo entry
    (acknowledged debt, `useGlyphCommits.js:122-124`).

## 2. UX friction (why the feature is missed)

- The entire feature hides behind a one-line, text-only `▸ MOTIF` disclosure,
  **collapsed by default** — and `SelectedLayerInspector` is keyed by
  `layer.id`, so the section **re-collapses on every selection change**.
- Split-brain: editing lives on the *host's* inspector, but the anchor-override
  ghost overlay activates only when the *motif layer* is selected — which lands
  on the empty inspector of bug 1.
- Pickers are bare native `<select>`s: no thumbnails in the list, swatch shows
  only `paths[0]` of the current glyph, library rows have no preview/delete.
- No empty-state invitation, no onboarding coverage, jargon wall
  (Route/Every N/Field · deferred), and a terminology collision with Extract's
  unrelated "motif".

## 3. Research takeaways feeding the redesign

Ableton (Live 12 manual + Eric Carl's design talk): pattern devices lead with a
**live visualization of their output** that doubles as the picker (Arpeggiator
style display + steppers); the device chain is a **persistent bottom strip**
that rebinds on selection; **hot-swap** links a device slot to a filtered
browser for modeless preview-before-commit (canvas keeps rendering = track
keeps playing); one **title-bar grammar** (enable · name · swap · save · menu)
learned once for every device; bypass ≠ delete.

Creative-tool libraries (Figma/Procreate/Illustrator/Blender/Spline + NN/g):
**the thumbnail is the name** — visual assets need visual pickers, text
dropdowns are the wrong control; **the current value is the picker's entry
point** (Figma instance menu); recents + pinned favorites; two access levels
(in-context swap flyout vs. full manage surface); empty states must sell the
feature; Illustrator's opt-in Symbols panel is the canonical "nobody opens the
drawer" failure (variant C tests this deliberately).

Sequence sweep (Majed's idea): a play transport that blinks instances in
placement order — with a cumulative dimming trail, adaptive timing (fixed
total duration, slow "learn" ramp on the first ~8 instances), and
step/scrub — makes ordering legible without permanent index labels. For a
plotter audience the order *is* the toolpath, so this doubles as an execution
preview. Prototyped as a simulated overlay (`SequenceSweep.jsx`); real
integration would read `placementEngine` output.

## 4. The three prototypes

Run `npm run dev`, open the studio, add `?variant=`:

- **A — Chain strip** (`?variant=A`): Ableton-style persistent device chain
  docked at the bottom of the canvas; thumbnail-led cards, fold/bypass,
  hot-swap popover with live hover preview, block chips inline.
- **B — Chip + flyout** (`?variant=B`): stays in the Inspector, but always
  open and thumbnail-first; the applied-motif chip is the swap entry point,
  opening a flyout with search/recents/set-tabs/grid + import/new/manage
  footer; starter-chip empty state.
- **C — Library rail** (`?variant=C`): browse-first Blender-style rail over
  the canvas left edge with drag-onto-canvas apply; applied motifs float as a
  chip tray on the canvas; rail collapses to test drawer discoverability.

All three share the sequence-sweep transport. Floating bottom pill (or ←/→
keys) cycles off→A→B→C→D. Screenshots + scraped reference images in the
session scratchpad.

- **D — Combined shell** (`?variant=D`, Majed's synthesis after reviewing
  A/B/C, 2026-07-19): B stays the per-layer editing surface in the Inspector
  ("motif as an effect chained on the layer"); C becomes the app-level
  browser behind a far-left **sidenav** (Layers / Motifs, Ableton-browser
  style) that swaps the left panel's content; the real ToolStrip re-homes to
  a rounded tab protruding onto the canvas. Drop rules: a compact read-only
  layer tree (eye toggles only) above the library is an explicit drop
  target; canvas drop applies to the selected host with a confirmation
  toast; while dragging, per-host badges appear on the canvas and hovering a
  badge highlights the matching mini-tree row (two-way validation).

**Verdict:** Majed picked B + C, synthesized as D, and confirmed it
(2026-07-19). A's chain strip is out as a placement.

## 5. Implementation (feat/motif-shell, 2026-07-19)

D is implemented for real on `feat/motif-shell` (prototype set preserved on
`proto/motif-ui-variants`):

- **Shell**: `LeftRailNav` replaces the ToolStrip in the w-12 rail
  (Layers / Motifs, persisted via `sonoform-left-surface`, `\` toggles); the
  real ToolStrip re-homes to a rounded tab over the canvas (same activeTool
  state). `MotifLibraryPanel` swaps into the object-tree slot on the Motifs
  surface: read-only mini drop-tree (eye only) + real library
  (built-ins / customGlyphs / user_motifs) with search + set tabs.
- **Drag-apply**: `MotifDropLayer` over the canvas — full-surface drop
  applies to the selected host, per-host badges disambiguate, badge hover
  highlights the mini-tree row. Apply path uses the shared
  `defaultMotifAddOpts` (extracted from the device so the two add paths
  can't drift) and folds library copy + layer-add into ONE recordBatch.
- **Device**: open by default, disclosure persisted (fixes the
  re-collapse-on-remount discoverability bug); the glyph `<select>` replaced
  by `GlyphPickerChip` (thumbnail chip → flyout with search / recents /
  set tabs / grid / Manage-library).
- **Audit bugs fixed**: 1 (pattern-swap guard + motif-layer info panel),
  2 (host-delete cascades adorned motifs), 3 (`usedByCount` now counts
  sequencer slots via `glyphUsage`), 6/7 partial (library + custom delete
  wired, use-count guarded), 8 (cap failures surface as a toast),
  10 partial (library load error surfaces in the panel).

**Still open** (tracked on the follow-up issue): bug 4 (stale
`motifPick.blockIndex` on chain edits), bug 5 (dangling `glyphRef` row
misrepresentation), bug 9 (editor modal focus trap + dirty-state confirm),
bug 11 (phantom no-op undo entry), hover hot-swap live preview (needs the
transient-glyph preview channel), the REAL sequence-sweep transport (read
placementEngine order; prototype proved the interaction), motif rows nesting
under hosts in trees, Extract "motif" terminology collision, onboarding
coverage, and whether the Motifs surface should also take the Operations
region.
