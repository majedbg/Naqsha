# Motif selection is a reorderable linear Chain, not a fixed pipeline and not a node graph

Motif anchor selection was a fixed, hard-coded stage order (roles → rate → skip →
density → field → overrides). To support Ableton-style composability (sequenced
glyph rhythms, repeated blocks, reordering rate vs skip), `binding.chain` becomes
an ordered array of Block instances the engine executes in stored order. We
deliberately stopped short of a node graph (split/merge/patch-cables): the
modulation system already chose flat edges over a graph for the same reason, a
graph demands a scheduler + cycle detection + graph-editor UI before the first
flower renders, and multi-branch routing is expressible by stacking multiple
motif layers on one host. Order is document state — the same Blocks reordered are
a different design — so determinism is preserved without hard-coding the order.

Consequences:

- The same Block type may appear more than once in a chain (stacked rhythms).
- Per-anchor include/exclude overrides are NOT a Block: they remain a fixed
  final say after the chain (exclude wins), so a user's canvas pin can never be
  buried under a reordered filter.
- Placement (orientation/jitter/sizing/acceptance) remains a fixed tail stage.
- Legacy `binding.selection` compiles lazily to a canonical chain
  (Route→EveryN→Skip→Density→Field, continuous cycling) that is byte-identical;
  documents rewrite to chain form only on the user's first block edit.
