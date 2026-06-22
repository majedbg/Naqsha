# Brooklyn Spark Guest-Submission — TDD Orchestrator Runbook

> Drives an autonomous, overnight, multi-subagent TDD build of **issues #26, #27, #28**
> (`majedbg/Naqsha`, label `brooklyn-spark`). Source of truth for behavior:
> **`docs/brooklyn-spark-dogfood-plan.md`** (read it first) and the three issue bodies.
> Methodology: `/tdd` — vertical slices, tracer-bullet first, behavior-through-public-interface,
> never "all tests first," never refactor while red.
>
> **Scope is the 3 AFK issues only.** #29 (provision org) and #30 (rehearsal + prod migration
> repair & deploy) are **HITL — DO NOT TOUCH.** This runbook's final deliverable for the human
> is a *drafted* rehearsal checklist (doc only), not its execution.

---

## 0. Hard do-not-touch list (read before anything; obey regardless of green)

- ❌ **Never** run `supabase migration repair`, `supabase db push`, or any deploy to **prod**.
- ❌ **Never** push to `origin` (any branch). Local git only.
- ❌ **Never** revert or modify the `WORKSHOP OVERRIDE` block in `src/lib/tierLimits.js` — it stays ON.
- ❌ **Never** build the jig/gang aggregation layout (deferred v2). Ride the existing `gridPlace` packer.
- ❌ **Additive only** to the existing *authenticated member* submit path + its RLS policies. Do not
  refactor the member flow; guest is a new branch alongside it.
- ❌ **Never** commit secrets/`.env`. Read local Supabase keys via `npx supabase status -o env`; never hardcode.
- ✅ **Allowed:** auto-merge each green, reviewed slice into **local `main`** (decision Q11; safe because
  there are no real users but the owner, and the prod DB push stays human-gated in #30).

---

## 1. Roles

**Orchestrator (lead agent) = DISPATCHER ONLY.** Does not write feature code/tests. Sets up the
worktree + harness, holds the DAG, dispatches workers in parallel waves with **disjoint file
ownership**, runs green-gates between waves, launches adversarial reviewers at checkpoints, routes
findings back to fix-workers, commits each green slice, and merges to local `main` when a slice is
green + reviewed.

**Workers = TDD EXECUTORS.** Each gets ONE slice, a public interface, an ordered behavior list, an
owned file set, a test infra. Red→green→refactor per behavior; return when green + lint-clean.

**Reviewers = ADVERSARIAL CHECKERS.** Security/correctness/a11y at checkpoints. The **anon-RLS review
(R1) is the most important gate in this run** — it must actively try to defeat the guest insert policy.

### Worker rules (put verbatim in every worker prompt)
- ONE test → minimal code to pass → next test. **Never** write all tests first (no horizontal slicing).
- Test observable behavior through the **public interface** only. A test that breaks on a pure refactor is wrong.
- Tracer bullet first: the first test proves the path end-to-end, then add behaviors incrementally.
- Never refactor while red. Get green, then refactor, then re-run.
- Touch ONLY your owned files. If you need something outside them, STOP and report to the orchestrator.
- Done = your behaviors green via `npx vitest run <yourfiles>`, `npm run lint` clean, no speculative code.

---

## 2. One-time setup (orchestrator does directly)

1. Clean base: `git worktree add ../brooklyn-spark -b feat/guest-submission main` (work in `../brooklyn-spark`).
2. **Attempt live Supabase ONCE, up front (decision Q8 — hybrid, attempt-live/degrade-loudly):**
   - `npx supabase start` then `npx supabase db reset`.
   - If it comes up clean → set `RLS_LIVE_AVAILABLE=true` for the run; RLS-touching slices gate on the
     **live local** `test:rls` suite.
   - If Docker will not boot/reset → set `RLS_LIVE_AVAILABLE=false`; RLS slices fall back to mocked tests
     **and the orchestrator records `RLS UNVERIFIED — human must run npm run test:rls` in the run log and
     in the final report.** Never silently report a security slice green on mocks.
   - Migrations are already normalized under `supabase/migrations/` (prior org-admin run did Phase 0). No
     re-normalization. New migrations append with later timestamps; seeds are idempotent
     (`insert … on conflict do nothing`).
3. Confirm the shared harness from the org-admin run exists and is usable: `src/test/supabaseMock.js`,
   `src/test/rlsHarness.js` (skips cleanly when Docker down), `src/test/rls.org.test.js`. Reuse them —
   do not rebuild. If absent, dispatch a harness worker first (blocks all RLS work).

---

## 3. Dependency DAG (waves)

```
SETUP ─┬─► PHASE A  (#26 data spine + gate)   ─► R1 adversarial anon-RLS review ─┐
       └─► PHASE C  (#28 materials seed+admin) ─► R3 review ─────────────────────┤
                                                                                 │
PHASE A ─► PHASE B (#27 guest submission e2e) ─► R2 review ───────────────────────┴─► FINALIZE
```
- **A and C are independent → dispatch in the same first wave** (disjoint files).
- **B is blocked by A** (needs the anon insert policies + helper).
- FINALIZE merges to local `main`, drafts the rehearsal checklist, writes the run report.

> **Migration-ordering rule (A1 + C1 both write `supabase/migrations/`):** the orchestrator assigns each
> an **explicit filename with a timestamp strictly greater than the latest existing migration**, up front
> — e.g. `…005_guest_submission.sql` (A1), `…006_materials_catalog_seed.sql` (C1). Workers must NOT invent
> timestamps. The real failure mode is ordering *before* `004`, not name collision.

---

## 4. Phase A — #26 Guest data spine + submissions-open gate  *(the security-critical phase)*

**Worker A1 — migration + RLS + helper.** Owns: a new `supabase/migrations/<ts>_guest_submission.sql`,
and the RLS test file (extend `src/test/rls.org.test.js` or add `src/test/rls.guest.test.js`).
Behavior list (tracer first):
1. Migration applies on `supabase db reset` (tracer): `submitted_by` → nullable; add
   `guest_name/guest_email/guest_phone`; XOR check (exactly one identity); `orgs.submissions_open boolean
   not null default false`; `is_org_accepting_guests(org_id)` SECURITY DEFINER reading `submissions_open`.
2. Anon insert into `submissions` **succeeds** when `submissions_open=true` AND `submitted_by IS NULL` AND
   `guest_name` present AND org/path bind.
3. Anon insert **fails** when `submissions_open=false`.
4. Anon insert **fails** when `submitted_by` is set, or `guest_name` missing, or org_id/path mismatch.
5. Anon `select/update/delete` on `submissions` → denied/empty (insert-only).
6. Anon insert to the `submissions` storage bucket allowed only for the org path while open; blocked else.
7. XOR check rejects both-identities and neither-identity rows.
8. **Regression:** authenticated member insert/select/update unchanged.
Gate: if `RLS_LIVE_AVAILABLE`, all via `npm run test:rls` (live Docker); else mocked + RLS-UNVERIFIED flag.

**Worker A2 — admin "Submissions open" toggle.** Owns: the toggle UI in the org admin area + any
`materialService`-sibling call to flip `orgs.submissions_open`; a component test. Behavior: admin sees
current state, flips it, `is_org_accepting_guests` reflects it. Mocked-Supabase component test.

**R1 — ADVERSARIAL ANON-RLS REVIEW (blocking, highest priority).** Reviewer is prompted to *defeat* the
guest policy: try inserting as a member impersonator, with a forged org_id, with a path pointing at
another org's folder, while `submissions_open=false`, reading back other rows, escalating via the
storage bucket. Default to "vulnerable" unless each attack provably fails. Findings → fix-worker, re-run.

---

## 5. Phase B — #27 Guest submission end-to-end  *(blocked by A)*

**Worker B1 — service guest branch.** Owns: the guest branch in `src/lib/org/` submission/upload
services (anon-key path, no membership lookup, persists guest fields + SVG snapshot). Mocked-Supabase
unit tests. Additive only — member service path untouched.

**Worker B2 — org-scoped Studio entry + guest modal.** Owns: `/o/:slug` "Create a design" CTA, org
context threading into the Studio (existing `OrgContext` pattern), and the `StudioSubmitModal` **guest
branch** (name required, email/phone optional, phone consent line). Component tests generalizing
`OrgSubmitPage.test.jsx` to the guest branch: guest form, name-required validation, member-vs-guest
branch selection. Tracer first: unauth visitor at `/o/:slug` → opens Studio in org context → submits →
service called with guest payload.

**R2 — review (correctness + a11y).** Verify member path regression, guest validation, consent copy
present, no auth leak (guest never sees member/admin data).

---

## 6. Phase C — #28 Materials catalog seed + admin wiring  *(independent; first wave with A)*

**Worker C1 — Canal Plastics catalog seed.** Owns: a new idempotent seed migration. Populate global
`materials` (`name`, `type='acrylic'`, `thickness_mm`, `color`/finish) from the recon data in the issue
(#28) — finish × {1.5, 3.0, 4.5, 6.0 mm} minimum + 9/12 mm for popular finishes. Done-signal: seed loads
on `supabase db reset`; `thickness_mm` matches the mm mapping.

**Worker C2 — admin material setup wiring.** Owns: `MaterialAdmin.jsx` (+ `materialService` only if a
helper is missing). Wire it to `listMaterials()` (drop the stale prop-stub assumption); admin configures
an org offering (material + standard sheet size + price + active). Component tests for catalog listing +
offering add/toggle (mocked). Standard sheet sizes offered as choices.

**R3 — review.** Seed sanity (thicknesses/finishes match Canal Plastics), idempotency, admin flow.

---

## 7. Green-gates (between every wave)

- `npx vitest run` (full mocked suite) green.
- `npm run lint` clean.
- `npm run build` succeeds.
- For RLS slices: `npm run test:rls` green **if** `RLS_LIVE_AVAILABLE`, else logged UNVERIFIED.
- Blocking reviewer for the wave passed (or findings fixed and re-reviewed).
- Then: commit the slice on `feat/guest-submission`, and **merge into local `main`** (no origin push).

## 8. Definition of done (decision Q10)

- #26, #27, #28 behaviors green: unit/component (mocked) + live local RLS (or UNVERIFIED-flagged).
- **No e2e built** (zero precedent; full-stack happy-path is the human's #30 rehearsal).
- All slices committed and merged to local `main`. `origin` untouched.
- **Final post-merge combined gate (after A+B+C are all merged into local `main`):** run the FULL
  `npx vitest run` + `npm run test:rls` (or UNVERIFIED flag) + `npm run build` **once more on `main`** to
  catch cross-slice interactions the per-wave gates can't see. A failure here re-opens the offending slice.

## 9. FINALIZE (orchestrator, after all green + reviews)

1. Draft the **rehearsal checklist doc** for #30 (AFK doc only; do not execute): the full-stack manual
   path build→submit→queue→aggregate(`gridPlace`, sheet=gang area)→export combined SVG→engrave one blank,
   plus the prod `migration repair` reminder. Save under `docs/`.
2. Update status lines in `docs/brooklyn-spark-dogfood-plan.md` (slices built) and note in the run report
   which issues are code-complete vs HITL-pending (#29, #30).
3. Write a run report: per-slice green status, RLS verified-vs-UNVERIFIED, reviewer findings + resolutions,
   anything flagged `NEEDS-HUMAN`. Leave dead-branch pruning (`text-feature`) and `origin` push to the human.
```
