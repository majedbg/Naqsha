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
