import { supabase } from '../lib/supabase';
import { loadLocalProgress, saveLocalProgress } from './playerProgress';

export type CharacterProgress={
 characterId:string; unlocked:boolean; level:number; speedLevel:number; jumpLevel:number; coinLevel:number;
 speed:number; jump:number; coinMultiplier:number; unlockCost:number;
};
export type CharacterProgressSnapshot={characters:CharacterProgress[]};

export async function getCharacterProgress():Promise<CharacterProgressSnapshot>{
 if(!supabase){ const p=loadLocalProgress(); return {characters:[{characterId:'amirreza',unlocked:true,level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:8,jump:9,coinMultiplier:1,unlockCost:0},{characterId:'reza',unlocked:Boolean(p?.unlockedCharacterIds.includes('reza')),level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:7,jump:8,coinMultiplier:1.05,unlockCost:150},{characterId:'taha',unlocked:Boolean(p?.unlockedCharacterIds.includes('taha')),level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:6,jump:8,coinMultiplier:1.1,unlockCost:250},{characterId:'mohna',unlocked:Boolean(p?.unlockedCharacterIds.includes('mohna')),level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:8,jump:11,coinMultiplier:1,unlockCost:400},{characterId:'abolfazl',unlocked:Boolean(p?.unlockedCharacterIds.includes('abolfazl')),level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:9,jump:9,coinMultiplier:1.15,unlockCost:600},{characterId:'mohammad',unlocked:Boolean(p?.unlockedCharacterIds.includes('mohammad')),level:1,speedLevel:0,jumpLevel:0,coinLevel:0,speed:10,jump:8,coinMultiplier:1.2,unlockCost:900}]}; }
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
 if(!supabase){ const p=loadLocalProgress(); const costs:Record<string,number>={reza:150,taha:250,mohna:400,abolfazl:600,mohammad:900}; if(!p)return null; if(action==='unlock'){const cost=costs[characterId];if(!cost||p.coins<cost||p.unlockedCharacterIds.includes(characterId))return null;const next={...p,coins:p.coins-cost,unlockedCharacterIds:[...p.unlockedCharacterIds,characterId],updatedAt:new Date().toISOString()};saveLocalProgress(next);return {unlocked:true,coins:next.coins};} const cost=action==='upgrade_coin'?75:50;if(p.coins<cost)return null;const next={...p,coins:p.coins-cost,updatedAt:new Date().toISOString()};saveLocalProgress(next);return {unlocked:true,coins:next.coins}; }
 const {data,error}=await supabase.functions.invoke('character-progress',{body:{characterId,action}});
 if(error||!data)return null;
 return data;
}
