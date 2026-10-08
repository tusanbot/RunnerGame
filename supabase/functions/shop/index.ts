const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization'); if(!auth?.startsWith('Bearer '))throw new Error('unauthorized');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),url=Deno.env.get('SUPABASE_URL'); if(!key||!url)throw new Error('server_not_configured');
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2'); const admin=createClient(url,key);
  const {data:{user},error:ue}=await admin.auth.getUser(auth.slice(7)); if(ue||!user)throw new Error('unauthorized');
  const body=await req.json(); const action=String(body?.action??''); const itemId=String(body?.itemId??'');
  if(!itemId)throw new Error('item_id_required');
  let data,error;
  if(action==='purchase'){
   const q=Math.floor(Number(body?.quantity??1));
   ({data,error}=await admin.rpc('purchase_runner_item',{p_user_id:user.id,p_item_id:itemId,p_quantity:q}));
  }else if(action==='activate'){
   ({data,error}=await admin.rpc('activate_runner_item',{p_user_id:user.id,p_item_id:itemId}));
  }else throw new Error('invalid_action');
  if(error){const bad=['invalid_quantity','item_not_found','player_progress_not_found','inventory_limit','insufficient_coins','item_not_owned'];const status=bad.some(x=>error.message.includes(x))?400:500;return new Response(JSON.stringify({error:error.message}),{status,headers:{...cors,'Content-Type':'application/json'}});}
  return new Response(JSON.stringify(data?.[0]??null),{headers:{...cors,'Content-Type':'application/json'}});
 }catch(e){return new Response(JSON.stringify({error:String(e?.message??e)}),{status:String(e?.message??e)==='unauthorized'?401:500,headers:{...cors,'Content-Type':'application/json'}})}
});