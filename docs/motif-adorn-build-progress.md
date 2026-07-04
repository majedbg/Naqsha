# Motif / Adorn — Overnight Build Progress (crash-safe handoff)

> **This doc is the single source of truth for a cold resume.** If you are a revived
> session: `cd ~/Documents/Sonoform_all/Naqsha-motif` (the ISOLATED WORKTREE on branch
> `feat/motif-adorn-iso` — NOT the shared main Naqsha dir), read this whole file, find
> the last checked slice, and continue from the next unchecked one under the same rules.

---
## ✅ FINAL HANDOFF REPORT (2026-07-04 ~02:45)

**What was built:** the complete **pure core** of the Motif/Adorn feature — 12 pure modules, **226 tests across 11 files, all green; full app suite 3450 passed / 0 failed; `vite build` green.** Everything is headless/deterministic (no p5/DOM/React in any motif module), TDD'd, and each risky piece got a dedicated adversarial review. Semantic anchors cover ALL 4 flagship hosts (Grid/Recursive/Spiral/Voronoi). Location: `~/Documents/Sonoform_all/Naqsha-motif` on `feat/motif-adorn-iso` (`a57992b..3fc1e70`, NOT pushed, NOT merged).

**The pure pipeline works end-to-end** (proven by `pipeline.e2e.test.js`): a real Grid host → `getSemanticAnchors` (25 crossings) → `placeMotifs` (role filter/rate/density/field/overrides → sequence/flip/orientation/jitter/sizing → test-before-place accept) → per-instance affine matrix → `MotifPattern` dual-emits identical geometry to canvas + SVG. The Wong no-overlap guarantee survives the whole pipeline; instances land exactly on crossings; fully deterministic.

### Module map (`src/lib/motif/`)
| Module | Public API | Purpose | Tests |
|---|---|---|---|
| `emptyCircle.js` | `largestEmptyCircleRadius`, `fitsAt`, `pointToSegmentDistance` | test-before-place sizing primitive | 16 |
| `anchors.js` | `sampleEdgeAnchors`, `resampleByArcLength`, `polylineLength`, `anchorId` | generic arc-length Edge anchors (winding-robust, density-independent) for ANY layer | 18 |
| `placementEngine.js` | `selectAnchors`, `resolvePlacements`, `placeMotifs` | the deterministic placement pipeline | 49 |
| `glyphs.js` | `MOTIF_GLYPHS`, `getGlyph` | 4 authored starter glyphs (leaf/dot/diamond/rosette) | 20 |
| `instancing.js` | `placementMatrix`, `applyMatrix`, `matrixToSVG` | single affine matrix per instance (feeds both emitters) | — |
| `MotifPattern.js` | `default class MotifPattern extends Pattern` | glyph→canvas+SVG dual-emit; `anchorMode:'edge'|'semantic'` | 17 + 7 e2e |
| `motifLayer.js` | `MOTIF_TYPE`, `isMotifLayer`, `createMotifParams`, `motifHostId`, `motifAutoName` | motif-layer schema (binding lives on the motif layer) | (36 w/ graph) |
| `adornGraph.js` | `buildAdornGraph` → `{edges,byHost,byMotif,orphans}` | host↔motif relationship derivation (mirrors buildModulationGraph) | ↑ |
| `semanticAnchors.js` | `getSemanticAnchors(patternType, params, W, H, opts?)` | Crossings/Edges/Tips/Cells for ALL 4 flagship hosts — Grid/Recursive/Spiral (formula, divergence-guarded) + Voronoi (GEOMETRY-IN via `opts.drawnCells`); null otherwise | 51 |
| `straddleCheck.js` | `straddleCheck(placements, boundarySegments)` | warn-only: motifs crossing a cut/score line | 10 |

### Key contracts (stable — downstream can depend on them)
- **Anchor**: `{id, role, x, y, tangent, normal, s, meta}`. `normal` is the winding-robust orientation (use it, not `tangent`, for 'path' orientation).
- **binding** (stored on motif layer via `createMotifParams`): `{selection, placement}` — consumed verbatim by `placeMotifs`. `selection` = role/rate/skip/density/field/overrides; `placement` = sequence/flip/orientation/jitter/sizing/junction.
- **Placement**: `{anchorId, role, index, x, y, rotation, scale, radius, seqId, flip}`.
- **Determinism** is a tested contract everywhere (same seed+inputs ⇒ identical output).
- **Proportional sizing** = `min(size*scaleFactor, margin*R)`, `margin∈(0,1]` ⇒ no overlap by construction, no Infinity (refined after adversarial review).

### What REMAINS (deferred — with reasons, NOT blockers hit)
**App/UI integration (the biggest remaining chunk — deliberately deferred to a HUMAN-present session):** touches shared app files and needs BROWSER verification, unsafe to do blind overnight beside the concurrent session on the main checkout.
- Register `MotifPattern` so a `type:'motif'` layer renders. Precedent: `ImportedPath` is `new`'d directly in `src/lib/useCanvas.js:112` from `layer.type==='import'` — do the same for `'motif'`.
- **Host-geometry ordering seam:** a motif reads its host's resolved geometry. In `useCanvas` render loop, the host layer's `generateWithContext` must run BEFORE the motif's, and the host's drawn paths (or, for semantic mode, its `patternType`+`params`) must be threaded into the motif's `params` as `hostPaths` / `hostPatternType`+`hostParams`. This ordering dependency is the one real integration risk — resolve hosts first, topologically (adornGraph gives you `byMotif`/`byHost`).
- `useLayers` motif layer creation (`addMotifLayer`) using `createMotifParams` + `motifAutoName`; orphaning already handled by `buildAdornGraph` (tolerate-dangling, no cascade code needed).
- Phase 4 device UI (shared editor, source picker, role selector, preset chips Straight/Half-drop/Brick/Mirror/Tossed, jitter/sequence/sizing controls, anchor-ghost overlay + click-to-override).
- Phase 5 rail: reuse `ModulationRail.jsx` (swap `buildModulationGraph`→`buildAdornGraph`, distinct hue); straddle badge + export-summary line off `straddleCheck`.
- `svgExport`/undo/persistence wiring (Phase 6).

**Pure work still open (safe to continue overnight if resumed):**
- ~~Semantic anchors for Voronoi/Spiral/Recursive~~ **DONE 2026-07-04 AM** (Grid/Recursive/Spiral formula + divergence-guarded; Voronoi GEOMETRY-IN). All four flagship hosts covered. Next pure items: the Voronoi host-cell producer wiring (needs `computeVoronoiCells` exported), and optional junction-aware corner strategies (amendment #8, v2).

**Human-only (out of scope, unchanged):** real CC0-plate glyph tracing; extraction-stepper fork (user wants a grill-me first — see Deferred); DB migrations; tier gating; motifs-on-motifs.

### Risks / things for the human to know
1. **#69 rode onto the parent branch** via a concurrent-session merge collision (see INCIDENT). To get a clean motif-only branch: cherry-pick `9ee5b7a ee7882b 36869cc d50d0dc ddee5ca ebea63a ca2d952 176dd26 ad77991 1deea70` onto a fresh branch off `main` (skip `a57992b`/`71f9dec` doc-only if desired).
2. **Isolated worktree** at `~/Documents/Sonoform_all/Naqsha-motif`; `node_modules` symlinks into `../Naqsha` (live). Not pushed/merged. `git worktree remove` when done (branch persists).
3. **Final whole-diff Phase-7 adversarial review: DONE (2026-07-04 ~08:50, post-limit-resume).** Attacked the previously-unreviewed modules + cross-module integration via probes: `semanticAnchors` honesty in untested Grid regimes (missing line-family, degenerate cols/rows/spacing), `adornGraph` invariants (edges/orphans disjoint, motif-hosting-motif→orphan, byHost/byMotif consistency, no input mutation), `straddleCheck` endpoint proximity. **VERDICT: SOUND** — every source contract held; the only defect found was in the throwaway probe itself (a world-vs-centered coordinate bug I fixed, which then confirmed the source). Combined with the earlier dedicated reviews of the engine (determinism/no-overlap) and dual-emit parity, and the e2e's render-scale no-overlap check, the pure core's contracts are verified honest. A human eyeball on actual rendered output is still worthwhile at integration time.
4. Watchdog v2 (PID 15633) may fire a revival ~05:17 if a usage limit hit; it resumes THIS session pointed at the worktree. Harmless if the build is already done (revival reads this report and finds nothing unchecked → no-op).
---


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
- [x] 1.3 semantic anchors for ALL 4 flagship hosts — DONE. `getSemanticAnchors(patternType, params, W, H, opts?)`:
  - **Grid** (`176dd26`, 16t) — formula, divergence-guarded (linear+nonlinear).
  - **Recursive** (`de3da4a`, +13t) — formula (seedless), n-gon tree, guarded shallow+deep.
  - **Spiral** (`4908fe4`, +12t) — formula; bit-exact at distortAmount=0, bounded tolerance when jittered, null when distort field active.
  - **Voronoi** (`3fc1e70`, +10t) — **GEOMETRY-IN**: sites come from ctx.random (irreproducible headless), so anchors derive from host-supplied `opts.drawnCells`; `null` without them → graceful edge fallback. Correct integration seam.
  - **TODO (integration):** wire a host-cell producer into MotifPattern so Voronoi semantic mode gets `drawnCells` (needs `computeVoronoiCells` exposed from VoronoiCells.js). Until then Voronoi hosts use generic edge anchors. All others work formula-only.

### Phase 2 — data model — DONE (commit `ca2d952`, 36 tests)
- [x] 2.1/2.2/2.3 motifLayer.js (schema/isMotifLayer/createMotifParams/motifHostId/motifAutoName) + adornGraph.js (buildAdornGraph {edges,byHost,byMotif,orphans}, mirrors buildModulationGraph, tolerate-dangling, stacking order, motifs-on-motifs→orphan).

> **REMAINING-TIME PLAN (2026-07-04 ~02:17, limit est ~04:11):** pure-core is functional+wireable. Do: (1) 1.3 Grid semantic anchors (full 4-role taxonomy on one flagship host, divergence-guarded) — Voronoi/Spiral/Recursive DEFERRED with spec (rushing 4 extractors blind = green-but-wrong risk); (2) 3C remaining glyphs; (3) Phase 5 straddleCheck (pure); (4) end-to-end demonstration test proving the whole pure pipeline; (5) thorough handoff + integration runbook for the human. **App/UI integration (Phase 3.3/4/rail) DEFERRED to human — it touches shared app files + needs browser verification, unsafe to do blind overnight beside the concurrent session.**

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

## Slice log (continued)
- 2026-07-04 02:08 — 3A glyphs+instancing (`ddee5ca`, 16t) + 3B MotifPattern dual-emit (`ebea63a`, 7t). Vertical slice complete.
- 2026-07-04 02:16 — Phase 2 data model (`ca2d952`, 36t).
- 2026-07-04 02:27 — 1.3 Grid semantic anchors, divergence-guarded (`176dd26`, 16t).
- 2026-07-04 02:37 — semantic wired into MotifPattern + e2e demo (`ad77991`, 17+7t). Full pure pipeline proven.
- 2026-07-04 02:41 — 3 more glyphs + straddleCheck (`1deea70`, 30t).
- 2026-07-04 02:45 — FINAL HANDOFF REPORT written (see top). 191 motif tests, full suite 3330+ green, build green. Pure core COMPLETE. App/UI integration deferred to human.

## Slice log (continued — 2026-07-04 AM, post-resume)
- Final Phase-7 adversarial review: SOUND (probe verdict recorded above).
- 1.3 semantic anchors completed for ALL 4 flagship hosts: Recursive `de3da4a`, Spiral `4908fe4`, Voronoi `3fc1e70` (GEOMETRY-IN). Motif suite now **226 tests**, full app suite green, build green.

## App/UI integration (2026-07-04 AM, user AFK ~3h, phone decisions only)
Scope chosen by user: **render + minimal device UI**, browser-self-verified, rail/overlay/polish deferred.
- [x] **INT-1** render plumbing (`e6c5a06`): register `motif→MotifPattern`; pure `resolveMotifHostParams(layer,layers)` injected in useCanvas (host patternType+params, no ordering dep); `addMotifLayer`. **v1 renders on grid/recursive/spiral via SEMANTIC anchors.** Voronoi/edge-arbitrary need host drawn-geometry → deferred (clean seams, no hacks). 251 tests.
- [x] **INT-1 BROWSER-VERIFIED**: seeded a grid+leaf-motif set via localStorage, cold-loaded the app → leaf glyphs render at every grid crossing (Operation view), layer tree shows "Leaf on Grid host", PATTERN=motif. Export transitively covered (canvas render ⇒ svgElements populated; parity test ⇒ canvas==SVG; svgExport reads toSVGGroup). Only console error is a pre-existing LayerRow key-spread warning (not mine).
- [ ] **INT-2** minimal Motif device in the host Inspector (add/remove motif, glyph picker, role checkboxes, rate/size/flip) — IN PROGRESS.
- [x] **INT-2** minimal Motif device (`e38eedb`): `MotifDevice` in host Inspector (grid/recursive/spiral) — lists motifs, glyph select + swatch, role checkboxes, every-Nth, size, flip, remove, "+ Add Motif". `deepMergeBinding` (pure) for partial patches. **BROWSER-VERIFIED**: device renders on grid host; "+ Add Motif" creates a motif; glyph leaf→rosette re-renders rosettes at every crossing live. 259+10 tests, full suite green.

### App/UI integration — DONE for chosen scope. Remaining UI (deferred, needs human at browser):
- Voronoi + edge-on-arbitrary-host rendering (need host drawn-geometry seam: two-pass resolve or host polyline recording; Voronoi also needs `computeVoronoiCells` exported + `drawnCells` threaded). MotifDevice currently gates to grid/recursive/spiral.
- Phase 5 rail ("adorns" edges via ModulationRail+buildAdornGraph) + straddle badge/export-summary.
- Anchor-ghost canvas overlay + click-to-override; preset chips (Straight/Half-drop/Brick/Mirror/Tossed); jitter/sequence full controls; device polish.
- Undo/persistence: motif layers persist via the normal layer localStorage path (verified: seeded set cold-loaded). Undo of motif param edits rides updateLayer's recordEdit — not explicitly verified.
- [x] **INT-3** AdornRail (`93fdbb0`): "adorns" relationship rail mirroring ModulationRail — gold/amber edges (rgb(184,134,11)) from each motif row to its host row via buildAdornGraph, distinct hue, selection emphasis, control point bowed to outer edge. **BROWSER-VERIFIED**: two motifs on one grid host → two gold edges converging on the host row with real geometry + emphasis. 4 tests. ModulationRail untouched.

### Still remaining (UI, needs human at browser): anchor-ghost canvas overlay + click-to-override; straddle badge + export-summary line (straddleCheck is built, just needs UI surface); preset chips (Straight/Half-drop/Brick/Mirror/Tossed); full jitter/sequence controls + polish; Voronoi/edge-host rendering (drawn-geometry seam). Undo of motif edits rides updateLayer.recordEdit (not eyeballed).
- [x] **INT-4** anchor-ghost overlay + click-to-override (`9418e41`): SVG overlay in the canvas-scaled box (no coord conversion — anchors already in canvas-px). When a motif is selected on a grid/recursive/spiral host, shows ghost dots at the host's anchors of the motif's targeted roles: placed/candidate/included/excluded states; click toggles include/exclude overrides (honored by the placement engine). **BROWSER-VERIFIED**: 36 crossing ghosts (18 placed/18 candidate @ rate n:2); clicking a candidate → included → engine places a glyph there. Role-filtered display (145→36) so the overlay stays focused. 7 tests. Existing overlays untouched.

### Remaining UI (needs human at browser): straddle badge + export-summary line (straddleCheck built); preset chips (Straight/Half-drop/Brick/Mirror/Tossed); fuller jitter/sequence controls + polish; Voronoi/edge-host rendering (drawn-geometry seam). Undo of motif edits rides updateLayer.recordEdit (not eyeballed).

## Mobile fixes (2026-07-04, user testing on Vercel preview)
- [x] **INT-fix** MobileStudio wired onAddMotif/onRemoveLayer (`76935ac`): MobileStudio renders its OWN <Inspector>; onAddMotif was a no-op → "+ Add Motif" did nothing on mobile. Fixed + browser-verified at 390px.
- [x] **INT-5** Motif device = collapsed accordion at TOP of Inspector (`bb1adac`): was buried at the bottom of the drawer (discoverability). Now "▸ Motif" above pattern params, collapsed by default, count badge. Same <Inspector> → desktop + mobile. Browser-verified at 390px (toggle y≈370, expand → + Add Motif → creates motif).

### Deploy: branch pushed to origin → Vercel preview. STABLE URL: https://naqsha-git-feat-motif-adorn-iso-majedbgs-projects.vercel.app (behind Vercel login; owner access or Share link). Main/production UNTOUCHED. To ship for real: rebase onto origin/main @565bb28 + resolve conflicts (shared files) — with human present.

## Voronoi drawn-geometry capture seam (2026-07-04 PM)
- [x] **INT-6** Voronoi motifs render via drawn-geometry capture (commit `5c187b6`). Closes the seam that was flagged deferred since INT-1: the Voronoi semantic extractor already wanted `opts.drawnCells`, nothing supplied them, and `MotifPattern` never threaded the 5th `opts` arg. Now motifs RENDER on voronoi hosts. 5 changes:
  1. `VoronoiCells.js` — inside `generate()`, after the FINAL Delaunay/Voronoi, capture the resolved cells via the existing private `computeVoronoiCells(points, triangles, halfW, halfH)` and stash `this.motifHostGeometry = { drawnCells }`. Each cell = `{ vertices:[{x,y}..], site:{x,y} }`, ≥3 vertices. Drawing output byte-identical (no VoronoiCells render/snapshot test existed; parity is that svgElements/ctx-calls are untouched).
  2. `useCanvas.js` render loop — per-frame `const hostGeometry = {}` (reset each render); harvest `instance.motifHostGeometry` into `hostGeometry[layer.id]` AFTER each layer's `generateWithContext` in BOTH the visible and hidden/noDraw branches; pass the map into `resolveMotifHostParams(layer, layers, hostGeometry)`.
  3. `resolveMotifHost.js` — optional 3rd `hostGeometry = {}` param; for a `voronoi` host with `hostGeometry[hostId].drawnCells` present, include `drawnCells` in the returned params; absent → omit (graceful null anchors → nothing placed). 2-arg callers unchanged.
  4. `MotifPattern.js` (~line 55) — thread the 5th arg: `getSemanticAnchors(..., { drawnCells: p.drawnCells })`. This wiring was MISSING; the voronoi semantic path could never have fired before. Mutation-proven load-bearing (removing the arg fails the "places at shared vertex" test).
  5. `Inspector.jsx` — added `"voronoi"` to `MOTIF_HOSTS` so the Motif device appears on voronoi hosts; comment updated.
- **CAPTURE-INSIDE-generate() (the load-bearing decision):** cells captured from the host's ACTUAL draw-run, NOT a headless recompute — VoronoiCells seeds sites from `ctx.random`, irreproducible under a separate mulberry32, so a pre-pass would diverge and glyphs would land NEXT TO the visible cells. Capturing inside `generate()` also excludes the render-loop node transform for free (applied by the wrapper OUTSIDE generate) — consistent with grid/recursive/spiral formula anchors, which also ignore the host node transform.
- **COORDINATE FRAME (hard contract):** `computeVoronoiCells` returns cells CENTERED at (0,0); the on-canvas base copy is drawn at `translate(cx+offsetX, cy+offsetY)` (symmetryUtils), so world (canvas-px, top-left) = `centeredVertex + (canvasW/2 + offsetX, canvasH/2 + offsetY)`. This matches the Grid anchor origin `ox = canvasW/2 + offsetX`. Note VoronoiCells' own `cx/cy` are `canvasW/2` WITHOUT the offset (applySymmetryDraw adds it), so the stash adds `offsetX/offsetY` explicitly. The stash test hand-derives an interior seed's world coordinate (300,300) independently of the impl conversion + a differential offset check.
- **Z-ORDER FOOTGUN:** the render loop runs bottom→top; a host generates before a motif stacked ABOVE it → that motif sees the geometry; a motif BELOW its host → absent entry → graceful no-op (nothing placed). The loop is NOT reordered.
- **SYMMETRY v1 LIMITATION:** only the BASE cell set is stashed (pre-`applySymmetryDraw`, pre-`startAngle`). For `symmetry !== 'none'` or a nonzero `startAngle` the render draws extra rotated copies; motifs land only on the base copy. Documented in a `VoronoiCells.js` code comment.
- **DEFERRED (unchanged):** edge-on-arbitrary-host rendering (needs a generic drawn-polyline seam); the anchor-ghost overlay + click-to-override FOR VORONOI (it can't reach the per-frame `hostGeometry` from the component — `AnchorGhostOverlay.jsx` allowlist stays grid/recursive/spiral).
- **Tests:** +14 (VoronoiCells.motif.test.js 7 new; resolveMotifHost.test.js +4; MotifPattern.test.js +2 GEOMETRY-IN; Inspector.motif.test.jsx net +1 voronoi-eligible, ineligible example moved voronoi→flowField). Targeted `src/lib/motif src/lib/patterns/VoronoiCells src/lib/useCanvas src/components/shell/Inspector`: 291 passed. Full suite: **3491 passed | 54 skipped (3545); 326 files passed | 5 skipped.** `npm run build` green.
- **NOT verified (orchestrator's job):** NO browser verification — actual rendered glyphs-on-voronoi-cells not eyeballed. The pure/headless path is proven (stash test + GEOMETRY-IN placement test + parity infra), but on-canvas visual correctness at real scale, and the useCanvas per-frame harvest under a live p5 adapter, are unproven here.

## Voronoi seam-fix: order-independent host-geometry pre-pass (2026-07-04 PM)
- [x] **SEAM-FIX** order-independent host-geometry pre-pass — Voronoi motifs now place regardless of z-order.
- **THE BUG (found in browser verification of INT-6):** commit `767f6ce` harvested each host's drawn cells INSIDE the single reverse-order render loop, then threaded them to motifs via `resolveMotifHostParams(layer, layers, hostGeometry)`. But useCanvas renders `[...layers].reverse()` (bottom→top) and `addMotifLayer` APPENDS a motif to the END of `layers` → a freshly-added motif sits LAST in the array → FIRST in renderOrder → it resolved its host params BEFORE the host had generated → `hostGeometry[hostId]` was still empty → `voronoiAnchors(null)` → ZERO placements. So Voronoi motifs rendered nothing in the default "+ Add Motif" flow. (Grid/recursive/spiral were immune — they read host PARAMS directly off the array, no render-order dependency; only the drawn-geometry seam was order-sensitive, which was the defect. This supersedes the "Z-ORDER FOOTGUN" note in the INT-6 entry above — the loop is no longer the harvest site.)
- **THE FIX (additive; z-order + addMotifLayer untouched):** a new pure helper `collectMotifHostGeometry(layers, generateHostGeometry)` (`src/lib/motif/collectHostGeometry.js`) computes the distinct motif-host id set (via `isMotifLayer`/`motifHostId`) and generates each host ONCE into a THROWAWAY instance to harvest `motifHostGeometry` — BEFORE the main paint loop, so placement no longer depends on stack position. useCanvas runs this pre-pass right after `drawCtx`/`noDrawCtx` are defined; the closure resolves `PATTERN_CLASSES[host.patternType] || getDynamicPatternClass(...)`, probes on `noDrawCtx` (wrapped in `p.push()/p.pop()`), and reads `probe.motifHostGeometry`. Hosts are probed regardless of visibility. The two in-loop harvests added by 767f6ce (visible + hidden/noDraw branches) were REMOVED; the `resolveMotifHostParams(layer, layers, hostGeometry)` call is unchanged.
- **RESTORES THE CONTRACT:** "placement is order-independent" — matching how grid/recursive/spiral already behave. A motif BEFORE its host AND a motif AFTER its host both resolve `drawnCells` / produce placements.
- **NO-DIVERGENCE (why double-generate is safe):** `drawCtx`/`noDrawCtx` wrap the SAME p5 instance `p`; `VoronoiCells.generate` calls `ctx.randomSeed(seed)` as its first line, so generating the host twice (pre-pass probe on noDrawCtx, then the real draw on drawCtx) reproduces byte-identical cells. The throwaway probe is ONLY for harvesting; the real drawn instance (owning `_lastParams`/`_lastCx` for SVG export) is still built in the main loop.
- **CAVEAT (out of scope):** the pre-pass uses BASE `host.params`. Voronoi is not modulated/moiré, so harvested cells == drawn cells. A MODULATED/moiré host would diverge (probe uses base params, real draw uses resolved params) — deferred.
- **TDD:** new `src/lib/motif/collectHostGeometry.test.js` (7 tests). Fail-first contract proven via an in-suite `oldCollectResolved` model that reproduces the ORIGINAL interleaved in-loop harvest: under it `[host, motif]` (default append order) resolves NO `drawnCells` (RED) while `[motif, host]` resolves them (GREEN) — an order-DEPENDENT asymmetry; the fix makes BOTH orderings resolve `drawnCells`. Teeth also confirmed by temporarily sabotaging the helper (map-population assertions go red).
- **Gates:** targeted `src/lib/motif src/lib/useCanvas src/lib/patterns/VoronoiCells` → 257 passed. Full suite: **3498 passed | 54 skipped (3552)** (was 3491; +7 new helper tests). `npm run build` green.
- **NOT verified (orchestrator's job):** NO browser verification — on-canvas glyphs-on-voronoi-cells in the live "+ Add Motif" flow not eyeballed. The pure/headless order-independence path is proven; live p5 render is the next step.
