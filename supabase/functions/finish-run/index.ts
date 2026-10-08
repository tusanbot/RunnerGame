import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MAX_RUN_SECONDS = 15 * 60;
const MAX_DISTANCE = 70000;
const MAX_COINS_PER_RUN = 250;
const MAX_CLAIMS_PER_HOUR = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'احراز هویت لازم است.' }, { status: 401, headers: corsHeaders });
    }

    const { data, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !data.user) {
      return Response.json({ error: 'نشست کاربر معتبر نیست.' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const runId = String(body.runId ?? '');
    const distance = Math.max(0, Math.floor(Number(body.distance ?? 0)));
    const collectedCoins = Math.max(0, Math.floor(Number(body.collectedCoins ?? 0)));

    if (!runId || !Number.isFinite(distance) || !Number.isFinite(collectedCoins)) {
      return Response.json({ error: 'نتیجه بازی نامعتبر است.' }, { status: 400, headers: corsHeaders });
    }
    if (distance > MAX_DISTANCE || collectedCoins > MAX_COINS_PER_RUN) {
      return Response.json({ error: 'نتیجه بازی خارج از محدوده مجاز است.' }, { status: 400, headers: corsHeaders });
    }

    const { count, error: countError } = await admin
      .from('runner_reward_events')
      .select('run_id', { count: 'exact', head: true })
      .eq('user_id', data.user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (countError) throw countError;
    if ((count ?? 0) >= MAX_CLAIMS_PER_HOUR) {
      return Response.json({ error: 'تعداد ثبت بازی‌ها در این ساعت بیش از حد مجاز است.' }, { status: 429, headers: corsHeaders });
    }

    const { data: session, error: sessionError } = await admin
      .from('runner_run_sessions')
      .select('run_id,user_id,started_at,status')
      .eq('run_id', runId)
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return Response.json({ error: 'جلسه بازی پیدا نشد.' }, { status: 404, headers: corsHeaders });
    }
    if (session.status !== 'active') {
      return Response.json({ error: 'این بازی قبلاً ثبت شده است.' }, { status: 409, headers: corsHeaders });
    }

    const elapsedSeconds = Math.max(0, (Date.now() - new Date(session.started_at).getTime()) / 1000);
    if (elapsedSeconds > MAX_RUN_SECONDS) {
      await admin.from('runner_run_sessions').update({ status: 'expired', finished_at: new Date().toISOString() }).eq('run_id', runId);
      return Response.json({ error: 'زمان بازی از حد مجاز بیشتر شده است.' }, { status: 400, headers: corsHeaders });
    }

    const maxDistanceFromTime = Math.ceil(elapsedSeconds * 90) + 150;
    if (distance > Math.min(MAX_DISTANCE, maxDistanceFromTime)) {
      return Response.json({ error: 'مسافت ثبت‌شده با زمان واقعی بازی سازگار نیست.' }, { status: 400, headers: corsHeaders });
    }

    const awardedCoins = Math.min(collectedCoins, Math.floor(distance / 10) + 5, MAX_COINS_PER_RUN);
    const awardedXp = Math.min(5000, Math.floor(distance / 10) + awardedCoins);

    const { error: rewardError } = await admin.from('runner_reward_events').insert({
      run_id: runId,
      user_id: data.user.id,
      distance,
      collected_coins: collectedCoins,
      awarded_coins: awardedCoins,
      awarded_xp: awardedXp,
    });

    if (rewardError) {
      if (rewardError.code === '23505') {
        return Response.json({ error: 'این بازی قبلاً ثبت شده است.' }, { status: 409, headers: corsHeaders });
      }
      throw rewardError;
    }

    const { data: progress, error: progressError } = await admin
      .from('runner_player_progress')
      .select('coins,xp,best_distance')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (progressError) throw progressError;

    const nextCoins = (progress?.coins ?? 0) + awardedCoins;
    const nextXp = (progress?.xp ?? 0) + awardedXp;
    const nextBestDistance = Math.max(progress?.best_distance ?? 0, distance);

    const { error: updateError } = await admin
      .from('runner_player_progress')
      .update({ coins: nextCoins, xp: nextXp, best_distance: nextBestDistance })
      .eq('user_id', data.user.id);
    if (updateError) throw updateError;

    const { error: sessionUpdateError } = await admin
      .from('runner_run_sessions')
      .update({ status: 'claimed', finished_at: new Date().toISOString() })
      .eq('run_id', runId)
      .eq('status', 'active');
    if (sessionUpdateError) throw sessionUpdateError;

    return Response.json({
      awardedCoins,
      awardedXp,
      coins: nextCoins,
      xp: nextXp,
      bestDistance: nextBestDistance,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[RunnerGame] finish-run failed', error);
    return Response.json({ error: 'پاداش بازی ثبت نشد.' }, { status: 500, headers: corsHeaders });
  }
});
