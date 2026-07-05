# Grid Geometry Core — ORCHESTRATOR

> **RESUME RULE — read this first.** A fresh session MUST read this whole file
> before touching anything, TRUST the WI statuses in the table, SKIP any WI
> marked `done`, and continue from the first `pending`/`in-progress`/`blocked`
> WI. Update this doc BEFORE and AFTER every subagent dispatch — never batch.
> The orchestrator writes NO product code; subagents do, one writer per file.

## Goal (Candidate #1 — docs/architecture/decisions/2026-07-05-architecture-review.html)

Reconcile the two grid→motif placement pipelines into ONE geometry core behind
ONE anchor seam. Today Grid's layout math is encoded **twice**:

- **Faithful path** — `gridGeometry.gridLinePositions(params, rng)` (pure,
  RNG-injected core) → `latticeForLayer` consumes it with `makeP5Random(seed)` +
  `toSymmetryCount`, delivering jittered, symmetry-replicated `{x,y,angle}`
  crossings through the `'lattice'` modulation channel to
  ExtractedPatternGenerator.
- **Degraded replay** — `motif/semanticAnchors.gridAnchors()` RE-COPIES the
  layout math inline (its own `distribute()`), producing role-tagged anchors
  that are honest but degraded: **no jitter** (anchors on the ideal pre-jitter
  lattice), **symmetry>1 not replicated** (base copy only), **warp → null**.

**Target:** one pattern-owned geometry core → one anchor interface
`[{id, role:'crossing'|'edge'|'tip'|'cell', x, y, tangent, normal, s, meta}]` →
consumed by BOTH the lattice/modulation path (lattice nodes ≡ `role:'crossing'`
anchors) AND placementEngine/MotifPattern. Delete the `distribute()` replay.
`placementEngine.js` is deep and well-tested — do NOT restructure it; only change
where its anchors come from.

---

## Phase 0 — VERIFIED FACTS (2026-07-05, against merged main @ af1d0d6)

All three of the review's load-bearing claims **HOLD** against the post-merge code:

| Claim | Verified | Evidence (file:line) |
|---|---|---|
| semanticAnchors replays layout inline (own `distribute()`), NOT importing gridGeometry | ✅ HOLDS | `src/lib/motif/semanticAnchors.js:61-77` (`distribute`), `:85-273` (`gridAnchors`); no import of gridGeometry |
| Degradations documented: no jitter / no sym>1 / warp→null | ✅ HOLDS | `semanticAnchors.js:33-45` (header), `:102` (warp→null), `:118` (base-copy origin), crossings use un-jittered `xPositions` `:130-144` |
| latticeForLayer builds nodes from gridLinePositions + makeP5Random | ✅ HOLDS | `src/lib/fields/latticeForLayer.js:25-27` (imports), `:64-65` (rng+gridLinePositions), `:76-89` (symmetry-rotated nodes) |
| gridGeometry is the pure RNG-injected core | ✅ HOLDS | `src/lib/patterns/gridGeometry.js:35-75`; header freezes RNG call order/count `:14-15,:22-28` |

**Branch state:** all feature branches merged (`git branch -a --no-merged` empty).
Working tree clean apart from untracked `.playwright-mcp/*.yml` scratch files.

**Baseline reconciliation (IMPORTANT):** the initial full-suite run was RED (53
failed / 28 files) — root cause was a **stale `node_modules`**: merged commit
`04a62b9` added `@realness.online/potrace@2.1.25` which was never installed
(entire `@realness.online/` scope missing). This is NOT a merge code breakage.
`npm install` restored it (3 packages; `package-lock.json` unchanged) → suite
dropped to **1 flaky failure**. In-scope safety rails were 279/279 green both
before and after install.

### Known pre-existing issues (NOT this refactor's scope — do not read as regressions)
- **Flaky test:** `src/pages/AdminPage.test.jsx > platform Organizations section`
  fails in the full run but passes 6/6 in isolation (test-ordering flake).
- **27 lint errors** across ~25 unrelated files (`src/pages/Studio.jsx` unused
  `parseForPlacement`, `App.jsx` refs-during-render, shell components, hooks,
  `scripts/*.mjs`). None are in this refactor's six target files.

### Gate decisions (user-confirmed 2026-07-05)
1. **Test gate:** proceed on baseline; gate each WI on *in-scope suite stays
   green + NO NEW failures beyond the known flaky AdminPage test*.
2. **Lint gate:** DoD lint gate = *the six target files stay lint-clean and zero
   NEW errors introduced*. The 27 pre-existing errors are out of scope.

---

## FROZEN ANCHOR CONTRACT (WI-1 — freeze before any fan-out)

### The anchor object (unchanged shape — already the placementEngine contract)
```
{ id: string,
  role: 'crossing' | 'edge' | 'tip' | 'cell',
  x: number, y: number,          // see COORDINATE FRAME below
  tangent: number, normal: number, // radians; ROTATE with symmetry copy θ
  s: number,                       // arc-length param (role-specific)
  meta: object }                   // includes meta.junction for crossings
```

### COORDINATE FRAME — the discriminator (resolves the advisor's risk item)
The **geometry core emits CENTRE-RELATIVE (origin-centred) anchors**, offsets
folded in, symmetry copies rotated about the origin. Rationale:
- `latticeForLayer` is **canvas-independent by contract** (pure; consumer adds
  `canvasW/2,canvasH/2` so canvas==SVG — `latticeForLayer.js:14-18`). It must
  keep consuming a centred frame. So the core CANNOT be world-coord.
- The **motif seam** (`semanticAnchors.gridAnchors`) applies the world translate
  `x += canvasW/2, y += canvasH/2` (offset already folded into the centred
  coord) — matching today's `ox = canvasW/2 + offsetX` net position.
- `placementEngine` then sees world coords as it does today
  (`placementEngine.js:165` field mask, `:292` canvas boundary) — **no change**.

**Bridge invariant (the safety rail):** at `jitter=0, symmetry=1, startAngle=0`,
core `role:'crossing'` world positions == today's `gridAnchors` crossing
positions == `latticeForLayer` node positions + `(canvasW/2,canvasH/2)`, for the
same params/seed. Pin this FIRST (WI-1).

### SYMMETRY — lives in the shared core, not per-consumer
The core replicates every anchor across `toSymmetryCount(symmetry)` copies,
copy `k` rotated by `θ = 2π·k/n + startAngle` about the (offset) origin —
matching `latticeForLayer.js:76-89`. Each anchor's `tangent`/`normal` add `θ`;
`meta` carries the copy index `k` and `θ` so the lattice consumer can set
`node.angle = θ`. This is the parity win: motif gains symmetry replication.

**ID SUFFIX EXCEPTION (WI-2b):** anchor ids carry the copy index `:k` ONLY when
`n>1`. At `n===1` the id is `anchorId(role, …idParts)` with NO copy suffix —
byte-identical to the pre-refactor `semanticAnchors.gridAnchors` ids. Rationale:
byte-identity + minimized blast radius — the entire sym=1 corpus keeps its exact
ids (ids join geometry under the "byte-identical at jitter=0/sym=1" guarantee).
Gate on `n===1`, NOT `k===0` (at n>1 EVERY copy incl. k=0 must carry `:k`, else
the base copy collides with the sym=1 id). `meta.copy`/`meta.theta` are always
present (harmless extra keys — id-based resolution ignores them; do NOT strip).

### HALF-EXTENTS — layered on top of the core, not baked into it
`gridLinePositions` returns `totalW/totalH` but NOT `margin/halfW/halfH`.
Edges/tips/cells need `halfW = totalW/2 + margin`, `halfH = totalH/2 + margin`
(`semanticAnchors.js:115-116`). The anchor builder layers margin on top; the
RNG-injected core (`gridGeometry`) stays lean and untouched.

### GUARDRAIL — never edit gridGeometry's RNG
Grid on-canvas/SVG byte-identity hinges on `gridLinePositions`' exact
`random` call order/count (`gridGeometry.js:14-15`). The anchor builder LAYERS on
its output; it MUST NOT change the core's RNG. Jitter for anchors comes from
`xJittered/yJittered` (already produced by the core), NOT a new RNG draw.

### Provider location & dispatch (decision)
- New pattern-owned module `src/lib/patterns/gridAnchors.js` (geometry is
  pattern-owned; sits beside `gridGeometry.js`). Exports the centre-relative,
  jitter+symmetry-aware, four-role builder.
- `semanticAnchors.getSemanticAnchors` keeps its `patternType` dispatch;
  `gridAnchors` case becomes a thin adapter (call core → world-translate).
  recursive/spiral/voronoi extractors are **untouched, just routed** this slice.
- `latticeForLayer` derives its `{x,y,angle}` nodes from the core's
  `role:'crossing'` anchors; its PUBLIC interface (`{nodes, cellSize}`) stays
  stable for `resolveModulationForTarget` consumers.

---

## WORK ITEMS

| WI | Description | Mode | Writes (files) | Status | Notes |
|---|---|---|---|---|---|
| WI-1 | **BLOCKING.** Freeze contract (above). Build the `gridAnchors.js` core (full four-role, centre-relative, jitter+symmetry builder) + PIN invariants: bridge test (jitter=0/sym=1 core crossings+centre == lattice nodes; core crossings→world == today's semanticAnchors gridAnchors). | CHARACTERIZATION + RED-GREEN (new core) | `src/lib/patterns/gridAnchors.js`, `src/lib/patterns/__tests__/gridAnchors.test.js` | **done** | Seam: `gridAnchorsCentered(params, rng, opts)`. Bridge PASSED by construction (byte-identical to latticeForLayer nodes). 14 tests. `meta.copy`/`meta.theta` carry symmetry angle θ. Verified: 293 in-scope green, lint clean. |
| WI-2 | **(EXPANDED — see restructure note.)** Flip the WHOLE motif-grid seam to the core atomically: (a) `semanticAnchors.gridAnchors` → thin adapter over `gridAnchorsCentered` (delete `distribute()` replay; world-translate +cx/+cy; keep warp→null); (b) thread the host seed so motif reproduces the LIVE-p5 jittered/symmetry lattice — `resolveMotifHost` forwards `host.seed` as `hostSeed`, `MotifPattern` passes it into `getSemanticAnchors` via opts. | CHARACTERIZATION (jitter=0/sym=1 byte-identical to today) + RED-GREEN (jitter/sym parity, seeded via `makeP5Random`) | `src/lib/motif/semanticAnchors.js`, `src/lib/motif/MotifPattern.js`, `src/lib/motif/resolveMotifHost.js` (+ their tests) | **done** | recursive/spiral/voronoi untouched. Disjoint from WI-3. Jitter validated via WI-1 bridge (both `makeP5Random`), NOT a RecordingContext guard (RNG divergence). |
| WI-2b | **CORRECTION (discovered during WI-2 verify).** (1) Core `gridAnchors.js`: OMIT the `:k` copy-suffix in anchor ids when `n===1` so sym=1 grid ids are byte-identical to the old `anchorId(role,i,j)` (fixes orphaned persisted overrides; keep `:k` for n>1). (2) `AnchorGhostOverlay.jsx`: pass `{hostSeed: host.seed}` to `getSemanticAnchors` for grid — WI-2 made the render seed-jittered but the overlay still used `makeP5Random(undefined)`, so ghosts diverged from placements at jitter>0. (3) Revert WI-2's 4 `:0`-appended test lookups. | CHARACTERIZATION (id byte-identity at sym=1; ghost==render) | `src/lib/patterns/gridAnchors.js` (+test), `src/components/canvas/AnchorGhostOverlay.jsx`, `src/lib/motif/semanticAnchors.test.js` | **done** | Grid is in MOTIF_HOSTS (Inspector.jsx:555, overlay:38). Core: `suffixCopy = n>1`. Overlay:90 now passes `{hostSeed: host.seed}`. 8 test-lookup reverts. Verified 300 in-scope green, lint clean. |
| WI-3 | Re-express `latticeForLayer` so its nodes = core `role:'crossing'` anchors. Public `{nodes, cellSize}` interface stable. Lattice tests (invariant 2) stay green. | CHARACTERIZATION | `src/lib/fields/latticeForLayer.js` (+test) | **done** | Now consumes `gridAnchorsCentered({...params, drawH:1, drawV:1})` crossings → `{x,y,angle:meta.theta}`. Byte-identical across 7-case matrix incl. drawFlag=0. Dup math deleted. | Disjoint from WI-2 files. Run sequentially in main tree (WI-1 core is untracked → worktrees would miss it; sequential avoids shared-tree test races). |
| WI-4 | **(REDUCED — MotifPattern pointing folded into WI-2.)** Verify motif canvas+SVG output: byte-identical at jitter=0/sym=1, improved (jitter+sym) elsewhere, for a fixed seed/params host. Record follow-ups (do NOT fix here): `voronoiAnchors` is a production dead branch (no drawnCells producer); `straddleCheck` wiring. Do NOT restructure placementEngine. | CHARACTERIZATION | verification only (no product code expected) | **done** | CONFIRMED by inspection: `hostSeed` → `renderParams` (useCanvas:224) drives BOTH drawCtx + noDrawCtx generate() (useCanvas:208-210,230-239); MotifPattern build-resolves canvas+SVG from ONE matrix/placement → canvas==SVG structural; export re-runs nothing. Full suite 3622 green (incl. pipeline.e2e parity). Follow-ups below. |
| WI-5 | **Final, dedicated subagent.** Stale-test sweep: find/remove tests encoding now-changed behavior (anchors on ideal pre-jitter lattice, base-copy-only symmetry). Every removal justified in this doc. Full suite green after. | — | test files only | **done** | Audit found NO stale tests to remove (all grid tests were at baseline). Fixed 2 stale source-comment cross-refs in semanticAnchors.js ("mirroring Grid" limitation notes → Grid now has parity). `distribute()` replay confirmed fully gone. Safety-rail tests confirmed passing. Full suite 3622 green. |

**Parallelization:** WI-1 blocking (do alone). After WI-1 freezes, WI-2 and WI-3
touch disjoint files (`semanticAnchors.js` vs `latticeForLayer.js`) → may run
concurrently with worktree isolation. WI-4 after WI-2. WI-5 last, alone.

---

## KEY INVARIANTS TO PIN FIRST (before any refactor)
1. **Bridge test:** at jitter=0, symmetry=1, startAngle=0, core `crossing`
   positions == `latticeForLayer` node positions (same params/seed). Safety rail.
2. **Lattice stamping unchanged:** `latticeForLayer.test.js`,
   `ExtractedPatternGenerator.lattice.test.js`,
   `resolveModulationForTarget.lattice.test.js` stay green throughout
   (canvas/SVG output identical).
3. **Motif/placementEngine output** for fixed seed/params pinned before
   switching anchor source. NOTE: motif output is byte-identical ONLY at
   jitter=0/sym=1; jitter>0/sym>1 CHANGES motif rendering by design (the parity
   win) — WI-5 deletes tests that asserted the old degraded behavior.

## DEFINITION OF DONE (reconciled)
- Full suite green except the known-pre-existing flaky AdminPage test; in-scope
  suite green throughout.
- Six target files lint-clean; zero new lint errors (per gate decision 2).
- **Canvas AND SVG byte-identical for grid + extracted-lattice ALWAYS.**
- **Motif byte-identical ONLY at jitter=0/sym=1** (bridge invariant);
  improved-by-design (jitter+symmetry) elsewhere. DoD and WI-5 say the same thing.
- `distribute()` replay deleted from semanticAnchors.
- Final run-log entry summarizing seams created, deletion-test result, and
  follow-ups (voronoi producer, straddleCheck wiring).
- Append a short ADR to `docs/architecture/decisions/` (what/why/anchor-seam shape).

---

## FOLLOW-UPS (recorded, NOT fixed in this refactor)
1. **`voronoiAnchors` "dead branch" claim is STALE vs the review.** The review
   (pre-INT-7) said voronoi is a production dead branch (no drawnCells producer).
   Post-merge, INT-6/INT-7 added a producer: `VoronoiCells.motifHostGeometry` →
   `collectHostGeometry`/`hostGeometry` → `resolveMotifHost` forwards
   `drawnEdges`+`sites` → `voronoiAnchorsFromEdges`. So the boundary-hardened
   `drawnEdges` path IS reachable in production; the legacy `drawnCells` path is
   the one that stays unused. Not a blocker — recorded as a review delta.
2. **`straddleCheck` wiring.** `src/lib/motif/straddleCheck.js` reads placements
   (`{anchorId,index,x,y,radius}`) and is format-agnostic to the id change. Its
   wiring into the render/preview pipeline was NOT audited here (out of scope);
   verify whether it is consumed or a not-yet-wired module.
3. **Sym>1 grid-host override orphan (existing-project consequence).** WI-2b
   protected the `n===1` id (byte-identical → sym=1 saved overrides keep binding).
   The `n>1` analog is NOT protected by design: old motif anchors were base-copy
   only with ids `crossing:i:j`; new sym>1 ids are `crossing:i:j:k`. So a saved
   project with **string-id overrides on a symmetry>1 grid host** will orphan
   those refs (they re-bind spatially only if they carry coords; the overlay
   writes id strings). This is inherent to giving motif symmetry parity (the base
   copy is now one of n copies). Also: saved **jitter>0 / sym>1** grid-host motifs
   now render differently (motifs follow the jittered lattice / replicate across
   copies) — the intended fix, but a visible change to existing work. Surface to
   user before shipping; a migration (re-key n=1→n>1 overrides, or spatial
   fallback) is possible if needed.
4. **latticeForLayer warp-guide edge** (see WI-3 log): benign/unreachable —
   core warp→null needs a resolved `mod.field`, absent on the raw guide passed by
   `resolveModulationForTarget`. Would only activate with a resolved warp field
   on a guide, where refusing beats the old silently-wrong un-warped nodes.

## RUN LOG
- **2026-07-05 (orchestrator, session start):** Phase 0 complete. Verified all 3
  review claims hold (refs above). Diagnosed + fixed red baseline (stale
  node_modules → `npm install`). In-scope rails 279/279 green; target files
  lint-clean. User confirmed both gate decisions. Froze anchor contract
  (centre-relative core, symmetry in core, half-extents layered, RNG guardrail).
  Tracking doc created. Next: dispatch WI-1.
- **2026-07-05 (WI-1 done):** `general-purpose` subagent built
  `src/lib/patterns/gridAnchors.js` (`gridAnchorsCentered(params, rng, opts)`) +
  14 tests. Bridge invariant PASSED by construction — core `role:'crossing'`
  anchors byte-identical (===) to `latticeForLayer` nodes for the same
  params/seed (verified incl. jitter=6/symmetry=4/startAngle=27/offset case AND
  jitter=0/sym=1). World-translated crossings match today's
  `getSemanticAnchors('grid',…)` (motif parity pinned before WI-2 rewires).
  `gridLinePositions` called ONCE, reused across all roles+copies (RNG untouched).
  Integrated-tree verify: 17 files / 293 in-scope tests green; new files
  lint-clean; no product file outside the 2 new files touched. WI-2 + WI-3 now
  unblocked. NOTE: running WI-2/WI-3 SEQUENTIALLY in the main tree (not parallel
  worktrees) — the WI-1 core is untracked, so a `git worktree` wouldn't include
  it; sequential avoids that + shared-tree concurrent-test races.
- **2026-07-05 (WI restructure, orchestrator):** Discovered `getSemanticAnchors`
  receives NO seed, and `resolveMotifHost` drops `host.seed`. To give motif
  jitter parity the seed must be threaded (`makeP5Random(host.seed)`, matching
  the LIVE p5 canvas — like latticeForLayer). Threading + adapter must flip
  ATOMICALLY or an intermediate `makeP5Random(undefined)` regresses jitter>0
  hosts. So folded WI-4's "point MotifPattern at provider" into WI-2 (files:
  semanticAnchors.js + MotifPattern.js + resolveMotifHost.js — disjoint from
  WI-3). WI-4 reduced to verification + follow-up recording. Also confirmed NO
  existing grid test uses jitter>0/sym>1 (all at the baseline), so WI-2 breaks no
  existing test and only ADDS parity tests. Dispatching WI-2 (in-progress).
- **2026-07-05 (WI-2 done, needs WI-2b):** subagent flipped the motif-grid seam
  (semanticAnchors adapter over core + seed threading via resolveMotifHost →
  MotifPattern → `opts.hostSeed`). 116 scoped tests green, lint clean.
  Integrated verify: 298 in-scope green. Byte-identity confirmed at
  jitter=0/sym=1 for GEOMETRY. **Two follow-ups surfaced during verify → WI-2b:**
  (a) core appends `:k` copy-suffix to ids even at sym=1, changing grid ids
  (`crossing:0:0`→`crossing:0:0:0`) — orphans persisted string-id overrides
  (grid IS a MOTIF_HOST; overrides persist via useLayers→localStorage). Fix:
  omit suffix at n===1. (b) `AnchorGhostOverlay.jsx:90` calls getSemanticAnchors
  for grid WITHOUT hostSeed → after WI-2 the overlay ghosts (makeP5Random(undef))
  diverge from the seed-jittered render at jitter>0. Fix: thread hostSeed. Both
  are genuine WI-2-introduced regressions in a 4th consumer outside its 3-file
  scope. Consulting advisor before dispatching WI-2b (re-opens the frozen core id
  format + a persistence surface).
- **2026-07-05 (WI-2b dispatched):** Advisor endorsed WI-2b + required a
  SYSTEMATIC caller sweep before sign-off. `grep -rn 'getSemanticAnchors(' src`
  → complete PRODUCTION caller set = {`MotifPattern.js:63` (fixed WI-2),
  `AnchorGhostOverlay.jsx:88` voronoi (fine) + `:90` grid (WI-2b fix)}. NO third
  production caller (no separate export/thumbnail path). Everything else is
  tests/definition. Froze id-suffix exception in the contract (n===1 ⇒ no `:k`).
  Dispatched WI-2b CORE id fix by resuming the WI-1 agent (holds emission/id
  context) — running in background. Serializing: overlay fix + test-revert and
  WI-3 wait until the core edit settles green (they read the in-flux core).
- **2026-07-05 (WI-2b done):** Core id fix landed (resumed WI-1 agent):
  `suffixCopy = n>1`; sym=1 ids byte-identical to old (`crossing:i:j`), sym>1 all
  copies carry `:k`. Then a small agent fixed `AnchorGhostOverlay.jsx:90` (passes
  `{hostSeed: host.seed}` — ghost previews now match the seed-jittered render) and
  reverted 8 stale `:0` id-lookups in semanticAnchors.test.js. Integrated verify:
  **300 in-scope tests green**, all touched files lint-clean. Motif-grid seam is
  now fully on the shared core with jitter + symmetry parity, byte-identical
  (geometry AND ids) at jitter=0/sym=1. Next: WI-3 (latticeForLayer to core).
- **2026-07-05 (WI-3 done):** `latticeForLayer` re-expressed as a pure consumer
  of the core (`gridAnchorsCentered` crossings, draw-flags coerced to 1 so the
  coordinate lattice is independent of stroking — byte-identical to old for every
  param incl. drawFlag=0). Inline `gridLinePositions`+symmetry loop deleted. 24
  lattice-path tests green. **FULL SUITE on integrated tree: 337 files / 3622
  tests PASS, 0 failures** (even the previously-flaky AdminPage passed).
  WARP-GUIDE EDGE (follow-up, benign/unreachable): core returns null for
  `modulation.channel==='warp' && mod.field`; `resolveModulationForTarget:40`
  passes the RAW guide whose params carry no resolved `.field`, so the branch
  never fires — nodes produced identically. Would only ever activate with a
  resolved warp field on a guide, where refusing beats the old silently-wrong
  un-warped nodes. Next: WI-4 + WI-5.
- **2026-07-05 (WI-4 + WI-5 done — REFACTOR COMPLETE):** WI-4 confirmed by
  inspection that `hostSeed` reaches `generate()` on BOTH the visible and export
  paths (useCanvas:224 → shared `renderParams` → drawCtx + noDrawCtx), so
  canvas==SVG is structural. WI-5 audit: no stale tests removed; 2 stale source
  comments fixed; `distribute()` replay fully gone; safety-rail tests
  (bridge + motif characterization) present and passing. **FINAL FULL SUITE: 337
  files / 3622 tests PASS, 0 failures.** All product files lint-clean;
  `gridGeometry.js` RNG core UNTOUCHED (verified). ADR written:
  `docs/architecture/decisions/2026-07-05-grid-geometry-core-anchor-seam.md`.
  **Seams created:** `gridAnchors.gridAnchorsCentered` (geometry core); the
  frozen centre-relative anchor contract; `opts.hostSeed` on `getSemanticAnchors`.
  **Deletion result:** `distribute()` replay + inline grid layout removed from
  semanticAnchors; inline expansion removed from latticeForLayer.
  **Follow-ups:** see FOLLOW-UPS section. Changeset: 8 modified + 3 new (incl.
  this doc). NOT committed (awaiting user).
