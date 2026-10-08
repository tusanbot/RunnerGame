create table if not exists public.runner_run_sessions (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'active' check (status in ('active','claimed','expired')),
  created_at timestamptz not null default now()
);

create index if not exists runner_run_sessions_user_started_idx
  on public.runner_run_sessions(user_id, started_at desc);

alter table public.runner_run_sessions enable row level security;

drop policy if exists "runner sessions own select" on public.runner_run_sessions;
create policy "runner sessions own select"
  on public.runner_run_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.runner_run_sessions from anon, authenticated;

create table if not exists public.runner_reward_events (
  run_id uuid primary key references public.runner_run_sessions(run_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  distance integer not null check (distance >= 0),
  collected_coins integer not null check (collected_coins >= 0),
  awarded_coins integer not null check (awarded_coins >= 0),
  awarded_xp integer not null check (awarded_xp >= 0),
  created_at timestamptz not null default now()
);

create index if not exists runner_reward_events_user_created_idx
  on public.runner_reward_events(user_id, created_at desc);

alter table public.runner_reward_events enable row level security;

drop policy if exists "runner rewards own select" on public.runner_reward_events;
create policy "runner rewards own select"
  on public.runner_reward_events for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.runner_reward_events from anon, authenticated;

revoke update (coins, xp, best_distance) on public.runner_player_progress from anon, authenticated;
grant select, insert, update (display_name, active_character_id, unlocked_character_ids, inventory, completed_mission_ids)
  on public.runner_player_progress to authenticated;
