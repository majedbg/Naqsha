-- ============================================================
-- 008_user_settings_json.sql
-- Per-user app settings as a single jsonb blob on profiles.
--
-- Namespaced under top-level keys so multiple features can share the column
-- without colliding, e.g.:
--   settings.patternPicker = { sortMode: 'auto'|'custom', manualOrder: string[] }
-- (read-merge-write is last-write-wins; deep-merge under the namespace key at
--  the service layer so a future second writer doesn't clobber a sibling key.)
--
-- RLS: the existing "Users update own profile" policy in 001_initial_schema.sql
-- is row-scoped only (using/with check `auth.uid() = id`) and is NOT
-- column-restricted, so a user may already write this new column on their OWN
-- row. No policy change is required.
--
-- NOTE: human-gated for prod apply (file-only in this slice).
-- ============================================================

alter table public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb;
