import { supabase } from '../lib/supabase';

export type PlayerProgress = {
  userId: string;
  displayName: string;
  coins: number;
  bestDistance: number;
  level: number;
  xp: number;
  activeCharacterId: string;
  unlockedCharacterIds: string[];
  inventory: Record<string, number>;
  completedMissionIds: string[];
  updatedAt: string;
};

const LOCAL_KEY = 'runner-legends:progress:v1';

export function loadLocalProgress(): PlayerProgress | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as PlayerProgress) : null;
  } catch {
    return null;
  }
}

export function saveLocalProgress(progress: PlayerProgress): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(progress));
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadCloudProgress(userId: string): Promise<PlayerProgress | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('runner_player_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[RunnerGame] Cloud progress is not available yet:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    userId: data.user_id,
    displayName: data.display_name ?? 'بازیکن',
    coins: data.coins ?? 0,
    bestDistance: data.best_distance ?? 0,
    level: data.level ?? 1,
    xp: data.xp ?? 0,
    activeCharacterId: data.active_character_id ?? 'amirreza',
    unlockedCharacterIds: data.unlocked_character_ids ?? ['amirreza'],
    inventory: data.inventory ?? {},
    completedMissionIds: data.completed_mission_ids ?? [],
    updatedAt: data.updated_at ?? new Date().toISOString(),
  };
}

export async function saveCloudProgress(progress: PlayerProgress): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('runner_player_progress')
    .upsert({
      user_id: progress.userId,
      display_name: progress.displayName,
      coins: progress.coins,
      best_distance: progress.bestDistance,
      level: progress.level,
      xp: progress.xp,
      active_character_id: progress.activeCharacterId,
      unlocked_character_ids: progress.unlockedCharacterIds,
      inventory: progress.inventory,
      completed_mission_ids: progress.completedMissionIds,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.warn('[RunnerGame] Cloud save failed:', error.message);
    return false;
  }

  return true;
}
