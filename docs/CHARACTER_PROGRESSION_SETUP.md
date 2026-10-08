# Character Progression Engine

Character unlocks and upgrades are server-authoritative.

## Characters
Six catalog characters are seeded: امیررضا, رضا, طاها, محنا, ابوالفضل, محمد.

Unlock prices are stored in the database. Each character has Speed, Jump and Coin Multiplier progression. Speed and Jump have 10 upgrade levels; Coin Multiplier has 10 levels.

Upgrade costs are calculated on the server:
- Speed/Jump: 50 + (current level × 50)
- Coin Multiplier: 75 + (current level × 75)

## Supabase
Run `supabase/migrations/20261008190000_runner_character_progression.sql`, then deploy `supabase/functions/character-progress`.

The client only reads catalog/progress. Unlock and upgrade operations call a protected Edge Function, which calls a restricted `SECURITY DEFINER` database function. The function locks the player row before changing coins and progression.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. RLS and grants protect the exposed catalog and per-user progression rows.
