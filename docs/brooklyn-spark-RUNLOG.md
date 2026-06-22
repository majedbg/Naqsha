# Brooklyn Spark Guest-Submission — Orchestrator Run Log

Branch: `feat/guest-submission` (worktree `../brooklyn-spark`). Scope: issues #26, #27, #28.
Orchestrator = dispatcher only. Local git only; no origin push; no prod DB.

## Environment (setup, verified)
- Real repo root: `generative-art-studio/`. Worktree created from `main@e74436c` (incl. brooklyn docs).
- `npm install` in worktree: done.
- Live Supabase Docker: UP. `db reset` applies all 4 existing migrations cleanly.
  Container `supabase_db_generative-art-studio` (single shared stack). Seed: materials=1, orgs=1.
  **RLS_LIVE_AVAILABLE = true** → RLS slices gate on live `npm run test:rls`.
- Baseline test suite: full `npx vitest run` shows **timeout-flaky** failures (NOT hard-broken) in:
  - `StudioRoute.aichat.test.jsx > "Object menu opens the AI Pattern Generator dialog"`
  - `StudioRoute.documentsetup.test.jsx > "...custom bed survives a same-Apply profile switch"`
  Both pass 7/7 in isolation (2 passes). **Gate rule = "no NEW failures vs. this set."** A full-run
  failure of exactly these two clears via isolation re-run; any OTHER StudioRoute failure (B2 touches
  adjacent code) is a real regression.

## Migration ordering (orchestrator-assigned, do not let workers invent)
- A1 → `supabase/migrations/20250101000005_guest_submission.sql`
- C1 → `supabase/migrations/20250101000006_materials_catalog_seed.sql`
  (C1 authors to `docs/staging/006_*.sql`; orchestrator promotes after A1's live loop to keep A1 resets clean.)

## Open decisions / flags
- **C1 thickness 6.0 vs 5.6:** issue prose says "1.5/3.0/4.5/6.0 mm minimum" but AC#2 requires
  `thickness_mm` match the Canal mm mapping (1/4in→5.6, no 6.0). Resolution: use mapping values
  {1.5,3.0,4.5,5.6} + {9.0,12.0} for popular finishes. Flag to R3.

## Waves
### Wave 1 (COMPLETE — all 4 workers green): A1 (live, exclusive), A2, C1, C2
- [x] A1 — migration `005` + anon-RLS tests (extended rls.org.test.js). `npm run test:rls` → **70 passed (4 files)**.
      Named XOR constraint `submissions_identity_xor`; 2 anon INSERT-only policies (submissions + storage.objects).
      LESSON for B1: anon has no SELECT policy → guest insert must NOT chain `.select()` (read-back fails & masks WITH CHECK).
- [x] A2 — `orgService.setSubmissionsOpen(orgId,open)` + `SubmissionsToggle.jsx` (role=switch). vitest 8 passed (mocked).
- [x] C1 — materials catalog seed → promoted to `migrations/20250101000006`. 46 rows, thicknesses {1.5,3.0,4.5,5.6,9.0,12.0}.
- [x] C2 — `MaterialAdmin` self-fetches via `listMaterials()` + standard sheet-size dropdown (in→mm). vitest 8 passed (mocked).

ORCHESTRATOR LIVE VERIFICATION (post-promote `db reset` of 005+006):
- 47 materials total; distinct acrylic thickness_mm = {1.5,3.0,4.5,5.6,9.0,12.0}; **0 rows at 6.0** (5.6 resolution holds).
- submissions guest cols=3; submitted_by nullable=YES; is_org_accepting_guests present.
- anon policies = exactly 2, both INSERT (submissions + storage.objects); no anon select/update/delete.

Lint baseline (gate target — must stay exactly): **10 problems (6 errors, 4 warnings)**, all pre-existing non-owned files
(Studio.jsx, ColorViewControl.jsx, usePanelWidth.js, fontRegistry.js, transformGestures.js, useCanvas.js, useLayers.js, Dendrite.verify.test.js).

- [x] Wave-1 green gate: full vitest **1555 passed / 0 failed** (188 files); lint **10 problems (=baseline, no new)**; build **OK**.
- [x] R1 — adversarial anon-RLS review → **SECURE**. All attack classes (member-impersonation, closed-org, cross-org path,
      exfiltration, anon update/delete, storage escalation, XOR both/neither, empty-name) provably blocked at the DB,
      confirmed by service-role readback. NOTEs #8/#8b (status freedom, cross-org org_material_id) = PRE-EXISTING member-path
      parity gaps, not introduced, no cross-tenant exposure → out of scope (additive-only). No must-fix.
- [x] R3 — materials review → all ACs MET. Seed thickness exact (0@6.0, 0 mismatches), idempotent, full coverage;
      MaterialAdmin self-fetch + 11 standard sizes + correct in→mm conversion. No bugs.
- [x] **RLS VERIFIED on live Docker** (RLS_LIVE_AVAILABLE was true). Not mocked. (#26 is NOT the UNVERIFIED fallback path.)
- [x] Committed slices #26 + #28 on feat/guest-submission; merged to LOCAL main.

### Wave 2 (COMPLETE — green + reviewed): B (#27 guest e2e)
Architecture (advisor-confirmed): honor Q9 (full Studio entry, NOT the OrgSubmitPage upload path). Q10 bar =
"wiring exists + seams component-tested," not e2e. New route `/o/:slug/create` mounts the EXISTING Studio wrapped in
OrgProvider; Studio takes an optional `submitOrg` prop (never calls useOrg() itself — useOrg throws w/o provider);
org+unauth → StudioSubmitModal guest branch. 3 pre-checks resolved: Studio→modal is localized (3-line edit); no auth
guard on /o/:slug; AdminQueue keys on row.name so guest rows already render.
- [x] B1 — `createGuestSubmission` in submissionService (anon insert, NO `.select()`, returns {ok:true}). 9 passed.
- [x] B2 — guest UI vertical: `/o/:slug/create` route + OrgCreatePage wrapper + "Create a design" CTA;
      StudioSubmitModal guest branch (name req, email/phone opt, consent line); SubmitForm guest mode (gate requires
      guest.name not userId; auto-select single active material #AC8; guest done-state = "✓ Submitted", NOT MySubmissions);
      Studio.jsx 3-line localized threading. 48 owned + 7 regression passed.
- [x] Orchestrator fix: added OrgCreatePage mock to src/App.jsx's smoke test src/App.test.jsx (B2 correctly STOPPED —
      not its owned file; new static import pulled the heavy Studio→gifenc chain into the canvas-free smoke). 8 passed.
- [x] R2 — correctness + a11y → **SHIP after 2 minor fixes** (member path proven byte-identical; 63 passed; no data leak;
      anon insert select-free confirmed). Fixes applied (fix-worker, modal-seam-localized, Studio.jsx untouched):
      (1) guest done-state now reachable — guest path suppresses host onSubmitted so the modal shows "✓ Submitted" instead
      of auto-closing; "Make another" closes via onCancel. (2) aria-required/aria-invalid on guest name input. 48+7 passed.
- [ ] Wave-2 re-gate after fixes (full vitest / lint / build) — running
- [ ] commit #27 slice + merge to local main

R2 NEEDS-BROWSER/NEEDS-HUMAN notes (not blocking code, for #30 rehearsal): (a) /o/:slug/create stacks TopNav+OrgShell+
Studio chrome — possible double-nav/overflow, jsdom can't catch. (b) guest path still relies on anon SELECT for org
resolution (useOrg/getOrgBySlug) + listActiveOrgMaterials — those anon read policies aren't exercised by mocked tests;
verify live in rehearsal. [See FINALIZE rehearsal checklist.]

### Finalize
- [ ] combined post-merge gate on local main
- [ ] rehearsal checklist doc (#30, draft only)
- [ ] run report
