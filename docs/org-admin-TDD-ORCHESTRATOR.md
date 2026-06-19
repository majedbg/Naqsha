# Org/Admin MVP — TDD Orchestrator Runbook

> Drives an autonomous, multi-hour, multi-subagent TDD build of the spec in
> **`docs/org-admin-mvp.md`** (read it first — it is the source of truth for behavior).
> Methodology: `/tdd` — vertical slices, tracer-bullet first, behavior-through-public-interface,
> never "all tests first," never refactor while red.

---

## 0. Roles

**Orchestrator (you, the lead agent) = DISPATCHER ONLY.** You do NOT write feature code or tests.
You: set up the worktree + deps + shared harness, hold the dependency DAG, dispatch worker subagents
in parallel waves with **disjoint file ownership**, run green-gates between waves, launch review
agents at checkpoints, route review findings back to fix-workers, and commit each green slice.

**Workers = TDD EXECUTORS.** Each gets ONE slice (a deep module or coherent feature), a public
interface, an ordered behavior list, an owned file set, and a test infra. They run red→green→refactor
per behavior and return when their slice is green + lint-clean.

**Reviewers = ADVERSARIAL CHECKERS.** Launched at checkpoints. Security/correctness/a11y. Blocking
reviewers must pass (or their findings become a fix-worker task) before the next wave.

### Worker rules (put verbatim in every worker prompt)
- ONE test → minimal code to pass → next test. **Never** write all tests first (no horizontal slicing).
- Test observable behavior through the **public interface** only. No tests on private internals; a test
  that breaks on a pure refactor is wrong.
- Tracer bullet first: the first test proves the path end-to-end, then incrementally add behaviors.
- Never refactor while red. Get green, then refactor, then re-run.
- Touch ONLY your owned files. If you need something outside them, STOP and report to the orchestrator.
- Done = your behaviors green via `npx vitest run <yourfiles>`, `npm run lint` clean, no speculative code.

---

## 1. One-time setup (orchestrator does this directly)

1. From a clean base: create worktree + branch.
   `git worktree add ../org-admin-mvp -b feat/org-admin-mvp main`  (work in `../org-admin-mvp`).
2. Add dep: `npm i dompurify`. (In jsdom tests, instantiate `createDOMPurify(window)`.)
3. **Phase 0 — Migration normalization (orchestrator's FIRST dispatched task; BLOCKS live RLS).**
   This repo's schema files are LOOSE in `supabase/` (`001_initial_schema.sql`…`003`), NOT in
   `supabase/migrations/`, so `supabase db reset` ignores them and a fresh local stack has an EMPTY `public`
   schema. Dispatch **Worker N (normalization)** — owns `supabase/migrations/` + `supabase/config.toml`:
   - `git mv` the loose files into `supabase/migrations/` with ordered timestamp names, preserving order:
     `20250101000001_initial_schema.sql`, `20250101000002_ai_credits.sql`,
     `20250101000003_free_ai_allowance.sql`. (Worker 1a's `…000004_org_admin.sql` lands in the same dir,
     with its seed as **idempotent** `insert … on conflict do nothing` so the seed travels with the migration
     to every env.)
   - Set `[auth.email] enable_confirmations = true` in `config.toml` (the spec §3 verified-email gate is
     untestable with it off; prod must also have confirmations ON).
   - Verify (done-signal): `npx supabase db reset` rebuilds the DB clean, exit 0 (001→003 apply, no errors).
     After 1a lands, the same `db reset` also applies 004 + seed.
   - **Caveat to log (`NEEDS-HUMAN`):** moving to `migrations/` makes it the source of truth for
     `supabase db push` to PROD; since prod already has 001–003, the first push must be reconciled
     (`supabase migration repair` / mark-applied). Do NOT push — flag it for the human.
4. Dispatch **Worker H (shared harness)** — BLOCKS all of Phase 1+. It owns:
   - `src/test/supabaseMock.js` — a chainable mock Supabase client factory (`.from().select().eq()...`,
     `.storage.from().upload()`, `.auth.getUser()`), returning seeded rows + error injection. Used by all
     service tests (no Docker).
   - `src/test/rlsHarness.js` — helper that, IF `npx supabase status` reports running, runs
     `npx supabase db reset` (rebuilds from `migrations/` + seed) then connects with anon + per-user JWTs
     (minted from the local JWT secret read via `npx supabase status -o env`; do NOT hardcode keys) to
     exercise real RLS; otherwise marks the suite `skipped` (never throws — autonomy must not stall on a
     dead Docker).
   - `src/test/fixtures/svg/` — fixtures: `units-mm.svg`, `units-px.svg`, `viewbox-only.svg`,
     `illustrator-pt.svg`, `inkscape-96.svg`, `malicious-script.svg`, `malicious-onload.svg`,
     `external-ref.svg`, `multi-color.svg`, `in-app-export.svg`.
   - Harness has its own tests proving the mock + fixtures load + (when Docker up) `db reset` applies clean.

---

## 2. Dependency DAG (waves)

```
SETUP ─► Worker N (normalize migrations/ + config) ─► Worker H (harness) ─┬─► PHASE 1 logic (1b–1f ‖)
                                                                          └─► 1a migration+RLS+platform_admins+seed (‖) ─► R1 review
R1 ─► PHASE 2 services (2a,2b,2c,2d,2e  ‖ parallel, mocked client) ─► R2 review (live RLS + platform gate)
R2 ─┬─► PHASE 2.5 platform admin panel (P1,P2,P3) ─► R2.5 review (security)
    └─► PHASE 3 submit+form (3a,3b ‖) ─► 3c ─► 3d ; 3e ‖ ─► R3 review ─► DEMO GATE
{R2.5,R3} ─► PHASE 4 admin aggregate (4a ─► 4b ; 4c ‖) ─► R4 review (e2e + security)
R4 ─► PHASE 5 polish (5a,5b ‖) ─► R5 final review
```
`‖` = dispatch concurrently in ONE message (multiple Agent calls). Disjoint files guarantee no collisions.

---

## 3. Worker task specs

Each worker prompt = {slice goal, public interface, ordered behaviors (tracer first), owned files,
test infra, DoD} + the verbatim worker rules from §0.

### PHASE 1 — Foundations

**1a · Schema + RLS + storage + seed** _(infra: live local Supabase via rlsHarness; BLOCKS Phase 2)_
Owns: `supabase/migrations/20250101000004_org_admin.sql`, `src/test/rls.org.test.js`.
Build the 6 tables exactly per spec §4 (orgs, **platform_admins**, org_members, materials, org_materials,
submissions) with FKs + on-delete (`submissions.design_id` SET NULL, `org_material_id` RESTRICT +
denormalized `material_label`; removing a member does NOT delete submissions),
`is_org_member()/is_org_admin()/`**`is_platform_admin()`** SECURITY DEFINER helpers, all RLS policies
(**orgs INSERT/UPDATE gated by `is_platform_admin()`**; `platform_admins` read-own/no-client-write), the
private storage bucket + policies, and the spec §4 seed: **`platform_admins`=majed.bg@gmail.com**, the
**ITP Camp org** (`slug='itp-camp'`), **Jade's itp-camp admin membership** (email-first), and 1 demo
`material`+`org_material`.
Behaviors (vertical, live RLS): (1) tracer — member reads own submission; (2) member CANNOT read
another member's submission; (3) admin reads all org submissions; (4) cross-org admin denied;
(5) anon denied everything; (6) claim-on-login: matching verified email flips org_members user_id+active;
(7) deleting a personal design SET NULLs submission.design_id but row survives; (8) removing a member
leaves their submissions intact; **(9) the platform-admin email can INSERT an org; (10) a non-platform user
CANNOT insert/update any org; (11) claim-on-login also fills `platform_admins.user_id` for a matching
verified email.**

**1b · SVG dimension parser** _(infra: vitest pure)_ — Owns `src/lib/svg/parseDimensions.js`(+test).
Interface: `parseDimensions(svgString) -> { widthMm, heightMm, ambiguous: bool, source }`.
Behaviors: tracer — explicit `width="80mm"` → 80; px→mm at 96dpi; pt (Illustrator); viewBox-only →
`ambiguous:true` with best-guess; Inkscape 90-vs-96 heuristic; missing/garbage → throws typed error.

**1c · Op extractor** _(vitest pure)_ — Owns `src/lib/svg/extractOps.js`(+test).
Interface: `extractOps(svgString, { source }) -> [{ key, label, defaultOp }]` where for uploads `key`=
distinct stroke color, for in-app `key`=layer id (op from `cut/add`+`penSlot`). Behaviors: tracer — one
stroke color → one row; multiple colors deduped; in-app roles map to cut/score/engrave; empty → [].

**1d · SVG sanitizer** _(vitest + jsdom)_ — Owns `src/lib/svg/sanitizeSvg.js`(+test).
Interface: `sanitizeSvg(svgString) -> { clean: string, removed: string[] }` via DOMPurify SVG profile.
Behaviors: tracer — benign svg passes unchanged; `<script>` stripped; `onload=`/event handlers stripped;
`<foreignObject>` removed; external/remote `href`/`xlink:href` neutralized; returns what was removed.

**1e · Grid sheet packer** _(vitest pure)_ — Owns `src/lib/aggregate/gridPlace.js`(+test).
Interface: `gridPlace(pieces[{id,wMm,hMm}], { sheetWMm, sheetHMm, gapMm }) -> sheets[[{id,xMm,yMm}]]`.
Behaviors: tracer — one piece at origin+gap; row fills then wraps; column fills then new sheet
(spillover); a piece larger than the sheet → typed error/flagged; gap respected.

**1f · Sheet composer** _(vitest + jsdom)_ — Owns `src/lib/aggregate/composeSheet.js`(+test).
Interface: `composeSheet(placedPieces, sheetDims) -> svgString`. Behaviors: tracer — one piece wrapped
in a labeled `<g data-submission>`; transforms position pieces correctly; op tags normalized to stroke
convention; output sized to sheet mm; multiple pieces grouped + labeled.

> **R1 REVIEW (blocking):** (a) **security** reviewer audits 1a RLS/storage policies + 1d sanitizer for
> XSS bypass; (b) **correctness** reviewer audits 1b parser dpi/unit math + 1e packing edge cases.
> Findings → fix-worker before Phase 2.

### PHASE 2 — Data services _(infra: supabaseMock; one focused live-RLS smoke in 2c)_
Owns disjoint files under `src/lib/org/`.
- **2a** `orgService.js` + `membershipService.js`: get org by slug, roster list/add-by-email/edit/remove,
  claim-on-login match, is-admin guard. Behaviors: tracer — add email creates invited row; duplicate
  email rejected (unique); claim flips to active; remove revokes but (assert) submission query untouched.
- **2b** `materialService.js`: list active org_materials (join catalog), admin add/toggle. Tracer —
  list returns catalog identity + org sheet attrs merged.
- **2c** `submissionService.js`: `createSubmission` (writes snapshot: dims, ops, material_label, svg_path,
  status=pending), `listMine`, `listForOrg(admin)`, `markStatus`. Tracer — create returns pending row with
  snapshot fields; listMine scoped to user; markStatus pending→cut sets cut_at. One live-RLS smoke: member
  create + admin sees it.
- **2d** `uploadService.js`: take sanitized svg → upload to private bucket `<org>/<id>.svg`, return path.
  Tracer — uploads sanitized bytes to correct path; rejects >5MB / non-svg.
- **2e** `platformService.js`: `isPlatformAdmin()`, `createOrg({name,slug,accent,logo})`, `listOrgs()`,
  `assignOrgAdmin(orgId, email)`. Tracer — create returns the org row; duplicate slug rejected (unique);
  assignOrgAdmin writes an email-first `org_members` row with `is_admin=true`. One live-RLS smoke:
  platform-admin JWT can insert an org; a normal-user JWT is denied.

> **R2 REVIEW (blocking):** integration reviewer runs the live RLS suite end-to-end against local
> Supabase, confirms snapshot immutability + on-delete behaviors hold through the service layer, **and
> that org INSERT/UPDATE is allowed ONLY under `is_platform_admin()`** (security focus on 2e).

### PHASE 2.5 — Platform admin panel _(infra: jsdom + RTL; uses 2e; runs ‖ with Phase 3)_
Implements spec §8. Disjoint files; can run concurrently with Phase 3's 3a/3b.
- **P1** `src/components/nav/TopNav.jsx` (+ mount in `App.jsx` above `<Routes>`): persistent top bar with an
  **Admin** tab shown only when `isPlatformAdmin()` OR admin of ≥1 org. Tracer — tab hidden for anon/plain
  member; visible for platform admin; visible for an org-admin.
- **P2** `src/pages/AdminPage.jsx` + `/admin` route: role-aware Dashboard. PLATFORM section = create org
  (name/slug/accent/logo) + list orgs + assign-admin-by-email (via 2e). Tracer — platform admin sees the
  Organizations section and can submit a create; a non-platform user hitting `/admin` gets access-denied/redirect.
- **P3** `src/components/admin/OrgLauncher.jsx`: thin *Your organizations* list for org-admins linking to
  `/o/:slug`. Tracer — lists only orgs where the user is admin; each links to the org admin view.

> **R2.5 REVIEW (blocking):** security reviewer confirms `/admin` + every create/assign action is gated by
> `is_platform_admin()` at BOTH the UI and (already verified in R2) the RLS layer — UI gating alone is never
> the boundary. a11y pass on the new TopNav.

### PHASE 3 — Submit pipeline + review-card form _(infra: jsdom + RTL + fake timers)_
- **3a** `src/pages/org/OrgRoute.jsx` + `OrgContext.jsx`: `/o/:slug` route, load org, inject
  accent/logo as CSS vars. Tracer — valid slug renders branded shell; unknown slug → not-found.
- **3b** `src/lib/org/claimOnLogin.js` wiring + email-verified gate. Tracer — verified email matching an
  invited row links membership; UNVERIFIED email does NOT link (hard gate).
- **3c** `src/components/org/UploadPipeline.jsx`: file pick → sanitize(1d) → parseDimensions(1b) →
  confirm-size step → extractOps(1c) tagging. Tracer — dropping a fixture advances through to a populated
  draft; ambiguous dims force the confirm step.
- **3d** `src/components/org/SubmitForm.jsx` + `HoldToSubmitButton.jsx` — the §7 review card.
  Behaviors (tracer first): read-only card renders dims/material/op-grouped layers; Edit→inline edit→Save
  round-trips metadata; **two-stage gate** — submit disabled with correct reason until valid+read-only;
  **hold-to-confirm** (fake timers) — holding 2s arms then fires; releasing early resets; **mobile tap**
  fires immediately; **keyboard Enter** fires; `prefers-reduced-motion` swaps glow for progress bar;
  Cancel abandons (drops temp file, nothing persisted).
- **3e** `src/components/org/MySubmissions.jsx`: list own with status. Tracer — shows new pending job.

> **R3 REVIEW (blocking):** UX/a11y reviewer audits the hold-button (keyboard/touch/reduced-motion) +
> form state machine; correctness reviewer checks submit→snapshot write path.
> **DEMO GATE:** after R3 + Phase 4's 4a/4b, the full loop (upload→queue→export→cut) is demoable.

### PHASE 4 — Admin queue + aggregate _(jsdom+RTL; uses 1e/1f/2c)_
- **4a** `src/components/org/admin/AdminQueue.jsx`: admin-only list, filter pending by org_material.
  Tracer — non-admin denied; admin sees org pending grouped by material.
- **4b** `AggregatePanel.jsx`: select → gridPlace(1e) → composeSheet(1f) → download combined SVG →
  markStatus cut(2c). Tracer — selecting N pieces produces one sheet SVG + flips them to cut; spillover →
  multiple sheets.
- **4c** `src/components/org/SubmitToOrg.jsx`: in-app path — export current design SVG, ops from layer
  roles, reuse SubmitForm. Tracer — submitting a studio design writes a pending submission with exact dims.

> **R4 REVIEW (blocking):** e2e reviewer walks upload-path AND in-app-path → queue → aggregate → cut;
> security reviewer re-checks admin authorization on every admin action; full `npm run test`+`build` green.

### PHASE 5 — Polish _(parallel)_
- **5a** `MaterialAdmin.jsx` — admin CRUD on org_materials. **5b** branding/theme refactor cleanup
  (replace hardcoded `KNOWN_THEMES`/static theme blocks with the data-driven CSS-var path; the seeded
  `itp-camp` org derives its accent/logo from the existing in-code ITP kit — same identity, the bridge).

> **R5 REVIEW (final):** full regression — all prior 143 tests + new suites green, lint clean, build OK,
> spec §3 non-negotiables re-verified (email-verified gate, on-delete rules, RLS isolation, sanitization).

---

## 4. Green gates & commit protocol
- Between waves the orchestrator runs: `npm run test` (ALL green), `npm run lint`, `npm run build`.
- A wave is not "done" until its gate is green AND its blocking review passed.
- Commit per green slice on `feat/org-admin-mvp` with message ending:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the user asks.

## 5. Failure / recovery rules
- Worker reports it needs files outside its scope → orchestrator re-partitions, does not let it proceed.
- Live Supabase down → live RLS suites mark `skipped` (not failed); R2/R4 fall back to policy review-only
  and the orchestrator logs a `NEEDS-HUMAN: live RLS unverified` note. The loop continues.
- A blocking review fails → dispatch a fix-worker scoped to the offending files, re-run the gate, re-review.
- Flaky/timeout in a worker → retry once with a tighter scope; if still failing, park the slice and
  continue independent slices, surfacing the parked item.

## 6. How to launch
Point a fresh lead agent at this file: _"Act as the orchestrator in
`docs/org-admin-TDD-ORCHESTRATOR.md`. Do §1 setup, then execute the waves, dispatching worker and review
subagents per the specs. You dispatch and gate; you do not write feature code."_
