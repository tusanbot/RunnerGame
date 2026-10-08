import { supabase } from '../lib/supabase';

export type LeaderboardMode = 'distance' | 'level';

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  bestDistance: number;
  level: number;
  xp: number;
  activeCharacterId: string;
};

export type LeaderboardSnapshot = {
  mode: LeaderboardMode;
  entries: LeaderboardEntry[];
  myRank: number | null;
  myEntry: LeaderboardEntry | null;
  updatedAt: string;
};

export async function getLeaderboard(mode: LeaderboardMode = 'distance', limit = 50): Promise<LeaderboardSnapshot | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke('leaderboard', {
    body: { mode, limit },
  });

  if (error || !data) return null;
  return data as LeaderboardSnapshot;
}
