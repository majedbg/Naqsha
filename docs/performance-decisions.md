# Performance as a Design Constraint in Naqsha — a decisions dossier

**Purpose.** Source material for a presentation on *how performance factors into
engineering decisions* in Naqsha — not "I optimized a loop," but the sharper story:
in a plotter/laser generative-art tool, **the physical output device sets the
performance budget**, and that budget resolves design arguments that would otherwise
be matters of taste. Each case below is a real decision with a receipt (ticket, file,
tolerance number).

**Framing for the talk.** The recurring move: *don't optimize to a vibe — optimize to a
physical threshold.* Naqsha renders for pen plotters and lasers, so "good enough" is not
subjective; it's one device dot. That single fact repeatedly (a) picks the algorithm,
(b) sets the constant, and (c) tells you when to *stop* optimizing — which is as
valuable as knowing when to start.

Companion dossier: [`workflow-tradeoffs-2026-07.md`](./workflow-tradeoffs-2026-07.md)
(how I *work*); this doc is how *performance* enters those decisions.

---

## Case 1 — Bézier flatten tolerance: the device dot picks the algorithm

**Context.** (Wayfinder map #99, ticket #106, Phase 2 warp-aware motif anchoring.)
When a grid pattern is *warped*, its straight lines become cubic Bézier curves. To place
motifs *on* those curves — and to intersect two of them for a crossing anchor — the curve
must be **flattened** into a chain of short straight segments (a polyline), because
segment math is cheap and curve math is not.

**The decision.** Fixed-step subdivision (always N segments) vs adaptive, flatness-based
subdivision (subdivide only while a segment deviates from the true curve by more than a
pixel tolerance).

**Where performance turned the argument.** Fixed-step looks simpler and faster to write,
but it optimizes the wrong thing:
- On a *gently* bent line it emits far more segments than needed → wasted points, wasted
  arc-length walking, for zero visible gain.
- On a *sharply* bent line it emits too few → visible facets, and worse, anchors drift
  **off the painted line**, so a motif floats beside the geometry it's supposed to sit on.

Warp curvature varies wildly across one field, so *any* single N is simultaneously too
fine somewhere and too coarse somewhere else. Adaptive subdivision spends points exactly
where curvature demands them — it targets a **quality guarantee** instead of a segment
count.

**The number, and why it's that number.** Tolerance = **≤ ~0.15px deviation at render
scale.** This is not a taste call — it's derived from the output hardware:
- Pen plotter line width ≈ 0.3mm; laser kerf is comparable.
- At the app's canvas→output scale, 0.15px sits **below one device dot**.
- Therefore the flattened polyline is *physically indistinguishable* from the true curve
  on the finished plot/engraving — and arc-length sampling stays even enough that motifs
  don't visibly bunch.

**The transferable lesson.** The plotter's pen width is what tells you *when to stop
subdividing*. Optimizing past one device dot buys nothing the eye or the pen can resolve;
optimizing short of it shows up as facets in the physical piece. Bind the constant to the
`catmullRomToBezier` render budget so captured, reconstructed, and painted geometry all
agree sub-pixel — one source of truth for "how smooth is smooth enough."

**Receipts.** Ticket #106 resolution; consumer inventory in `hostKinds.js`
(single-axis grid capture routing, `:99/:136/:116`); shared utility `flattenCubic(bezier,
tol)` feeds both `capturePolylines` (capture path) and the #105 reconstruction path.

---

## Case template (for future entries)

- **Context** — feature / ticket, and the geometry or interaction under load.
- **The decision** — the fork, stated as A vs B.
- **Where performance turned the argument** — what each option wastes or breaks.
- **The number, and why it's that number** — the physical / perceptual threshold the
  constant is derived from (device dot, frame budget, RNG stream, etc.).
- **The transferable lesson** — the reusable principle.
- **Receipts** — ticket, file:line, test delta.

<!-- Candidate future cases to write up when their decisions land:
     - RNG byte-identity under warp (#103): warp applied AFTER all noise/random
       consumption so the unmodulated corpus stays byte-identical — a *determinism*
       budget, not a speed budget, but the same "bind to a hard threshold" move.
     - Finite-difference frames at ε=1/512 (#104): 4 field calls per anchor chosen
       over an analytic Jacobian that doesn't exist — accuracy/cost traded explicitly.
     - Warp resolved on transient renderParams, never host.params (#101): a purity
       budget that keeps the pre-pass order-independent. -->
