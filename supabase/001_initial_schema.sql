-- ============================================================
-- 001_initial_schema.sql
-- Paste this into Supabase SQL Editor to set up all tables,
-- RLS policies, triggers, and indexes.
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (auto-created on first Google sign-in via trigger)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  tier text not null default 'free'
    check (tier in ('free', 'pro', 'studio')),

  -- Stripe (schema only — no checkout implementation yet)
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_status text
    check (subscription_status in ('active', 'past_due', 'canceled', 'trialing', null)),
  subscription_current_period_end timestamptz,

  -- Studio/Team future (nullable org membership)
  org_id uuid,  -- FK to future orgs table

  -- AI generation counter (Pro: 3/month included)
  ai_generations_used int not null default 0,
  ai_generations_reset_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile row on first sign-in (server-side trigger)
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- DESIGNS (JSON config storage, soft delete, sharing)
-- ============================================================
create table public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Untitled',
  config jsonb not null,       -- { layers, canvasW, canvasH, presetIndex }
  thumbnail text,              -- base64 JPEG data URL (~50-100KB)

  -- Sharing
  share_token text unique,     -- 16-byte hex string, null = not shared
  share_mode text not null default 'none'
    check (share_mode in ('none', 'view', 'fork')),

  -- Soft delete
  deleted_at timestamptz,

  -- Studio/Team future
  org_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.designs enable row level security;

create policy "Owner full access"
  on public.designs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Shared designs readable by anyone (via share token lookup)
create policy "Public read shared"
  on public.designs for select
  using (share_token is not null and share_mode != 'none' and deleted_at is null);

create index idx_designs_user on public.designs(user_id, updated_at desc);
create index idx_designs_share on public.designs(share_token) where share_token is not null;

create trigger designs_updated_at
  before update on public.designs
  for each row execute function public.set_updated_at();

-- ============================================================
-- DESIGN HISTORY (Pro: last 50 auto-saved snapshots per design)
-- ============================================================
create table public.design_history (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  config jsonb not null,
  thumbnail text,
  created_at timestamptz not null default now()
);

alter table public.design_history enable row level security;

create policy "Owner read history"
  on public.design_history for select using (auth.uid() = user_id);
create policy "Owner insert history"
  on public.design_history for insert with check (auth.uid() = user_id);
create policy "Owner delete history"
  on public.design_history for delete using (auth.uid() = user_id);

create index idx_history_design on public.design_history(design_id, created_at desc);

-- ============================================================
-- COLLECTIONS + JUNCTION (Pro: organize designs into folders)
-- ============================================================
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;
create policy "Owner full access"
  on public.collections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_designs (
  collection_id uuid not null references public.collections(id) on delete cascade,
  design_id uuid not null references public.designs(id) on delete cascade,
  added_at timestamptz not null default now(),
  sort_order int not null default 0,
  primary key (collection_id, design_id)
);

alter table public.collection_designs enable row level security;
create policy "Owner via collection"
  on public.collection_designs for all
  using (exists (
    select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()
  ));

-- ============================================================
-- RPC: Get shared design by token (public, no auth required)
-- ============================================================
create or replace function public.get_shared_design(token text)
returns jsonb language plpgsql security definer as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', d.id, 'name', d.name, 'config', d.config,
    'share_mode', d.share_mode, 'author', p.display_name,
    'avatar_url', p.avatar_url, 'created_at', d.created_at
  ) into result
  from public.designs d
  join public.profiles p on p.id = d.user_id
  where d.share_token = token
    and d.share_mode != 'none' and d.deleted_at is null;
  return result;
end;
$$;

-- ============================================================
-- Future: orgs table (noted, not created)
-- When implementing Studio/Team tier:
--   create table public.orgs (id uuid primary key default gen_random_uuid(), name text, ...);
--   ALTER TABLE profiles ADD CONSTRAINT fk_org FOREIGN KEY (org_id) REFERENCES orgs(id);
--   ALTER TABLE designs ADD CONSTRAINT fk_org FOREIGN KEY (org_id) REFERENCES orgs(id);
--   RLS: "members of same org can read shared designs"
-- ============================================================
