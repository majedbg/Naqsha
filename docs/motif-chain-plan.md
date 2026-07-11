# Motif Chain — grilled plan (2026-07-11)

Rinceaux/arabesque-style sequential motif work: swappable glyph sequences
(x‑o‑x‑o), multi-motif routing to different parts of a host, and modular
chainable Blocks in the Ableton MIDI-effect spirit. Grilled with `/grill-with-docs`;
all decisions below are LOCKED unless marked open. Glossary terms (Chain, Block,
Sequencer, Slot, Rest, Route) are in `CONTEXT.md`; architecture decisions in
`docs/adr/0004` (linear chain) and `docs/adr/0005` (hash-per-anchor RNG).

## Locked decisions

- **D1 — Scope.** Two work items, sequencer platform first: (a) the Chain/Block
  platform built against existing hosts; (b) a dedicated vine/rinceau host
  pattern as a follow-up consumer (**needs its own grill** — stem generator
  shape, branching model, semantic anchors like spiral-end/node/mid-stem).
- **D2 — Chain model.** `binding.chain` = ordered array of Block instances;
  reorderable, repeatable, bypassable. Linear only — no split/merge. Placement
  (orientation/jitter/sizing/acceptance) stays a fixed tail stage. Per-anchor
  include/exclude overrides stay a fixed final say AFTER the chain (exclude
  wins), not a Block. (ADR-0004)
- **D3 — Slot schema.** Sequencer Slot = `{glyphRef, sizeScale?, rotationOffset?,
  flip?, rotationRandom?: {range, spread: 'flat'|'bell'}}` or `{rest: true}`.
  Modifiers ride multiplicatively/additively on the layer's base placement.
  Progressive disclosure: randomization controls appear only behind an "angle
  randomization" toggle per slot. `sizeScale` applies BEFORE acceptance — a
  bigger slot claims a bigger empty-circle footprint (greedy packing pushes
  neighbors away rather than overlapping).
- **D4 — Cycle scope.** All cycling Blocks (Sequencer, skip rhythm, every-Nth)
  restart their counter at each host path by default (each tendril starts at
  slot 0); each cycling Block has a `continuous` toggle for cross-path weaves.
  Anchors already carry `meta.pathIndex`. Legacy compile sets continuous.
- **D5 — Routing.** New Route Block = anchor roles + path scope (`all | closed |
  open | picked`). Picked paths are stored as pathIndex refs with the
  tolerate-dangling + spatial-rebind precedent from anchor overrides.
- **D6 — RNG.** New randomized Blocks/Slots: `mulberry32(hash(seed, anchor.id,
  channel))` — pure function of the anchor. Legacy jitter stream untouched.
  (ADR-0005)
- **D7 — Chain UI.** Block cards inside the existing Motif device (per motif
  row expands into the chain). Stack follows the Inspector dock orientation:
  vertical cards in right dock, horizontal Ableton-style flow in bottom-shelf
  mode (dock-state-through-portal-context already exists). dnd-kit reorder,
  ⏻ bypass, ⊕ add-block menu. Sequencer card shows a horizontal slot strip with
  glyph thumbnails; tap a slot to edit that glyph via the existing Motif Edit
  Session (session gains slot context for commit-back).
- **D8 — Hosts.** Fold #67 "arbitrary-edge hosts" in: any layer whose pattern
  emits polyline geometry is a legal edge-mode host (flowfield, wave, text,
  imports…), via drawn-geometry capture à la `collectHostGeometry`. Semantic
  anchors remain exclusive to grid/recursive/spiral/voronoi.
- **D9 — Migration.** Lazy compile: engine runs `binding.chain` when present,
  else compiles legacy `binding.selection` at read time into the canonical
  chain (Route→EveryN→Skip→Density→Field, continuous cycling, legacy jitter) —
  provably byte-identical (golden tests). Document rewrites to chain form only
  on the user's first block edit, as one undo entry. No migration pass, no
  version stamp beyond presence check.
- **D10 — Deal modes.** Sequencer ships Cycle + weighted Random. Per-slot
  weights are revealed only in Random mode. Random uses D6 hashing; the
  restart/continuous toggle scopes the hash namespace per path. No
  ping-pong/mirror orders in v1 (palindromes are authorable in the strip).
- **D11 — Presets.** 4–6 curated starter chips on the Motif device (e.g.
  Alternate x‑o, Vine 🌸‑🌿‑🌿, Sparse scatter, Border march), each pure chain
  JSON using built-in glyphs. User-saved chain presets deferred (glyph-ref
  portability across documents deserves its own grill).

## Block roster (v1)

Route · Every N · Skip rhythm (step-toggle strip) · Density · Field mask ·
Sequencer. All existing engine stages become Blocks; Sequencer is the only new
selection-stage capability, consuming the dormant `seqId` hook
(`placementEngine.js` `resolvePlacements`) and finally mapping it to glyphs in
`MotifPattern` (per-slot glyph resolution through the useCanvas glyph-injection
seam — slots reference customGlyphs/built-ins exactly like `glyphRef` today).

## Out of scope (v1)

- Vine/rinceau host pattern (WI-2, own grill).
- Save-chain-to-library presets.
- #67 remainder not folded in: straddle badge, paint-order.
- Node-graph routing (rejected, ADR-0004).
- Migrating legacy jitter to hash RNG (rejected, ADR-0005).

## Build-time notes

- Multi-glyph layers change `motifAutoName` ("Flower +2 on Voronoi 1"?) — decide
  in build.
- AnchorGhostOverlay: consider tinting ghosts per slot so the rhythm is visible
  pre-render (nice-to-have).
- Export: unchanged contract — `generate()` resolves all stamped geometry into
  `svgElements`; per-slot glyphs just vary the verbatim paths per instance.
- Determinism batteries: byte-identical legacy-compile golden; survivor-stable
  hash-RNG test (edit Every-N, assert surviving anchors keep values); per-path
  restart vs continuous goldens.
