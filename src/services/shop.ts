import { supabase } from '../lib/supabase';
import { loadLocalProgress, saveLocalProgress } from './playerProgress';

export type ShopItem = { id:string; title:string; description:string; emoji:string; priceCoins:number; itemType:'consumable'|'boost'; maxInventory:number; quantity:number; };
export type RunnerLoadout = { shield:boolean; magnet:boolean; turbo:boolean; coinBoost:boolean; };

const LOCAL_ITEMS: Omit<ShopItem,'quantity'>[] = [
 {id:'shield',title:'سپر نجات',description:'یک برخورد مرگبار را در این اجرا خنثی می‌کند.',emoji:'🛡️',priceCoins:80,itemType:'consumable',maxInventory:9},
 {id:'magnet',title:'مگنت سکه',description:'سکه‌های اطراف را برای یک اجرا به سمتت می‌کشد.',emoji:'🧲',priceCoins:120,itemType:'consumable',maxInventory:9},
 {id:'turbo',title:'توربو',description:'شروع سریع‌تر و افزایش سرعت برای یک اجرا.',emoji:'⚡',priceCoins:150,itemType:'boost',maxInventory:9},
 {id:'coin_boost',title:'ضریب سکه',description:'پاداش سکه این اجرا را افزایش می‌دهد.',emoji:'💰',priceCoins:180,itemType:'boost',maxInventory:9},
];

const LOADOUT_KEY='runner-legends:loadout:v1';
const emptyLoadout=():RunnerLoadout=>({shield:false,magnet:false,turbo:false,coinBoost:false});

export function getRunnerLoadout():RunnerLoadout{try{const raw=localStorage.getItem(LOADOUT_KEY);return raw?{...emptyLoadout(),...(JSON.parse(raw) as Partial<RunnerLoadout>)}:emptyLoadout();}catch{return emptyLoadout();}}
export function setRunnerLoadout(loadout:RunnerLoadout){localStorage.setItem(LOADOUT_KEY,JSON.stringify(loadout));}
export function toggleRunnerLoadout(itemId:string,enabled:boolean){const loadout=getRunnerLoadout();const map:Record<string,keyof RunnerLoadout>={shield:'shield',magnet:'magnet',turbo:'turbo',coin_boost:'coinBoost'};const key=map[itemId];if(!key)return loadout;loadout[key]=enabled;setRunnerLoadout(loadout);return loadout;}
export function clearRunnerLoadout(){const loadout=emptyLoadout();setRunnerLoadout(loadout);return loadout;}

export async function getShopItems():Promise<ShopItem[]>{
 if(supabase){
  const {data,error}=await supabase.from('runner_shop_items').select('id,title,description,emoji,price_coins,item_type,max_inventory').eq('active',true).order('sort_order');
  if(!error&&data?.length){
   const {data:user}=await supabase.auth.getUser();
   const local=loadLocalProgress();
   if(user.user){const {data:p}=await supabase.from('runner_player_progress').select('inventory').eq('user_id',user.user.id).maybeSingle();const inv=p?.inventory??{};return data.map((x:any)=>({...x,priceCoins:Number(x.price_coins),maxInventory:Number(x.max_inventory),quantity:Number(inv[x.id]??0)}));}
   return data.map((x:any)=>({...x,priceCoins:Number(x.price_coins),maxInventory:Number(x.max_inventory),quantity:Number(local?.inventory?.[x.id]??0)}));
  }
 }
 const progress=loadLocalProgress();
 return LOCAL_ITEMS.map(x=>({...x,quantity:Number(progress?.inventory?.[x.id]??0)}));
}

export async function purchaseItem(itemId:string,quantity=1){
 if(supabase){const {data:user}=await supabase.auth.getUser();if(user.user){const {data,error}=await supabase.functions.invoke('shop',{body:{action:'purchase',itemId,quantity}});if(!error&&data)return data;return null;}}
 const item=LOCAL_ITEMS.find(x=>x.id===itemId);const progress=loadLocalProgress();
 if(!item||!progress||quantity<1||!Number.isInteger(quantity))return null;
 const current=Number(progress.inventory?.[itemId]??0);const totalCost=item.priceCoins*quantity;
 if(current+quantity>item.maxInventory||progress.coins<totalCost)return null;
 const next={...progress,coins:progress.coins-totalCost,inventory:{...progress.inventory,[itemId]:current+quantity},updatedAt:new Date().toISOString()};
 saveLocalProgress(next);return {coins:next.coins,quantity:current+quantity};
}
export async function activateItem(itemId:string){return toggleRunnerLoadout(itemId,true);}
