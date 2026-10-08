import { supabase } from '../lib/supabase';

export type CharacterProgress={
 characterId:string; unlocked:boolean; level:number; speedLevel:number; jumpLevel:number; coinLevel:number;
 speed:number; jump:number; coinMultiplier:number; unlockCost:number;
};
export type CharacterProgressSnapshot={characters:CharacterProgress[]};

export async function getCharacterProgress():Promise<CharacterProgressSnapshot>{
 if(!supabase)return {characters:[]};
 const {data:user}=await supabase.auth.getUser();
 if(!user.user)return {characters:[]};
 const {data:catalog,error:ce}=await supabase.from('runner_characters').select('id,base_speed,base_jump,base_coin_multiplier,unlock_cost').eq('active',true).order('sort_order');
 if(ce||!catalog)return {characters:[]};
 const {data:rows}=await supabase.from('runner_character_progress').select('character_id,unlocked,level,speed_level,jump_level,coin_level').eq('user_id',user.user.id);
 const map=new Map((rows??[]).map((r:any)=>[r.character_id,r]));
 return {characters:catalog.map((c:any)=>{
   const r=map.get(c.id);
   const speedLevel=Number(r?.speed_level??0),jumpLevel=Number(r?.jump_level??0),coinLevel=Number(r?.coin_level??0);
   return {characterId:c.id,unlocked:Boolean(r?.unlocked??c.id==='amirreza'),level:Number(r?.level??1),speedLevel,jumpLevel,coinLevel,
     speed:Number(c.base_speed)+speedLevel*.35,jump:Number(c.base_jump)+jumpLevel*.45,
     coinMultiplier:Number(c.base_coin_multiplier)+coinLevel*.05,unlockCost:Number(c.unlock_cost)};
 })};
}

export async function progressCharacter(characterId:string,action:'unlock'|'upgrade_speed'|'upgrade_jump'|'upgrade_coin'){
 if(!supabase)return null;
 const {data,error}=await supabase.functions.invoke('character-progress',{body:{characterId,action}});
 if(error||!data)return null;
 return data;
}
