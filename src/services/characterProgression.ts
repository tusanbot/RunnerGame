import { supabase } from '../lib/supabase';
import { loadLocalProgress, saveLocalProgress } from './playerProgress';

export type CharacterProgress={
 characterId:string; unlocked:boolean; level:number; speedLevel:number; jumpLevel:number; coinLevel:number;
 speed:number; jump:number; coinMultiplier:number; unlockCost:number;
};
export type CharacterProgressSnapshot={characters:CharacterProgress[]};

function getLocalCharacterProgress():CharacterProgressSnapshot{
 const p=loadLocalProgress(); const raw=JSON.parse(localStorage.getItem('runner-legends:character-levels:v1')||'{}') as Record<string,number>; const level=(id:string,key:string)=>Number(raw[id+'-'+key]??0); return {characters:[{characterId:'amirreza',unlocked:true,level:1,speedLevel:level('amirreza','speed'),jumpLevel:level('amirreza','jump'),coinLevel:level('amirreza','coin'),speed:8+level('amirreza','speed')*.35,jump:9+level('amirreza','jump')*.45,coinMultiplier:1+level('amirreza','coin')*.05,unlockCost:0},{characterId:'reza',unlocked:Boolean(p?.unlockedCharacterIds.includes('reza')),level:1,speedLevel:level('reza','speed'),jumpLevel:level('reza','jump'),coinLevel:level('reza','coin'),speed:7+level('reza','speed')*.35,jump:8+level('reza','jump')*.45,coinMultiplier:1.05+level('reza','coin')*.05,unlockCost:150},{characterId:'taha',unlocked:Boolean(p?.unlockedCharacterIds.includes('taha')),level:1,speedLevel:level('taha','speed'),jumpLevel:level('taha','jump'),coinLevel:level('taha','coin'),speed:6+level('taha','speed')*.35,jump:8+level('taha','jump')*.45,coinMultiplier:1.1+level('taha','coin')*.05,unlockCost:250},{characterId:'mohna',unlocked:Boolean(p?.unlockedCharacterIds.includes('mohna')),level:1,speedLevel:level('mohna','speed'),jumpLevel:level('mohna','jump'),coinLevel:level('mohna','coin'),speed:8+level('mohna','speed')*.35,jump:11+level('mohna','jump')*.45,coinMultiplier:1+level('mohna','coin')*.05,unlockCost:400},{characterId:'abolfazl',unlocked:Boolean(p?.unlockedCharacterIds.includes('abolfazl')),level:1,speedLevel:level('abolfazl','speed'),jumpLevel:level('abolfazl','jump'),coinLevel:level('abolfazl','coin'),speed:9+level('abolfazl','speed')*.35,jump:9+level('abolfazl','jump')*.45,coinMultiplier:1.15+level('abolfazl','coin')*.05,unlockCost:600},{characterId:'mohammad',unlocked:Boolean(p?.unlockedCharacterIds.includes('mohammad')),level:1,speedLevel:level('mohammad','speed'),jumpLevel:level('mohammad','jump'),coinLevel:level('mohammad','coin'),speed:10+level('mohammad','speed')*.35,jump:8+level('mohammad','jump')*.45,coinMultiplier:1.2+level('mohammad','coin')*.05,unlockCost:900}]}; };

export async function getCharacterProgress():Promise<CharacterProgressSnapshot>{
 if(!supabase)return getLocalCharacterProgress();
 const {data:user}=await supabase.auth.getUser();
 if(!user.user)return getLocalCharacterProgress();
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
 if(!supabase){ const p=loadLocalProgress(); const costs:Record<string,number>={reza:150,taha:250,mohna:400,abolfazl:600,mohammad:900}; if(!p)return null; if(action==='unlock'){const cost=costs[characterId];if(!cost||p.coins<cost||p.unlockedCharacterIds.includes(characterId))return null;const next={...p,coins:p.coins-cost,unlockedCharacterIds:[...p.unlockedCharacterIds,characterId],updatedAt:new Date().toISOString()};saveLocalProgress(next);return {unlocked:true,coins:next.coins};} const cost=action==='upgrade_coin'?75:50;if(p.coins<cost)return null;const key=action==='upgrade_coin'?'coin':action==='upgrade_jump'?'jump':'speed';const store=JSON.parse(localStorage.getItem('runner-legends:character-levels:v1')||'{}') as Record<string,number>;const id=characterId+'-'+key;store[id]=Number(store[id]??0)+1;localStorage.setItem('runner-legends:character-levels:v1',JSON.stringify(store));const next={...p,coins:p.coins-cost,updatedAt:new Date().toISOString()};saveLocalProgress(next);return {unlocked:true,coins:next.coins}; }
 const {data,error}=await supabase.functions.invoke('character-progress',{body:{characterId,action}});
 if(error||!data)return null;
 return data;
}
