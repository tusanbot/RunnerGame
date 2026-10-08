import { supabase } from '../lib/supabase';

export type ShopItem={id:string;title:string;description:string;emoji:string;priceCoins:number;itemType:'consumable'|'boost';maxInventory:number;quantity:number};
export async function getShopItems():Promise<ShopItem[]>{
 if(!supabase)return [];
 const {data,error}=await supabase.from('runner_shop_items').select('id,title,description,emoji,price_coins,item_type,max_inventory').eq('active',true).order('sort_order');
 if(error||!data)return [];
 const {data:user}=await supabase.auth.getUser();
 if(!user.user)return data.map((x:any)=>({...x,priceCoins:x.price_coins,maxInventory:x.max_inventory,quantity:0}));
 const {data:p}=await supabase.from('runner_player_progress').select('inventory').eq('user_id',user.user.id).maybeSingle();
 const inv=p?.inventory??{};
 return data.map((x:any)=>({...x,priceCoins:x.price_coins,maxInventory:x.max_inventory,quantity:Number(inv[x.id]??0)}));
}
export async function purchaseItem(itemId:string,quantity=1){
 if(!supabase)return null;
 const {data,error}=await supabase.functions.invoke('shop',{body:{action:'purchase',itemId,quantity}});
 if(error||!data)return null;
 return data;
}
export async function activateItem(itemId:string){
 if(!supabase)return null;
 const {data,error}=await supabase.functions.invoke('shop',{body:{action:'activate',itemId}});
 if(error||!data)return null;
 return data;
}
