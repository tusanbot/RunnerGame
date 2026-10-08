import { supabase } from '../lib/supabase';

export type ShopItem = {
  id: string;
  title: string;
  description: string;
  emoji: string;
  priceCoins: number;
  itemType: 'consumable' | 'boost';
  maxInventory: number;
  quantity: number;
};

export type RunnerLoadout = {
  shield: boolean;
  magnet: boolean;
  turbo: boolean;
  coinBoost: boolean;
};

const LOADOUT_KEY = 'runner-legends:loadout:v1';

const emptyLoadout = (): RunnerLoadout => ({
  shield: false,
  magnet: false,
  turbo: false,
  coinBoost: false,
});

export function getRunnerLoadout(): RunnerLoadout {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    return raw ? { ...emptyLoadout(), ...(JSON.parse(raw) as Partial<RunnerLoadout>) } : emptyLoadout();
  } catch {
    return emptyLoadout();
  }
}

export function setRunnerLoadout(loadout: RunnerLoadout) {
  localStorage.setItem(LOADOUT_KEY, JSON.stringify(loadout));
}

export function toggleRunnerLoadout(itemId: string, enabled: boolean) {
  const loadout = getRunnerLoadout();
  const map: Record<string, keyof RunnerLoadout> = {
    shield: 'shield',
    magnet: 'magnet',
    turbo: 'turbo',
    coin_boost: 'coinBoost',
  };
  const key = map[itemId];
  if (!key) return loadout;
  loadout[key] = enabled;
  setRunnerLoadout(loadout);
  return loadout;
}

export function clearRunnerLoadout() {
  const loadout = emptyLoadout();
  setRunnerLoadout(loadout);
  return loadout;
}

export async function getShopItems(): Promise<ShopItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('runner_shop_items')
    .select('id,title,description,emoji,price_coins,item_type,max_inventory')
    .eq('active', true)
    .order('sort_order');
  if (error || !data) return [];

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return data.map((x: any) => ({ ...x, priceCoins: x.price_coins, maxInventory: x.max_inventory, quantity: 0 }));

  const { data: p } = await supabase
    .from('runner_player_progress')
    .select('inventory')
    .eq('user_id', user.user.id)
    .maybeSingle();

  const inv = p?.inventory ?? {};
  return data.map((x: any) => ({
    ...x,
    priceCoins: x.price_coins,
    maxInventory: x.max_inventory,
    quantity: Number(inv[x.id] ?? 0),
  }));
}

// Kept for compatibility with existing callers. Gameplay now equips items locally
// and consumes them atomically when the secure run starts.
export async function purchaseItem(itemId: string, quantity = 1) {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('shop', { body: { action: 'purchase', itemId, quantity } });
  if (error || !data) return null;
  return data;
}

export async function activateItem(itemId: string) {
  return toggleRunnerLoadout(itemId, true);
}
