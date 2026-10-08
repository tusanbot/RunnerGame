import { supabase } from '../lib/supabase';

export type Mission = {
  id:string; title:string; description:string; cadence:'daily'|'weekly';
  metric:'runs'|'distance'|'coins'; target:number; rewardCoins:number; rewardXp:number;
  progress:number; completed:boolean; claimed:boolean;
};

export type MissionSnapshot = { missions:Mission[] };

function periodStart(cadence:'daily'|'weekly'){
  const d=new Date();
  const day=cadence==='daily' ? 0 : (d.getUTCDay()+6)%7;
  const base=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day));
  if(cadence==='daily') return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).toISOString();
  return base.toISOString();
}

export async function getMissionSnapshot():Promise<MissionSnapshot|null>{
  if(!supabase) return null;
  const {data: missions,error}=await supabase.from('runner_missions')
    .select('id,title,description,cadence,metric,target,reward_coins,reward_xp')
    .eq('active',true).order('sort_order');
  if(error||!missions) return null;

  const {data: claims}=await supabase.from('runner_mission_claims')
    .select('mission_id,period_start');
  const claimed=new Set((claims??[]).map((x:any)=>x.mission_id+':'+x.period_start));

  const {data: user}=await supabase.auth.getUser();
  if(!user.user) return {missions:[]};

  const {data: runs}=await supabase.from('runner_run_sessions').select('started_at,status')
    .eq('status','claimed');
  const {data: rewards}=await supabase.from('runner_reward_events').select('created_at,distance,collected_coins');

  return {missions:missions.map((m:any)=>{
    const start=new Date(periodStart(m.cadence)).getTime();
    const end=start+(m.cadence==='daily'?86400000:604800000);
    const inPeriod=(iso:string)=>{const t=Date.parse(iso);return t>=start&&t<end;};
    const progress=m.metric==='runs'
      ? (runs??[]).filter((r:any)=>inPeriod(r.started_at)).length
      : (rewards??[]).filter((r:any)=>inPeriod(r.created_at)).reduce((s:number,r:any)=>s+(m.metric==='distance'?r.distance:r.collected_coins),0);
    const key=m.id+':'+new Date(start).toISOString();
    return {...m,rewardCoins:m.reward_coins,rewardXp:m.reward_xp,progress,completed:progress>=m.target,claimed:claimed.has(key)};
  })};
}

export async function claimMission(missionId:string){
  if(!supabase) return null;
  const {data,error}=await supabase.functions.invoke('claim-mission',{body:{missionId}});
  if(error||!data) return null;
  return data;
}
