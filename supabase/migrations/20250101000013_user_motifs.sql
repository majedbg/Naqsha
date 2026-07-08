-- ============================================================
-- 013_user_motifs.sql  (svg-motif-editor P4 — global motif library)
--
-- ⚠️  HUMAN-GATED: review + apply manually (Supabase SQL editor or CLI).
--     Nothing in CI/agents may run it. Authored only.
--
-- The GLOBAL, per-user motif library (DECISIONS D1). A custom motif lives in a
-- document's `customGlyphs` store; the user may PROMOTE it here ("Save to my
-- library") to reuse it across documents. Owner-only (RLS), mirroring the
-- `designs` table conventions exactly.
--
-- The `glyph` jsonb is the full motif glyph object as used in-app:
--   { id, name, tradition, paths:[{d,closed}], viewRadius, root:{x,y,angle} }
-- On PLACE, the client COPIES this glyph into the document's customGlyphs keyed
-- by THIS row's uuid (self-contained documents; share links carry the copy —
-- so the library is never resolved at render time). See the P4 orchestrator doc.
-- ============================================================

create table public.user_motifs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Untitled motif',
  glyph jsonb not null,        -- { id, name, tradition, paths, viewRadius, root }

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_motifs enable row level security;

-- Owner-only read/write — the library is private to its owner. (Unlike designs,
-- there is NO public/shared read path: a promoted motif travels to other users
-- only by being COPIED into a shared document's config, never referenced.)
create policy "Owner full access"
  on public.user_motifs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Per-user library list (newest first).
create index idx_user_motifs_user on public.user_motifs(user_id, updated_at desc);

-- Shared updated_at trigger (defined in 001_initial_schema.sql).
create trigger user_motifs_updated_at
  before update on public.user_motifs
  for each row execute function public.set_updated_at();
