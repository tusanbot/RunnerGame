const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer '))throw new Error('unauthorized');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),url=Deno.env.get('SUPABASE_URL');
  if(!key||!url)throw new Error('server_not_configured');
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  const admin=createClient(url,key);
  const {data:{user},error:ue}=await admin.auth.getUser(auth.slice(7));
  if(ue||!user)throw new Error('unauthorized');
  const body=await req.json();
  const characterId=String(body?.characterId??'');
  const action=String(body?.action??'');
  if(!characterId)throw new Error('character_id_required');
  const allowed=['unlock','upgrade_speed','upgrade_jump','upgrade_coin'];
  if(!allowed.includes(action))throw new Error('invalid_character_action');
  const {data,error}=await admin.rpc('progress_runner_character',{p_user_id:user.id,p_character_id:characterId,p_action:action});
  if(error){
    const known=['invalid_character_action','character_not_found','player_progress_not_found','character_already_unlocked','insufficient_coins','character_locked','max_level'];
    const status=known.some(x=>error.message.includes(x))?400:500;
    return new Response(JSON.stringify({error:error.message}),{status,headers:{...cors,'Content-Type':'application/json'}});
  }
  return new Response(JSON.stringify(data?.[0]??null),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(e){
  const message=String((e as Error)?.message??e);
  return new Response(JSON.stringify({error:message}),{status:message==='unauthorized'?401:500,headers:{...cors,'Content-Type':'application/json'}});
 }
});