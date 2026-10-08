# RunnerGame Supabase progress schema

This is the planned cloud-save contract for RunnerGame.

## Table

public.runner_player_progress

- user_id uuid — primary key, references auth.users(id)
- display_name text — player's display name
- coins bigint — current coins
- best_distance integer — best distance
- level integer — current level
- xp integer — experience points
- active_character_id text — selected character
- unlocked_character_ids jsonb — unlocked character IDs
- inventory jsonb — item quantities
- completed_mission_ids jsonb — completed mission IDs
- updated_at timestamptz — last cloud save

## Security requirements

RLS must be enabled. Authenticated players may only read/write the row whose user_id equals auth.uid().

The browser must only receive the Supabase publishable key. A service-role/secret key must never be committed to the repository or shipped to the browser.

## Current status

The repository now contains the client and cloud-save contract, but the actual Supabase project/table and authentication UI are not yet created.

Do not treat cloud saving as active until the database table and RLS policies have been created and verified.
