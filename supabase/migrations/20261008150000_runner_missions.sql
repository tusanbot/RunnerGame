create table if not exists public.runner_missions (
  id text primary key,
  title text not null,
  description text not null,
  cadence text not null check (cadence in ('daily','weekly')),
  metric text not null check (metric in ('runs','distance','coins')),
  target integer not null check (target > 0),
  reward_coins integer not null check (reward_coins >= 0),
  reward_xp integer not null check (reward_xp >= 0),
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.runner_missions (id,title,description,cadence,metric,target,reward_coins,reward_xp,sort_order)
values
('daily_run_1','اولین دویدن','یک دست بازی را کامل کن.','daily','runs',1,20,30,10),
('daily_distance_1000','هزار متر','امروز مجموعاً ۱۰۰۰ متر بدو.','daily','distance',1000,35,50,20),
('daily_coins_30','سکه‌جمع‌کن','امروز ۳۰ سکه جمع کن.','daily','coins',30,30,45,30),
('weekly_run_7','هفته پرتحرک','این هفته ۷ دست بازی را کامل کن.','weekly','runs',7,100,150,40),
('weekly_distance_10000','دونده حرفه‌ای','این هفته ۱۰٬۰۰۰ متر بدو.','weekly','distance',10000,150,250,50),
('weekly_coins_250','گنج‌یاب','این هفته ۲۵۰ سکه جمع کن.','weekly','coins',250,120,200,60)
on conflict (id) do update set
  title=excluded.title, description=excluded.description, cadence=excluded.cadence,
  metric=excluded.metric, target=excluded.target, reward_coins=excluded.reward_coins,
  reward_xp=excluded.reward_xp, sort_order=excluded.sort_order, active=excluded.active;

create table if not exists public.runner_mission_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.runner_missions(id) on delete cascade,
  period_start timestamptz not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, mission_id, period_start)
);

create index if not exists runner_mission_claims_user_idx
  on public.runner_mission_claims(user_id, claimed_at desc);

alter table public.runner_missions enable row level security;
alter table public.runner_mission_claims enable row level security;

drop policy if exists "runner missions public read" on public.runner_missions;
create policy "runner missions public read" on public.runner_missions
  for select to anon, authenticated using (active = true);

drop policy if exists "runner mission claims own read" on public.runner_mission_claims;
create policy "runner mission claims own read" on public.runner_mission_claims
  for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.runner_missions from anon, authenticated;
revoke insert, update, delete on public.runner_mission_claims from anon, authenticated;
grant select on public.runner_missions to anon, authenticated;
grant select on public.runner_mission_claims to authenticated;

create or replace function public.claim_runner_mission(
  p_user_id uuid,
  p_mission_id text
)
returns table (
  mission_id text,
  awarded_coins integer,
  awarded_xp integer,
  coins bigint,
  xp integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission public.runner_missions%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_value integer;
  v_already boolean;
  v_progress public.runner_player_progress%rowtype;
begin
  select * into v_mission from public.runner_missions
   where id=p_mission_id and active=true;
  if not found then raise exception 'mission_not_found'; end if;

  if v_mission.cadence='daily' then
    v_period_start := date_trunc('day', clock_timestamp());
    v_period_end := v_period_start + interval '1 day';
  else
    v_period_start := date_trunc('week', clock_timestamp());
    v_period_end := v_period_start + interval '7 days';
  end if;

  select exists(
    select 1 from public.runner_mission_claims
     where user_id=p_user_id and mission_id=p_mission_id and period_start=v_period_start
  ) into v_already;
  if v_already then raise exception 'mission_already_claimed'; end if;

  if v_mission.metric='runs' then
    select count(*)::integer into v_value from public.runner_run_sessions
     where user_id=p_user_id and status='claimed' and started_at>=v_period_start and started_at<v_period_end;
  elsif v_mission.metric='distance' then
    select coalesce(sum(distance),0)::integer into v_value from public.runner_reward_events
     where user_id=p_user_id and created_at>=v_period_start and created_at<v_period_end;
  else
    select coalesce(sum(collected_coins),0)::integer into v_value from public.runner_reward_events
     where user_id=p_user_id and created_at>=v_period_start and created_at<v_period_end;
  end if;

  if v_value < v_mission.target then raise exception 'mission_not_completed'; end if;

  select * into v_progress from public.runner_player_progress
   where user_id=p_user_id for update;
  if not found then raise exception 'player_progress_not_found'; end if;

  update public.runner_player_progress
     set coins=v_progress.coins+v_mission.reward_coins,
         xp=v_progress.xp+v_mission.reward_xp,
         updated_at=clock_timestamp()
   where user_id=p_user_id
   returning * into v_progress;

  insert into public.runner_mission_claims(user_id,mission_id,period_start)
  values(p_user_id,p_mission_id,v_period_start);

  return query select p_mission_id,v_mission.reward_coins,v_mission.reward_xp,v_progress.coins,v_progress.xp;
end;
$$;

revoke all on function public.claim_runner_mission(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_runner_mission(uuid,text) to service_role;
