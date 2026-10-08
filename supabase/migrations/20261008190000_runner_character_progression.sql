create table if not exists public.runner_characters (
 id text primary key,
 name text not null,
 ability text not null,
 unlock_cost integer not null default 0 check (unlock_cost >= 0),
 base_speed integer not null check (base_speed > 0),
 base_jump integer not null check (base_jump > 0),
 base_coin_multiplier numeric(5,2) not null default 1.0 check (base_coin_multiplier > 0),
 active boolean not null default true,
 sort_order integer not null default 0
);

insert into public.runner_characters
(id,name,ability,unlock_cost,base_speed,base_jump,base_coin_multiplier,sort_order)
values
('amirreza','امیررضا','توربو',0,8,9,1.00,10),
('reza','رضا','مقاومت',150,7,8,1.05,20),
('taha','طاها','سکه‌خور',250,6,8,1.10,30),
('mohna','محنا','پرش خرگوشی',350,8,11,1.00,40),
('abolfazl','ابوالفضل','شوت',500,9,9,1.15,50),
('mohammad','محمد','شیطنت',700,10,8,1.20,60)
on conflict (id) do update set
name=excluded.name,ability=excluded.ability,unlock_cost=excluded.unlock_cost,
base_speed=excluded.base_speed,base_jump=excluded.base_jump,
base_coin_multiplier=excluded.base_coin_multiplier,sort_order=excluded.sort_order,active=excluded.active;

alter table public.runner_characters enable row level security;
drop policy if exists "runner characters public read" on public.runner_characters;
create policy "runner characters public read" on public.runner_characters
for select to anon,authenticated using(active=true);
revoke insert,update,delete on public.runner_characters from anon,authenticated;
grant select on public.runner_characters to anon,authenticated;

create table if not exists public.runner_character_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 character_id text not null references public.runner_characters(id) on delete cascade,
 unlocked boolean not null default false,
 level integer not null default 1 check(level between 1 and 20),
 speed_level integer not null default 0 check(speed_level between 0 and 10),
 jump_level integer not null default 0 check(jump_level between 0 and 10),
 coin_level integer not null default 0 check(coin_level between 0 and 10),
 updated_at timestamptz not null default now(),
 primary key(user_id,character_id)
);
create index if not exists runner_character_progress_user_idx on public.runner_character_progress(user_id);

alter table public.runner_character_progress enable row level security;
drop policy if exists "runner character progress own read" on public.runner_character_progress;
create policy "runner character progress own read" on public.runner_character_progress
for select to authenticated using((select auth.uid())=user_id);
revoke insert,update,delete on public.runner_character_progress from anon,authenticated;
grant select on public.runner_character_progress to authenticated;

create or replace function public.progress_runner_character(
 p_user_id uuid,p_character_id text,p_action text
) returns table(character_id text,unlocked boolean,level integer,speed_level integer,jump_level integer,coin_level integer,
 speed numeric,jump numeric,coin_multiplier numeric,coins bigint)
language plpgsql security definer set search_path=''
as $$
declare
 v_item public.runner_characters%rowtype;
 v_progress public.runner_player_progress%rowtype;
 v_state public.runner_character_progress%rowtype;
 v_cost integer;
 v_unlock_cost integer;
begin
 if p_action not in ('unlock','upgrade_speed','upgrade_jump','upgrade_coin') then raise exception 'invalid_character_action'; end if;
 select * into v_item from public.runner_characters where id=p_character_id and active=true;
 if not found then raise exception 'character_not_found'; end if;

 select * into v_progress from public.runner_player_progress where user_id=p_user_id for update;
 if not found then raise exception 'player_progress_not_found'; end if;

 insert into public.runner_character_progress(user_id,character_id,unlocked)
 values(p_user_id,p_character_id,p_character_id='amirreza')
 on conflict(user_id,character_id) do nothing;

 select * into v_state from public.runner_character_progress
 where user_id=p_user_id and character_id=p_character_id for update;

 if p_action='unlock' then
   if v_state.unlocked then raise exception 'character_already_unlocked'; end if;
   v_unlock_cost=v_item.unlock_cost;
   if v_progress.coins<v_unlock_cost then raise exception 'insufficient_coins'; end if;
   update public.runner_player_progress
   set coins=coins-v_unlock_cost,
       unlocked_character_ids=(select jsonb_agg(x order by x) from (
         select distinct x from jsonb_array_elements_text(coalesce(unlocked_character_ids,'[]'::jsonb))
         union select p_character_id
       ) s(x)),
       updated_at=clock_timestamp()
   where user_id=p_user_id returning * into v_progress;
   update public.runner_character_progress set unlocked=true,updated_at=clock_timestamp()
   where user_id=p_user_id and character_id=p_character_id returning * into v_state;
 elsif not v_state.unlocked then
   raise exception 'character_locked';
 else
   if p_action='upgrade_speed' then
     if v_state.speed_level>=10 then raise exception 'max_level'; end if;
     v_cost=50+(v_state.speed_level*50);
     update public.runner_character_progress set speed_level=speed_level+1,level=least(20,level+1),updated_at=clock_timestamp()
     where user_id=p_user_id and character_id=p_character_id returning * into v_state;
   elsif p_action='upgrade_jump' then
     if v_state.jump_level>=10 then raise exception 'max_level'; end if;
     v_cost=50+(v_state.jump_level*50);
     update public.runner_character_progress set jump_level=jump_level+1,level=least(20,level+1),updated_at=clock_timestamp()
     where user_id=p_user_id and character_id=p_character_id returning * into v_state;
   else
     if v_state.coin_level>=10 then raise exception 'max_level'; end if;
     v_cost=75+(v_state.coin_level*75);
     update public.runner_character_progress set coin_level=coin_level+1,level=least(20,level+1),updated_at=clock_timestamp()
     where user_id=p_user_id and character_id=p_character_id returning * into v_state;
   end if;
   if v_progress.coins<v_cost then
     raise exception 'insufficient_coins';
   end if;
   update public.runner_player_progress set coins=coins-v_cost,updated_at=clock_timestamp()
   where user_id=p_user_id returning * into v_progress;
 end if;

 return query select v_state.character_id,v_state.unlocked,v_state.level,v_state.speed_level,v_state.jump_level,v_state.coin_level,
   (v_item.base_speed + v_state.speed_level*0.35)::numeric,
   (v_item.base_jump + v_state.jump_level*0.45)::numeric,
   (v_item.base_coin_multiplier + v_state.coin_level*0.05)::numeric,
   v_progress.coins;
end; $$;

revoke all on function public.progress_runner_character(uuid,text,text) from public,anon,authenticated;
grant execute on function public.progress_runner_character(uuid,text,text) to service_role;
