-- ============================================================
-- 012_pattern_symmetry.sql  (issue #56 / PRD #48 — S7 wallpaper-group facet)
--
-- ⚠️  HUMAN-GATED: review + apply manually; nothing in CI/agents may run it.
--     Ships AFTER 009–011 — extends the user_patterns table 009 creates.
--     A deployment that has 009–011 but NOT 012 still works: extracted-pattern
--     saves that carry a symmetry classification fail the insert on the missing
--     column and LibraryRepository degrades to a session-only save (never a dead
--     end) — apply 012 to persist + query the symmetry facet. (Same graceful-
--     degrade contract as 010-on-009 / 011-on-010.)
--
-- ⚠️  IDEMPOTENT-ish: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, so
--     a re-run is a no-op. Safe to apply once; harmless if reapplied.
--
-- Adds the OPTIONAL wallpaper-group facet for extracted patterns. Nullable;
-- extracted rows with no detected lattice (the single-motif floor) simply leave
-- it NULL. The value is a small jsonb object, NOT a bare text, so the full
-- classification round-trips with the entity:
--
--   symmetry  jsonb  { group, confidence, source } — `group` is one of the 17
--                    canonical IUC names (p1,p2,pm,pg,cm,pmm,pmg,pgg,cmm,
--                    p4,p4m,p4g,p3,p3m1,p31m,p6,p6m); validated app-side
--                    (symmetry.js validateSymmetry — whitelist + validate-and-
--                    null). NO database CHECK: the whitelist is enforced in the
--                    application layer exactly like the soft source_type/material
--                    vocabularies (011), so a future canonical-name reconcile is
--                    a value change, not a migration.
-- ============================================================

ALTER TABLE public.user_patterns
  ADD COLUMN IF NOT EXISTS symmetry jsonb;   -- {group, confidence, source}

-- ---------- S10 facet-filter seam (queryable now) ------------------
-- The Library symmetry filter (issue #59, S10) scans the group per user. This
-- expression index on symmetry->>'group', scoped to a user's extracted rows,
-- makes S10 a UI concern, not a schema change — and composes (bitmap-AND) with
-- 011's tags/facets indexes when filters combine. No RLS change: symmetry lives
-- on user_patterns, already governed by the "Owner full access" policy (009).
CREATE INDEX IF NOT EXISTS idx_user_patterns_symmetry
  ON public.user_patterns (user_id, (symmetry->>'group'))
  WHERE source = 'extracted' AND symmetry IS NOT NULL;
