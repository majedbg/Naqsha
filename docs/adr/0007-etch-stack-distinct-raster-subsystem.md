# The Etch Stack is a distinct raster subsystem, not the motif Chain

Naqsha already has a reorderable "rack of effects" abstraction: the motif **Chain**
of **Blocks** (ADR-0004), an ordered array of units an anchor stream flows through,
modelled explicitly on Ableton-style device racks. The Etch layer needs the same
*shape* — a reorderable, bypassable rack of tone/dither/halftone/paper steps — so
the obvious move is to generalize Chain/Block to span both domains. We deliberately
did **not**: the Etch Stack is a separate subsystem with its own vocabulary —
**Etch Stack** (the rack) of **Stages** (the units).

The two racks operate on fundamentally different streams. A motif Block filters and
annotates a discrete **anchor** stream (every-Nth, skip rhythm, sequencer slots); an
Etch Stage transforms a continuous **pixel** field (luma remap, error-diffusion,
screening). Their unit contracts, params, and engines share nothing but the "ordered
and reorderable" property. Generalizing Chain/Block would mean rewriting the locked,
anchor-specific glossary entries and ADR-0004 to mean two incompatible things, and
every reader of "Block" would have to disambiguate which domain is meant. Coining
new words keeps each glossary entry precise and lets the two engines evolve
independently.

Considered options:

- **Generalize Chain/Block to cover both anchors and pixels.** One mental model,
  fewer words — but forces a rewrite of ADR-0004's locked definitions and overloads
  "Block" across two engines that share no code. Rejected.
- **Fixed pipeline for the Etch (no reorder).** Cheaper, but loses the ability to
  place e.g. paper-texture before vs. after dithering (which visibly changes the
  result) and the Ableton feel the feature is built around. Rejected.

Consequences:

- `CONTEXT.md` carries a separate **Raster Etch** section (Etch / Etch Stack / Stage
  / Highlight Hold), with each term's `_Avoid_` naming the motif-Chain words it must
  not borrow (`Block`, `Chain`, `Pass`, `effect`, `filter`, `device`).
- The parallel structure is intentional and may invite a future consolidation; if
  one ever unifies the two racks, this ADR records that the split was a choice, not
  an oversight.
- **Highlight Hold** is explicitly *not* a Stage — it is a fixed terminal safety
  clamp outside the reorderable rack, so it can never be dragged out of the last
  position or bypassed.
