-- ============================================================
-- 015_etch_sources.sql  (Raster Etch S7, issue #86)
--
-- ⚠️  HUMAN-GATED: review + apply manually (Supabase SQL editor or CLI).
--     Nothing in CI/agents may run it. Authored only. Coordinate its
--     application with the other unapplied migration (014_material_evaluations)
--     — see NEEDS-HUMAN.md.
--
-- The SIGNED-IN half of the Etch's hybrid source storage (grilled decision 7):
-- a guest/offline Etch keeps its capped (≤~1024px) source data-URI ON the layer
-- (S1, unchanged); a signed-in Etch uploads its FULL-resolution source photo to
-- this PRIVATE bucket and the layer stores a `sourcePath` instead of inlining the
-- base64 bytes. So the saved design stays small and the full-res source survives
-- the localStorage quota that capped guest sources can exceed.
--
-- NO TABLE / NO COLUMN. `sourcePath` is a plain Etch-layer param that rides
-- inside the existing design blob (`public.designs.config` jsonb =
-- { layers, canvasW, canvasH, … }). This migration therefore provisions ONLY the
-- private storage bucket + its owner-only object RLS — mirroring the
-- material-evaluations bucket shape (migration 014).
-- ============================================================

-- ── Storage: private bucket for Etch source photos ──────────────────────────
-- PRIVATE bucket (public = false): objects are served only via the owner's
-- authenticated session (client downloads, never a public URL). 10 MB cap,
-- images only — conservative defaults mirroring the material-evaluations bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'etch-sources',
  'etch-sources',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Owner-scoped object access: the first path segment is the owner's uid
-- (`<user_id>/<source_id>/source.<ext>` — buildEtchSourcePath), the standard
-- Supabase per-user-folder pattern. Owner-only, matching the material-evaluation
-- precedent — no public/shared read is granted here.
create policy "Etch source owners manage own objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'etch-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'etch-sources'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
