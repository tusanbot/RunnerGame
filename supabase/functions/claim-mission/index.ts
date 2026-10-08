const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info' };

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization');
    if(!auth?.startsWith('Bearer ')) return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{...cors,'Content-Type':'application/json'}});
    const token=auth.slice(7);
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl=Deno.env.get('SUPABASE_URL');
    if(!serviceKey||!supabaseUrl) throw new Error('server_not_configured');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    const admin=createClient(supabaseUrl,serviceKey);
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user) return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{...cors,'Content-Type':'application/json'}});
    const body=await req.json();
    const missionId=String(body?.missionId??'');
    if(!missionId) return new Response(JSON.stringify({error:'mission_id_required'}),{status:400,headers:{...cors,'Content-Type':'application/json'}});
    const {data,error}=await admin.rpc('claim_runner_mission',{p_user_id:user.id,p_mission_id:missionId});
    if(error){
      const bad=['mission_not_found','mission_already_claimed','mission_not_completed','player_progress_not_found'];
      const status=bad.some(x=>error.message.includes(x))?400:500;
      return new Response(JSON.stringify({error:error.message}),{status,headers:{...cors,'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify(data?.[0]??null),{headers:{...cors,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({error:String((e as Error)?.message??e)}),{status:500,headers:{...cors,'Content-Type':'application/json'}});
  }
});