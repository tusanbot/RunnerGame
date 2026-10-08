import { supabase } from '../lib/supabase';

export type RunReward = {
  awardedCoins: number;
  awardedXp: number;
  coins: number;
  xp: number;
  bestDistance: number;
};

export async function startSecureRun(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('start-run', { body: {} });
  if (error || !data?.runId) {
    console.warn('[RunnerGame] Secure run start failed:', error?.message);
    return null;
  }
  return String(data.runId);
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
