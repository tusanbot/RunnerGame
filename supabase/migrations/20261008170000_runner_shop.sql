create table if not exists public.runner_shop_items (
  id text primary key,
  title text not null,
  description text not null,
  emoji text not null,
  price_coins integer not null check (price_coins >= 0),
  item_type text not null check (item_type in ('consumable','boost')),
  max_inventory integer not null default 99 check (max_inventory > 0),
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.runner_shop_items
(id,title,description,emoji,price_coins,item_type,max_inventory,sort_order)
values
('shield','سپر نجات','یک بار برخورد با مانع را خنثی می‌کند.','🛡️',80,'consumable',10,10),
('magnet','مگنت سکه','سکه‌های نزدیک را راحت‌تر جمع می‌کند.','🧲',120,'boost',10,20),
('turbo','توربو','شروع بازی با سرعت بیشتر و امتیاز هیجانی‌تر.','⚡',150,'boost',10,30),
('coin_boost','ضریب سکه','در یک بازی، ارزش سکه‌های جمع‌شده را افزایش می‌دهد.','💰',180,'boost',10,40)
on conflict (id) do update set
title=excluded.title,description=excluded.description,emoji=excluded.emoji,
price_coins=excluded.price_coins,item_type=excluded.item_type,
max_inventory=excluded.max_inventory,sort_order=excluded.sort_order,active=excluded.active;

alter table public.runner_shop_items enable row level security;
drop policy if exists "runner shop public read" on public.runner_shop_items;
create policy "runner shop public read" on public.runner_shop_items
for select to anon,authenticated using(active=true);
revoke insert,update,delete on public.runner_shop_items from anon,authenticated;
grant select on public.runner_shop_items to anon,authenticated;

revoke update on public.runner_player_progress from anon,authenticated;
grant update (display_name,active_character_id,unlocked_character_ids,completed_mission_ids) on public.runner_player_progress to authenticated;

create table if not exists public.runner_item_activations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null references public.runner_shop_items(id),
 activated_at timestamptz not null default now()
);
create index if not exists runner_item_activations_user_idx
on public.runner_item_activations(user_id,activated_at desc);
alter table public.runner_item_activations enable row level security;
drop policy if exists "runner item activations own read" on public.runner_item_activations;
create policy "runner item activations own read" on public.runner_item_activations
for select to authenticated using((select auth.uid())=user_id);
revoke insert,update,delete on public.runner_item_activations from anon,authenticated;
grant select on public.runner_item_activations to authenticated;

create or replace function public.purchase_runner_item(p_user_id uuid,p_item_id text,p_quantity integer default 1)
returns table(item_id text,quantity integer,spent_coins integer,coins bigint)
language plpgsql security definer set search_path=''
as $$
declare v_item public.runner_shop_items%rowtype; v_progress public.runner_player_progress%rowtype;
v_current integer; v_cost integer; v_inventory jsonb;
begin
 if p_quantity<1 or p_quantity>10 then raise exception 'invalid_quantity'; end if;
 select * into v_item from public.runner_shop_items where id=p_item_id and active=true for update;
 if not found then raise exception 'item_not_found'; end if;
 select * into v_progress from public.runner_player_progress where user_id=p_user_id for update;
 if not found then raise exception 'player_progress_not_found'; end if;
 v_current=coalesce((v_progress.inventory->>p_item_id)::integer,0);
 if v_current+p_quantity>v_item.max_inventory then raise exception 'inventory_limit'; end if;
 v_cost=v_item.price_coins*p_quantity;
 if v_progress.coins<v_cost then raise exception 'insufficient_coins'; end if;
 v_inventory=coalesce(v_progress.inventory,'{}'::jsonb);
 v_inventory=jsonb_set(v_inventory,array[p_item_id],to_jsonb(v_current+p_quantity),true);
 update public.runner_player_progress set coins=coins-v_cost,inventory=v_inventory,updated_at=clock_timestamp()
 where user_id=p_user_id returning * into v_progress;
 return query select p_item_id,v_current+p_quantity,v_cost,v_progress.coins;
end; $$;
revoke all on function public.purchase_runner_item(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.purchase_runner_item(uuid,text,integer) to service_role;

create or replace function public.activate_runner_item(p_user_id uuid,p_item_id text)
returns table(item_id text,remaining_quantity integer)
language plpgsql security definer set search_path=''
as $$
declare v_progress public.runner_player_progress%rowtype; v_item public.runner_shop_items%rowtype;
v_current integer; v_inventory jsonb;
begin
 select * into v_item from public.runner_shop_items where id=p_item_id and active=true;
 if not found then raise exception 'item_not_found'; end if;
 select * into v_progress from public.runner_player_progress where user_id=p_user_id for update;
 if not found then raise exception 'player_progress_not_found'; end if;
 v_current=coalesce((v_progress.inventory->>p_item_id)::integer,0);
 if v_current<1 then raise exception 'item_not_owned'; end if;
 v_inventory=jsonb_set(coalesce(v_progress.inventory,'{}'::jsonb),array[p_item_id],to_jsonb(v_current-1),true);
 update public.runner_player_progress set inventory=v_inventory,updated_at=clock_timestamp() where user_id=p_user_id;
 insert into public.runner_item_activations(user_id,item_id) values(p_user_id,p_item_id);
 return query select p_item_id,v_current-1;
end; $$;
revoke all on function public.activate_runner_item(uuid,text) from public,anon,authenticated;
grant execute on function public.activate_runner_item(uuid,text) to service_role;
