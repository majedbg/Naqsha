# Execution prompt — Candidate #1: one grid-geometry core (reconcile lattice + motif anchors)

> Paste the block below into a fresh Claude Code session in this repo.
> Source review: `docs/architecture/decisions/2026-07-05-architecture-review.html` (candidate 1 + top recommendation).

---

You are the ORCHESTRATOR for an architecture refactor in this repo (Naqsha, React + Vite + p5 generative-art studio). You coordinate; subagents build. Everything must be resumable from a tracking doc if this session dies.

## Goal (Candidate #1 from docs/architecture/decisions/2026-07-05-architecture-review.html)

Reconcile the two grid→motif placement pipelines into ONE geometry core behind ONE anchor seam:

- `src/lib/patterns/gridGeometry.js` (`gridLinePositions(params, rng)`) is the single encoding of Grid's layout math — jitter, distribution eases — with byte-exact p5 RNG parity via `src/lib/patterns/rng.js` (`makeP5Random`) and symmetry counts via `symmetryUtils.toSymmetryCount`.
- `src/lib/fields/latticeForLayer.js` consumes it faithfully (jittered, symmetry-replicated `{x,y,angle}` crossings) and delivers nodes through the modulation channel `'lattice'` to `ExtractedPatternGenerator`.
- The motif subsystem (`src/lib/motif/`) instead RE-COPIES Grid's layout math inline in `semanticAnchors.js` (a `distribute()` replay, approx lines 61–77 at review time) — honest but degraded: no jitter (anchors sit on the ideal pre-jitter lattice), symmetry>1 not replicated (base copy only), warp → returns null.

Target state: pattern-owned geometry core → one anchor interface (`[{x, y, angle/tangent, normal, role: 'crossing'|'edge'|'tip'|'cell', s, meta}]`) → consumed by BOTH the lattice/modulation path (lattice nodes ≡ `role:'crossing'` anchors) and `placementEngine`/`MotifPattern`. Delete the `distribute()` replay. `placementEngine.js` is deep and well-tested — do NOT restructure it; only change where its anchors come from.

## Phase 0 — VERIFY MAIN FIRST (blocking, do before any plan is final)

I merged the previously-separate branches (`feat/grid-lattice-motif`, `feat/motif-adorn-iso`) after the review was written. The review describes the PRE-merge state. Before anything else:

1. `git log --oneline -15`, `git status`, `git branch -a --no-merged` — confirm which branches are merged, confirm the working tree is clean and on main (or tell me to fix it).
2. Confirm files exist post-merge: `src/lib/patterns/gridGeometry.js`, `src/lib/fields/latticeForLayer.js`, `src/lib/motif/semanticAnchors.js`, `src/lib/motif/placementEngine.js`, `src/lib/motif/MotifPattern.js`, `src/lib/motif/instancing.js`.
3. Re-verify the review's load-bearing claims against the ACTUAL merged code (line numbers will have shifted; merge resolution may have already changed things): (a) `semanticAnchors.js` still contains its own inline grid `distribute()` replay rather than importing `gridGeometry`; (b) `latticeForLayer` still builds nodes from `gridLinePositions` + `makeP5Random`; (c) `gridAnchors` still documents the no-jitter / base-copy-only / warp→null caveats. If any claim no longer holds, record the delta in the tracking doc and adjust the work items instead of following this prompt blindly.
4. Run `npm test` and `npm run lint` for a green baseline. If the merge left failures, STOP and report — do not refactor on a red baseline.

## Tracking doc (create FIRST, update ALWAYS)

Create `docs/grid-geometry-core-ORCHESTRATOR.md` (matches this repo's existing `*-ORCHESTRATOR.md` convention) containing: goal summary; Phase-0 verified facts (with real file:line refs); a work-item table (WI id, description, TDD mode, file-locks, status: pending/in-progress/done/blocked, subagent notes); a run log (append an entry after EVERY subagent completes or fails, with tests added/removed and files touched). RESUME RULE stated at the top of the doc: "A fresh session must read this file first, trust its statuses, skip done WIs, and continue from the first non-done WI." Update the doc before and after each dispatch — never batch updates.

## Orchestration pattern

- You (orchestrator) never write product code directly; you dispatch subagents (Agent tool). One blocking seam-definition WI merges first; then fan out parallel WIs ONLY if their write-file sets are disjoint (use worktree isolation for anything concurrent). One writer per file at any time.
- Each subagent prompt must be self-contained: its WI section from the tracking doc, the frozen anchor contract, its file-locks, its TDD mode, and the definition of done. Subagents report: seam touched, tests added (names), files changed.
- After each subagent: run the FULL `npm test` + `npm run lint` on the integrated tree, then update the tracking doc.

## TDD

Invoke the TDD skill at session start (Skill tool) and follow it for every WI. Per-WI mode is declared in the tracking doc:
- CHARACTERIZATION (golden-master) for everything that restructures existing behavior — pin current output BEFORE touching code.
- RED→GREEN only for genuinely new behavior (the unified anchor provider's new capabilities, e.g. jittered crossings exposed as anchors).
Key invariants to pin FIRST, before any refactor:
1. Bridge test: at jitter=0, symmetry=1, `gridAnchors(...)` crossing positions == `latticeForLayer(...)` node positions for the same params/seed (they should coincide today; this test is the safety rail for the whole refactor).
2. `ExtractedPatternGenerator` lattice stamping: existing lattice tests (`latticeForLayer.test.js`, `latticeIntegration.test.js`, `ExtractedPatternGenerator.lattice.test.js`, `resolveModulationForTarget.lattice.test.js`) stay green throughout — canvas/SVG output byte-identical.
3. `MotifPattern` + `placementEngine` output for a fixed seed/params (pin before switching its anchor source).

## Suggested work items (adjust after Phase 0 if reality differs)

- **WI-1 (blocking):** Define the anchor seam — the anchor object shape and a provider dispatch (`anchorsForLayer(layer, layers)` or per-pattern providers; decide and record the location + rationale in the tracking doc, e.g. next to `gridGeometry` in `src/lib/patterns/` vs `src/lib/fields/`). Freeze the contract in the doc before fan-out.
- **WI-2:** Rebuild grid anchors on `gridLinePositions` + `makeP5Random` + `toSymmetryCount`: crossings/edges/tips/cells WITH jitter and symmetry parity. Delete the `distribute()` replay from `semanticAnchors.js`; `semanticAnchors` becomes a thin dispatcher over providers (spiral/recursive/voronoi extractors untouched for now, just routed).
- **WI-3:** Re-express `latticeForLayer` over the shared provider (its nodes = `role:'crossing'` anchors). Keep its public interface stable for `resolveModulationForTarget` consumers, or route through the new seam if cleaner — either way, byte-identity tests from invariant 2 must stay green.
- **WI-4:** Point `placementEngine`/`MotifPattern`'s grid path at the new provider. Note in the doc (do not fix here): `voronoiAnchors` is a production dead branch (always null — no `drawnCells` producer) and `straddleCheck` is built-but-unwired; leave as recorded follow-ups.
- **WI-5 (final, dedicated subagent):** Stale-test sweep. Now that anchors have jitter/symmetry parity, find and remove/replace tests that pinned the OLD degraded behavior (e.g. tests asserting anchors sit on the ideal pre-jitter lattice, base-copy-only symmetry expectations, or the deleted `distribute()` internals). Rules: never delete a byte-identity/parity test; a test is removed only if it encodes behavior this refactor intentionally changed or targets deleted code; every removal gets a one-line justification in the tracking doc. Full suite green after the sweep.

## Definition of done

`npm test` + `npm run lint` green; canvas AND SVG output unchanged for grid, extracted-lattice, and motif layers (byte-identity where tests exist); `distribute()` replay deleted; tracking doc has a final entry summarizing seams created, deletion-test result, and follow-ups (voronoi producer, straddleCheck wiring, spiral/recursive provider migration). Finish by appending a short decision entry (what/why/shape of the anchor seam) to `docs/architecture/decisions/` as a markdown ADR so future reviews don't re-litigate it.
