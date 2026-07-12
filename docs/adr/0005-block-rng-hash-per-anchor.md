# New motif Blocks draw randomness by hashing (seed, anchorId, channel); legacy jitter keeps its sequential stream

Two RNG idioms deliberately coexist in the motif engine. The pre-chain jitter
stage keeps its contractual sequential mulberry32 stream (exactly 4 draws per
survivor) so every existing document renders byte-identical. All NEW randomized
Blocks and Slot modifiers (weighted-random deal, per-slot rotation spread) derive
values as `mulberry32(hash(blockSeed, anchor.id, channel))` — a pure function of
the anchor, never of stream position. Rationale: with user-reorderable chains, a
sequential stream re-rolls every downstream anchor whenever any upstream
selection edit changes the survivor list, and the draw-N-even-when-bypassed
bookkeeping becomes permanent fragile ceremony. Hash-per-anchor gives locality —
anchors that survive an edit keep their random values — matching the per-path
restart principle. Do NOT "unify" jitter onto the hash convention: that would
visibly re-roll every jittered document on upgrade.
