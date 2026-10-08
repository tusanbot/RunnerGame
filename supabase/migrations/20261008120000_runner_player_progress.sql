-- Base player progression schema.
-- Safe to run after manually creating runner_player_progress: CREATE TABLE IF NOT EXISTS
-- leaves an existing table untouched, while the statements below normalize defaults,
-- indexes, RLS and grants used by the application.

create table if not exists public.runner_player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'بازیکن',
  coins bigint not null default 0 check (coins >= 0),
  best_distance integer not null default 0 check (best_distance >= 0),
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  active_character_id text not null default 'amirreza',
  unlocked_character_ids jsonb not null default '["amirreza"]'::jsonb,
  inventory jsonb not null default '{}'::jsonb,
  completed_mission_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists runner_player_progress_user_uidx
  on public.runner_player_progress(user_id);

alter table public.runner_player_progress
  alter column display_name set default 'بازیکن',
  alter column coins set default 0,
  alter column best_distance set default 0,
  alter column level set default 1,
  alter column xp set default 0,
  alter column active_character_id set default 'amirreza',
  alter column unlocked_character_ids set default '["amirreza"]'::jsonb,
  alter column inventory set default '{}'::jsonb,
  alter column completed_mission_ids set default '[]'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.runner_player_progress enable row level security;

drop policy if exists "runner progress own read" on public.runner_player_progress;
create policy "runner progress own read"
  on public.runner_player_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "runner progress own profile update" on public.runner_player_progress;
create policy "runner progress own profile update"
  on public.runner_player_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.runner_player_progress from anon;
grant select on public.runner_player_progress to authenticated;
grant update (display_name, active_character_id) on public.runner_player_progress to authenticated;
