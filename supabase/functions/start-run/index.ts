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

    const body = await req.json().catch(() => ({}));
    const effects = body?.effects ?? {};
    const shield = effects.shield === true;
    const magnet = effects.magnet === true;
    const turbo = effects.turbo === true;
    const coinBoost = effects.coinBoost === true;

    const { data: run, error } = await admin.rpc('start_runner_run', {
      p_user_id: data.user.id,
      p_shield: shield,
      p_magnet: magnet,
      p_turbo: turbo,
      p_coin_boost: coinBoost,
    });

    if (error) {
      const known = ['player_progress_not_found', 'item_not_owned'];
      return Response.json(
        { error: known.includes(error.message) ? error.message : 'شروع بازی آنلاین انجام نشد.' },
        { status: known.includes(error.message) ? 400 : 500, headers: corsHeaders },
      );
    }

    const result = Array.isArray(run) ? run[0] : run;
    if (!result?.run_id) throw new Error('empty_run');

    return Response.json({
      runId: result.run_id,
      effects: {
        shield: Boolean(result.shield_active),
        magnet: Boolean(result.magnet_active),
        turbo: Boolean(result.turbo_active),
        coinBoost: Number(result.coin_multiplier ?? 1) > 1,
        coinMultiplier: Number(result.coin_multiplier ?? 1),
      },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('[RunnerGame] start-run failed', error);
    return Response.json({ error: 'شروع بازی آنلاین انجام نشد.' }, { status: 500, headers: corsHeaders });
  }
});
