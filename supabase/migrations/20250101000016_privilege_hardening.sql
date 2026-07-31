-- ============================================================
-- 016_privilege_hardening.sql
-- Closes the B1 / B2 privilege-escalation defects found by the
-- project-saving adversarial review and resolved on issue #216.
--
--   Review: docs/reviews/project-saving-adversarial-review-2026-07-30.md
--           §B1 (credit RPCs executable by anon), §B2 (profiles
--           column privileges), §4.6 ("Public read shared" policy).
--   Live measurements confirming the deployed state: issue #217.
--
-- Four changes, all authorization-only — no data is read or written:
--   1. `search_path` pinned on all three SECURITY DEFINER functions.
--   2. B1 — EXECUTE on the credit RPCs revoked from PUBLIC (and from
--      anon / authenticated explicitly); credit mutation moves to the
--      generate-pattern edge function via new service-role-only RPCs.
--   3. B2 — table-level UPDATE on `profiles` revoked, replaced by a
--      column-level grant covering only user-editable columns.
--   4. §4.6 — the broad "Public read shared" SELECT policy on
--      `designs` dropped; shared reads go through get_shared_design.
--
-- ⚠️  DEPLOY ORDER MATTERS. This migration must be applied BEFORE the
--     new generate-pattern edge function is deployed (the function
--     calls the *_for RPCs created here), and the client bundle
--     deploys last. See the PR body for the full ordering rationale.
--
-- NOTE: human-gated for prod apply (file-only in this slice).
-- ============================================================

-- ------------------------------------------------------------
-- 1. SECURITY DEFINER hygiene: pin search_path.
--
-- Measured on production (#217): prosecdef = true and proconfig = NULL
-- on all three functions — i.e. SECURITY DEFINER with a caller-mutable
-- search_path, a standard escalation primitive that Supabase's own
-- advisor flags. `handle_new_user` (001, rewritten in 003) already sets
-- `search_path = public`; these three are matched to that house style.
-- Every object reference inside all three bodies is already
-- schema-qualified, so pinning the path changes no behaviour.
-- ------------------------------------------------------------
alter function public.add_ai_credits(int)        set search_path = public;
alter function public.deduct_ai_credits(int)     set search_path = public;
alter function public.get_shared_design(text)    set search_path = public;

-- ------------------------------------------------------------
-- 2. B1 — the credit RPCs become server-side only.
--
-- Measured grantees on production (#217):
--   ["PUBLIC","postgres","anon","authenticated","service_role"]
--
-- PUBLIC is the load-bearing one: PostgreSQL grants EXECUTE on every
-- new function to PUBLIC by default, and revoking from anon /
-- authenticated alone would be a no-op — both roles are members of
-- PUBLIC and would keep the privilege. The explicit per-role REVOKEs
-- below clear the separate direct grants Supabase also issues.
--
-- service_role is re-granted explicitly: once PUBLIC's grant is gone it
-- has nothing left (BYPASSRLS covers row policies, not function
-- EXECUTE). Same reason 009 names service_role explicitly for
-- ai_patterns. `postgres` keeps its grant — it owns the functions.
-- ------------------------------------------------------------
revoke execute on function public.add_ai_credits(int)    from public, anon, authenticated;
revoke execute on function public.deduct_ai_credits(int) from public, anon, authenticated;

grant execute on function public.add_ai_credits(int)    to service_role;
grant execute on function public.deduct_ai_credits(int) to service_role;

-- get_shared_design stays reachable by share-link viewers, who are
-- anonymous by definition. Revoke the blanket PUBLIC grant so the
-- grantee list is explicit and auditable, then name the two roles that
-- genuinely need it. This is a tightening of provenance, not of reach.
revoke execute on function public.get_shared_design(text) from public;
grant  execute on function public.get_shared_design(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2b. Service-role credit RPCs for the generate-pattern edge function.
--
-- The existing add/deduct RPCs identify the caller through `auth.uid()`,
-- which is NULL for a service-role connection — so they are unusable
-- from the edge function even with EXECUTE granted. These two take the
-- user id as a parameter instead, and are callable ONLY by service_role.
--
-- `refund_ai_credits_for` is the dedicated refund path that retires the
-- `deduct_ai_credits(-cost)` hack in aiPatternService.js (and its TODO).
-- That hack depended on the exact bypass B1 flags: a negative amount
-- skips the `current_credits < amount` guard and adds credits. Both
-- functions here reject non-positive amounts outright, so neither can
-- be turned into a minting primitive if a grant is ever widened.
--
-- Refund deliberately touches `ai_credits` only — never
-- `ai_credits_purchased` — so a failed generation cannot record a
-- phantom purchase (the original reason the negative-deduct hack
-- existed at all).
-- ------------------------------------------------------------
create or replace function public.deduct_ai_credits_for(p_user_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public as $$
declare
  current_credits int;
begin
  if p_user_id is null then
    raise exception 'deduct_ai_credits_for: user id is required' using errcode = '22023';
  end if;
  -- Server-authoritative pricing: the caller may not deduct zero (a free
  -- generation) or a negative amount (a mint).
  if p_amount is null or p_amount <= 0 then
    raise exception 'deduct_ai_credits_for: amount must be positive (got %)', p_amount
      using errcode = '22023';
  end if;

  select ai_credits into current_credits
    from public.profiles
    where id = p_user_id
    for update;

  if current_credits is null then
    raise exception 'Profile not found';
  end if;

  if current_credits < p_amount then
    return -1; -- insufficient credits (sentinel, same contract as 002)
  end if;

  update public.profiles
    set ai_credits = ai_credits - p_amount
    where id = p_user_id;

  return current_credits - p_amount;
end;
$$;

create or replace function public.refund_ai_credits_for(p_user_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public as $$
declare
  new_total int;
begin
  if p_user_id is null then
    raise exception 'refund_ai_credits_for: user id is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'refund_ai_credits_for: amount must be positive (got %)', p_amount
      using errcode = '22023';
  end if;

  update public.profiles
    set ai_credits = ai_credits + p_amount
    where id = p_user_id
    returning ai_credits into new_total;

  if new_total is null then
    raise exception 'Profile not found';
  end if;

  return new_total;
end;
$$;

revoke execute on function public.deduct_ai_credits_for(uuid, int) from public, anon, authenticated;
revoke execute on function public.refund_ai_credits_for(uuid, int) from public, anon, authenticated;

grant execute on function public.deduct_ai_credits_for(uuid, int) to service_role;
grant execute on function public.refund_ai_credits_for(uuid, int) to service_role;

-- ------------------------------------------------------------
-- 3. B2 — column-level UPDATE privileges on `profiles`.
--
-- Measured on production (#217): both `anon` AND `authenticated` hold
-- column-level UPDATE on tier, ai_credits, ai_credits_purchased,
-- stripe_customer_id and subscription_status. The "Users update own
-- profile" policy (001:44-46) is row-scoped only, so a signed-in user
-- could set their own tier to 'studio' or their own ai_credits to any
-- value. `getEffectiveTier` (AuthContext.jsx) trusts the column.
--
-- Supabase grants UPDATE at the TABLE level, which implies every column
-- including ones added by later migrations. Revoking the table-level
-- grant and re-granting per column inverts that default: new privileged
-- columns are closed unless explicitly opened.
--
-- The retained columns are exactly the user-editable ones:
--   display_name, avatar_url — profile identity, seeded by the signup
--                              trigger, legitimately user-owned.
--   settings                 — the app-settings jsonb blob (008); the
--                              ONLY profiles column any client code
--                              writes today (settingsService.js:52,
--                              exportSettings.js:82).
-- `updated_at` is NOT granted and does not need to be: it is written by
-- the `set_updated_at` BEFORE UPDATE trigger, and PostgreSQL checks
-- column privileges against the statement's SET list, not against what
-- triggers subsequently modify.
--
-- anon gets no UPDATE at all. It never had a usable one — `auth.uid()`
-- is NULL so no row satisfies the policy — but the privilege itself is
-- what the probe in §B2 detected, and it should not exist.
--
-- INSERT is left alone: `handle_new_user` is SECURITY DEFINER and runs
-- as the function owner, so signup is unaffected by anything here.
-- ------------------------------------------------------------
revoke update on public.profiles from public, anon, authenticated;

-- Belt and braces: a table-level REVOKE clears the table-level grant, but it
-- does NOT clear a separately-issued COLUMN-level grant on the same column.
-- `information_schema.column_privileges` expands table grants into per-column
-- rows, so the #217 measurement cannot tell the two apart — and if any of these
-- columns also carries a direct column grant, B2 would still be open while this
-- migration looked applied. Revoking them by name closes that case outright.
-- A REVOKE of a privilege that was never granted is a no-op.
revoke update (
  tier,
  ai_credits,
  ai_credits_purchased,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  subscription_status,
  subscription_current_period_end,
  org_id
) on public.profiles from public, anon, authenticated;

grant update (display_name, avatar_url, settings)
  on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 4. §4.6 — drop the broad shared-designs SELECT policy.
--
-- "Public read shared" (001:118-120) has no `to` role restriction and
-- no predicate binding a row to a caller-supplied token, so one
-- unauthenticated `GET /rest/v1/designs?select=*` returns every shared
-- design — its full config, its thumbnail, and its share_token. The
-- token stops being a capability the moment sharing is used at all.
--
-- Zero designs are shared in production today (probe-confirmed, §4.6),
-- so dropping it breaks nothing and costs nothing. Shared reads already
-- go exclusively through `get_shared_design(token)` — the only shared
-- read path in src/ is designService.js:106, an rpc call — and that
-- function is SECURITY DEFINER, so it reads the row as its owner and is
-- entirely unaffected by the absence of this policy.
--
-- Owner access is untouched: the "Owner full access" FOR ALL policy
-- (001:112-115) still covers the owner's own selects, including reading
-- back their own share_token in the share sheet.
--
-- This does NOT pre-decide share-token semantics (secret capability vs
-- public link) — that question stays open. RPC-by-token is compatible
-- with both answers; the dropped policy was compatible with neither.
-- ------------------------------------------------------------
drop policy if exists "Public read shared" on public.designs;

-- ============================================================
-- Post-apply verification (run in the SQL editor as the owner):
--
--   -- 1 + 2: search_path pinned, PUBLIC gone from the credit RPCs
--   select p.proname, p.prosecdef, p.proconfig,
--          array(select grantee::text from information_schema.routine_privileges rp
--                where rp.routine_name = p.proname and rp.privilege_type = 'EXECUTE') as executors
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('add_ai_credits','deduct_ai_credits','get_shared_design',
--                       'deduct_ai_credits_for','refund_ai_credits_for');
--   -- expect: proconfig = {search_path=public} on all five;
--   --         no PUBLIC/anon/authenticated executor on any credit RPC;
--   --         anon + authenticated retained on get_shared_design only.
--
--   -- 3: no privileged column left writable by a client role
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'profiles'
--     and grantee in ('anon','authenticated') and privilege_type = 'UPDATE';
--   -- expect: exactly three rows, all authenticated —
--   --         display_name, avatar_url, settings.
--
--   -- 4: policy gone
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'designs';
--   -- expect: "Owner full access" only.
-- ============================================================
