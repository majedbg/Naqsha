# Zones live inside the terminal Sequencer, and a mode's identity is its skeleton, not its glyphs

The Vine redesign ("flower at the ends, leaves along the body, each a small
sequence of its own") needs one motif to deal different glyph runs to different
structural positions on the host. The existing model said the opposite — the
Route glossary entry read "flowers on the border ring, leaves on the inner
tendrils is two motifs with two Routes." We rejected that shape (a preset that
silently spawns paired layers lies in the layer list, doubles every future
zoned preset, and makes mode-matching span layers) and rejected multiple
sequence Blocks per chain (the at-most-one-terminal-sequence invariant is
load-bearing in the rack editor and engine partition). Instead the single
terminal `sequence` Block gains optional **zones**: named partitions of the
survivor set (`apex`, `stem`), each with its own slots and its own cycle/random
deal. A flat `slots` array remains legal and byte-identical in behavior — zero
migration, and the other three starter chips stay flat.

Zone membership is structural, not role-jargon: **Apex** = path termini
(semantic hosts: `tip` anchors; edge-captured hosts: traversal-derived first/
last sample per polyline), filterable to both/upper/lower end — spatially, by
y-then-x lexicographic compare, never drawing order, which is invisible and
arbitrary on captured hosts. **Stem** = interior: `edge` samples ∪ `crossing`
junctions (botanically, nodes are where leaves sprout; excluding them would
punch holes at a grid's most prominent points). `cell` anchors belong to
neither (off the plant). Closed loops have no Apex — Stem covers them whole.
Cycle deals default zone-aware: Stem restarts per path (the x‑o‑x‑o invariant);
Apex indexes continuously across paths, because a per-path restart over ≤2
termini would pin every strand to slot 0 and "three flowers cycling" would
never visibly cycle.

Mode identity splits by preset kind, deliberately reversing modeMatch's
prior "a swapped slot glyph ⇒ custom" contract:

- **Zoned modes (Vine): identity = the zone skeleton.** Route + block
  structure + the {apex, stem} partition. Everything inside a zone — glyphs,
  slot counts, deal mode, end-selector, modifiers, rests — is the maker's
  content and never flips the mode.
- **Flat modes (Alternate x‑o, Sparse scatter, Border march): identity = the
  rhythm, glyph-agnostic.** Same canonicalization as before minus `glyphRef`:
  swapping the diamond for a dot keeps "Alternate x‑o"; deleting the rest or
  adding a slot is a new rhythm ⇒ Custom. Slots cannot be ignored wholesale —
  x‑o's identity *is* its two-step pattern.
- A zoned sequence never matches a flat chip, nor vice versa.

Switching modes must not destroy work: the motif layer carries a **modeCache**
(mode-id → stashed chain), mirroring the pattern-switch `paramsCache`
precedent. Applying a mode stashes the outgoing chain under its derived id and
restores the incoming mode's stash, falling back to the chip factory. Clicking
the lit mode is a no-op; clicking Custom restores the stashed custom chain;
only an explicit Reset re-applies factory (and clears that stash).

Consequences:

- Documents created before this ADR hold flat Vine chains; they render
  byte-identically but read as **Custom** (they genuinely aren't the new
  structure). Adopting the new Vine is one mode-click; the old chain is
  stashed under Custom, one click back. No auto-migration — migrating would
  silently change rendered artwork.
- The zoned Sequencer is generic machinery: future zoned presets (e.g. a
  tips-only Border march) are data-only chips, no engine work. A future
  `crossing`-specific zone would be named **Node** (botanically apt) and is an
  additive schema change.
- UI-facing zone names are **Apex/Stem** (see CONTEXT.md); internal anchor
  roles stay `tip`/`edge`/`crossing` — zones are built *from* roles but are a
  distinct, maker-facing vocabulary.
- The sequencer's single seed is shared by all zones (random deals are
  per-anchor-id hashes; zones cannot collide, so per-zone seeds are UI noise).

## Amendment — Cell is a third Zone (PRD #143, ticket #150)

The original decision put `cell` anchors off the plant: they belonged to
neither Apex nor Stem, and the zoned Sequencer rests every anchor it finds in
no Zone. That was coherent while every motif host emitted a path. It stopped
being coherent when Circle Packing became a host (#146) and emitted cells and
nothing else: a zoned mode on a cell-only host rests all of its anchors and
renders an empty canvas, with no error and no explanation. Measured on `main`
before this slice — the Vine chip on a default Circle Packing accepts zero
placements, while the flat Alternate x‑o chip on the same anchors accepts
eighty.

So the partition gains a third member. **Cell** = `cell` anchors: the enclosed
regions of the host — a packed circle, a tile, a face. It has its own Slots and
its own cycle/random deal, exactly as Apex and Stem do, and it shares the
block's single seed for the same reason they do. On a cell-only host a zoned
mode deals through the Cell Zone alone. On a mixed host Cell and Stem coexist:
tiles fill while arcs run. Unknown roles still fall to Stem — Stem remains the
lenient catch-all, and Cell takes only the `cell` role, because a Zone that
silently absorbed unrecognised anchors would make the partition unpredictable
on every future host.

A Zone is still what it was: a named partition of the survivor set by
structural position on the host, distinct from the internal anchor-role
vocabulary it is built from. Cell is that in the same sense Apex and Stem are —
it is not a role passed through to the maker. The end-selector stays Apex-only;
there is no upper or lower end of a region. Closed loops still have no Apex,
and a Sequencer with no Zones at all is untouched, still dealing one flat run
to every survivor, cells included. This is the additive extension the original
decision anticipated when it reserved **Node** for a future `crossing`-specific
zone — the same shape of change, arriving first for a different role.

Two consequences of the Cell Zone are not confined to the deal, and both are
part of this decision rather than incidental to it.

The first is the Route. A zoned chip draws all its Zones from one Route, so the
Route must admit the union of the roles they consume — and that union is now
"every role this host emits". The Vine's hardcoded `['crossing','edge','tip']`
was therefore not merely stale but load-bearing: on a cell-only host it
filtered every anchor away *before* the Sequencer ran, so the Cell Zone alone
would have fixed nothing visible. The Vine's Route is now sourced at create
time from the single params-aware host→roles capability seam, which is the same
seam the Route UI asks. A Route is still never rewritten on load.

The second is mode identity, and that is where the cost lands. A zoned mode's
identity is still its Zone skeleton, but the skeleton is now a set drawn from
three members, not two, so **a mode whose skeleton includes Cell is a different
mode from one that does not**. `{apex, stem}` and `{apex, cell, stem}` are
different modes and must not match. This is not new machinery — the canonical
form already compares a sorted zone-id list — but it is a new way for a stored
chain to read as Custom, and it follows the same rule this ADR already set for
pre-ADR flat Vines: no auto-migration, because migrating would silently change
rendered artwork. A maker whose Vine reads as Custom after this change has lost
nothing; the chain is intact and one mode click adopts the new skeleton, with
the old chain stashed under Custom by the modeCache.

Consequences:

- Documents with no Cell Zone are unaffected. A chain whose `zones` array holds
  only Apex and Stem still rests its cells, because the deal is driven by the
  configured Zones, not by the partition. The partitioner returning a third
  bucket that nothing reads changes no output. Asserted per cell-capable host,
  not once: cells sit contiguously at the *end* of a Grid's anchor list and at
  the *start* of a Truchet's, so a single-host regression would prove nothing
  general.
- The Zone lookup in the zoned deal stops being two hardcoded `find` calls and
  becomes a walk over one canonical zone-id list, so the reserved **Node** zone
  and any later partition are data, not another pair of statements.
- The per-Zone cycle default becomes a per-zone-id table rather than the boolean
  the two-Zone deal could get away with. Cell defaults to a per-path restart,
  like Stem; on today's cell hosts every anchor shares path 0, so the two
  defaults are observationally identical there. No Zone exposes `continuous` in
  the rack, so this is a code default for all three, not a control.
- The Sequencer shows only the Zones the host can fill. A cell-only host renders
  a Cell section and no Apex or Stem, because offering the maker two partitions
  that can never receive an anchor teaches the host wrongly. This is a view, not
  a write — the chain keeps every Zone it carries, so the skeleton, and
  therefore the mode, does not vary by host.
- A newly created Vine on a cell-capable host is NOT byte-identical to one
  created before this change: its Route now admits `cell`, so it places glyphs
  in the regions and, where a host emits cells before its edges, the extra
  survivors shift the jitter stream for the rest. That is the feature, and it
  applies at create time only; no stored chain is touched.
- The recognised zone ids are single-sourced beside the partition that produces
  them, so the partition and the deal cannot drift. There is still no schema
  validation of zone ids anywhere in the studio and an unrecognised id still
  rests its members rather than throwing — the pre-existing silent-blank failure
  mode, narrowed but not closed, and worth its own slice.
- CONTEXT.md gains a Cell glossary entry beside Apex and Stem, and the Zone
  entry stops enumerating exactly two. Cell is a deliberate, recorded exception
  to that entry's `_Avoid_: role` rule: the role/Zone separation holds for
  structures that are part of a path, and a region has no other name.
