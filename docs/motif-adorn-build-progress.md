# Motif / Adorn — Overnight Build Progress (crash-safe handoff)

> **This doc is the single source of truth for a cold resume.** If you are a revived
> session: `cd ~/Documents/Sonoform_all/Naqsha`, read this whole file, find the last
> checked slice, and continue from the next unchecked one under the same rules.

## ⚠️ INCIDENT — concurrent-session collision (2026-07-04 ~01:20), then ISOLATED
A **second, concurrent Claude session** (long-running process since Wed 23:00; reflog `HEAD@{7..13}` shows it serially merging `feat/extraction-*` branches into main) ran `git merge origin/feat/extraction-invert-polarity` at **01:20 while `feat/motif-adorn` was checked out in the shared main working tree** — so issue **#69 (extraction invert/polarity) rode onto MY branch** as commits `355ef7c` + merge `56d0588`. #69 is legit work and the full suite passes with it, but it is **NOT my work** and is NOT yet on `main` (`git merge-base --is-ancestor 355ef7c main` = false). A shared working tree + index with a second writer is a corruption risk for an unattended run.
**Resolution:** isolated all further motif work into a **dedicated git worktree** (own working dir + index; git serializes ref writes safely). See updated Run identity below. The main `~/Documents/Sonoform_all/Naqsha` checkout is LEFT ALONE for the other session. **For the human in the morning:** #69 is woven into the first-parent chain via merge `56d0588` — do NOT rebase it out of a live branch. If you want a clean #69-free motif branch, **cherry-pick the four motif commits `9ee5b7a ee7882b 36869cc d50d0dc` onto a fresh branch off `main`** (each is an independent diff, so this reconstructs a clean motif-only branch). Your choice; I did not do it.
**Note (node_modules race):** the worktree's `node_modules` symlinks into the live `../Naqsha` the other session uses. If a test fails *bizarrely*, re-run it ONCE before believing it — could be a transient npm race, not a real regression.

## Run identity
- **BUILD HERE (isolated worktree):** `~/Documents/Sonoform_all/Naqsha-motif` on branch **`feat/motif-adorn-iso`**. `node_modules` is a symlink → `../Naqsha/node_modules`; `docs/motif-adorn-research.md` copied in (untracked). **All slices, tests, commits happen HERE now.**
- **DO NOT TOUCH:** the shared main checkout `~/Documents/Sonoform_all/Naqsha` (branch `feat/motif-adorn`, used by a concurrent session), nor `~/Documents/Sonoform_all/Naqsha-wt-69`, nor the old S1 clone `~/…/Sonoform_generativeArt/generative-art-studio`.
- **Branch lineage:** `feat/motif-adorn-iso` forked from `feat/motif-adorn` @ `71f9dec` (= `main`@`0270351` + #69-collision + my 4 motif slices).
- **Orchestrator session id (pinned):** `3424bc48-ae4a-4e33-b5c7-30ec37328e4b`; project dir `~/.claude/projects/-Users-jadembg-Documents-Sonoform-all-Sonoform-generativeArt/`.
- **Watchdog v2:** `/tmp/revive-motif-orchestrator.sh` — PID **15633** (bash) + 15635 (caffeinate). Repointed at the worktree. Sleeps 12600s then up to 6 pinned-id `claude --resume` attempts 20min apart. Log `~/naqsha-motif-rev.log`.
- **Design spec (locked):** `docs/motif-adorn-research.md` §0 as amended by §1 (16 adopted amendments; §1 supersedes §0). PRD: `gh issue view 67 --repo majedbg/Naqsha`.

## Baseline (known-good start)
- `npm install` in the Naqsha clone: DONE (was missing deps; 11 pre-existing audit vulns, ignored).
- Baseline `npm test`: **3215 passed | 54 skipped (3269); 310 files passed | 5 skipped. Duration ~36s. Exit 0.** (Stack traces in log are intentionally-tested error paths.) This is the known-good start.
- Baseline build: **green (`vite build`, 1.92s, exit 0).**
- **Architecture brief: `docs/motif-adorn-arch-brief.md`** — exact precedent signatures every slice subagent must read first.

## Rules (non-negotiable)
- Subagents **sonnet or opus only, never fable**. Default sonnet; opus for semantic anchors, placementEngine, adversarial reviews, integration debugging.
- **ONE subagent at a time** — full build→test→review before next dispatch. Never parallel. Browser serialized. (Do NOT use the Workflow tool — hook nudges are false matches.)
- **TDD each slice:** failing tests first, then implementation. Gate after every slice: full `npm test` green + `npm run build` green.
- Opus adversarial review after each phase (min) or risky slice — reviewer tries to PROVE it broken/dishonest.
- **Commit per green slice** on `feat/motif-adorn`, explicit paths only (NEVER `git add -A` — untracked `s13-laser-prototype/` is the user's live S13; `docs/motif-adorn-research.md` is untracked design). **NEVER push / merge / migrate / touch S12 worktree.**
- Update THIS doc after EVERY slice.
- Blocked on a human decision → record in "Deferred", skip, continue.
- Every Bash git/npm needs its own `cd ~/Documents/Sonoform_all/Naqsha` (shell cwd does not persist).

## Two correctness traps every review must target
1. **Determinism contract:** tests must assert *identical* placements from same seed+inputs across two runs — not merely that placements exist.
2. **Build-time geometry before dual-emit:** SVG export bypasses ctx; all geometry must resolve at build time. Verify canvas-vs-SVG parity via RecordingContext.

## Scope tonight
- **CORE = Phases 1–3** (pure core, data model, Pattern-contract + dual-emit + placeholder glyphs). Push into 4–7 as far as time allows.
- EXCLUDED: extraction-stepper fork (blocked on S12 merge context), DB migrations, starter-set plate tracing, tier gating, motifs-on-motifs.

## Phase / slice plan (check off as completed)

### Phase 1 — pure core (TDD, no UI)
- [x] 1.0 Architecture map of precedents → `docs/motif-adorn-arch-brief.md`. DONE.
- [x] 1.1 `emptyCircle` module — DONE (commit `9ee5b7a`, 16 tests). API: `largestEmptyCircleRadius(center, obstacles[{x,y,r}], boundary)`, `fitsAt`, `pointToSegmentDistance`. boundary = null | {type:'rect',width,height} | {type:'polygon',points}. Signed distance; ≤0 ⇒ reject.
- [x] 1.2 generic arc-length Edge sampler — DONE (commit `ee7882b`, 18 tests). `sampleEdgeAnchors(paths,{spacing|count,includeEndpoints,idPrefix})`, `resampleByArcLength`, `polylineLength`, `anchorId`. Anchor shape FINAL: `{id,role,x,y,tangent,normal,s,meta:{pathIndex,sampleIndex,closed}}`. Winding-robust via `normal` (outward, shoelace centroid); `tangent` flips π on reversal (engine orientation uses `normal`). Density-independent.

> **REORDER (2026-07-04 ~01:14):** build placementEngine BEFORE semantic anchors. Engine consumes the stable Anchor shape; generic Edge anchors already cover every layer → engine+render+glyph = working vertical slice. Semantic anchors enrich flagship hosts afterward. Split engine into 1.4a/1.4b.

- [x] 1.4a placementEngine **selection** — DONE (commit `36869cc`, 27 tests). `selectAnchors(anchors, rules, {canvasW,canvasH}) → {survivors, orphans}`. Deterministic role→rate→skip→density(mulberry32)→field→overrides pipeline.
- [x] 1.4b placementEngine **transform+accept** — DONE (commit `d50d0dc`, 49 engine tests). `resolvePlacements(survivors, config, {boundary})` + `placeMotifs` composer. Opus adversarial review caught 3 real green-but-broken bugs (proportional Infinity/obstacle-poisoning; margin>1 overlap; missing no-overlap invariant test) — ALL FIXED in same commit. Proportional semantics refined: `radius = min(size*scaleFactor, margin*R)`, margin clamped (0,1] ⇒ no overlap by construction, no Infinity. Determinism+RNG+winding reviewed SOUND.
 — role filter → rate/skip → seeded density (mulberry32) → field mask (ScalarField `sampleNorm` + threshold + invert) → overrides (ID match → spatial re-bind within tol → orphan). Pure → {survivors, orphans}. Determinism tested.
- [ ] 1.3 (moved after engine) semantic `anchorPoints()` for Grid, Spiral, Recursive, Voronoi (Crossings/Edges/Tips/Cells) from pre-flatten internal structure; stable IDs. May ship partial (Grid+Voronoi first) if time-constrained.

### Phase 2 — data model
- [ ] 2.1 Motif layer schema (binding on the motif layer: hostLayerId, source descriptor, rules, overrides).
- [ ] 2.2 pure `adornGraph` derivation (mirror `buildModulationGraph`); orphan on host/source delete.
- [ ] 2.3 auto-naming ("Rosette on Voronoi 1").

### Phase 3 — Pattern contract + render  (NEXT — completes the vertical slice; contains the dual-emit trap)
**Locked approach (advisor):** prevent the build-time-geometry/dual-emit divergence STRUCTURALLY — in `generate()` compute ONE final affine **matrix** per instance (`translate·rotate·scale·flip`), then feed BOTH emitters from that single list: canvas applies it to glyph points; SVG serializes the SAME matrix as `transform="matrix(a b c d e f)"`. Flip = the divergence hotspot → matrix (NOT canvas manual-negate vs SVG `scale(-1,1)`, whose order-vs-rotate differs). Parity test must be ADVERSARIAL: independently parse the emitted SVG matrix + apply to the glyph's verbatim `d` points, compare to captured canvas vertices (do NOT reuse the impl's transform helper for "expected"). Cases: flipped ASYMMETRIC glyph, rotated placement, two-instance. Then opus review.
**Integration seam (deferred to render wiring, keep in doc):** the host layer must resolve its geometry BEFORE the motif reads it (generate-ordering dependency in `useCanvas`). Pure slices pass synthetic `hostPaths` in params.
**MotifPattern params = the motif-layer schema (design now so Phase 2 formalizes, not rewrites):** `{ glyphRef, hostLayerId | hostPaths(seam), binding:{selection, placement}, anchorMode:'edge'|'semantic', edgeOpts:{spacing|count} }`.
- [x] 3A glyph format + instancing matrix + leaf glyph — DONE (commit `ddee5ca`, 16 tests). `glyphs.js` (getGlyph/MOTIF_GLYPHS, leaf asymmetric), `instancing.js` (placementMatrix/applyMatrix/matrixToSVG, single affine).
- [x] 3B `MotifPattern` dual-emit — DONE (commit `ebea63a`, 7 tests). Single matrix feeds canvas + SVG; mutation-verified adversarial parity test (flip proven a real mirror, build-time resolution proven). **PURE VERTICAL SLICE COMPLETE: hostPaths+glyph+binding → anchors → placements → parity-verified canvas + SVG export.** Full suite 3330 green.
- [ ] 3C author remaining 3 glyphs (rosette, dot, diamond) once 3B parity is proven. Real CC0-traced starter set = human task, OUT of scope.
- [ ] 3.3 layer-as-source (generate once/frame, instance by transform; "used as motif" badge semantics) — after 3B.

### Phase 4 — Motif device UI (stretch)
- [ ] 4.x shared editor, source mini-picker, role selector, preset chips, rule/jitter/sequence/sizing controls, anchor-ghost overlay + click-to-override.

### Phase 5 — rail + straddle (stretch)
- [ ] 5.x rail "adorns" edge (distinct hue, ModulationRail approach), drag-attach, `straddleCheck` (pure, lazy), badge + export-summary line.

### Phase 6 — integration (stretch)
- [ ] 6.x export pipeline verification, undo/persistence wiring, full-suite + build gates, golden-path E2E.

### Phase 7 — final adversarial review (stretch)
- [ ] 7.x whole-diff honesty battery; fix findings; final handoff report.

## Deferred (needs human / grill-me)
- **Import-centric motif extraction** (extraction-stepper fork): user wants a grill-me session to revisit before building. DEFERRED per user. Motif *does* touch the import pipeline — note any coupling discovered but don't build the fork.
- Starter-set CC0 plate tracing (curation task).
- DB migrations (human-gated).

## Slice log (append after EVERY slice: status · commit · test count · decisions · open issues)
- 2026-07-04 00:5x — Setup: branch created, watchdog armed (PID 86560), npm install done, progress doc written. Baseline 3215 green + build green.
- 2026-07-04 01:0x — Slice 1.0 (arch brief) + 1.1 (emptyCircle, 16 tests) DONE. Commit `9ee5b7a`. Full motif suite green, build green. S13 untracked files protected.
- 2026-07-04 01:13 — Slice 1.2 (generic Edge sampler, 18 tests) DONE. Commit `ee7882b`.
- 2026-07-04 01:21 — Slice 1.4a (selection, 27 tests) DONE. Commit `36869cc`.
- 2026-07-04 01:20 — ⚠️ CONCURRENT-SESSION COLLISION: #69 merged onto my branch by another session (see INCIDENT at top). `355ef7c`+`56d0588`.
- 2026-07-04 01:43 — Slice 1.4b (transform+accept, 49 engine tests) DONE + Opus adversarial review + 3 real-bug fixes folded in. Commit `d50d0dc`. **Full suite 3307 passed, build green.** Phase 1 core (1.1/1.2/1.4a/1.4b) COMPLETE; semantic anchors (1.3) remain.
- 2026-07-04 ~01:45 — ISOLATING into dedicated worktree to end the collision risk (see Run identity).
