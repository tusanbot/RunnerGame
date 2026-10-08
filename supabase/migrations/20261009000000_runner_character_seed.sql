-- Ensure every authenticated player has a character-progress row so secure run completion
-- and leaderboard validation never fail on a fresh account.
create or replace function public.seed_runner_character_progress()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.runner_character_progress(user_id, character_id, unlocked)
  select new.user_id, c.id, c.id = 'amirreza'
  from public.runner_characters c
  where c.active = true
  on conflict (user_id, character_id) do nothing;
  return new;
end;
$$;

drop trigger if exists runner_seed_character_progress on public.runner_player_progress;
create trigger runner_seed_character_progress
after insert on public.runner_player_progress
for each row execute function public.seed_runner_character_progress();

insert into public.runner_character_progress(user_id, character_id, unlocked)
select p.user_id, c.id, c.id = 'amirreza'
from public.runner_player_progress p
cross join public.runner_characters c
where c.active = true
on conflict (user_id, character_id) do nothing;

revoke all on function public.seed_runner_character_progress() from public, anon, authenticated;
grant execute on function public.seed_runner_character_progress() to service_role;
