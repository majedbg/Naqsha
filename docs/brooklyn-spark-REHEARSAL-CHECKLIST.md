# Brooklyn Spark — Dress-Rehearsal Checklist (Issue #30, HUMAN-GATED)

> **Drafted by the overnight orchestrator. NOT executed.** This is the manual, full-stack
> happy-path that the automated build deliberately does NOT cover (no e2e infra; Q10). Run it
> days before the workshop, on a Supabase **branch DB** or with tagged rows + a cleanup query.
> The prod `migration repair` + `db push` here are the ONLY prod-touching steps and must be
> done by a human, never automated.

## 0. Pre-flight (verify the build landed)
- [ ] On `main`: migrations `001`–`007` present; `npx vitest run` green; `RLS_LIVE=1 npm run test:rls` green on local Docker.
- [ ] `WORKSHOP OVERRIDE` still ON in `src/lib/tierLimits.js` (grep `WORKSHOP OVERRIDE`). Guests need all patterns/params.
- [ ] Frontend builds: `npm run build`.

## 1. Provision (issue #29 — do this first; HUMAN, platform-admin panel)
- [ ] Create org: `slug=brooklyn-spark`, `name="Brooklyn Spark"`, accent color, logo.
- [ ] Add ONE active org material: an acrylic-blank engrave offering from the seeded catalog (#28),
      with **sheet dims = the gang area** (the `gridPlace` packer treats this as the bed).
- [ ] Confirm `submissions_open` defaults **OFF**.
- [ ] Confirm at least one platform/org admin can see the org admin queue.

## 2. Full-stack guest happy-path (the rehearsal proper)
Run with `submissions_open` **ON** for the rehearsal window (toggle via the admin "Submissions open" control).
- [ ] As an **unauthenticated** visitor, open `/o/brooklyn-spark`. The branded org shell loads (name/accent/logo).
      → **Verifies anon read of `orgs`** (migration 007). If this 404s ("Organization not found"), `submissions_open`
      is OFF or 007 didn't deploy.
- [ ] Click **"Create a design"** → lands at `/o/brooklyn-spark/create`, the full Studio in org context.
- [ ] Build a simple design (engrave a name). Confirm patterns/params are unlocked (WORKSHOP OVERRIDE).
- [ ] Click **"Submit to Brooklyn Spark"** → guest modal. Enter a display name (required); optionally email/phone
      (note the consent line). The single active material auto-selects (no picker). → **Verifies anon read of
      `org_materials`/`materials` (007)** + the auto-material path (#27 AC8).
- [ ] Hold-to-submit. Confirm the in-modal **"✓ Submitted"** success state appears (guest does NOT see a
      submissions list — anon has no read-back, by design). → **Verifies anon INSERT on submissions + storage (005).**
- [ ] Repeat for **3–5 fake guests** (varied names; some with email/phone, some without).
- [ ] As **admin**, open the org admin queue. All guest rows appear alongside any member rows (queue keys on the
      submission name; guest rows have `guest_name`, null `submitted_by`).
- [ ] **Aggregate:** run the existing aggregate panel (`gridPlace` packer, sheet = gang area). Export the
      **combined SVG**.
- [ ] Open the combined SVG in **Lightburn**. A manual nudge of placement is acceptable for v1 (jig-perfect
      placement is deferred v2). → cutter-bridge is for drag cutters, not the laser; laser handoff is by hand.
- [ ] **Engrave ONE real acrylic blank** from the combined export. Confirm it physically comes out right.
- [ ] Toggle `submissions_open` **OFF**. Re-confirm an anon visitor at `/o/brooklyn-spark` can no longer reach
      the create flow / submit (org branding hidden again — 007 gate is live, not seed-time).
- [ ] Run the stray-row cleanup query for any tagged rehearsal rows.

## 3. Prod migration repair + deploy (HUMAN ONLY — the footgun)
> Prod Supabase has `001`–`003` applied; the repo consolidated migrations. Do NOT `db push` before repair.
- [ ] `supabase migration repair` marking `001`,`002`,`003` as **applied** (so they are NOT re-run).
- [ ] Verify with `supabase migration list` that only `004`,`005`,`006`,`007` are pending.
- [ ] `supabase db push` → applies ONLY `004_org_admin`, `005_guest_submission`, `006_materials_catalog_seed`,
      `007_anon_guest_reads`. Confirm no re-apply of `001`–`003`.
- [ ] **Before push, review the anon-readable surface on prod** (R1b-confirmed on local): anon can read only
      OPEN orgs' branding (`id/slug/name/logo_url/accent_color/created_at/submissions_open`), active offerings of
      open orgs, and their referenced materials — nothing else (no rosters, no platform_admins, no submissions).
- [ ] Deploy the frontend.
- [ ] Smoke test guest submission against **prod** with `submissions_open` ON, then turn it **OFF**.
- [ ] Confirm `submissions_open` is OFF outside the live session; keep the stray-row cleanup query on hand.
- [ ] Keep the hardcoded ITP kit path as a **hot fallback** in case the deploy misbehaves live.

## 4. Known non-blocking items to eyeball during rehearsal (from the overnight reviews)
- [ ] **Chrome stacking (R2 NEEDS-BROWSER):** `/o/:slug/create` renders under TopNav (NavLayout) + OrgShell header
      + AppShell + the Studio's own full-viewport chrome. jsdom can't catch layout; check for duplicate nav bars /
      overflow on a real screen and trim if it looks off (OrgShell / MobileStudio, not touched by the build).
- [ ] **Guest "Make another":** after submit, the guest's success state offers "Make another," which closes the
      modal back to the Studio. Confirm that reads sensibly to a walk-up beginner (product call; acceptable for v1).
- [ ] Workshop day: `submissions_open` ON for the session, OFF after. `WORKSHOP OVERRIDE` ON.
