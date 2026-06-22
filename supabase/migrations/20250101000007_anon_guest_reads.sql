-- ============================================================
-- 007_anon_guest_reads.sql
-- Minimal, gated anon SELECT policies so the guest Studio entry
-- (#27) can resolve its org branding + active material offerings.
-- Additive only: never alters/drops existing authenticated/member
-- policies. All three policies are role-scoped `to anon` and
-- gated through public.is_org_accepting_guests (migration 005),
-- so closed orgs, inactive offerings, rosters, submissions, and
-- every other surface stay hidden from anonymous clients.
-- ============================================================

-- orgs: anon reads ONLY orgs whose guest gate is open (branding row).
create policy "orgs anon read open"
  on public.orgs for select
  to anon
  using (public.is_org_accepting_guests(id));

-- org_materials: anon reads ONLY active offerings of an open org.
create policy "org_materials anon read active open"
  on public.org_materials for select
  to anon
  using (is_active and public.is_org_accepting_guests(org_id));

-- materials: anon reads ONLY materials referenced by an active offering of
-- an open org. PostgREST embeds (org_materials -> materials) are filtered by
-- the embedded table's own SELECT policy, so this is required for the join.
create policy "materials anon read referenced"
  on public.materials for select
  to anon
  using (
    exists (
      select 1 from public.org_materials om
      where om.material_id = materials.id
        and om.is_active
        and public.is_org_accepting_guests(om.org_id)
    )
  );
