-- ============================================================================
-- RapidMeta Living-Meta — Supabase backend setup
-- Project: https://cfgywerxufcoutnplwhs.supabase.co
-- ----------------------------------------------------------------------------
-- Run this ENTIRE script once in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- It creates one table that stores, per user and per living-meta app, a JSON
-- blob of that user's saved progress, plus Row Level Security policies so each
-- authenticated user can read/write ONLY their own rows (auth.uid() = user_id).
--
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS guards.
-- ============================================================================

-- 1) Table: one row per (user, living-meta app) -----------------------------
create table if not exists public.living_meta_progress (
    id          uuid        primary key default gen_random_uuid(),
    user_id     uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
    meta_app_id text        not null,                 -- e.g. "FINERENONE_REVIEW.html"
    state       jsonb       not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    -- one saved-state row per user per app (drives upsert on conflict)
    unique (user_id, meta_app_id)
);

-- Helpful index for the per-app lookup the client does on load
create index if not exists living_meta_progress_user_app_idx
    on public.living_meta_progress (user_id, meta_app_id);

-- 2) Keep updated_at fresh on every update -----------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_living_meta_progress_updated_at on public.living_meta_progress;
create trigger trg_living_meta_progress_updated_at
    before update on public.living_meta_progress
    for each row execute function public.set_updated_at();

-- 3) Row Level Security: each user sees ONLY their own rows -------------------
alter table public.living_meta_progress enable row level security;

drop policy if exists "own rows - select" on public.living_meta_progress;
create policy "own rows - select"
    on public.living_meta_progress
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "own rows - insert" on public.living_meta_progress;
create policy "own rows - insert"
    on public.living_meta_progress
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "own rows - update" on public.living_meta_progress;
create policy "own rows - update"
    on public.living_meta_progress
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "own rows - delete" on public.living_meta_progress;
create policy "own rows - delete"
    on public.living_meta_progress
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- Done. Anonymous (logged-out) visitors get no access to this table at all,
-- which is correct: they fall back to local-only (localStorage) progress.
