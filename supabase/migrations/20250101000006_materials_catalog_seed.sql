-- Materials catalog seed — Canal Plastics curated acrylic finish × thickness grid
-- =============================================================================
-- Source: Canal Plastics (canalplastic.com), recon 2026-06-21. All rows type='acrylic'.
--
-- Curated grid: 10 finishes × {1.5, 3.0, 4.5, 5.6} mm = 40 rows,
-- PLUS the 3 popular finishes (Clear Colorless, White Opaque, Black Opaque)
-- also at {9.0, 12.0} mm = 6 rows. Total 46 rows.
--
-- Thickness inch→mm mapping (AUTHORITATIVE):
--   1/16in→1.5 · 1/8in→3.0 · 3/16in→4.5 · 1/4in→5.6 · 3/8in→9.0 · 1/2in→12.0
-- NOTE: 1/4in resolves to 5.6 mm (Canal plate spec), NOT 6.0 mm. The issue prose
-- mentions "...6.0 mm minimum", but the authoritative Canal mm mapping has no 6.0;
-- its 1/4-inch plate is 5.6 mm, and the acceptance criterion gates on the mapping.
--
-- IDEMPOTENT: public.materials has NO unique constraint, so `on conflict do nothing`
-- would be a no-op. Each insert is instead guarded by `where not exists (...)` keyed
-- on the unique, human-readable `name`. Re-running this seed inserts nothing new.
-- =============================================================================

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Clear Colorless Cast Acrylic', 'acrylic', 1.5, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '1/16in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Clear Colorless Cast Acrylic', 'acrylic', 3.0, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '1/8in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Clear Colorless Cast Acrylic', 'acrylic', 4.5, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '3/16in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Clear Colorless Cast Acrylic', 'acrylic', 5.6, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '1/4in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in White Opaque Cast Acrylic', 'acrylic', 1.5, 'White Opaque'
  where not exists (select 1 from public.materials where name = '1/16in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in White Opaque Cast Acrylic', 'acrylic', 3.0, 'White Opaque'
  where not exists (select 1 from public.materials where name = '1/8in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in White Opaque Cast Acrylic', 'acrylic', 4.5, 'White Opaque'
  where not exists (select 1 from public.materials where name = '3/16in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in White Opaque Cast Acrylic', 'acrylic', 5.6, 'White Opaque'
  where not exists (select 1 from public.materials where name = '1/4in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Black Opaque Cast Acrylic', 'acrylic', 1.5, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '1/16in Black Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Black Opaque Cast Acrylic', 'acrylic', 3.0, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '1/8in Black Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Black Opaque Cast Acrylic', 'acrylic', 4.5, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '3/16in Black Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Black Opaque Cast Acrylic', 'acrylic', 5.6, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '1/4in Black Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in White Translucent Cast Acrylic', 'acrylic', 1.5, 'White Translucent'
  where not exists (select 1 from public.materials where name = '1/16in White Translucent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in White Translucent Cast Acrylic', 'acrylic', 3.0, 'White Translucent'
  where not exists (select 1 from public.materials where name = '1/8in White Translucent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in White Translucent Cast Acrylic', 'acrylic', 4.5, 'White Translucent'
  where not exists (select 1 from public.materials where name = '3/16in White Translucent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in White Translucent Cast Acrylic', 'acrylic', 5.6, 'White Translucent'
  where not exists (select 1 from public.materials where name = '1/4in White Translucent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Silver Mirror Cast Acrylic', 'acrylic', 1.5, 'Silver Mirror'
  where not exists (select 1 from public.materials where name = '1/16in Silver Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Silver Mirror Cast Acrylic', 'acrylic', 3.0, 'Silver Mirror'
  where not exists (select 1 from public.materials where name = '1/8in Silver Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Silver Mirror Cast Acrylic', 'acrylic', 4.5, 'Silver Mirror'
  where not exists (select 1 from public.materials where name = '3/16in Silver Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Silver Mirror Cast Acrylic', 'acrylic', 5.6, 'Silver Mirror'
  where not exists (select 1 from public.materials where name = '1/4in Silver Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Gold Mirror Cast Acrylic', 'acrylic', 1.5, 'Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/16in Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Gold Mirror Cast Acrylic', 'acrylic', 3.0, 'Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/8in Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Gold Mirror Cast Acrylic', 'acrylic', 4.5, 'Gold Mirror'
  where not exists (select 1 from public.materials where name = '3/16in Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Gold Mirror Cast Acrylic', 'acrylic', 5.6, 'Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/4in Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Rose Gold Mirror Cast Acrylic', 'acrylic', 1.5, 'Rose Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/16in Rose Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Rose Gold Mirror Cast Acrylic', 'acrylic', 3.0, 'Rose Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/8in Rose Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Rose Gold Mirror Cast Acrylic', 'acrylic', 4.5, 'Rose Gold Mirror'
  where not exists (select 1 from public.materials where name = '3/16in Rose Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Rose Gold Mirror Cast Acrylic', 'acrylic', 5.6, 'Rose Gold Mirror'
  where not exists (select 1 from public.materials where name = '1/4in Rose Gold Mirror Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Frosted Satin Ice Cast Acrylic', 'acrylic', 1.5, 'Frosted Satin Ice'
  where not exists (select 1 from public.materials where name = '1/16in Frosted Satin Ice Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Frosted Satin Ice Cast Acrylic', 'acrylic', 3.0, 'Frosted Satin Ice'
  where not exists (select 1 from public.materials where name = '1/8in Frosted Satin Ice Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Frosted Satin Ice Cast Acrylic', 'acrylic', 4.5, 'Frosted Satin Ice'
  where not exists (select 1 from public.materials where name = '3/16in Frosted Satin Ice Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Frosted Satin Ice Cast Acrylic', 'acrylic', 5.6, 'Frosted Satin Ice'
  where not exists (select 1 from public.materials where name = '1/4in Frosted Satin Ice Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Aura Iridescent Cast Acrylic', 'acrylic', 1.5, 'Aura Iridescent'
  where not exists (select 1 from public.materials where name = '1/16in Aura Iridescent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Aura Iridescent Cast Acrylic', 'acrylic', 3.0, 'Aura Iridescent'
  where not exists (select 1 from public.materials where name = '1/8in Aura Iridescent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Aura Iridescent Cast Acrylic', 'acrylic', 4.5, 'Aura Iridescent'
  where not exists (select 1 from public.materials where name = '3/16in Aura Iridescent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Aura Iridescent Cast Acrylic', 'acrylic', 5.6, 'Aura Iridescent'
  where not exists (select 1 from public.materials where name = '1/4in Aura Iridescent Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/16in Fire Tortoise Shell Pearl Cast Acrylic', 'acrylic', 1.5, 'Fire Tortoise Shell Pearl'
  where not exists (select 1 from public.materials where name = '1/16in Fire Tortoise Shell Pearl Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/8in Fire Tortoise Shell Pearl Cast Acrylic', 'acrylic', 3.0, 'Fire Tortoise Shell Pearl'
  where not exists (select 1 from public.materials where name = '1/8in Fire Tortoise Shell Pearl Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/16in Fire Tortoise Shell Pearl Cast Acrylic', 'acrylic', 4.5, 'Fire Tortoise Shell Pearl'
  where not exists (select 1 from public.materials where name = '3/16in Fire Tortoise Shell Pearl Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/4in Fire Tortoise Shell Pearl Cast Acrylic', 'acrylic', 5.6, 'Fire Tortoise Shell Pearl'
  where not exists (select 1 from public.materials where name = '1/4in Fire Tortoise Shell Pearl Cast Acrylic');

-- Popular finishes — heavy plate (3/8in, 1/2in)

insert into public.materials (name, type, thickness_mm, color)
  select '3/8in Clear Colorless Cast Acrylic', 'acrylic', 9.0, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '3/8in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/2in Clear Colorless Cast Acrylic', 'acrylic', 12.0, 'Clear Colorless'
  where not exists (select 1 from public.materials where name = '1/2in Clear Colorless Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/8in White Opaque Cast Acrylic', 'acrylic', 9.0, 'White Opaque'
  where not exists (select 1 from public.materials where name = '3/8in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/2in White Opaque Cast Acrylic', 'acrylic', 12.0, 'White Opaque'
  where not exists (select 1 from public.materials where name = '1/2in White Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '3/8in Black Opaque Cast Acrylic', 'acrylic', 9.0, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '3/8in Black Opaque Cast Acrylic');

insert into public.materials (name, type, thickness_mm, color)
  select '1/2in Black Opaque Cast Acrylic', 'acrylic', 12.0, 'Black Opaque'
  where not exists (select 1 from public.materials where name = '1/2in Black Opaque Cast Acrylic');
