# Motif Chain — Orchestrator Runbook

> **STATUS: READY (execution starting 2026-07-11).**
> **Spec:** `docs/motif-chain-plan.md` (D1–D11, LOCKED) · `docs/adr/0004` (linear chain) ·
> `docs/adr/0005` (hash-per-anchor RNG) · `CONTEXT.md` (Chain/Block/Sequencer/Slot/Rest/Route) ·
> issue **#79** · precedent signatures in `docs/motif-adorn-arch-brief.md`.
> **Working copy:** this checkout (`generative-art-studio/`), branch `feat/motif-chain` off `main`
> (`56dc32c`). In sync with origin/main; no concurrent session (only unrelated parked worktree
> `naqsha-zoom-ux`).

## Baseline (known-good start)

- `npm test`: **4318 passed | 54 skipped (4373); 382 files passed | 5 skipped.** Plus **1
  pre-existing order-dependent flake** in the org-admin suites (`AdminPage.test.jsx`
  "access denied") — FAILS only in full-suite ordering, PASSES in isolation and when its 3
  admin suites run together individually. **NOT caused by motif work; treat as baseline
  noise.** Gate on motif-targeted suites (green, no exceptions) + full-suite delta staying
  at exactly this 1 flake.
- `npm run build`: green (Vite) — builder re-confirms at each gate.

## Non-negotiable rules (from the prior motif build; unchanged)

1. **Subagents: sonnet or opus ONLY, never fable.** Default sonnet; opus for the chain
   executor, legacy-compile, sequencer, dual-emit, arbitrary-edge capture, and every
   adversarial review / integration-debug.
2. **ONE subagent at a time** — full build → test → adversarial review → commit before the
   next dispatch. Never parallel. Browser use serialized. **Do NOT use the Workflow tool**
   (the hook nudges are false matches).
3. **TDD every slice:** failing vitest first, implement to green. Tests colocate next to
   source (`src/lib/motif/__tests__` idiom or beside the module, matching neighbors).
4. **Gate after EVERY slice:** motif-targeted suites green + full `npm test` at baseline-delta
   + `npm run build` green.
5. **Commit per green slice** on `feat/motif-chain`, **explicit paths only — NEVER
   `git add -A`** (protect any untracked user files). Conventional commits:
   `feat(motif): …` / `refactor(motif): …` / `test(motif): …`. Reference #79 in bodies.
6. **Update this doc's slice log after EVERY slice.** Update the #79 checklist at phase
   boundaries.
7. Blocked on a human decision → record in "Deferred", skip, continue.
8. Every Bash git/npm runs from `generative-art-studio/` (shell cwd does not persist).

## Review independence (hard rule)

"Build → adversarial review → commit" means the reviewer is a **separate opus subagent with
fresh context**, NOT the builder reviewing itself. Flow per reviewed slice: builder
(build+test) → **independent** opus reviewer whose sole job is to PROVE it broken/dishonest →
orchestrator applies & validates fixes → commit → gate. A self-review folds nothing. (The
prior build's value — "caught 3 real green-but-broken bugs" — came from independent eyes.)

## The Sequencer's place in the pipeline (PIN — resolves a doc conflict; read before A2)

The `chain` array holds **selection filter blocks** (route/everyN/skip/density/field) AND the
single **`sequence`** block, but `sequence` is **terminal and not a filter**:
- **A2 `runSelectionChain` partitions the array:** run the selection filters (in stored
  order) + the post-chain override step; **pass the `sequence` block through untouched**
  (opaque/terminal). A2 never treats `sequence` as an anchor filter. Return
  `{survivors, orphans, sequence}`.
- **`sequence` is at-most-one and last.** The UI forbids a second sequencer and forbids any
  selection block *after* it (otherwise "repeatable blocks" makes an incoherent design). This
  is the answer to "can a block follow the sequencer / can there be two" — no.
- **A4 executes `sequence` in the placement stage** (the fixed tail, per ADR-0004),
  recomputing each survivor's per-path cycle index from `meta.pathIndex` (already present —
  no threading needed).
- **Rests drop BEFORE the acceptance/obstacle loop** so a rest leaves a real gap. A rest must
  NOT reserve footprint in `placed` — otherwise it silently shoves neighbors around, the
  opposite of an intended silence. Write a golden that pins this.

## Cycle vs Random are DIFFERENT invariants (read before A4)

- **Cycle mode is POSITIONAL:** slot = `slots[cycleIndex]`. Editing Every-N 2→3 shifts every
  downstream anchor's slot *by design* (the x‑o‑x‑o rhythm re-flowing). Cycle-mode tests
  assert positional behavior + that the per-path/continuous toggle changes the deal.
- **Random mode is PER-ANCHOR-ID-STABLE** (ADR-0005 survivor-stability): slot =
  weighted-draw(`hashRng(seed, anchorId, 'slot')`). Editing an upstream filter must NOT
  re-roll anchors that survive both before and after.
- **The per-path/continuous toggle is a CYCLE-mode control.** Because `anchorId` already
  encodes `pathIndex`, `hashRng(seed, anchorId, 'slot')` is already per-path-distinct — the
  toggle is a no-op in random mode. Do NOT invent contrived meaning for it there.

## Two correctness traps every review MUST target (carried from the prior build)

1. **Determinism contract:** assert *identical* output from same seed+inputs across two runs
   — not merely that output exists. New: **survivor-stability** — editing an upstream block
   must NOT re-roll hash-RNG values on anchors that survive both before and after (ADR-0005).
2. **Build-time geometry before dual-emit:** SVG export bypasses `ctx`; all geometry resolves
   at build time. Verify canvas-vs-SVG parity via `RecordingContext` — now **per-slot** (each
   Sequencer slot's glyph + modifiers must be byte-identical across canvas and SVG).

## The load-bearing migration invariant (D9)

`compileSelectionToChain(legacy)` must render **byte-identical** to today's `selectAnchors`
for EVERY existing binding. This is golden-tested over a sweep of legacy selection combos
(roles × rate × skip × density<1 × field × overrides). The ONLY RNG-consuming legacy
selection stage is **density** (sequential `mulberry32`); the compiled density block must
reproduce that exact stream (carry an explicit `rngMode:'sequential'` origin flag, or wrap
legacy selection opaquely — builder + advisor pick, the golden pins the requirement). New
density blocks added via UI default to `rngMode:'hash'` (ADR-0005). Legacy **jitter**
(placement stage) keeps its sequential 4-draws-per-survivor stream untouched — do NOT fold
it onto hash.

---

## PHASE A — pure engine core (headless, TDD, no UI, no browser)

### A1 — `hashRng` (sonnet)
New `src/lib/motif/hashRng.js` + tests. `hashRng(seed, anchorId, channel) → () => float[0,1)`
(FNV-1a or splitmix over the string `${seed}:${anchorId}:${channel}`, then mulberry32).
Contract: pure, deterministic, well-distributed, order-independent. Tests: same inputs ⇒ same
value; different channel/anchorId ⇒ decorrelated; reordering anchors doesn't change any
anchor's value. Reuse `mulberry32` from `patterns/rng.js`.

### A2 — chain selection executor (opus, INDEPENDENT adversarial review)
New `src/lib/motif/chain.js`. Block param schemas + `runSelectionChain(anchors, chain, opts)
→ {survivors, orphans, sequence}` (see "The Sequencer's place" PIN above — partition out the
opaque terminal `sequence` block; it is passed through, never filtered). Selection block
types: `route` (roles + path scope all|closed|open|picked[pathIndex refs]), `everyN`
({n,offset}), `skip` ({mask[]}), `density` ({density,seed,rngMode}), `field`
({field,threshold,invert}). Execute filters in stored order; skip bypassed blocks; a filter
type MAY repeat. **Per-path restart (D4):** cycling filters (everyN, skip) restart their
counter at each `meta.pathIndex` group unless `block.continuous`. **Overrides stay OUTSIDE
the chain** — a fixed post-chain include/exclude step (extract & reuse `resolveRef`/override
logic from `placementEngine.selectAnchors`; exclude wins; unresolved include → orphan). Tests:
per-block unit tests; order-matters (rate→skip vs skip→rate differ); repeated block; per-path
restart vs continuous goldens; picked-path routing; determinism; sequence passthrough intact.
**Review target:** the pipeline-order contract and the per-path grouping must not corrupt
input order or leak RNG across paths.

### A3 — legacy compile (opus, adversarial review)
New `src/lib/motif/compileSelectionToChain.js`. `compileSelectionToChain(legacySelection) →
chain`. **Byte-identical golden vs `selectAnchors`** across a generated sweep (the migration
safety net — this is the review's whole job). Engine accepts both shapes: chain present ⇒
`runSelectionChain`; else compile then run. Density RNG per the migration invariant above.

### A4 — Sequencer + placement modifiers (opus, adversarial review)
Extend the placement stage (`placementEngine.resolvePlacements` or a new `sequencer.js`
consumed by it) to read a `sequence` Block from the chain and deal **Slots** to survivors:
- **Cycle** mode: `slots[i % len]` per surviving anchor, **per-path-restart aware** (D4).
- **Random** mode: weighted draw via `hashRng(seed, anchorId, 'slot')` (D6/D10); restart
  toggle scopes the hash namespace per path.
- Slot → `{glyphRef, sizeScale, rotationOffset, flip, rotationRandom:{range,spread}}` or
  `{rest:true}` (rest ⇒ no placement, but still occupies a cycle step). Modifiers ride on the
  base placement: `sizeScale` multiplies `radius` **before** empty-circle acceptance (bigger
  slot claims a bigger footprint); `rotationOffset` adds to rotation; `rotationRandom` adds
  `spread(hashRng(seed, anchorId, 'rot'))` where spread ∈ {flat, bell(sum-of-2-uniforms)}.
  Wire the dormant `seqId`. Placement output gains `glyphRef` + resolved modifier fields.
  Tests: cycle rhythm, rest occupies a step, weighted-random distribution + survivor
  stability, sizeScale affects acceptance packing, bell vs flat spread shape, determinism.

## PHASE B — render integration (touches shared files; browser-verified)

### B1 — multi-glyph MotifPattern dual-emit (opus, dual-emit parity trap)
`MotifPattern.generate` resolves a **per-placement glyph** (from `p.glyphs` map injected by
useCanvas over customGlyphs+built-ins, keyed by slot glyphRef) and applies slot modifiers into
`placementMatrix`. Dual-emit canvas + SVG from the SINGLE matrix, **per slot**. useCanvas
glyph-injection seam injects the whole slot glyph set. **Adversarial per-slot parity test**
(independently parse emitted SVG matrix, apply to that slot's verbatim glyph `d`, compare to
canvas vertices — do NOT reuse the impl transform helper for "expected"). Back-compat:
single-glyph (no sequencer) path stays byte-identical.

### B2 — arbitrary-edge host capture (opus) — folds in #67
Generic drawn-polyline capture (à la `collectHostGeometry` / the Voronoi `motifHostGeometry`
seam) so ANY polyline-emitting layer (flowfield, wave, phyllotaxis, text, imports…) is a legal
**edge-mode** host. Add them to `MOTIF_HOSTS` (Inspector + AnchorGhostOverlay). Semantic
anchors stay exclusive to grid/recursive/spiral/voronoi. Order-independent pre-pass precedent:
`collectHostGeometry.js`. Browser-verify a motif on a flowfield host.

### B3 — chain wired end-to-end (opus, browser)
Thread the chain through `useCanvas` → `resolveMotifHost` → `MotifPattern`; per-path restart
carried; lazy-compile at the render seam. **Browser-verify the rinceaux demo:** Sequencer
x‑o‑x‑o (flower/leaf/rest) on a flowfield or spiral host — glyphs alternate along the stem.

## PHASE C — the rack UI (browser-verified)

### C1 — chain data plumbing (sonnet)
`motifLayer.js`: `binding.chain` schema helpers; deep-merge for chain edits; lazy-compile on
read; **rewrite legacy → chain form on first block edit as ONE undo entry** (D9). No version
stamp beyond presence check.

### C2 — Block rack in MotifDevice (opus, browser)
Per-motif-row expands into a Block stack: dnd-kit reorder (precedent: pattern-picker manual
sort), ⏻ bypass, ⊕ add-block menu, per-block cards. **Orientation follows the Inspector dock**
(vertical in right dock, horizontal Ableton-flow in bottom shelf — reuse dock-state-through-
portal-context). Works at 390px + iPad portrait.

### C3 — Sequencer card (opus, browser)
Horizontal slot strip: glyph thumbnails, add/remove/reorder slots (dnd), Rest chip. Cycle |
Random mode toggle; per-slot weight sliders revealed only in Random mode. **Progressive
disclosure:** an "angle randomization" checkbox per slot reveals range + spread (flat/bell).
Tap a slot → open that glyph in the Motif Edit Session (session gains slot context for
commit-back).

### C4 — Route card (opus, browser)
Roles + path scope (all/closed/open/picked). Picked paths via canvas click — reuse the
anchor-ghost override click infra + tolerate-dangling/spatial-rebind precedent.

### C5 — starter chips (sonnet, browser)
4–6 curated chain-JSON chips on the device (Alternate x‑o, Vine 🌸‑🌿‑🌿, Sparse scatter,
Border march) using built-in glyphs. Data-only; one tap populates chain + slots.

## PHASE D — hardening + final review

### D1 — export/undo/persistence (opus, browser)
Golden + browser verify: multi-glyph SVG export; chain edits ride `updateLayer`/undo; chains
persist + reload; legacy docs open unchanged then upgrade-on-edit as one undo entry. Optional:
AnchorGhostOverlay per-slot tinting.

### D2 — whole-diff adversarial review + handoff (opus)
Whole-diff honesty battery (determinism, survivor-stability, byte-identical legacy compile,
dual-emit per-slot parity, no input mutation). Fix findings. Final handoff report; update this
doc + #79.

---

## Deferred (needs human / own grill)
- **Vine/rinceau host pattern** (WI-2) — own grill (stem generator, branching, semantic
  anchors spiral-end/node/mid-stem).
- Save-chain-to-library presets (glyph-ref portability grill).
- Node-graph routing (rejected, ADR-0004). Migrating legacy jitter to hash (rejected,
  ADR-0005). #67 straddle badge + paint-order.
- DB migrations / tier gating — none expected (chains persist via the existing layer path).

## Slice log (append after EVERY slice: status · commit · test count · decisions · open issues)
- 2026-07-11 — Setup: grill complete; ADR-0004/0005, plan, CONTEXT glossary, this runbook
  written; issue #79 created; baseline captured (4318 green + 1 known admin flake, build
  green). Branch `feat/motif-chain` cut (`c61f0e7` docs, `3dffa9b` runbook refinement).
- 2026-07-11 — **A1 hashRng DONE** (`65f4b50`, 12 tests). `hashRng(seed, anchorId, channel)`
  = FNV-1a→mulberry32; pure per-anchor, order-independent. Motif suite 357 green, build green.
  Sonnet-built, orchestrator-verified (no separate review — small foundational slice). Note
  for A2: arg order is `(seed, anchorId, channel)`; hold one generator if drawing multiple
  times per anchor; channel strings are unvalidated namespace tags (keep to 'slot'/'rot').
- 2026-07-11 — **A2 chain selection executor DONE** (`5663574`, 43 tests, motif suite 400
  green, build green). `runSelectionChain → {survivors, orphans, sequence}`; blocks
  route/everyN/skip/density/field; per-path restart via true positional per-pathIndex counter
  + `continuous` toggle; sequence partitioned out (terminal, by-reference). `resolveRef`/
  override logic extracted to new `overrides.js`, shared with placementEngine (its tests
  unchanged+green). density `rngMode:'sequential'` byte-identical to selectAnchors.
  **Independent opus review: SOUND** (1600 fuzz cases, zero divergence incl. orphans).
  **Forward-notes:** (a) **A3 compile MUST emit `continuous:true` + `seed` on cycling
  blocks** or multi-path density stream diverges; canonical order route→everyN→skip→density→
  field; new UI density defaults `rngMode:'hash'`, compiled density is `'sequential'`.
  (b) **C4 Route card must NOT offer `closed`/`picked` on semantic-anchor hosts**
  (crossing/tip/cell lack `meta.closed`/`meta.pathIndex` ⇒ those scopes empty the selection);
  `open`/`all` are safe. Returned `sequence` is by-reference, at-most-one (first wins).
- 2026-07-11 — **A3 legacy compile DONE** (`007622c`, 24 tests, motif suite 424 green, build
  green). `compileSelectionToChain(legacy) => {chain, overrides}` (canonical route→everyN→
  skip→density→field, `continuous:true` cycling, `rngMode:'sequential'`+`seed` density);
  `resolveSelection(binding, anchors, opts)` = the both-shapes render seam (runs
  `binding.chain` if present else compiles `binding.selection`, threads overrides via opts).
  600-case byte-identity fuzz vs real selectAnchors. **Independent opus review: SOUND** (3000
  more fuzz cases zero divergence, mutation-verified the fuzz bites; null-coercion edge proven
  unreachable — fix site if ever reachable is the writer or selectAnchors, NOT compile).
  **For A4/C1:** consume `{chain, overrides}` (overrides NOT in the chain array); compiled
  density stays `'sequential'` on C1 rewrite, only NEW UI density blocks default `'hash'`.
  `resolveSelection` returns `{survivors, orphans, sequence}` (sequence by-reference for A4).
- 2026-07-11 — **A4 sequencer + modifiers DONE** — **PHASE A COMPLETE** (`a70e968`,
  82 tests, motif suite 454 green, build green). New `sequencer.js` `dealSlots(survivors,
  sequence) → Assignment[]`; `resolvePlacements` consumes it. Sequence block
  `{type,mode:'cycle'|'random',continuous?,seed?,slots[]}`; Slot `{glyphRef, sizeScale?,
  rotationOffset?, flip?, rotationRandom?:{range,spread:'flat'|'bell'}, weight?}` or
  `{rest:true,weight?}`. sizeScale multiplies target radius BEFORE acceptance (no-overlap
  invariant preserved: only naturalTarget scaled, never the margin*R cap). Rest draws its 4
  jitter values then early-returns before `placed.push` (reserves no footprint; `rejected`
  reason `'rest'`). Cycle=positional/per-path-restart; Random=hashRng per-anchor-stable,
  continuous is a no-op there. **Independent opus review: SOUND** (byte-identity vs
  reconstructed pre-A4 engine over 900 fuzz cases; no-overlap over 500 layouts; bell/flat
  bounded). **For B1/B3:** the sequence block MUST be set on `placement.sequence` (object
  form) or the sequencer stays dormant & silently single-glyph. `glyphRef` present IFF
  sequenced — key per-instance resolution off `'glyphRef' in p`, not truthiness. Modifiers
  already folded into radius/rotation/flip — B1 renders the resolved glyphRef at the matrix,
  no re-applying. `seqId` is a number on sequenced placements; `rejected` may carry `'rest'`.
- 2026-07-11 — **B1 multi-glyph MotifPattern DONE** (`f7725b1`, +10 MotifPattern +1 useCanvas
  tests; motif+useCanvas 467 green, build green). generate() now runs
  `resolveSelection(binding,anchors,{canvasW,canvasH,overrides})` → `resolvePlacements(survivors,
  {...placement, sequence-when-truthy}, {boundary})` → per-placement glyph resolved from injected
  `p.glyphs` map (base + every slot ref; useCanvas builds it, isMotifLayer-gated) → single-matrix
  dual-emit. Per-glyph viewRadius/root. Legacy no-sequence byte-identical. **Independent opus
  review: SOUND** (21+ legacy cases byte-identical incl field/overrides/string-array no-clobber;
  per-slot canvas==SVG parity holds). Touched shared `useCanvas.js` (additive+gated). **Seam for
  C1:** chain-mode overrides read from top-level `binding.overrides` (B1's choice; C1 owns the
  final schema). Nit (non-blocking): fully-stripped-base-glyph runs the pipeline before skipping
  (zero observable divergence).
- 2026-07-12 — **B2 arbitrary-edge host capture DONE** — folds in #67 (`68e2924`, +33 tests:
  new capturePolylines 10 / hostCapture 13 / hostKinds 5, +drawingContext 3 / resolveMotifHost 4;
  motif+useCanvas 488 green (was 467), full suite 4470 passed 0 failed, build green). B1 built
  the CONSUMER (edge-mode `p.hostPaths`); B2 is the PRODUCER. **P5Adapter record mode**
  (`{draw:false, record:true}`): records line + beginShape/vertex/endShape + push/pop/translate/
  rotate/scale into `this.calls` (transforms record EVEN under draw:false — the fix) while RNG/
  noise/color still delegate to live p5 (no-divergence, same guarantee as the voronoi probe). New
  pure **`capturePolylines.js`** folds the recorded calls through a 2D-affine CTM stack →
  `[{points,closed}]` absolute coords (single home for the matrix math; closed iff `endShape(CLOSE)`).
  useCanvas prepass probes edge hosts via the existing order-independent `collectMotifHostGeometry`;
  `resolveMotifHostParams` forwards `{anchorMode:'edge', hostPaths}`, injected once at generate-time
  (canvas/SVG parity automatic). New **`hostKinds.js`** centralizes SEMANTIC_/EDGE_/MOTIF_HOSTS;
  Inspector uses the union (edge hosts selectable, roles→`['edge']`), **AnchorGhostOverlay stays
  semantic-only** (getSemanticAnchors null for edge hosts → widening = silent no-op ghost; generic
  edge ghost DEFERRED). **Edge hosts added** (verified emit polylines + reseed at generate() top):
  `flowfield, wave, spirograph, topographic, phyllodash, diffgrowth, dendrite`. **Excluded, NOT
  added** (structurally unreachable by the adapter prepass): `text` (drawTextNode) + `import`
  (ImportedPath) — bespoke follow-up. **Independent opus review: SOUND** (hand-derived affine
  fixtures cross-checked off-impl; per-host reseed audit of all 7; 2 mutation checks — rotate-sign
  + host-reseed deletion — each flipped a red test then reverted; full suite re-run 4470/0).
  **Browser-verified** a motif on a flowfield host (glyphs stamp along the flow trails; hiding both
  host layers left only the motif tracing the swirl → capture + absolute-coord fold + z-order-
  independent prepass all proven). **v1 limits (documented, match voronoi precedent):** symmetry
  N>1 captures all N drawn copies; modulated edge host diverges (probe uses base params); capture is
  pre-`applyNodeTransform` (matches paint only at identity — same limit semantic hosts have).
  **For B3:** `hostPaths` + forced `anchorMode:'edge'` already in place; thread the chain/Sequencer
  through edge hosts. **Open seams:** `bezierVertex`/`curveVertex` not recorded (no in-scope host
  uses them); generic edge-anchor ghost preview deferred.
- 2026-07-12 — **B3 chain wired end-to-end DONE** — **PHASE B COMPLETE** (`c1920fb`, +7 tests,
  motif+useCanvas 502 green (was 495), build green). **VERIFICATION slice — NO production code
  changed.** The chain data path was already wired by B1/B2: `binding` rides `layer.params.binding`
  → `MotifPattern` reads `p.binding` (via the normal `renderParams = layer.params` spread) →
  `resolveSelection` lazy-compiles legacy `binding.selection`→chain at the render seam (D9);
  per-path restart (D4) keys off `meta.pathIndex`, which B2's multi-path edge hosts now supply.
  New `chain.e2e.test.js` is the regression LOCK: full pure pipeline on a synthetic 2-path host
  (path 0 = 5 anchors, cycle len 3 flower/leaf/rest) pins the ONE non-trivial boundary — path 1's
  first slots differ between default per-path restart (fresh slot 0) and `continuous:true`
  (mid-cycle global index) — via glyph-IDENTITY swap, not presence; + Rest consumes a step (gap,
  no shift), twice-run determinism over full svgElements, and D9 legacy==compiled-chain parity
  through the seam. **Independent opus review: SOUND** — full `normalizeBinding` caller trace
  proves it strips `.chain` ONLY at motif CREATION (`addMotifLayer`), never on load
  (`migrateLayer` leaves `params.binding` untouched) or update (shallow merge), so a chain written
  to `params.binding.chain` survives to render (**the C1 deferral is legit, not hollow**); both
  per-path mutations (force continuous / ignore pathKey) go red; FlowField continuity claim honest
  (`beginShape/vertex`, one path per streamline → per-path restart genuinely fires per stem).
  **Browser-verified** the rinceaux demo: chain seeded programmatically (no authoring UI yet —
  C3/C5) into `params.binding.chain`, rosette/leaf glyphs stamp with rest gaps along the flowfield
  trails. **Seams for C1:** `normalizeBinding` (motifLayer.js) must be extended to PRESERVE `.chain`
  (currently drops it — fine today since only creation normalizes, but C1's "rewrite legacy→chain
  on first block edit as one undo entry" must write + keep `.chain` through the layer/undo path);
  chain-mode overrides still read from top-level `binding.overrides` (B1 placeholder — C1 owns the
  final schema). **Coverage seam for D2:** end-to-end holds BY COMPOSITION (this test = MotifPattern
  boundary; B1 `useCanvas.motif.test.jsx` = `binding.chain`→`params.glyphs` injection; browser demo
  = real multi-path capture). No single headless test spans useCanvas `capturePolylines` → multi-path
  boundary; D2 may add one (needs jsdom+p5, like useCanvas.motif.test.jsx).
- 2026-07-12 — **C1 chain data plumbing DONE** — PHASE C begun (`34058ec`, +19 tests, motif+
  useCanvas 521 green (was 502), build green, full suite 4496 passed 0 failed). Pure layer/
  authoring-side primitives in `motifLayer.js` (render seam untouched — it already lazy-compiles
  from B3). **`normalizeBinding` now PRESERVES chain-form** (the B3-flagged bug): chain binding
  round-trips `{chain, overrides?, placement}`; legacy stays `{selection, placement}` byte-
  identical; shapes never coexist (D9 — presence check, no version stamp). **`readChain(binding)`**
  = lazy-compile-on-READ (chain if present else `compileSelectionToChain(selection).chain`) so the
  rack renders Blocks uniformly; tolerates empty/undefined. **`ensureChainForm(binding)`** = first-
  edit rewrite primitive, idempotent when already chain-form (same ref), else new chain-form via
  compile with **`selection` DROPPED** (genuine transition, not overlay — a stale selection would
  silently re-diverge + confuse the presence check). Never mutates. **`deepMergeBinding`** confirmed
  correct for chain edits (array replaces wholesale). **Sonnet-built, ORCHESTRATOR-verified** (no
  adversarial-review annotation, like A1; compiled-chain byte-identity is A3's reviewed job; undo/
  persistence gated end-to-end at D1) — read the diff + runtime-checked undefined/idempotent/no-
  mutation invariants. **HANDOFF TRAP for C2 (mutual-exclusivity):** on a first block edit, C2 MUST
  `ensureChainForm(old)` BEFORE `deepMergeBinding(base, patch)` — deepMergeBinding never deletes
  keys, so merging onto the RAW legacy binding RESURRECTS the dropped `selection`. Flow:
  `base = ensureChainForm(old); next = deepMergeBinding(base, patch); updateLayer(id, {params:{...
  layer.params, binding: next}})` → one coalescing undo entry. Per-block authoring mutators
  (add/remove/reorder/bypass, slot edit) are C2/C3, built on these primitives.
- 2026-07-12 — **C2 Block rack DONE** (`1404347`, +~44 tests: new chainEditor 17, rack/Inspector
  motif suite grown to 28; shell+motif 909 green, components 924 green, build green). Each motif
  row's fixed selection controls → an expandable Ableton-style **Block stack** over the chain.
  New pure **`chainEditor.js`** (reorder/add/remove/bypass/setBlock; every op returns INPUT ref
  unchanged on reject/no-op — the contract the one-undo guard keys off) + new **`MotifBlockRack.jsx`**
  (DndContext/SortableContext à la PatternGalleryView; cards from `readChain`; functional everyN/
  skip/density/field cards, minimal route/sequence shells; dock orientation via
  `useInspectorDockContext` — bottom→horizontal, right/null→vertical). Inspector MotifDevice renders
  the rack; **Size/Flip kept as a fixed Placement footer** (placement is a fixed tail, ADR-0004, not
  a chain block). **Sequence-terminal invariant triple-guarded** (canAddBlock forbids 2nd sequence;
  addBlock splices selection blocks BEFORE any sequence; reorderChain rejects if sequence not last;
  menu hides Sequencer when one exists). **First-edit-as-one-undo** (C1 trap): `editChain` =
  `ensureChainForm(old)` → `deepMergeBinding(base,{chain})` in ONE onUpdateLayer, with a
  `nextChain === base.chain` guard so a rejected drop/forbidden add neither migrates a legacy
  binding nor burns a phantom undo entry; Size/Flip keep legacy legacy. **Independent opus review:
  SOUND** (invariant + one-undo mutation-tested — reorder-reject + raw-binding-merge each turned
  tests red then reverted; same-ref contract per op; no shared-Inspector regression). **Browser-
  verified**: add/bypass/reorder, menu forbids 2nd sequencer, one-click undo of a chain edit, both
  dock orientations, no horizontal overflow at 390/768px. **Coverage notes:** rack renders at 390px
  via MobileStudio's null-dock vertical path (RTL-tested) — only in-browser touch-drag reorder at
  mobile width unverified; the `editChain` no-op guard is proxy-tested (jsdom can't drive a rejected
  dnd drop). **For C3:** flesh the `sequence` card (slot strip, cycle/random, per-slot weights,
  angle-randomization progressive disclosure; tap-slot → Motif Edit Session with slot context).
  **For C4:** flesh the `route` card path-scope atop the existing role checkboxes — **must NOT offer
  `closed`/`picked` on semantic-anchor hosts** (A2 note). `field` block inert until a source is wired.
  (Note: `rm -rf .playwright-mcp` mid-slice briefly deleted tracked verification screenshots from
  earlier P-slices — restored via `git checkout`; browser-verify scratch `.yml` are untracked, just
  don't stage them.)
- 2026-07-12 — **C3 Sequencer card DONE** (`a9372db`, +29 tests; shell+motif 929 green, hooks+
  components 1170+ green, full suite 4549 passed 0 failed, build green). Fleshed C2's minimal
  sequence shell into the full authoring UI over the A4 sequence block; all edits ride C2's one-undo
  editChain path. **Slot strip** (SortableSlotChips: glyph thumb / dashed REST chip, grip, remove;
  +Glyph/+Rest), **Cycle|Random toggle** (Continuous shown only in Cycle — no-op in Random per PIN),
  **per-slot weight sliders ONLY in Random** (Rests included), **per-slot angle-randomization**
  progressive disclosure (±° range + flat/bell spread → rotationRandom). New pure chainEditor slot
  helpers (addSlot/removeSlot/reorderSlots/setSlot/setSlotGlyphRef, same-ref-on-no-op, rebuild via
  setBlock). **Nested dnd** isolated (slot strip = own DndContext+sensors, `slot-${i}` namespace,
  grip-only listeners — dragging a slot never moves its block). **Tap-slot → Motif Edit Session with
  SLOT context** (advisor-scoped narrow): `open(layerId, glyphRef, {slotIndex})`; custom slot edits
  in place (no rebind), built-in slot forks → Save rebinds THAT slot via new
  `useGlyphCommits.commitNewGlyphToSlot` — glyph-add + slot-rebind in ONE recordBatch, seqIndex fresh
  at commit, aborts before any write if layer/seq/slot gone (no orphan). Base Edit byte-identical
  when slotIndex absent (additive); also fixed `saveAsCopy` (previously always forked the base).
  Verified A4 random deal already guards zero-sum/all-Rest (returns slot 0); no spurious weight-freeze
  (weight edits ≠ ADR-0005 concern). **Independent opus review: SOUND** (fork-rebind + one-recordBatch
  + fresh-seqIndex + abort-before-write; base-rebind & `from===to` mutations each red then reverted;
  additive back-compat via caller grep). **Browser-verified** on rinceaux flowfield: add glyph/rest,
  slot reorder via real mouse-drag with parent block unmoved, Cycle↔Random reveals weights, angle
  disclosure, tap-slot opens THAT slot's glyph, fork+Save rebinds only that slot, one ⌘Z reverts the
  whole fork. Nit (non-blocking): angle-OFF writes `rotationRandom:undefined` (key present but inert —
  engine guards range>0, JSON drops on persist), not a key deletion. **For D1:** export goldens should
  cover a modifier-only slot (no glyphRef → base) + per-slot rotationRandom.
  **⚠️ CONCURRENCY (2026-07-12):** a SEPARATE session is building a "Raster Etch" subsystem in this
  same checkout — it has modified `CONTEXT.md` (Etch/Etch Stack/Stage glossary) and added
  `docs/adr/0006`+`0007` (untracked). These are NOT motif work; every motif commit stages EXPLICIT
  paths only and leaves the Etch files untouched. Watch for collisions if both sessions touch a shared
  file (none so far — Etch is raster/pixels, motif is anchors/vector).
- 2026-07-12 — **C4 Route card DONE** (`cbdd5a8`, +25 tests; src/components+src/lib/motif 1504
  green, Studio 27 suites green, build green). Roles + path scope (all/closed/open/picked); picked
  via canvas click. **Host gating (A2):** semantic → {all, open} only; edge → all four. **Stood up
  the deferred B2 edge-anchor ghost:** useCanvas surfaces each edge host's captured `hostPaths` on
  the drawn instance (`motifHostGeometry`, gated to edge hosts so voronoi's self-stash is untouched);
  AnchorGhostOverlay runs `sampleEdgeAnchors(hostPaths, motif.edgeOpts)` → dots carrying
  `meta.pathIndex`. **Canvas-pick:** ephemeral Studio `motifPick={layerId,blockIndex}` (never
  persisted, one armed); overlay resolves its motif from `motifPick.layerId` (HOST is selected while
  picking); a dot click toggles that pathIndex in the route block's `pickedPaths` via
  `ensureChainForm → chainEditor.togglePickedPath → one updateLayer` (one undo). Disarms on
  scope-away/collapse/deselect; "N picked · Clear". **Wiring writes the CHAIN route block, never
  `selection.overrides`** (no selection resurrection, C1 intact). Guarded the overlay's legacy
  `placeMotifs` preview → [] for edge hosts. **Independent opus review: SOUND** (raw-merge mutation +
  hardcode-0 pathIndex mutation each red then reverted; gating double-guarded; shared-file surface
  clean — voronoi untouched, overlay inert unless armed, additive wiring). **Browser-verified** on
  the flowfield: picked-1-path placed 21 glyphs vs 2740 at all; one ⌘Z reverts one pick; Clear resets.
  **D1/C5 follow-ups (non-blocking):** DECIMATE the edge ghost (~13k pointer-events dots on a dense
  flowfield; overlapping tendrils can mis-toggle at crossings — clicking a visible tendril still
  works, "N picked" makes errors visible/correctable); `sampleEdgeAnchors` runs on mere selection
  (before the unarmed early-return); Studio deselect-disarm effect correct-on-read but untested.
  **D1 (pre-flagged, NOT touched):** AnchorGhostOverlay's legacy per-anchor include/exclude override
  reads/writes `selection.overrides` + uses legacy `placeMotifs` → misbehaves on chain-form motifs
  (semantic hosts too); left intact for D1 to redirect onto the chain overrides seam.
- 2026-07-12 — **C5 starter chips DONE** — **PHASE C COMPLETE** (`a0e59e4`, +39 tests: new starterChips 35,
  Inspector.motifChips 4; src/components/shell+src/lib/motif 986 green (was 947), full suite 4613
  passed 0 failed, build green). New pure **`starterChips.js`**: `STARTER_CHIPS` (4 chips —
  alternate-xo/vine/sparse-scatter/border-march) each `{id, label, build(hostIsSemantic) =>
  {glyphRef, anchorMode, binding:{chain, placement}}}`, already CHAIN-FORM (no legacy compile,
  no first-edit rewrite needed — a chip-created motif is chain-form from birth). Shared
  `hostAwareRoute(hostIsSemantic, edgeScope)` mirrors Inspector's `addMotif` host-aware logic:
  semantic → roles `['crossing']`, scope downgraded to `'all'`/`'open'` only (never
  closed/picked, A2); edge → roles `['edge']`, scope used as-is. **Advisor caught a real bug
  before build:** border-march's edge scope was drafted as `'closed'`, but the named
  browser-verify edge host (flowfield) emits OPEN streamlines (`meta.closed` stays false), so
  `'closed'` would have silently placed ZERO glyphs there — changed to `'open'` (the everyN
  rhythm earns the "march" name, not the scope). Chip UI: new "Quick start" row in
  `MotifDevice` (Inspector.jsx, above the motif list), one tappable chip per entry with a tiny
  built-in-glyph SVG preview; tap → `onAddMotif(layer.id, chip.build(hostIsSemantic))` — the
  SAME seam `+ Add Motif` uses, so C1's `createMotifParams`/`normalizeBinding` round-trip and
  the rack render Blocks immediately with no extra wiring. **Correctness proven in
  `starterChips.test.js`:** every chip's chain runs through `runSelectionChain` without
  throwing on both semantic- and edge-flavored anchor fixtures; any `sequence` block is
  terminal + at-most-one (`chainEditor.hasSequence`/`sequenceIndex`); every glyphRef (base +
  slots) resolves via `getGlyph` with NO customGlyphs arg (built-in-only); both host branches
  assert anchorMode/roles/scope; `createMotifParams` round-trip keeps `.chain`. **Sonnet-built,
  ORCHESTRATOR-verified** (small curated-data slice, no separate adversarial review — matches
  A1/C1 precedent). **Browser-verified** (dev server on :5174, a concurrent session already
  held :5173 — left untouched until an accidental `pkill -f vite` late in the session killed
  BOTH dev servers, see Deferred/note below): Vine on a semantic Grid host (rosette/leaf/leaf
  cycle visibly alternating at grid crossings, host layers hidden to isolate); Alternate x‑o,
  Border march, and Sparse scatter all on the edge Flow Field host (diamonds with visible rest
  gaps; sparser every-N‑3 diamonds confirming the `'open'` fix actually places glyphs; scattered
  dots at density 0.25). Rack cards inspected in the a11y tree for each (Route roles/scope,
  Sequencer slots/Every N/Density) matched the chip's authored chain exactly. Verified no
  horizontal overflow / all four chips reachable at 390px (mobile sheet, chips wrap to 2 rows)
  and 768px (iPad, one row). No new console errors (3 pre-existing unrelated: nested-button
  hydration warning, LayerRow key-spread warning, unauthenticated supabase 400). **Seam for
  D1:** a chip-created motif is a completely ordinary chain-form motif (no chip provenance
  tagged on the layer) — export/persist/undo already exercised by C1/C2/D1's own goldens
  apply unchanged; no chip-specific gap identified. **Incident (own accountability, not
  concurrency-file-touching):** while stopping my own dev server I ran `pkill -f vite`, which
  is unscoped and also killed the OTHER session's dev server on :5173 — no files/git touched,
  but that session's `npm run dev` needs a restart if it relied on that process still running.
- 2026-07-12 — **ISOLATION:** to stop colliding with the concurrent Raster-Etch session in the
  main checkout, Phase D runs in a SEPARATE git worktree `../naqsha-motif-d` on branch
  **`feat/motif-chain-d`** (cut from `feat/motif-chain` HEAD `aa18711`; node_modules symlinked).
  `feat/motif-chain` is untouched with the Etch session's uncommitted work intact; fast-forward
  `feat/motif-chain` onto `feat/motif-chain-d` once the tree is clear. Dev-server teardown is now
  scoped to the worktree's own PID (never unscoped `pkill`).
- 2026-07-12 — **D1 export/undo/persistence DONE** (`1bff198`, +14 tests, VERIFICATION-ONLY — no
  production change; worktree gate src/lib/motif+svgExport+useLayers+shell 1031 green, build green).
  `export.d1.test.js` (5): real export path `buildAllLayersSVG → MotifPattern.toSVGGroup`; every
  slot glyph exports per-slot in order + per-slot canvas==SVG parity; (a) modifier-only slot (no
  glyphRef → base, sizeScale baked) + (b) per-slot rotationRandom (delta baked, deterministic).
  Multi-glyph export already worked from B1 — verification-only. `persistUndo.d1.test.jsx` (9):
  LOAD-path bite — `migrateLayer` preserves `params`/`params.binding` by REF IDENTITY (confirmed it
  never touches the binding); chain-form doc round-trips localStorage save↔load byte-identical
  (chain/slots/pickedPaths/overrides); LEGACY doc loads with NO eager migration, first block edit
  upgrades→chain as ONE undo entry (selection dropped), ⌘Z restores legacy, upgraded binding
  persists; block-reorder/slot-edit/pickedPath-toggle each one undo entry with ⌘Z restore.
  Mutate-to-red confirmed each (drop-slot-glyph, rotationRandom→0, migrateLayer-strips-binding,
  ensureChainForm-keeps-selection). **Orchestrator-verified** (test-only slice; D2 whole-diff review
  covers it next) — read the test files + reran gate. **Browser-verified** (worktree dev server,
  scoped PID kill): Vine chip → exported SVG 57 rosette + 112 leaf (the ratio), reload preserved the
  chain, chain edit + ⌘Z. **NEXT:** the AnchorGhostOverlay chain-form redirect (accumulated C3/C4
  bug — its own scoped slice), then D2 whole-diff review + handoff.
