# ADR: One grid geometry core behind one anchor seam

- **Date:** 2026-07-05
- **Status:** Accepted (implemented)
- **Context doc:** [2026-07-05-architecture-review.html](./2026-07-05-architecture-review.html) (Candidate #1)
- **Tracking:** [../../grid-geometry-core-ORCHESTRATOR.md](../../grid-geometry-core-ORCHESTRATOR.md)

## Context

Grid's line-layout math was encoded **twice**. The faithful path
(`gridGeometry.gridLinePositions` → `latticeForLayer`, via `makeP5Random(seed)` +
`toSymmetryCount`) delivered jittered, symmetry-replicated crossings to the
motif-lattice modulation channel. The motif path (`semanticAnchors.gridAnchors`)
**re-copied** that math inline (its own `distribute()`) and degraded: anchors sat
on the ideal *pre-jitter* lattice, `symmetry>1` was not replicated (base copy
only), and `warp` returned null. Two encodings of one truth — a drift hazard, and
the motif subsystem was the honest-but-worse copy.

## Decision

Introduce **one pattern-owned geometry core** and route both consumers through it.

- **New core `src/lib/patterns/gridAnchors.js`** — `gridAnchorsCentered(params, rng, opts)`
  builds the four-role anchor set (`crossing`/`edge`/`tip`/`cell`) in the
  **centre-relative** frame, with jitter (from the injected `rng`) and full
  symmetry replication (copy `k` rotated by `θ = 2π·k/n + startAngle`; each
  anchor's `tangent`/`normal` add `θ`; `meta.copy`/`meta.theta` recorded). It
  **layers on top of** the untouched RNG core `gridLinePositions` (called once,
  reused across roles and copies) — Grid's on-canvas byte-identity is preserved.

- **Anchor seam (frozen contract):**
  `{ id, role, x, y, tangent, normal, s, meta }`.
  - **Coordinate frame is the discriminator.** The core emits **centre-relative**
    coords (offsets folded in). `latticeForLayer` (canvas-independent, so
    canvas==SVG) consumes them directly; the **motif adapter** applies the world
    translate `+canvasW/2, +canvasH/2` — matching the old `ox/oy`, so
    `placementEngine`'s world-space field mask/boundary are unchanged.
  - **Ids** carry a `:k` copy-suffix **only when `n>1`**; at `n===1` they are
    byte-identical to the pre-refactor ids (protects persisted, id-keyed motif
    overrides and keeps ids under the "byte-identical at jitter=0/sym=1"
    guarantee).

- **Consumers rewired:**
  - `semanticAnchors` grid case → thin adapter over the core; the `distribute()`
    replay is **deleted**. recursive/spiral/voronoi extractors are untouched.
  - `latticeForLayer` → consumes the core's `role:'crossing'` anchors (draw-flags
    coerced to 1 so the coordinate lattice is independent of stroking); its inline
    expansion is deleted. Public `{nodes, cellSize}` interface unchanged.
  - Motif now reproduces the **live-p5** jittered/symmetry lattice: the host seed
    threads `resolveMotifHost` (`hostSeed: host.seed`) → `MotifPattern` →
    `getSemanticAnchors(opts.hostSeed)` → `makeP5Random`. `AnchorGhostOverlay`
    passes the same seed so previews match placements.
  - `placementEngine` is **not restructured** — only its anchor source changed.

## Consequences

- **Byte-identity — pinned by a bridge invariant.** At `jitter=0, sym=1,
  startAngle=0`, core crossings === `latticeForLayer` nodes === (world-translated)
  the old motif anchors, for the same params/seed. Grid and extracted-lattice
  canvas/SVG output are byte-identical **always**; motif is byte-identical
  (geometry AND ids) at jitter=0/sym=1.
- **Motif gains parity by design.** For `jitter>0` or `symmetry>1`, motif anchors
  now sit on the real jittered lattice and replicate across symmetry copies — a
  deliberate improvement over the old degraded placement. `canvas==SVG` remains
  structural (one `generate()`, one matrix per placement, seed on both the visible
  and export paths).
- **One source of truth.** Grid layout lives in `gridGeometry` (RNG) +
  `gridAnchors` (roles); neither consumer can drift.
- **Follow-ups (not addressed here):** `voronoiAnchors` is no longer a dead branch
  (INT-7's `drawnEdges` producer is live; the legacy `drawnCells` path is the
  unused one — a delta from the review's pre-INT-7 snapshot); `straddleCheck`
  wiring unaudited; the `latticeForLayer` warp-guide edge is benign/unreachable
  (needs a resolved `mod.field`, absent on the raw guide). See the tracking doc.
