# RunnerGame Mission Engine

The mission system is server-authoritative. Mission definitions live in Supabase, progress is derived from claimed run/reward events, and rewards are granted only by the protected `claim_runner_mission` database function.

## Included missions
- Daily: 1 completed run, 1,000m, 30 collected coins.
- Weekly: 7 completed runs, 10,000m, 250 collected coins.

## Supabase setup
Run `supabase/migrations/20261008150000_runner_missions.sql` in the project's SQL Editor, then deploy the `claim-mission` Edge Function. Edge Functions are intended for authenticated HTTP endpoints and can call Postgres securely; database functions can also be exposed as RPCs with explicit grants. citeturn0search0turn0search2

Required server secrets remain `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose the service role key in Vite/browser code.

## Client behavior
The client reads active mission definitions and own progress from RLS-protected tables. A completed mission still has to be claimed; the server recalculates the period progress before awarding coins/XP. Claims are idempotent per user + mission + period.

## Limitation
Progress is based on server-recorded completed runs and reward events. This is substantially safer than client-maintained counters, while the existing run validation remains the base anti-cheat layer.
