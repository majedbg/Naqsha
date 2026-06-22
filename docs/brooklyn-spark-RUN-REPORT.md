# Brooklyn Spark Guest-Submission — Orchestrator Run Report

**Scope:** the three AFK issues #26, #27, #28 (`brooklyn-spark`, `ready-for-agent`). #29 + #30 are HITL —
not touched (a #30 rehearsal checklist was drafted, not executed). **Output boundary:** all work committed
to **LOCAL `main`** only; `origin` never pushed; prod DB never touched.

## Outcome: COMPLETE — all in-scope issues code-complete, green, adversarially reviewed, merged to local main.

Plus one in-scope plan gap discovered and closed mid-run (anon read RLS, migration 007), advisor-confirmed
as required by #27's own acceptance criteria.

## Per-slice status

| Slice | Issue | What shipped | Tests | Review |
|------|-------|--------------|-------|--------|
| A1 | #26 | Migration `005`: `submitted_by` nullable, guest_name/email/phone, named XOR check, `orgs.submissions_open`, `is_org_accepting_guests()`, anon INSERT-only on submissions + storage | live `test:rls` **70→** (part of 81) | **R1 SECURE** |
| A2 | #26 | `orgService.setSubmissionsOpen` + `SubmissionsToggle` (role=switch) admin control | 8 mocked | (in R1 scope) |
| C1 | #28 | Migration `006`: 46 idempotent Canal Plastics acrylic catalog rows (finish×thickness) | live seed-load verified | **R3 PASS** |
| C2 | #28 | `MaterialAdmin` self-fetches via `listMaterials()`; 11 standard sheet sizes (in→mm) | 8 mocked | **R3 PASS** |
| B1 | #27 | `createGuestSubmission` (anon insert, no `.select()`, returns `{ok:true}`) | 9 mocked | **R2 SHIP** |
| B2 | #27 | `/o/:slug/create` route + `OrgCreatePage` (Studio in OrgProvider, optional `submitOrg` prop); StudioSubmitModal guest branch (name req, email/phone opt, consent line, aria-required/invalid); SubmitForm guest mode (gate on guest.name, auto-select single active material, in-modal success, no MySubmissions); "Create a design" CTA | 48 owned + 7 regression | **R2 SHIP** (after 2 minor fixes, applied) |
| D1 | #27 gap | Migration `007`: 3 gated anon SELECT policies (orgs open / org_materials active+open / materials referenced) | live `test:rls` **81 (4 files)** | **R1b SECURE** |

## RLS verification: VERIFIED on live Docker (NOT the mocked-fallback path)
`RLS_LIVE_AVAILABLE=true` for the whole run (Docker booted, `db reset` clean). Every RLS-touching slice
(#26 anon insert/storage, #27-gap anon reads) was gated red→green on the **live local** `npm run test:rls`
(final: 81 passed, 4 files). The "RLS UNVERIFIED" degrade path was never taken. **This is not a mocked-RLS
green.**

## Adversarial reviews (the security gates)
- **R1 (anon-write, #26) — SECURE.** Member-impersonation, closed-org insert, cross-org path, exfiltration
  (anon read-back), anon update/delete, storage escalation, XOR both/neither, empty guest_name — all provably
  blocked at the DB (42501/23514), confirmed by service-role readback. Two NOTEs (anon may set `status`; may
  reference another org's `org_material_id`) are PRE-EXISTING member-path-parity gaps, not introduced, no
  cross-tenant exposure → out of scope for an additive change. No must-fix.
- **R1b (anon-read, #27 gap / migration 007) — SECURE, 23/23.** Cannot enumerate or read closed orgs, inactive
  offerings, materials referenced only by inactive/closed offerings; rosters (`org_members` emails),
  `platform_admins` emails, `submissions` (incl. guest rows), profiles/designs — all denied; no PostgREST embed
  pivot; gate enforced live at query time (open→closed flip immediately revokes). `orgs` anon columns are all
  non-sensitive branding (id/slug/name/logo_url/accent_color/created_at/submissions_open). No must-fix.
- **R2 (guest UI correctness + a11y, #27) — SHIP after 2 minor fixes (applied).** Member path proven
  byte-identical; guest validation/branching correct; no auth/data leak (guest never reads back; done-state
  shows in-modal success, not MySubmissions); consent copy present; auto-material correct. Fixes applied
  (fix-worker, modal-seam-localized, Studio.jsx untouched): (1) guest success done-state made reachable (guest
  path suppresses the host auto-close so "✓ Submitted" renders); (2) `aria-required`/`aria-invalid` on the guest
  name input.
- **R3 (materials, #28) — all ACs MET.** Seed thickness exact (0 rows at 6.0; 1/4in→5.6 resolution; 0
  name/thickness mismatches), idempotent (`where not exists` on name), full coverage; MaterialAdmin self-fetch +
  standard sizes + conversion correct. No bugs.

## Key decisions / judgment calls made during the run
1. **Lint & test baselines are dirty.** Baseline `npm run lint` = 10 problems (6 err/4 warn) in pre-existing
   non-owned files; two `StudioRoute` tests are timeout-flaky under full-suite load (pass in isolation). Gates
   were therefore "no NEW failures / no NEW lint problems vs. baseline," not "zero." Held throughout (final lint
   = 10; flaky pair re-cleared by isolation when it tripped).
2. **C1 thickness 6.0 → 5.6.** Issue prose said "6.0mm minimum" but AC#2 requires matching the Canal mm mapping
   (1/4in = 5.6, no 6.0). Used mapping values {1.5,3.0,4.5,5.6,9.0,12.0}; R3 confirmed.
3. **Honored locked Q9 (full Studio entry)** rather than the easier OrgSubmitPage upload path; reframed against
   Q10 (no e2e overnight) the bar was "wiring exists + seams component-tested." Threaded org context as an
   optional `submitOrg` prop (Studio never calls `useOrg()`, which throws without a provider).
4. **Anon-read gap (007) built, not parked on the human.** Initially read as a Q7↔Q9 conflict; advisor
   clarified Q7's "anon never SELECTs" is scoped to the write surface, so anon-read for org/materials is an
   unaddressed gap that #27 AC1/AC8 require. Built RLS-native (the Q7-endorsed mechanism), R1b-reviewed.

## NEEDS-HUMAN (left for you, per guardrails)
- **#29** — provision the real "Brooklyn Spark" org + acrylic-blank offering (platform-admin panel). HITL.
- **#30** — dress rehearsal + **prod `supabase migration repair` (mark 001–003 applied) then `db push`**
  (applies 004–007 only) + frontend deploy. The ONLY prod-touching steps; never automate. Checklist drafted:
  `docs/brooklyn-spark-REHEARSAL-CHECKLIST.md`.
- **Confirm the anon-readable surface on prod** before/at first `db push` (R1b verified it on local).
- **Browser eyeball:** `/o/:slug/create` stacks TopNav + OrgShell header + AppShell + Studio chrome — possible
  duplicate-nav/overflow that jsdom can't catch (R2 NEEDS-BROWSER). Trim OrgShell/MobileStudio if it looks off.
- **Housekeeping (untouched):** prune dead branch `text-feature`; push `feat/guest-submission`/`main` to origin.
  Both deliberately left to you.

## Git state (local only)
Branch `feat/guest-submission` (worktree `../brooklyn-spark`) fast-forward-merged into **local `main`**:
```
b9de3c3 feat(org): scoped anon read … guest entry (#27 gap)   [migration 007]
8404177 feat(org): guest submission end-to-end (#27)
d99d2cc feat(org): Canal Plastics materials catalog seed + admin wiring (#28)
1029221 feat(org): guest-identity data spine + submissions-open gate (#26)
e74436c docs(brooklyn-spark): add dogfood plan + TDD orchestrator runbook
```
`origin` untouched. The 4 pre-existing user-modified docs in the working tree were left alone.
