-- ============================================================
-- 014_material_evaluations.sql  (material-evaluation vertical slice 1)
--
-- ⚠️  HUMAN-GATED: review + apply manually (Supabase SQL editor or CLI).
--     Nothing in CI/agents may run it. Authored only.
--
-- An EVALUATION SUBMISSION (docs/material-evaluation-VISION.md): a maker's
-- photo of their physical Sheet next to a screenshot of the 3D preview
-- rendering the same Material Archetype, stored as ONE row so the pairing is
-- the atomic unit of evidence. Downstream of ADR 0003 ("acceptance is
-- external, not taste") — this table is where community-supplied side-by-side
-- evidence accumulates.
--
-- PROVISIONAL decisions (docs/material-evaluation-DECISIONS-DRAFT.md — morning
-- review required):
--   • Owner-only RLS, mirroring user_motifs. The community-gallery / public
--     visibility question is OPEN in the vision; private-by-default is the
--     conservative, reversible choice (loosening later is additive policy).
--   • `kind` seam: 'material-vs-render' today; the owner's executed-piece
--     evolution lands as a new kind value, not a new table.
--   • `archetype` is DENORMALIZED at submission time (resolveAppearance may
--     change later; the evidence must record what the render actually used).
--   • The weekly re-assessment job (BINDING pre-decision: PROPOSE-ONLY, never
--     auto-applies archetype constants) is NOT built in this slice; nothing
--     here grants any writer access to archetype constants — they live in
--     code (src/lib/three3d/materialArchetypes.js), not in this database.
-- ============================================================

create table public.material_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Which preview material was evaluated. material_id/name come from the
  -- Material-lens catalog (materialPreview.js DEFAULT_PREVIEW_MATERIALS or a
  -- future org catalog); archetype is the resolved Material Archetype id the
  -- render actually used, captured at submission time.
  material_id text not null,
  material_name text not null,
  archetype text not null,

  -- Submission variant seam (vision: material-vs-render today, the executed
  -- piece [a Run's physical output] vs-render as the owner's evolution).
  kind text not null default 'material-vs-render'
    check (kind in ('material-vs-render', 'piece-vs-render')),

  -- Storage object paths in the private `material-evaluations` bucket:
  --   <user_id>/<evaluation_id>/photo.<ext>   (maker's photo of the Sheet)
  --   <user_id>/<evaluation_id>/render.png    (3D preview screenshot)
  photo_path text not null,
  render_path text not null,

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.material_evaluations enable row level security;

-- Owner-only read/write (mirrors user_motifs). The vision's community gallery
-- and calibration-aggregation reads are OPEN questions; when they are decided
-- a dedicated read policy (or a service-role reader) is ADDED — nothing about
-- this policy needs to change.
create policy "Owner full access"
  on public.material_evaluations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Per-user review list (newest first) + the future re-assessment job's
-- per-archetype rollup.
create index idx_material_evaluations_user
  on public.material_evaluations(user_id, created_at desc);
create index idx_material_evaluations_archetype
  on public.material_evaluations(archetype, created_at desc);

-- Shared updated_at trigger (defined in 001_initial_schema.sql).
create trigger material_evaluations_updated_at
  before update on public.material_evaluations
  for each row execute function public.set_updated_at();

-- ── Storage: private bucket for the photo/render pair ───────────────────────
-- PRIVATE bucket (public = false): objects are served only via signed URLs
-- created by the owner's session. 10 MB cap, images only — conservative
-- defaults, revisit at the grill.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-evaluations',
  'material-evaluations',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Owner-scoped object access: the first path segment is the owner's uid
-- (photo_path/render_path convention above), the standard Supabase
-- per-user-folder pattern.
create policy "Evaluation owners manage own objects"
  on storage.objects for all
  using (
    bucket_id = 'material-evaluations'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'material-evaluations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
