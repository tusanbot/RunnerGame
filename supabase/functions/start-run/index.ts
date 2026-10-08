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

    const runId = crypto.randomUUID();
    const { error } = await admin.from('runner_run_sessions').insert({
      run_id: runId,
      user_id: data.user.id,
    });
    if (error) throw error;

    return Response.json({ runId }, { headers: corsHeaders });
  } catch (error) {
    console.error('[RunnerGame] start-run failed', error);
    return Response.json({ error: 'شروع بازی آنلاین انجام نشد.' }, { status: 500, headers: corsHeaders });
  }
});
