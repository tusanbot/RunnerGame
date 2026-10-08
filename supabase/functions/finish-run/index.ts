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

    const { data: userData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !userData.user) {
      return Response.json({ error: 'نشست کاربر معتبر نیست.' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const runId = String(body.runId ?? '');
    const distance = Math.floor(Number(body.distance ?? 0));
    const collectedCoins = Math.floor(Number(body.collectedCoins ?? 0));

    if (!runId || !Number.isFinite(distance) || !Number.isFinite(collectedCoins)) {
      return Response.json({ error: 'نتیجه بازی نامعتبر است.' }, { status: 400, headers: corsHeaders });
    }
    if (distance < 0 || collectedCoins < 0 || distance > MAX_DISTANCE || collectedCoins > MAX_COINS_PER_RUN) {
      return Response.json({ error: 'نتیجه بازی خارج از محدوده مجاز است.' }, { status: 400, headers: corsHeaders });
    }

    const { count, error: countError } = await admin
      .from('runner_reward_events')
      .select('run_id', { count: 'exact', head: true })
      .eq('user_id', userData.user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (countError) throw countError;
    if ((count ?? 0) >= MAX_CLAIMS_PER_HOUR) {
      return Response.json({ error: 'تعداد ثبت بازی‌ها در این ساعت بیش از حد مجاز است.' }, { status: 429, headers: corsHeaders });
    }

    const { data, error } = await admin.rpc('claim_runner_run', {
      p_run_id: runId,
      p_user_id: userData.user.id,
      p_distance: distance,
      p_collected_coins: collectedCoins,
    });

    if (error) {
      console.error('[RunnerGame] claim_runner_run failed', error);
      const known = new Set([
        'run_not_found',
        'run_already_claimed',
        'run_result_out_of_range',
        'run_expired',
        'distance_time_mismatch',
        'invalid_run_result',
      ]);
      const code = error.message;
      const status = known.has(code) ? 400 : 500;
      return Response.json({ error: status === 400 ? 'نتیجه بازی قابل قبول نیست.' : 'پاداش بازی ثبت نشد.' }, {
        status,
        headers: corsHeaders,
      });
    }

    const reward = Array.isArray(data) ? data[0] : data;
    if (!reward) throw new Error('empty_reward');

    return Response.json({
      awardedCoins: reward.awarded_coins,
      awardedXp: reward.awarded_xp,
      coins: reward.coins,
      xp: reward.xp,
      bestDistance: reward.best_distance,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[RunnerGame] finish-run failed', error);
    return Response.json({ error: 'پاداش بازی ثبت نشد.' }, { status: 500, headers: corsHeaders });
  }
});
