-- ============================================================
-- 005_guest_submission.sql
-- Anonymous guest submission spine (issue #26 data spine).
-- Additive only: never alters/drops existing member policies.
-- Adds nullable guest identity columns, a named XOR identity
-- check, a per-org submissions_open gate, and anon INSERT-only
-- RLS on submissions + storage.objects. Anon gets NO
-- select/update/delete (default-deny covers it).
-- ============================================================

-- ------------------------------------------------------------
-- SCHEMA: relax submitted_by, add guest identity columns.
-- ------------------------------------------------------------
alter table public.submissions alter column submitted_by drop not null;

alter table public.submissions add column guest_name  text;
alter table public.submissions add column guest_email text;
alter table public.submissions add column guest_phone text;

-- Exactly one identity: a member (submitted_by) XOR a guest (guest_name).
-- Boolean `<>` is a clean 2-way XOR that rejects BOTH and NEITHER.
alter table public.submissions
  add constraint submissions_identity_xor
  check ((submitted_by is not null) <> (guest_name is not null));

-- ------------------------------------------------------------
-- ORGS: per-org guest-submission gate (default closed).
-- ------------------------------------------------------------
alter table public.orgs
  add column submissions_open boolean not null default false;

-- security definer: anon cannot read public.orgs directly (no select policy),
-- so the gate check must run with definer privileges.
create or replace function public.is_org_accepting_guests(org uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.orgs o
    where o.id = org and o.submissions_open = true
  );
$$;

-- ------------------------------------------------------------
-- RLS: anon INSERT-only on submissions (mirrors member path/row binding).
-- ------------------------------------------------------------
create policy "submissions anon guest insert"
  on public.submissions for insert
  to anon
  with check (
    public.is_org_accepting_guests(org_id)
    and submitted_by is null
    and guest_name is not null
    and guest_name <> ''
    -- Bind the storage path's org folder to the row's org_id (R1 MEDIUM):
    -- the <org_id> prefix is attacker-controlled, so prevent path/row divergence.
    and split_part(svg_path, '/', 1) = org_id::text
  );

-- ------------------------------------------------------------
-- STORAGE: anon INSERT-only into the submissions bucket while open.
-- No owner check — anon has no auth.uid().
-- ------------------------------------------------------------
create policy "submissions storage anon guest insert"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'submissions'
    and public.is_org_accepting_guests(((storage.foldername(name))[1])::uuid)
  );
