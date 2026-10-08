create index if not exists runner_player_progress_distance_leaderboard_idx
on public.runner_player_progress (best_distance desc, updated_at asc)
where best_distance > 0;

create index if not exists runner_player_progress_xp_leaderboard_idx
on public.runner_player_progress (xp desc, level desc, updated_at asc)
where xp > 0;
