-- ============================================================
-- 009_user_patterns.sql  (issue #49 / PRD #48 — S0 extraction spine)
--
-- ⚠️  HUMAN-GATED: this migration renames the live ai_patterns table.
--     Review + apply manually; nothing in CI/agents may run it.
--
-- 1. Generalizes ai_patterns into the unified USER-PATTERN table
--    `user_patterns` with source enum ('ai' | 'extracted'). Existing AI
--    rows are preserved in place (rename, not copy); a security-invoker
--    compatibility VIEW named `ai_patterns` keeps already-deployed
--    clients (aiPatternService inserts/selects) working unchanged, so
--    migration and deploy order are independent.
-- 2. Adds the minimal extracted-pattern columns for S0: tile_svg,
--    fabrication_tags, lattice, photo_path, visibility (private-default
--    sharing scaffold — locked decision, PRD §data-safety).
-- 3. Creates the project's FIRST storage bucket, `pattern-photos`
--    (private), with per-user folder RLS: objects live under
--    `<auth.uid()>/…` and are readable/writable only by their owner.
-- ============================================================

-- ---------- 1. rename + generalize --------------------------------

ALTER TABLE public.ai_patterns RENAME TO user_patterns;
ALTER INDEX IF EXISTS idx_ai_patterns_user RENAME TO idx_user_patterns_user;

ALTER TABLE public.user_patterns
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'extracted')),
  -- pattern payload for extracted entries (S0: fixed geometry — locked
  -- decision 10; param_defs/default_params stay NULL until parameterization)
  ADD COLUMN IF NOT EXISTS tile_svg text,
  ADD COLUMN IF NOT EXISTS fabrication_tags jsonb,   -- per-path engrave/cut/score
  ADD COLUMN IF NOT EXISTS lattice jsonb,            -- {t1,t2,type} — null until S1
  ADD COLUMN IF NOT EXISTS photo_path text,          -- storage path of original photo
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public'));

-- AI columns become nullable so extracted rows can omit them; a payload
-- check keeps every row internally consistent instead.
ALTER TABLE public.user_patterns
  ALTER COLUMN source_code DROP NOT NULL,
  ALTER COLUMN param_defs DROP NOT NULL,
  ALTER COLUMN default_params DROP NOT NULL;

ALTER TABLE public.user_patterns
  ADD CONSTRAINT user_patterns_payload_check CHECK (
    (source = 'ai' AND source_code IS NOT NULL)
    OR
    (source = 'extracted' AND tile_svg IS NOT NULL)
  );

-- Per-user index for the library list (mirrors the original AI index).
CREATE INDEX IF NOT EXISTS idx_user_patterns_user_source
  ON public.user_patterns(user_id, source, created_at DESC);

-- RLS: the existing "Owner full access" policy travelled with the rename
-- (policies are attached to the table). Re-assert defensively in case a
-- future squash drops it.
ALTER TABLE public.user_patterns ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_patterns'
  ) THEN
    CREATE POLICY "Owner full access"
      ON public.user_patterns FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------- 2. compatibility view for deployed clients -------------
--
-- security_invoker: the underlying table's RLS runs as the CALLER, so the
-- view is exactly as locked-down as user_patterns itself. The view is
-- updatable (single table, no aggregates): existing INSERTs into
-- `ai_patterns` land in user_patterns with source defaulting to 'ai'.

CREATE VIEW public.ai_patterns
  WITH (security_invoker = true) AS
  SELECT id, user_id, pattern_id, name, description, source_code,
         param_defs, default_params, revision_of, credits_used, created_at
    FROM public.user_patterns
   WHERE source = 'ai';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_patterns TO service_role;

-- ---------- 3. private per-user storage bucket ----------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('pattern-photos', 'pattern-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Objects are keyed `<user_id>/<pattern_id>.<ext>`; the first folder
-- segment must equal the caller's uid for every operation.
CREATE POLICY "pattern-photos owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pattern-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pattern-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pattern-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pattern-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pattern-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'pattern-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "pattern-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pattern-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
