-- ============================================================
-- 011_pattern_provenance_palette.sql  (issue #58 / PRD #48 — S9 provenance +
-- organization metadata + palette facet)
--
-- ⚠️  HUMAN-GATED: review + apply manually; nothing in CI/agents may run it.
--     Ships AFTER 009 + 010 — extends the user_patterns table 009 creates.
--     A deployment that has 009/010 but NOT 011 still works: extracted-pattern
--     saves that carry S9 metadata fail the insert on the missing columns and
--     LibraryRepository degrades to a session-only save (never a dead end) —
--     apply 011 to persist provenance/tags/palette. (Same graceful-degrade
--     contract as 010-on-009.)
--
-- ⚠️  IDEMPOTENT-ish: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, so
--     a re-run is a no-op. Safe to apply once; harmless if reapplied.
--
-- Adds the OPTIONAL organization + provenance columns for extracted patterns.
-- All nullable / empty-defaulted; progressive disclosure means nothing here
-- blocks a save (only an auto-suggested title matters). Vocabularies are kept
-- as SOFT text/jsonb with NO database CHECK and a tolerant application read
-- (provenanceMeta.js) — reconciling a vocabulary later is a value change, not
-- a migration, exactly like 010's location.source.
--
--   note         text    free-form user note.
--   favorite     bool    starred flag (default false).
--   tags         text[]  free-form tags (validated app-side; GIN-indexed).
--   collection_id uuid   REUSES the existing collections table (initial schema)
--                        via a single-membership FK — #58 "assign to a
--                        collection" (singular). ON DELETE SET NULL so removing
--                        a collection never destroys the pattern. NO new
--                        junction table (collection_designs FKs designs(id),
--                        which cannot hold user_patterns rows).
--   source_type  text    provenance: in_person|book|screenshot|url (soft).
--   material     text    provenance: stone|glass|wood|textile|ceramic|… (soft).
--   tradition    text    free-form tradition/style label.
--   palette      jsonb   auto facet: [{hex,coverage}] from PaletteExtractor.
-- ============================================================

ALTER TABLE public.user_patterns
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS collection_id uuid
    REFERENCES public.collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS tradition text,
  ADD COLUMN IF NOT EXISTS palette jsonb;

-- ---------- S10 facet-filter seams (queryable now) ------------------
-- Facet filtering (issue #59, S10) needs to scan these columns per user. These
-- indexes are additive and cheap; adding them here means S10 is a UI concern,
-- not a schema change. No RLS change: every column lives on user_patterns,
-- already governed by the "Owner full access" policy (009).

-- tags: GIN for array containment (WHERE tags && '{gothic}').
CREATE INDEX IF NOT EXISTS idx_user_patterns_tags
  ON public.user_patterns USING gin (tags);

-- provenance facets, scoped per user + source (the Library list is always
-- filtered to one user's extracted rows). Partial index keeps it lean.
CREATE INDEX IF NOT EXISTS idx_user_patterns_facets
  ON public.user_patterns (user_id, source_type, material)
  WHERE source = 'extracted';

-- favorites surfacing (story 38): a user's starred finds, newest first.
CREATE INDEX IF NOT EXISTS idx_user_patterns_favorite
  ON public.user_patterns (user_id, created_at DESC)
  WHERE favorite = true AND source = 'extracted';

-- collection membership lookups.
CREATE INDEX IF NOT EXISTS idx_user_patterns_collection
  ON public.user_patterns (collection_id)
  WHERE collection_id IS NOT NULL;
