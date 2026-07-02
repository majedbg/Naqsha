-- ============================================================
-- 010_pattern_capture_metadata.sql  (issue #57 / PRD #48 — S8 EXIF + location)
--
-- ⚠️  HUMAN-GATED: review + apply manually; nothing in CI/agents may run it.
--     Ships WITH 009 — apply 010 immediately AFTER 009 (010 extends the
--     user_patterns table 009 creates). A deployment that has 009 but not 010
--     still works: extracted-pattern saves that carry capture metadata fail the
--     insert on the missing columns and LibraryRepository degrades to a
--     session-only save (never a dead end) — but apply 010 to persist metadata.
--
-- ⚠️  IDEMPOTENT-ish: uses ADD COLUMN IF NOT EXISTS so a re-run is a no-op for
--     the columns. Safe to apply once; harmless if reapplied.
--
-- Adds the OPTIONAL capture-metadata columns for extracted patterns (locked
-- decision: auto-capture beats manual entry — EXIF date/GPS pre-fill location,
-- reverse-geocode suggests a place name + title). All nullable; extracted rows
-- without a location/date/camera simply leave them NULL.
--
--   location     jsonb  { lat, lng, placeName, address,
--                         source: 'exif'|'manual'|'geocoded' } — nullable.
--                        DELIBERATELY no CHECK on the nested `source` value:
--                        the vocabulary is still being reconciled with the PRD
--                        ('pin'|'address'); keeping it soft jsonb means a later
--                        reconciliation is a value change, not a migration.
--   capture_date text   ISO-8601 capture timestamp from EXIF (or manual).
--   exif         jsonb  { camera } — camera make/model label; room for raw
--                        EXIF facets later (S9 provenance).
--
-- NOTE ON STORED PHOTOS (privacy): the original photo is uploaded to the
-- private `pattern-photos` bucket AS-IS (see 009), so its embedded EXIF —
-- including GPS — persists in the blob even if the user clears the location
-- proposal here. The mitigation is the bucket's per-user RLS (owner-only read,
-- 009); client-side EXIF stripping is out of S8 scope.
-- ============================================================

ALTER TABLE public.user_patterns
  ADD COLUMN IF NOT EXISTS location jsonb,       -- {lat,lng,placeName,address,source}
  ADD COLUMN IF NOT EXISTS capture_date text,    -- ISO-8601 capture timestamp
  ADD COLUMN IF NOT EXISTS exif jsonb;           -- {camera, …raw facets later}

-- No new RLS: these columns live on user_patterns, already fully governed by
-- the "Owner full access" policy (009). No new index: location facet filtering
-- is an S10 concern (GIN on jsonb) — deferred with the filter UI.
