# RunnerGame — Supabase setup

Project reference: `kvtrtvnqorqqmehcbrsz`

## 1. Browser configuration for GitHub Pages

The Vite app reads:

```env
VITE_SUPABASE_URL=https://kvtrtvnqorqqmehcbrsz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Do **not** put a Supabase secret/service-role key in these variables.

In GitHub:

1. Open **Settings → Secrets and variables → Actions**.
2. Under **Variables**, create:
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://kvtrtvnqorqqmehcbrsz.supabase.co`
3. Under **Secrets**, create:
   - Name: `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Value: the project's publishable key from **Supabase → Settings → API Keys**.

Both the normal build workflow and the GitHub Pages deployment workflow now consume these values.

The publishable key is intended for browser/mobile code; RLS must still protect every table. Supabase's newer API-key model uses publishable keys for client code and secret keys for backend/Edge Functions.

## 2. Database migrations

The repository now contains a reproducible base migration for the player table:

`supabase/migrations/20261008120000_runner_player_progress.sql`

Then run the feature migrations in this exact order:

1. `20261008120000_runner_player_progress.sql`
2. `20261008130000_runner_economy.sql`
3. `20261008150000_runner_missions.sql`
4. `20261008170000_runner_shop.sql`
5. `20261008190000_runner_character_progression.sql`
6. `20261008210000_runner_leaderboard.sql`
7. `20261008230000_runner_item_gameplay.sql`

### Dashboard method

For the first setup, the simplest method is Supabase Dashboard → **SQL Editor**.

Run each migration file from top to bottom. The first migration is safe if `runner_player_progress` was already created manually because it uses `create table if not exists`, then normalizes the defaults/RLS/indexes.

## 3. Edge Functions

The application currently has these functions:

- `start-run`
- `finish-run`
- `claim-mission`
- `shop`
- `character-progress`
- `leaderboard`

They are designed to perform privileged operations server-side. The functions currently read Supabase's injected `SUPABASE_URL` and legacy `SUPABASE_SERVICE_ROLE_KEY` environment variables. Supabase still provides the legacy variable, but its current documentation recommends migrating backend code to the newer secret-key environment model before the end-of-2026 deprecation window.

Deploy them to the same project:

```bash
supabase login
supabase link --project-ref kvtrtvnqorqqmehcbrsz

supabase functions deploy start-run
supabase functions deploy finish-run
supabase functions deploy claim-mission
supabase functions deploy shop
supabase functions deploy character-progress
supabase functions deploy leaderboard
```

If you use the Supabase CLI for database deployment as well:

```bash
supabase db push
```

Do not commit a local `supabase/functions/.env` containing secret keys.

## 4. Authentication

The game uses Supabase Auth. Enable at least:

- Email/password authentication

After the first registration, the client creates/synchronizes the player's progress row through the secure game flow.

## 5. What must be configured manually

I can prepare the repository and workflows, but GitHub does not expose repository secrets for me to write through the connected GitHub API.

So these two values must be entered once by you:

- `VITE_SUPABASE_URL` — GitHub Actions **Variable**
- `VITE_SUPABASE_PUBLISHABLE_KEY` — GitHub Actions **Secret**

The database migrations and Edge Functions also need to be applied to project `kvtrtvnqorqqmehcbrsz`.

## 6. Security rule

Never use:

- `sb_secret_...`
- `service_role`
- any other privileged Supabase key

in `VITE_*` variables or browser code.

Only the publishable key belongs in the browser. Privileged writes such as rewards, item consumption, mission claims and character upgrades are intentionally routed through server-side database functions/Edge Functions.
