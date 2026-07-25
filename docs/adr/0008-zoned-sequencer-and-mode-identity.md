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
