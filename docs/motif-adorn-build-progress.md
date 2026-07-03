# Motif / Adorn — Overnight Build Progress (crash-safe handoff)

> **This doc is the single source of truth for a cold resume.** If you are a revived
> session: `cd ~/Documents/Sonoform_all/Naqsha`, read this whole file, find the last
> checked slice, and continue from the next unchecked one under the same rules.

## Run identity
- **Repo (build here):** `~/Documents/Sonoform_all/Naqsha` (the S12 clone; `main` @ `0270351`, has `docs/motif-adorn-research.md`). NOTE: a *second, older* clone exists at `~/Documents/Sonoform_all/Sonoform_generativeArt/generative-art-studio` (S1 era) — **do NOT build there.**
- **Branch:** `feat/motif-adorn` (off `main` @ `0270351`).
- **Orchestrator session id (pinned):** `3424bc48-ae4a-4e33-b5c7-30ec37328e4b`
- **Session project dir:** `~/.claude/projects/-Users-jadembg-Documents-Sonoform-all-Sonoform-generativeArt/`
- **Watchdog:** `/tmp/revive-motif-orchestrator.sh` — PID **86560** (bash) + 86563 (caffeinate). Sleeps 12600s then up to 6 `claude --resume` attempts 20min apart. Log: `~/naqsha-motif-rev.log`. Session id is PINNED literal (NOT globbed — the original spec's `ls -t` was a hazard; fixed).
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
- [ ] 1.1 `emptyCircle` module — largest empty circle at a point vs placed geometry + boundary; floor → reject. Pure, deterministic.
- [ ] 1.2 `anchors` module — generic arc-length path sampler first (winding-robust, vertex-density-independent) → Edge anchors for any layer. Stable deterministic IDs.
- [ ] 1.3 semantic `anchorPoints()` for Grid, Spiral, Recursive, Voronoi (Crossings/Edges/Tips/Cells) from pre-flatten internal structure; stable IDs.
- [ ] 1.4 `placementEngine` — role filter → rate/skip/seeded-density → field mask (ScalarField threshold+invert) → overrides (ID match → spatial re-bind within tol → orphan) → A/B sequence w/ INDEPENDENT flip → orientation Path/Page + per-role policy → jitter (one seed, 0–1 amount/property; lateral vs along-path) → Proportional/Fixed sizing → test-before-place accept via emptyCircle → junction policy center/skip. **Determinism is a tested contract.**

### Phase 2 — data model
- [ ] 2.1 Motif layer schema (binding on the motif layer: hostLayerId, source descriptor, rules, overrides).
- [ ] 2.2 pure `adornGraph` derivation (mirror `buildModulationGraph`); orphan on host/source delete.
- [ ] 2.3 auto-naming ("Rosette on Voronoi 1").

### Phase 3 — Pattern contract + render
- [ ] 3.1 Pattern-contract impl (ImportedPath precedent); transform-group instancing.
- [ ] 3.2 canvas/SVG dual-emit parity via RecordingContext (build-time geometry).
- [ ] 3.3 layer-as-source (generate once/frame, instance by transform; "used as motif" badge semantics).
- [ ] 3.4 3–4 AUTHORED placeholder glyphs (rosette, leaf, dot, diamond). Real CC0-traced starter set = human task, OUT of scope.

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
- 2026-07-04 00:5x — Setup: branch created, watchdog armed (PID 86560), npm install done, progress doc written. Baseline test running.
