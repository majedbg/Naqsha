# Org / Admin / Job-Submission MVP — Design Spec

> Grilled 2026-06-19. Status: **design locked, NOT built.** Stack: React 19 SPA + Vite +
> Supabase (Postgres + Auth + Storage), Vercel. No TypeScript, no backend server (Supabase only).

## 1. Problem & goal

Today Jade cuts/plots designs for people by hand: they send files, he downloads, renames, imports
into Lightburn/Illustrator, and arranges them on a sheet manually. This feature turns that into a
**multi-tenant job-submission system**: organizations (workshops/makerspaces) get a branded space
where members submit designs (uploaded SVG **or** built in-app), pick a material, and the org admin
sees a queue and **programmatically aggregates submissions onto a material sheet** for cutting.

Secondary: each org gets a light branded UI (the data-driven successor to the hardcoded "ITP Camp"
kit). Future (out of scope): self-serve org signup, billing, true nesting, design-on-demand storefront.

## 2. Locked decisions (grill outcomes)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Submission source | **Both** upload + in-app submit |
| 2 | Submission model | New `submissions` table; **immutable SVG snapshot** in Storage (both sources converge to an SVG artifact) |
| 3 | Cardinality | **Many** submissions per member/org; optional soft per-member quota in app logic |
| 4 | Onboarding | Admin adds members **by email**; member self-auths (Google **or** Supabase email/password); auto-link on email match. No custom credentials, no `service_role`. |
| 5 | Org creation | Created by the **platform super-admin via the Admin panel** (see #17 — supersedes the original manual-SQL plan). Still no public self-serve, no billing UI. |
| 6 | Materials | **Shared global catalog + org↔material join** |
| 7 | Material attrs | **Split**: catalog = identity; join = org-specific attrs; submission FKs the join row |
| 8 | Aggregation | **Grid auto-place → combined SVG export**, client-side. True nesting deferred. |
| 9 | Branding | **Org identity via dynamic CSS vars** (name/logo/accent). Full kit builder deferred. |
| 10 | Org context | **URL-based routes `/o/:slug`** |
| 11 | Lifecycle | Status field `{pending, cut, rejected, canceled}`; **ephemeral batching** (no batches table) |
| 12 | Upload security | **Sanitize + validate on upload** (DOMPurify SVG profile), private bucket, re-sanitize on render |
| 13 | Access control | **Postgres RLS**; members see **only their own** submissions; admins see all org |
| 14 | Roster shape | **Single `org_members` table**, nullable `user_id` + `email`, claim-on-login |
| 15 | Org table | **Minimal**, billing deferred |
| 16a | Upload dimensions | **Parse on upload + member confirm-size**; store `width_mm`/`height_mm` |
| 16b | Cut/engrave ops | **Member tags ops at submit** (in-app: free from `cut/add`+`penSlot`; upload: tag by distinct stroke color) |
| 17 | Platform admin | **RLS-backed `platform_admins` table + `is_platform_admin()`**; super-admin (majed.bg@gmail.com) creates/lists orgs + assigns admins via a top-nav **Admin** panel (reverses #5's manual-SQL) |
| 18 | Admin tab IA | **Role-aware `/admin` dashboard/launcher**; platform section = org CRUD; org-admins get a thin launcher into `/o/:slug` (heavy admin UI stays there, unchanged) |

## 3. Non-negotiable constraints (from review)

- **Email verification before auto-link.** Google OAuth emails are verified. The Supabase email/password
  provider **must require email confirmation** before a login can claim a pending `org_members` row —
  otherwise auto-link-by-email is an invite-hijack / account-takeover vector.
- **FK on-delete:** `submissions.design_id → ON DELETE SET NULL` (the SVG snapshot is source of truth;
  deleting a personal design must not destroy the job). `submissions.org_material_id → ON DELETE RESTRICT`,
  **and** denormalize a material label/thickness snapshot onto the submission so the job record survives
  catalog edits.
- **Removing a member does NOT cascade-delete their submissions** — the job stays in the admin queue;
  only the member's access is revoked.
- **`profiles.org_id` (existing stub) is abandoned** — it's single-org and contradicts multi-org
  membership. Membership lives in `org_members`.
- **Org writes are gated by `is_platform_admin()`.** Creating/editing an org is allowed only for a
  verified platform-admin email. The Admin tab is also hidden client-side, but the RLS policy — not the
  UI — is the real boundary.

## 4. Data model

### Existing (unchanged): `profiles`, `designs`, `design_history`, `collections`, `ai_patterns`.

### New tables

```sql
-- ORGS (Jade provisions manually for MVP)
create table orgs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,          -- /o/:slug
  name         text not null,
  logo_url     text,
  accent_color text,                           -- injected as CSS var at runtime
  created_at   timestamptz not null default now()
);

-- PLATFORM ADMINS (super-admin allowlist, email-first like org_members)
create table platform_admins (
  email      text primary key,                 -- seeded: majed.bg@gmail.com
  user_id    uuid references profiles(id) on delete set null,  -- claimed on login
  created_at timestamptz not null default now()
);

-- ROSTER (email-first; user_id filled on claim-at-login)
create table org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  email      text not null,                    -- admin types this
  user_id    uuid references profiles(id) on delete set null,  -- null until first login
  is_admin   boolean not null default false,   -- member AND/OR admin
  status     text not null default 'invited',  -- 'invited' -> 'active'
  metadata   jsonb not null default '{}',      -- arbitrary per-member (safety certs, etc.)
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- GLOBAL MATERIAL CATALOG (Jade curates) — invariant identity
create table materials (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                  -- '1/8in clear acrylic'
  type         text,                           -- 'acrylic' | 'plywood' | ...
  thickness_mm numeric,
  color        text,
  created_at   timestamptz not null default now()
);

-- ORG OFFERING (admin manages) — org-specific attrs
create table org_materials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  sheet_w_mm  numeric,                          -- stock sheet size -> aggregation bed
  sheet_h_mm  numeric,
  price       numeric,
  is_active   boolean not null default true,
  unique (org_id, material_id)
);

-- SUBMISSIONS (the job queue) — immutable snapshot
create table submissions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  submitted_by     uuid not null references profiles(id) on delete cascade,
  org_material_id  uuid not null references org_materials(id) on delete restrict,
  material_label   text,                         -- denormalized snapshot (survives catalog edits)
  source           text not null,                -- 'upload' | 'design'
  design_id        uuid references designs(id) on delete set null,  -- provenance only
  svg_path         text not null,                -- private Storage: <org_id>/<submission_id>.svg (sanitized)
  width_mm         numeric not null,             -- real-world size (parsed/confirmed)
  height_mm        numeric not null,
  ops              jsonb not null default '{}',  -- member-tagged op map: {color|layer -> cut|score|engrave}
  name             text not null default 'Untitled',
  notes            text,
  status           text not null default 'pending', -- pending|cut|rejected|canceled
  cut_at           timestamptz,
  created_at       timestamptz not null default now()
);
```

### RLS (helpers avoid recursive-policy errors)

```sql
-- SECURITY DEFINER helpers
is_org_member(org uuid)  -> bool   -- exists active membership for auth.uid()
is_org_admin(org uuid)   -> bool   -- exists active membership w/ is_admin
is_platform_admin()      -> bool   -- auth.email() (verified) in platform_admins
```

- `orgs`: read if `is_org_member(id)` **or `is_platform_admin()`**; INSERT/UPDATE if `is_platform_admin()`.
- `platform_admins`: a user reads only their own row; no client writes (seeded / managed out of band).
- `org_members`: admin of the org reads/writes the roster; a member reads their own row.
- `materials`: read = any authenticated; write = platform-only.
- `org_materials`: read if `is_org_member(org_id)`; write if `is_org_admin(org_id)`.
- `submissions`: member reads/writes **own** (`submitted_by = auth.uid()`); **admin** reads all in org +
  updates `status`/`cut_at`. No cross-member visibility.
- **Storage bucket** (private): read if owner or `is_org_admin(org_id)`; write by owner.

### Seed (in the migration)
- `platform_admins`: `email='majed.bg@gmail.com'`.
- `orgs`: ITP Camp — `slug='itp-camp'`, `name='ITP Camp'` (slug == the existing in-code ITP kit id; its
  `accent_color`/`logo_url` bridge to that kit's branding — same identity, not two).
- `org_members`: `(org=itp-camp, email='majed.bg@gmail.com', is_admin=true, status='invited')` — claims to
  your profile on next Google login.
- one demo `material` + `org_materials` row (the spine's seeded material).

## 5. Key flows

**Onboarding.** Admin adds emails to roster → hands out `/o/:slug` link → person logs in (Google or
verified email/password) → on login, match `auth.email` to a pending `org_members` row → set `user_id`,
flip `status='active'` → land in branded org space.

**Submit (both sources).**
1. Member in `/o/:slug` picks an active `org_material`.
2. SVG acquired: **upload** (validate type+size ≤5MB → DOMPurify → parse dims → confirm-size step → tag
   ops by distinct stroke color) **or** **in-app** ("Submit current design" → export SVG; dims exact;
   ops derived from existing `cut/add`+`penSlot`).
3. Store sanitized SVG to private bucket; insert `submissions` row (snapshot dims, ops, material_label).

**Admin aggregate.** Admin opens org queue → filters `pending` by `org_material` → selects rows →
client-side grid auto-place onto `sheet_w_mm × sheet_h_mm` (spillover → next sheet), each piece wrapped
in a labeled `<g>`, ops normalized from tags → export combined SVG → mark selected `cut`.

## 6. Build sequencing (thinnest spine first)

1. **Spine:** 1 manually-seeded org + 1 manual `org_material`; member upload → sanitize → dims confirm →
   queue → grid export → mark cut. (Proves the whole value loop.)
2. Roster management UI (admin add/edit/remove by email) + claim-on-login.
3. In-app "Submit to org" path (reuses export; ops from layer roles).
4. Dynamic per-org CSS-var branding + `/o/:slug` polish.
5. Material catalog/offering admin UI.

Independently shippable; (1) is the demo that de-risks everything.

## 7. User-facing submit form (review card)

Shared by both sources (upload + in-app submit). A single self-contained **review card**,
pre-filled from the upstream flow. Read-only by default; **Edit unlocks inline editing of
submission metadata only** — geometry is immutable here (to change paths, go back to the studio
or re-upload). Nothing is written to `submissions` until the hold-to-submit fires.

### Layout (top → bottom)
- **Header:** job name + org branding (accent color / logo).
- **Preview:** rendered (sanitized) SVG thumbnail.
- **Dimensions readout:** `width × height mm` — the parsed/confirmed real-world size. Read-only badge.
- **Material readout:** selected `org_material` (name, thickness, sheet size). Read-only.
- **Layers list:** each row = one layer (in-app: a design layer; upload: a distinct stroke color),
  showing name + an op-type badge (**cut / score / engrave**), **grouped by op type** for readability.
  Read-only. Member does not sequence cut order (admin owns that in Lightburn).
- **Button bar (bottom)** — mode-aware:
  - Read-only: `[Cancel]  [Edit]  [Hold-to-Submit]`
  - Edit:      `[Cancel edit]  [Save]`  (hold-to-submit hidden while editing)

### Edit mode (metadata only)
Unlocks: material picker (org's active materials), width/height confirm, per-layer op-type
dropdowns, job name. Geometry NOT editable. **Save** validates → returns to read-only.
**Cancel edit** reverts changes.

### Completeness gate (two-stage)
Submit is fully **disabled (greyed, not holdable)** with a clear reason until: material chosen
**AND** size confirmed **AND** every layer op-tagged **AND** in read-only (not editing). Reasons
surface inline — `Pick a material` · `Confirm size` · `Tag layer N` · `Save your edits`. The
gradient/glow cannot even start on an incomplete job.

### Hold-to-confirm submit
Deliberate friction so a member doesn't accidentally commit real material for cutting.
- **Desktop:** press-and-hold (mouse-down, or `Space`/`Enter` key-down) for **2s**. An org-accent
  **gradient fills proportionally to hold progress** (0→2s), and a **glow blooms at full charge**;
  releasing after full = submit, releasing early = **decay back to 0**.
- **Mobile / touch:** plain tap submits (no hold friction — touch has no hover/hold affordance here).
- **Keyboard:** `Enter` activates plainly (a 2s key-hold is worse a11y than the friction is worth).
- Engages **only** when the completeness gate passes.
- **`prefers-reduced-motion`:** replace gradient+glow with a simple 2s progress bar/countdown; keep
  the 2s delay and the disabled-reason via `aria`.

### On submit
Write the `submissions` row (`status='pending'`, snapshot `width_mm/height_mm`, `ops`,
`material_label`; the sanitized SVG is already in the private bucket). The glow resolves into a
brief **success check**, then route to a **"My Submissions"** list for this org showing the new job
as *Pending* (material + size). Member can start another. *(Adds a small member-submissions view;
RLS already scopes it to own rows.)*

### Cancel
Discards the draft and returns to the org space. Confirm if a file was uploaded; drop the sanitized
temp file. Nothing is persisted to `submissions` until submit fires.

## 8. Platform admin panel & top nav

A new persistent `<TopNav>` wraps the router (mounts in `App.jsx` above `<Routes>` — today there is **no
top nav**; the studio fills the screen). It shows an **Admin** tab only when the user is a platform admin
**or** an admin of ≥1 org.

**`/admin` Dashboard** — role-aware:
- **Platform super-admin (you):** an *Organizations* section — create org (name, slug, accent, logo), list
  orgs, and assign an org's first admin **by email** (writes an `org_members` row, `is_admin=true`,
  email-first/claim-on-login). This is how orgs + accounts get set up, replacing manual SQL.
- **Org admin (any user admin of ≥1 org):** a thin *Your organizations* launcher listing their orgs, each
  linking into that org's `/o/:slug` admin view (queue/aggregate/roster/material — unchanged, stays there).
- **MVP builds only** the platform *Organizations* section + the launcher list.

**Security:** every org write goes through RLS `is_platform_admin()`; the tab/route are also client-gated,
but the DB policy is the boundary. Direct nav to `/admin` while unauthorized → access-denied / redirect.

## 9. Deferred (explicitly out of MVP)

True nesting solver · self-serve org creation · org billing/subscription · self-serve kit/theme builder ·
starter-asset libraries · persistent batches/reprints · notifications · shared org gallery · per-member quotas.
