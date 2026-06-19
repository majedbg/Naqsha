-- ============================================================
-- 004_org_admin.sql
-- Org / Admin / Job-Submission MVP — multi-tenant schema.
-- Tables, SECURITY DEFINER helpers, claim-on-login RPC, RLS
-- policies, private Storage bucket policies, and idempotent seed.
-- Built to docs/org-admin-mvp.md §4 exactly.
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

-- ORGS (platform super-admin provisions via Admin panel)
create table public.orgs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,          -- /o/:slug
  name         text not null,
  logo_url     text,
  accent_color text,                           -- injected as CSS var at runtime
  created_at   timestamptz not null default now()
);

-- PLATFORM ADMINS (super-admin allowlist, email-first like org_members)
create table public.platform_admins (
  email      text primary key,                 -- seeded: majed.bg@gmail.com
  user_id    uuid references public.profiles(id) on delete set null,  -- claimed on login
  created_at timestamptz not null default now()
);

-- ROSTER (email-first; user_id filled on claim-at-login)
create table public.org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  email      text not null,                    -- admin types this
  user_id    uuid references public.profiles(id) on delete set null,  -- null until first login
  is_admin   boolean not null default false,   -- member AND/OR admin
  status     text not null default 'invited',  -- 'invited' -> 'active'
  metadata   jsonb not null default '{}',      -- arbitrary per-member
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- GLOBAL MATERIAL CATALOG (Jade curates) — invariant identity
create table public.materials (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                  -- '1/8in clear acrylic'
  type         text,                           -- 'acrylic' | 'plywood' | ...
  thickness_mm numeric,
  color        text,
  created_at   timestamptz not null default now()
);

-- ORG OFFERING (admin manages) — org-specific attrs
create table public.org_materials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  sheet_w_mm  numeric,                          -- stock sheet size -> aggregation bed
  sheet_h_mm  numeric,
  price       numeric,
  is_active   boolean not null default true,
  unique (org_id, material_id)
);

-- SUBMISSIONS (the job queue) — immutable snapshot
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  submitted_by     uuid not null references public.profiles(id) on delete cascade,
  org_material_id  uuid not null references public.org_materials(id) on delete restrict,
  material_label   text,                         -- denormalized snapshot (survives catalog edits)
  source           text not null,                -- 'upload' | 'design'
  design_id        uuid references public.designs(id) on delete set null,  -- provenance only
  svg_path         text not null,                -- private Storage: <org_id>/<submission_id>.svg
  width_mm         numeric not null,             -- real-world size (parsed/confirmed)
  height_mm        numeric not null,
  ops              jsonb not null default '{}',  -- member-tagged op map
  name             text not null default 'Untitled',
  notes            text,
  status           text not null default 'pending', -- pending|cut|rejected|canceled
  cut_at           timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_org_members_user on public.org_members(user_id);
create index idx_submissions_org on public.submissions(org_id, status);
create index idx_submissions_by on public.submissions(submitted_by);

-- ============================================================
-- SECURITY DEFINER HELPERS (avoid recursive-policy errors)
-- ============================================================

-- Verified-email reader: defensive across synthetic + real Supabase tokens.
create or replace function public.jwt_email_verified()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt()->>'email_verified')::boolean,
    (auth.jwt()->'user_metadata'->>'email_verified')::boolean,
    false
  );
$$;

-- exists active membership for auth.uid()
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- exists active membership w/ is_admin for auth.uid()
create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.is_admin = true
  );
$$;

-- auth.email() (the verified email) in platform_admins
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.platform_admins p
    where p.email = auth.email()
  ) and public.jwt_email_verified();
$$;

-- claim-on-login: matching VERIFIED email flips org_members.user_id + status,
-- and fills platform_admins.user_id. SECURITY DEFINER so a member can claim a
-- row RLS would not otherwise let them write.
create or replace function public.claim_memberships()
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid  := auth.uid();
  v_email text  := auth.email();
begin
  if v_uid is null or v_email is null then
    return;
  end if;
  -- Email verification is the security boundary (invite-hijack prevention).
  if not public.jwt_email_verified() then
    return;
  end if;

  update public.org_members
    set user_id = v_uid, status = 'active'
    where email = v_email and user_id is null;

  update public.platform_admins
    set user_id = v_uid
    where email = v_email and user_id is null;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.orgs            enable row level security;
alter table public.platform_admins enable row level security;
alter table public.org_members     enable row level security;
alter table public.materials       enable row level security;
alter table public.org_materials   enable row level security;
alter table public.submissions     enable row level security;

-- orgs: read if member or platform admin; write if platform admin.
create policy "orgs read member or platform"
  on public.orgs for select
  using (public.is_org_member(id) or public.is_platform_admin());
create policy "orgs insert platform"
  on public.orgs for insert
  with check (public.is_platform_admin());
create policy "orgs update platform"
  on public.orgs for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- platform_admins: a user reads only their own row; no client writes.
create policy "platform_admins read own"
  on public.platform_admins for select
  using (email = auth.email() or user_id = auth.uid());

-- org_members: org admin reads/writes roster; a member reads their own row.
create policy "org_members admin all"
  on public.org_members for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));
create policy "org_members read own"
  on public.org_members for select
  using (user_id = auth.uid());

-- materials: read = any authenticated; write = platform-only.
create policy "materials read authenticated"
  on public.materials for select
  to authenticated
  using (true);
create policy "materials write platform"
  on public.materials for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- org_materials: read if member; write if admin.
create policy "org_materials read member"
  on public.org_materials for select
  using (public.is_org_member(org_id));
create policy "org_materials write admin"
  on public.org_materials for all
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- submissions: member reads/writes own; admin reads all in org + updates.
create policy "submissions member own"
  on public.submissions for select
  using (submitted_by = auth.uid());
create policy "submissions member insert own"
  on public.submissions for insert
  with check (
    submitted_by = auth.uid()
    and public.is_org_member(org_id)
    -- Bind the storage path's org folder to the row's org_id (R1 MEDIUM):
    -- the <org_id> prefix is attacker-controlled, so prevent path/row divergence.
    and split_part(svg_path, '/', 1) = org_id::text
  );
create policy "submissions member update own"
  on public.submissions for update
  using (submitted_by = auth.uid())
  with check (
    submitted_by = auth.uid()
    -- Keep the path/org binding invariant on UPDATE too (no svg_path rebind).
    and split_part(svg_path, '/', 1) = org_id::text
  );
create policy "submissions member delete own"
  on public.submissions for delete
  using (submitted_by = auth.uid());
create policy "submissions admin read org"
  on public.submissions for select
  using (public.is_org_admin(org_id));
create policy "submissions admin update org"
  on public.submissions for update
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

-- ============================================================
-- STORAGE (private bucket): read if owner or org admin; write by owner.
-- Path convention: <org_id>/<submission_id>.svg
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('submissions', 'submissions', false)
  on conflict (id) do nothing;

create policy "submissions storage read owner or admin"
  on storage.objects for select
  using (
    bucket_id = 'submissions'
    and (
      owner = auth.uid()
      or public.is_org_admin(((storage.foldername(name))[1])::uuid)
    )
  );
create policy "submissions storage insert owner"
  on storage.objects for insert
  with check (
    bucket_id = 'submissions'
    and owner = auth.uid()
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy "submissions storage update owner"
  on storage.objects for update
  using (bucket_id = 'submissions' and owner = auth.uid());
create policy "submissions storage delete owner"
  on storage.objects for delete
  using (bucket_id = 'submissions' and owner = auth.uid());

-- ============================================================
-- SEED (idempotent)
-- ============================================================
insert into public.platform_admins (email)
  values ('majed.bg@gmail.com')
  on conflict (email) do nothing;

insert into public.orgs (slug, name)
  values ('itp-camp', 'ITP Camp')
  on conflict (slug) do nothing;

insert into public.org_members (org_id, email, is_admin, status)
  select o.id, 'majed.bg@gmail.com', true, 'invited'
  from public.orgs o where o.slug = 'itp-camp'
  on conflict (org_id, email) do nothing;

insert into public.materials (name, type, thickness_mm, color)
  values ('1/8in clear acrylic', 'acrylic', 3.0, 'clear')
  on conflict do nothing;

insert into public.org_materials (org_id, material_id, sheet_w_mm, sheet_h_mm, price, is_active)
  select o.id, m.id, 600, 400, 25, true
  from public.orgs o, public.materials m
  where o.slug = 'itp-camp' and m.name = '1/8in clear acrylic'
  on conflict (org_id, material_id) do nothing;
