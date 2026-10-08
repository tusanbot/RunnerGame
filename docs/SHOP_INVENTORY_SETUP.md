# Shop & Inventory Engine

The shop is server-authoritative. The browser can read the active catalog and its own inventory, but purchases and item activation are performed by protected database functions through the `shop` Edge Function.

## Items
- 🛡️ Shield — blocks one collision.
- 🧲 Magnet — gameplay boost.
- ⚡ Turbo — gameplay boost.
- 💰 Coin Boost — gameplay boost.

## Supabase
Run `supabase/migrations/20261008170000_runner_shop.sql`, then deploy `supabase/functions/shop`.

The migration removes direct authenticated updates to the `inventory` column. Purchase/activation functions use `security definer`, a pinned empty search path, row locking, and restricted execute grants. Supabase recommends RLS for exposed tables and explicitly restricted execute privileges for protected functions. citeturn0search0turn0search1

Never expose `SUPABASE_SERVICE_ROLE_KEY` in Vite/browser code. citeturn0search2

## Client
Use `getShopItems()`, `purchaseItem()`, and `activateItem()` from `src/services/shop.ts`.
