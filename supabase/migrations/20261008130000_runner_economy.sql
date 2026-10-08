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


create or replace function public.claim_runner_run(
  p_run_id uuid,
  p_user_id uuid,
  p_distance integer,
  p_collected_coins integer
)
returns table (
  awarded_coins integer,
  awarded_xp integer,
  coins bigint,
  xp integer,
  best_distance integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.runner_run_sessions%rowtype;
  v_progress public.runner_player_progress%rowtype;
  v_elapsed_seconds numeric;
  v_max_distance integer;
  v_awarded_coins integer;
  v_awarded_xp integer;
begin
  if p_distance < 0 or p_collected_coins < 0 then
    raise exception 'invalid_run_result';
  end if;

  select *
    into v_session
    from public.runner_run_sessions
   where run_id = p_run_id
     and user_id = p_user_id
   for update;

  if not found then
    raise exception 'run_not_found';
  end if;

  if v_session.status <> 'active' then
    raise exception 'run_already_claimed';
  end if;

  if p_distance > 70000 or p_collected_coins > 250 then
    raise exception 'run_result_out_of_range';
  end if;

  v_elapsed_seconds := greatest(0, extract(epoch from (clock_timestamp() - v_session.started_at)));

  if v_elapsed_seconds > 900 then
    update public.runner_run_sessions
       set status = 'expired', finished_at = clock_timestamp()
     where run_id = p_run_id;
    raise exception 'run_expired';
  end if;

  v_max_distance := ceil(v_elapsed_seconds * 90)::integer + 150;
  if p_distance > least(70000, v_max_distance) then
    raise exception 'distance_time_mismatch';
  end if;

  v_awarded_coins := least(p_collected_coins, floor(p_distance / 10)::integer + 5, 250);
  v_awarded_xp := least(5000, floor(p_distance / 10)::integer + v_awarded_coins);

  select *
    into v_progress
    from public.runner_player_progress
   where user_id = p_user_id
   for update;

  if not found then
    insert into public.runner_player_progress (
      user_id, display_name, coins, best_distance, level, xp,
      active_character_id, unlocked_character_ids, inventory, completed_mission_ids
    )
    values (
      p_user_id, 'بازیکن', v_awarded_coins, p_distance, 1, v_awarded_xp,
      'amirreza', '["amirreza"]'::jsonb, '{}'::jsonb, '[]'::jsonb
    )
    returning * into v_progress;
  else
    update public.runner_player_progress
       set coins = v_progress.coins + v_awarded_coins,
           xp = v_progress.xp + v_awarded_xp,
           best_distance = greatest(v_progress.best_distance, p_distance),
           updated_at = clock_timestamp()
     where user_id = p_user_id
     returning * into v_progress;
  end if;

  insert into public.runner_reward_events (
    run_id, user_id, distance, collected_coins, awarded_coins, awarded_xp
  )
  values (
    p_run_id, p_user_id, p_distance, p_collected_coins, v_awarded_coins, v_awarded_xp
  );

  update public.runner_run_sessions
     set status = 'claimed', finished_at = clock_timestamp()
   where run_id = p_run_id;

  return query
  select v_awarded_coins, v_awarded_xp, v_progress.coins, v_progress.xp, v_progress.best_distance;
end;
$$;

revoke all on function public.claim_runner_run(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_runner_run(uuid, uuid, integer, integer) to service_role;
