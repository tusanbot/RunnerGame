import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  loadCloudProgress,
  loadLocalProgress,
  saveCloudProgress,
  saveLocalProgress,
  type PlayerProgress,
} from './playerProgress';

export type AuthState = {
  session: Session | null;
  progress: PlayerProgress | null;
};

function guestProgress(): PlayerProgress {
  const local = loadLocalProgress();
  if (local) return local;
  return {
    userId: 'guest',
    displayName: 'بازیکن',
    coins: 0,
    bestDistance: 0,
    level: 1,
    xp: 0,
    activeCharacterId: 'amirreza',
    unlockedCharacterIds: ['amirreza'],
    inventory: {},
    completedMissionIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function mergeProgress(local: PlayerProgress, cloud: PlayerProgress, userId: string): PlayerProgress {
  const unlocked = Array.from(new Set([
    ...cloud.unlockedCharacterIds,
    ...local.unlockedCharacterIds,
  ]));

  const inventory: Record<string, number> = { ...cloud.inventory };
  for (const [key, value] of Object.entries(local.inventory)) {
    inventory[key] = Math.max(inventory[key] ?? 0, value);
  }

  const missions = Array.from(new Set([
    ...cloud.completedMissionIds,
    ...local.completedMissionIds,
  ]));

  const activeCharacterId = unlocked.includes(local.activeCharacterId)
    ? local.activeCharacterId
    : cloud.activeCharacterId;

  return {
    userId,
    displayName: cloud.displayName || local.displayName || 'بازیکن',
    coins: Math.max(cloud.coins, local.coins),
    bestDistance: Math.max(cloud.bestDistance, local.bestDistance),
    level: Math.max(cloud.level, local.level),
    xp: Math.max(cloud.xp, local.xp),
    activeCharacterId,
    unlockedCharacterIds: unlocked,
    inventory,
    completedMissionIds: missions,
    updatedAt: new Date().toISOString(),
  };
}

export async function getInitialAuthState(): Promise<AuthState> {
  if (!supabase) {
    return { session: null, progress: guestProgress() };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    return { session: null, progress: guestProgress() };
  }

  const user = data.session.user;
  const local = loadLocalProgress() ?? guestProgress();
  const cloud = await loadCloudProgress(user.id);

  const base = cloud
    ? mergeProgress(local, cloud, user.id)
    : {
        ...local,
        userId: user.id,
        displayName: user.user_metadata?.display_name ?? local.displayName,
        updatedAt: new Date().toISOString(),
      };

  saveLocalProgress(base);
  if (!cloud) await saveCloudProgress(base);
  else await saveCloudProgress(base);

  return { session: data.session, progress: base };
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) return { error: new Error('Supabase هنوز تنظیم نشده است.') };

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName.trim() || 'بازیکن' },
      emailRedirectTo: window.location.href.split('#')[0],
    },
  });
}

export async function signIn(email: string, password: string) {
  if (!supabase) return { error: new Error('Supabase هنوز تنظیم نشده است.') };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return { error: null };
  return supabase.auth.signOut();
}

export async function sendPasswordReset(email: string) {
  if (!supabase) return { error: new Error('Supabase هنوز تنظیم نشده است.') };

  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('#')[0],
  });
}

export async function updatePassword(password: string) {
  if (!supabase) return { error: new Error('Supabase هنوز تنظیم نشده است.') };
  return supabase.auth.updateUser({ password });
}

export function subscribeAuth(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  if (!supabase) return () => undefined;

  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}
