# Brooklyn Spark Dogfood — Next-Steps Plan

> Grilled 2026-06-21. Status: **decisions locked, build NOT started.**
> Strategic anchor: **Direction A — workshop/makerspace operators** (productize the
> manual "Jade cuts files people send him" service). The org/admin MVP is already
> **built + merged to main** (Audit 2026-06-21); it has simply never touched a real
> customer. The next step is therefore **deploy it and run a real workshop on it**,
> not build more features — converting cold code into validated learning.

## 0. One-line thesis
Run the next workshop ("**Brooklyn Spark**") as **Org #1** of the existing org/admin
system, with one new front-door feature (**guest submission**), riding everything
else that's already built, on the real prod database.

---

## 1. Locked decisions (grill outcomes)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Customer / direction | **A — workshop/makerspace operators** | Only direction with proven pull; org/admin ~done |
| 2 | Vehicle | **Dogfood org/admin as Org "Brooklyn Spark"**, with a full dress rehearsal | Cheapest validation of a built-but-cold B2B product |
| 3 | Participant identity | **Guest submission** — `display_name` (required), `email` + `phone` (optional) | 13 beginners can't do email-confirm auth in a 60-min window; optional contact = lead capture |
| 4 | Aggregation (this workshop) | **Ride existing `gridPlace` shelf-packer**; admin nudges final alignment in Lightburn | Tested code; jig-perfect placement is the v2 magic, not the dogfood risk |
| 5 | Submission gate | **Admin "submissions open" time-boxed toggle** (hard boundary); schema leaves room for a per-org code later | Matches physical reality; real security boundary without in-room friction |
| 6 | Database | **Existing prod Supabase** + careful `migration repair` | (User choice over isolated-project rec; see Risks) |
| 7 | Creative access | **Keep `WORKSHOP OVERRIDE` ON** for the session; replace with org-level entitlement after | Guests need all patterns/params; don't leave a global unlock live forever |
| 8 | Laser handoff | **Combined SVG → Lightburn by hand** | Cutter-bridge is for drag cutters, not lasers — out of scope here |
| 9 | Lead-capture follow-up | **Capture only now**; "your piece is ready / make more" is direction-C future | Don't build remarketing for a dogfood |

---

## 2. The ONE thing to build: Guest Submission

A no-account submission path scoped to an org.

- **Data model:** add nullable `guest_name` (required when no `user_id`), `guest_email`,
  `guest_phone` to `submissions` (or a small guest-identity shape). A submission is now
  either member-owned (`user_id`) **or** guest (`guest_*`).
- **RLS:** allow **anon insert** into `submissions` for an org **only while that org's
  `submissions_open` flag is true**. Guest rows are **org-scoped, admin-visible,
  member-invisible** (they break the "members see only their own" assumption — that's
  intended for kiosk mode). Add `orgs.submissions_open boolean` (admin-toggled).
- **Gate:** admin toggles `submissions_open` on for the session window, off otherwise.
  Design the policy so a future per-org `submission_code` can be required without a schema
  redo.
- **UX:** in-app build → "Submit to Brooklyn Spark" → name (req) + email/phone (opt) +
  light consent line for phone → done. Reuses the existing `StudioSubmitModal` /
  `SubmitForm` path, minus auth.
- **Why this is infra, not a hack:** every walk-up / makerspace / event org needs
  no-account submission. This is the correct default front-door for the consumer/edu wedge.

---

## 2A. Build architecture — decisions for the overnight orchestrator (grilled 2026-06-21, Q7–Q11)

| # | Decision | Choice |
|---|----------|--------|
| Q7 | Anonymous guest write path | **Pure RLS-native.** Anon role gets **insert-only** on `submissions` + `storage.objects`, gated by a new `is_org_accepting_guests(org_id)` SECURITY DEFINER helper (reads `orgs.submissions_open`). WITH CHECK enforces `user_id IS NULL`, `guest_name` present, org match, path-binding. **Anon never SELECTs.** No `service_role`, no edge functions. |
| Q8 | RLS verification overnight | **Run local Docker Supabase as the PRIMARY path** — gate every RLS-touching slice red→green on the live local `test:rls` suite (extend `src/test/rls.org.test.js` with anon-guest cases). All-local, nothing online. Degrade-to-mocked + **loud "RLS UNVERIFIED" flag** ONLY if Docker won't boot — not a routine outcome. |
| Q9 | Guest entry topology | **Org-scoped Studio entry, single Studio.** `/o/:slug` "Create a design" CTA opens the existing full Studio with org context threaded (existing `OrgContext` pattern). Submit = "Submit to {org}"; `StudioSubmitModal` branches on auth: member → existing path; **guest → name/email/phone → anon-insert to context org.** No stripped/parallel Studio. |
| Q10 | Definition of done | **Unit/component (mocked, jsdom) + live local RLS overnight.** Generalize `OrgSubmitPage.test.jsx` to the guest branch. **Full-stack browser happy-path is NOT automated overnight** (no e2e infra exists — zero precedent) — it's verified by the **human dress rehearsal** (laser in the loop anyway). Orchestrator's final artifact = the written rehearsal checklist. |
| Q11 | Output boundary | **Auto-merge to `main` on all-green** (acceptable: no real users but Jade; prod DB push stays human-gated per #6, so guest RLS can't reach prod data unattended; worst case = harmless frontend deploy ahead of DB). Commit per vertical slice. **Hard do-not-touch list below.** |

### Guest-submission migration shape (from code audit)
- `submissions.submitted_by` is currently `uuid NOT NULL references profiles(id) on delete cascade` → must become **nullable**.
- Add `guest_name` (text), `guest_email` (text, nullable), `guest_phone` (text, nullable).
- Add **XOR CHECK**: exactly one of (`submitted_by IS NOT NULL`) or (`guest_name IS NOT NULL`).
- Add `orgs.submissions_open boolean default false` (admin-toggled, the hard gate).
- New helper `is_org_accepting_guests(org_id)` SECURITY DEFINER (mirrors the existing `is_org_member` style).

### Hard do-not-touch list (orchestrator obeys regardless of green)
- ❌ Never run `supabase migration repair` or `db push`/deploy to **prod** (human-gated, #6).
- ❌ Never revert the `WORKSHOP OVERRIDE` (must stay on, #7).
- ❌ Never build the jig/gang layout (deferred to v2, Q4/§6).
- ❌ **Additive only** to existing authenticated submit/RLS — do not refactor the member path.
- ❌ Never commit secrets/`.env`; never push to `origin/main` (auto-merge to local `main` is allowed).

## 3. Ride-as-is (do NOT build for the dogfood)
- **Aggregation:** `src/lib/aggregate/{gridPlace,composeSheet}.js` — set the "sheet" to the
  gang area, tune `gapMm` to ~blank pitch, export combined SVG, nudge in Lightburn.
- **Admin queue / aggregate panel:** `src/components/org/admin/*` — already built.
- **Org branding / routes:** `/o/brooklyn-spark`, dynamic CSS vars — already built.
- **Org material:** create an `org_materials` row = "acrylic blank, <size>, engrave".

---

## 4. Workshop-readiness checklist (sequence)
1. **[human-gated] Prod migration repair** — `supabase migration repair` marking 001–003
   applied, then push so only `004_org_admin` runs. **Verify during rehearsal.**
2. Build **guest submission** (§2) behind the `submissions_open` toggle.
3. Create the **Brooklyn Spark org** (platform-admin panel): slug, name, logo, accent.
4. Create the **org material** (acrylic blank, engrave).
5. Confirm **WORKSHOP OVERRIDE** still on (`src/lib/tierLimits.js`).
6. **Dress rehearsal (days before):** 3–5 fake guest submissions → queue → aggregate →
   combined SVG → engrave one real acrylic blank. On a branch DB or with tagged rows +
   cleanup query.
7. Keep the **hardcoded ITP kit path as a hot fallback** in case the deploy misbehaves live.
8. Workshop day: toggle `submissions_open` ON for the session, OFF after.

## 5. Risks (esp. from choosing prod DB, decision #6)
- **Migration repair is a real footgun.** A wrong `db push` before repair diverges prod.
  Gate it behind the rehearsal; do not improvise on workshop morning.
- **Shared blast radius.** Workshop bugs / spam land in the same DB as real users.
  Mitigate: rehearse on a Supabase branch; keep `submissions_open` OFF outside the session;
  have a cleanup query for stray anon rows.
- **Anon insert = abuse surface.** The `submissions_open` toggle is the only thing between
  the queue and the internet. Default it OFF.
- **Packer ≠ jig.** Placement is approximate; admin still does a manual Lightburn nudge —
  collection is automated, placement is not (that's §6's job).

---

## 6. Post-workshop roadmap (the "next product directions")
In priority order, informed by what the live run teaches:
1. **Jig/gang layout (aggregation v2)** — org-material defines blank size + grid
   (rows×cols + pitch + origin); submissions slot into fixed positions, batched by gang
   size; output drops onto the physical jig with zero Lightburn fiddling. *This is the
   defensible magic that makes an operator switch from Lightburn-by-hand.* Reusable for
   coasters / keychains / badges / magnets.
2. **Org-level entitlement** — replace the global `WORKSHOP OVERRIDE` with per-org creative
   access, so unlocking Brooklyn Spark guests doesn't unlock everyone everywhere.
3. **Operator onboarding polish** — make creating an org + roster + materials self-service
   enough that a second operator could run it without Jade.
4. **Lead-capture follow-up (direction-C bridge)** — "your piece is ready" + "make more at
   naqsha.app" using captured email/phone; the funnel from workshop attendee → hobbyist.
5. **Self-serve org signup + billing** — explicitly deferred; only after 2–3 hand-run orgs
   prove the model.

## 7. Housekeeping
- Prune dead branch `text-feature` (+7 commits, superseded by `feat/text-tool-port`).
