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
  const { data, error } = await supabase.functions.invoke('finish-run', {
    body: { runId, distance: Math.floor(distance), collectedCoins: Math.floor(collectedCoins), characterId },
  });
  if (error || !data) {
    console.warn('[RunnerGame] Secure reward claim failed:', error?.message);
    return null;
  }
  return data as RunReward;
}
