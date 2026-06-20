-- ============================================================
-- 002_ai_credits.sql
-- Migrates from monthly generation counter to credit-based system.
-- Pro users start with 36 credits. Credits are purchasable.
-- Cost: 12 credits = new pattern, 4 credits = pattern revision.
-- ============================================================

-- Add credit columns to profiles (keep old columns for backwards compat)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_credits int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_purchased int NOT NULL DEFAULT 0;

-- Store AI pattern generation history
CREATE TABLE IF NOT EXISTS public.ai_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pattern_id text NOT NULL,           -- runtime pattern ID (e.g. 'ai-xyz123')
  name text NOT NULL,                 -- user-visible name
  description text,                   -- user's prompt/description
  source_code text NOT NULL,          -- generated JS class source
  param_defs jsonb NOT NULL,          -- PATTERN_PARAM_DEFS entry
  default_params jsonb NOT NULL,      -- DEFAULT_PARAMS entry
  revision_of uuid REFERENCES public.ai_patterns(id), -- null = new, set = revision
  credits_used int NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access"
  ON public.ai_patterns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_patterns_user ON public.ai_patterns(user_id, created_at DESC);

-- RPC: Atomically check credits and deduct
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_credits int;
BEGIN
  SELECT ai_credits INTO current_credits
    FROM public.profiles
    WHERE id = auth.uid()
    FOR UPDATE;

  IF current_credits IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_credits < amount THEN
    RETURN -1; -- insufficient credits
  END IF;

  UPDATE public.profiles
    SET ai_credits = ai_credits - amount
    WHERE id = auth.uid();

  RETURN current_credits - amount;
END;
$$;

-- RPC: Add purchased credits
CREATE OR REPLACE FUNCTION public.add_ai_credits(amount int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_total int;
BEGIN
  UPDATE public.profiles
    SET ai_credits = ai_credits + amount,
        ai_credits_purchased = ai_credits_purchased + amount
    WHERE id = auth.uid()
    RETURNING ai_credits INTO new_total;

  RETURN new_total;
END;
$$;

-- Grant 36 credits to Pro users who don't have any yet
-- (Run manually or as part of Stripe webhook when tier upgrades to 'pro')
-- UPDATE public.profiles SET ai_credits = 36 WHERE tier = 'pro' AND ai_credits = 0;
