import { supabase } from '../lib/supabase';
import { loadLocalProgress } from './playerProgress';

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
  if (!supabase) { const p = loadLocalProgress(); const hasScore = Boolean(p && (p.bestDistance > 0 || p.xp > 0)); const entry: LeaderboardEntry = { rank: 1, userId: p?.userId ?? 'guest', displayName: p?.displayName ?? 'بازیکن', bestDistance: p?.bestDistance ?? 0, level: p?.level ?? 1, xp: p?.xp ?? 0, activeCharacterId: p?.activeCharacterId ?? 'amirreza' }; return { mode, entries: hasScore ? [entry] : [], myRank: hasScore ? 1 : null, myEntry: hasScore ? entry : null, updatedAt: new Date().toISOString() }; }

  const { data, error } = await supabase.functions.invoke('leaderboard', {
    body: { mode, limit },
  });

  if (error || !data) { const p = loadLocalProgress(); const hasScore = Boolean(p && (p.bestDistance > 0 || p.xp > 0)); const entry: LeaderboardEntry = { rank: 1, userId: p?.userId ?? 'guest', displayName: p?.displayName ?? 'بازیکن', bestDistance: p?.bestDistance ?? 0, level: p?.level ?? 1, xp: p?.xp ?? 0, activeCharacterId: p?.activeCharacterId ?? 'amirreza' }; return { mode, entries: hasScore ? [entry] : [], myRank: hasScore ? 1 : null, myEntry: hasScore ? entry : null, updatedAt: new Date().toISOString() }; }
  return data as LeaderboardSnapshot;
}
