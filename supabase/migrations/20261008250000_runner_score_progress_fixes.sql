-- Runner Legends: keep level synchronized with earned XP.
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
set search_path=''
as $$
declare
  v_session public.runner_run_sessions%rowtype;
  v_progress public.runner_player_progress%rowtype;
  v_elapsed_seconds numeric;
  v_max_distance integer;
  v_awarded_coins integer;
  v_awarded_xp integer;
  v_effective_coins integer;
  v_level integer;
begin
  if p_distance < 0 or p_collected_coins < 0 then raise exception 'invalid_run_result'; end if;

  select * into v_session from public.runner_run_sessions
   where run_id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_session.status <> 'active' then raise exception 'run_already_claimed'; end if;
  if p_distance > 70000 or p_collected_coins > 250 then raise exception 'run_result_out_of_range'; end if;

  v_elapsed_seconds := greatest(0, extract(epoch from (clock_timestamp()-v_session.started_at)));
  if v_elapsed_seconds > 900 then
    update public.runner_run_sessions set status='expired',finished_at=clock_timestamp() where run_id=p_run_id;
    raise exception 'run_expired';
  end if;

  v_max_distance := ceil(v_elapsed_seconds * 90)::integer + 150;
  if p_distance > least(70000,v_max_distance) then raise exception 'distance_time_mismatch'; end if;

  v_effective_coins := least(250, floor(p_collected_coins * greatest(1.0,v_session.coin_multiplier))::integer);
  v_awarded_coins := least(v_effective_coins, floor(p_distance/10)::integer + 5, 250);
  v_awarded_xp := least(5000, floor(p_distance/10)::integer + v_awarded_coins);

  select * into v_progress from public.runner_player_progress where user_id=p_user_id for update;
  if not found then
    v_level := greatest(1, floor(v_awarded_xp / 500)::integer + 1);
    insert into public.runner_player_progress(
      user_id,display_name,coins,best_distance,level,xp,active_character_id,unlocked_character_ids,inventory,completed_mission_ids
    ) values (
      p_user_id,'بازیکن',v_awarded_coins,p_distance,v_level,v_awarded_xp,'amirreza','["amirreza"]'::jsonb,'{}'::jsonb,'[]'::jsonb
    ) returning * into v_progress;
  else
    v_level := greatest(1, floor((v_progress.xp + v_awarded_xp) / 500)::integer + 1);
    update public.runner_player_progress
       set coins=v_progress.coins+v_awarded_coins,
           xp=v_progress.xp+v_awarded_xp,
           level=v_level,
           best_distance=greatest(v_progress.best_distance,p_distance),
           updated_at=clock_timestamp()
     where user_id=p_user_id returning * into v_progress;
  end if;

  insert into public.runner_reward_events(run_id,user_id,distance,collected_coins,awarded_coins,awarded_xp)
  values(p_run_id,p_user_id,p_distance,v_effective_coins,v_awarded_coins,v_awarded_xp);

  update public.runner_run_sessions set status='claimed',finished_at=clock_timestamp() where run_id=p_run_id;
  return query select v_awarded_coins,v_awarded_xp,v_progress.coins,v_progress.xp,v_progress.best_distance;
end;
$$;

revoke all on function public.claim_runner_run(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_runner_run(uuid,uuid,integer,integer) to service_role;

update public.runner_player_progress
set level=greatest(1,floor(xp/500)::integer+1)
where level < greatest(1,floor(xp/500)::integer+1);
