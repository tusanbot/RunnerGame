const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
};

type Row = {
  user_id: string;
  display_name: string | null;
  best_distance: number | null;
  level: number | null;
  xp: number | null;
  active_character_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!serviceKey || !supabaseUrl) throw new Error('server_not_configured');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(supabaseUrl, serviceKey);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body?.mode === 'level' ? 'level' : 'distance';
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 50);

    const auth = req.headers.get('Authorization');
    let currentUserId: string | null = null;
    if (auth?.startsWith('Bearer ')) {
      const { data: { user } } = await admin.auth.getUser(auth.slice(7));
      currentUserId = user?.id ?? null;
    }

    const order = mode === 'distance'
      ? { column: 'best_distance', ascending: false }
      : { column: 'xp', ascending: false };

    const { data, error } = await admin
      .from('runner_player_progress')
      .select('user_id,display_name,best_distance,level,xp,active_character_id')
      .gt(mode === 'distance' ? 'best_distance' : 'xp', 0)
      .order(order.column, { ascending: order.ascending })
      .order('level', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const rows = (data ?? []) as Row[];
    const entries = rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      displayName: row.display_name?.trim() || 'بازیکن',
      bestDistance: Number(row.best_distance ?? 0),
      level: Number(row.level ?? 1),
      xp: Number(row.xp ?? 0),
      activeCharacterId: row.active_character_id || 'amirreza',
    }));

    let myRank: number | null = null;
    let myEntry: typeof entries[number] | null = null;

    if (currentUserId) {
      const me = entries.find((entry) => entry.userId === currentUserId);
      if (me) {
        myRank = me.rank;
        myEntry = me;
      } else {
        const { data: own } = await admin
          .from('runner_player_progress')
          .select('user_id,display_name,best_distance,level,xp,active_character_id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (own) {
          const score = Number(mode === 'distance' ? own.best_distance ?? 0 : own.xp ?? 0);
          if (score > 0) {
            const { count } = await admin
              .from('runner_player_progress')
              .select('user_id', { count: 'exact', head: true })
              .gt(mode === 'distance' ? 'best_distance' : 'xp', score);

            myRank = Number(count ?? 0) + 1;
            myEntry = {
              rank: myRank,
              userId: own.user_id,
              displayName: own.display_name?.trim() || 'بازیکن',
              bestDistance: Number(own.best_distance ?? 0),
              level: Number(own.level ?? 1),
              xp: Number(own.xp ?? 0),
              activeCharacterId: own.active_character_id || 'amirreza',
            };
          }
        }
      }
    }

    return new Response(JSON.stringify({
      mode,
      entries,
      myRank,
      myEntry,
      updatedAt: new Date().toISOString(),
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: String((error as Error)?.message ?? error),
    }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
