-- ============================================================
-- 003_free_ai_allowance.sql
-- Flatten Pro into Free in the product. The Free tier is now the
-- full creative experience; the only thing we still cap is the
-- Anthropic API spend, via a per-account credit allowance.
--
-- Allowance: 24 credits per account.
--   = 1 new AI pattern (12 credits) + up to 3 revisions (4 credits each)
-- There is no purchase path in the app — the 24 credits are the hard cap.
--
-- Paired app changes:
--   - src/lib/tierLimits.js      (free now matches pro)
--   - src/components/PatternTabs.jsx (AI button gated on aiCredits, not tier)
--   - src/components/AuthButton.jsx  (credits shown to all signed-in users)
--   - src/components/AIPatternChat.jsx (purchase stub removed)
--   - CREDIT_PACKS removed from src/lib/aiPatternService.js
-- ============================================================

-- 1. Recreate the signup trigger so every new profile starts with 24 credits.
--    Replaces the function defined in 001_initial_schema.sql. The default on
--    the `ai_credits` column stays at 0, so this trigger is the single place
--    where the allowance is granted — easy to revisit if the product model
--    changes later.
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, ai_credits)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    24
  );
  return new;
end;
$$;

-- 2. Backfill every existing profile to the new flat allowance.
--    Per the product decision, paid users (if any exist) also reset to 24
--    because Pro/Studio are no longer materially different from Free in-app.
update public.profiles
  set ai_credits = 24;
