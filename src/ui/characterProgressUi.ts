import { getCharacterProgress, progressCharacter, type CharacterProgress } from '../services/characterProgression';
import type { PlayerProgress } from '../services/playerProgress';

const names:Record<string,string>={amirreza:'امیررضا',reza:'رضا',taha:'طاها',mohna:'محنا',abolfazl:'ابوالفضل',mohammad:'محمد'};

export class CharacterProgressUi{
 private root=document.createElement('div');
 private getProgress:()=>PlayerProgress;
 private setProgress:(p:PlayerProgress)=>void;
 private onChanged:()=>void;
 constructor(getProgress:()=>PlayerProgress,setProgress:(p:PlayerProgress)=>void,onChanged:()=>void){
  this.getProgress=getProgress;this.setProgress=setProgress;this.onChanged=onChanged;
  this.root.className='runner-character-progress-root';
  this.root.innerHTML='<button class="runner-character-progress-open">⭐ ارتقای شخصیت‌ها</button><div class="runner-character-progress-backdrop hidden"><section class="runner-character-progress-modal"><button class="runner-character-progress-close">×</button><div class="runner-character-progress-title">⭐ شخصیت‌ها و ارتقا</div><div class="runner-character-progress-balance"></div><div class="runner-character-progress-grid"></div></section></div>';
  document.body.appendChild(this.root);
  const backdrop=this.root.querySelector('.runner-character-progress-backdrop') as HTMLElement;
  (this.root.querySelector('.runner-character-progress-close') as HTMLButtonElement).onclick=()=>backdrop.classList.add('hidden');
  (this.root.querySelector('.runner-character-progress-open') as HTMLButtonElement).onclick=async()=>{backdrop.classList.remove('hidden');await this.render();};
 }
 async open(){(this.root.querySelector('.runner-character-progress-backdrop') as HTMLElement).classList.remove('hidden');await this.render();}
 async render(){
  const p=this.getProgress();
  const snapshot=await getCharacterProgress();
  (this.root.querySelector('.runner-character-progress-balance') as HTMLElement).textContent='🪙 موجودی: '+p.coins;
  const grid=this.root.querySelector('.runner-character-progress-grid') as HTMLElement;
  grid.innerHTML=snapshot.characters.map(c=>this.card(c,p.coins)).join('');
  grid.querySelectorAll<HTMLElement>('[data-action]').forEach(b=>b.onclick=async()=>{
    b.setAttribute('aria-busy','true');
    const result=await progressCharacter(b.dataset.character!,b.dataset.action as any);
    if(result){
      const unlocked=Boolean(result.unlocked);
      const ids=new Set(p.unlockedCharacterIds);
      if(unlocked)ids.add(b.dataset.character!);
      const next={...p,coins:Number(result.coins),unlockedCharacterIds:[...ids],activeCharacterId:unlocked?p.activeCharacterId:p.activeCharacterId,updatedAt:new Date().toISOString()};
      this.setProgress(next); this.onChanged();
    }
    await this.render();
  });
 }
 private card(c:CharacterProgress,coins:number){
  const unlock=!c.unlocked;
  const speedCost=50+c.speedLevel*50,jumpCost=50+c.jumpLevel*50,coinCost=75+c.coinLevel*75;
  const action=(a:string,cost:number,label:string,disabled:boolean)=>'<button data-action="'+a+'" data-character="'+c.characterId+'" '+(disabled?'disabled':'')+'>'+label+' · 🪙 '+cost+'</button>';
  return '<article class="runner-character-progress-card"><div class="runner-character-progress-name">'+(c.unlocked?'':'🔒 ')+names[c.characterId]+'</div><div class="runner-character-progress-level">سطح '+c.level+'</div><div class="runner-character-progress-stats"><span>🏃 '+c.speed.toFixed(1)+'</span><span>🦘 '+c.jump.toFixed(1)+'</span><span>🪙 ×'+c.coinMultiplier.toFixed(2)+'</span></div>'+
   (unlock?'<button data-action="unlock" data-character="'+c.characterId+'" '+(coins>=c.unlockCost?'':'disabled')+'>🔓 باز کردن · 🪙 '+c.unlockCost+'</button>':
   action('upgrade_speed',speedCost,'🏃 سرعت',c.speedLevel>=10||coins<speedCost)+action('upgrade_jump',jumpCost,'🦘 پرش',c.jumpLevel>=10||coins<jumpCost)+action('upgrade_coin',coinCost,'🪙 سکه',c.coinLevel>=10||coins<coinCost))+
   '</article>';
 }
 destroy(){this.root.remove();}
}