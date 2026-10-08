import { supabase } from '../lib/supabase';

export type RunnerEffects = {
  shield: boolean;
  magnet: boolean;
  turbo: boolean;
  coinBoost: boolean;
  coinMultiplier: number;
};

export type RunReward = {
  awardedCoins: number;
  awardedXp: number;
  coins: number;
  xp: number;
  bestDistance: number;
};

export async function startSecureRun(effects: Partial<RunnerEffects> = {}): Promise<{ runId: string; effects: RunnerEffects } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('start-run', {
    body: { effects },
  });
  if (error || !data?.runId) {
    console.warn('[RunnerGame] Secure run start failed:', error?.message);
    return null;
  }
  return {
    runId: String(data.runId),
    effects: {
      shield: Boolean(data.effects?.shield),
      magnet: Boolean(data.effects?.magnet),
      turbo: Boolean(data.effects?.turbo),
      coinBoost: Boolean(data.effects?.coinBoost),
      coinMultiplier: Number(data.effects?.coinMultiplier ?? 1),
    },
  };
}

export async function finishSecureRun(
  runId: string,
  distance: number,
  collectedCoins: number,
  characterId: string,
): Promise<RunReward | null> {
  if (!supabase) return null;
  const body = { runId, distance: Math.floor(distance), collectedCoins: Math.floor(collectedCoins), characterId };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('finish-run', { body });
    if (!error && data) return data as RunReward;
    lastError = error;
    await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
  }
  console.warn('[RunnerGame] Secure reward claim failed after retries:', (lastError as { message?: string } | null)?.message);
  return null;
}
