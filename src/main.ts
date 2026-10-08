import Phaser from 'phaser';
import './styles.css';
import { AuthUi } from './ui/authUi';
import { loadLocalProgress, saveCloudProgress, saveLocalProgress, type PlayerProgress } from './services/playerProgress';
import { finishSecureRun, startSecureRun } from './services/runnerRewards';
import { claimMission, getMissionSnapshot, type MissionSnapshot } from './services/missions';
import { ShopUi } from './ui/shopUi';
import { getCharacterProgress, type CharacterProgress } from './services/characterProgression';
import { CharacterProgressUi } from './ui/characterProgressUi';

type Character = { id:string; name:string; color:number; accent:number; ability:string; speed:number; jump:number; };
const characters:Character[]=[
  {id:'amirreza',name:'امیررضا',color:0x8b5a3c,accent:0xff4d6d,ability:'توربو',speed:8,jump:9},
  {id:'reza',name:'رضا',color:0xf2c29b,accent:0xffc94d,ability:'مقاومت',speed:7,jump:8},
  {id:'taha',name:'طاها',color:0xf0b58a,accent:0x8b5cf6,ability:'سکه‌خور',speed:6,jump:8},
  {id:'mohna',name:'محنا',color:0xf3c4a8,accent:0x22d3ee,ability:'پرش خرگوشی',speed:8,jump:11},
  {id:'abolfazl',name:'ابوالفضل',color:0xc78f68,accent:0x22c55e,ability:'شوت',speed:9,jump:9},
  {id:'mohammad',name:'محمد',color:0xd59b78,accent:0xf97316,ability:'شیطنت',speed:10,jump:8}
];

class RunnerScene extends Phaser.Scene{
  selected=characters[0]; running=false; distance=0; coins=0; speed=420; lane=1; player!:Phaser.GameObjects.Container;
  playerY=0; velocityY=0; groundY=0; obstacles:Phaser.GameObjects.Container[]=[]; coinObjs:Phaser.GameObjects.Arc[]=[];
  ui!:Phaser.GameObjects.Text; coinText!:Phaser.GameObjects.Text; missionText!:Phaser.GameObjects.Text; lastSpawn=0; lastCoin=0;
  missionSnapshot:MissionSnapshot|null=null;
  characterProgress:CharacterProgress[]=[];
  progress:PlayerProgress=loadLocalProgress() ?? {userId:'guest',displayName:'بازیکن',coins:0,bestDistance:0,level:1,xp:0,activeCharacterId:'amirreza',unlockedCharacterIds:['amirreza'],inventory:{},completedMissionIds:[],updatedAt:new Date().toISOString()};
  constructor(){super('RunnerScene');}
  setProgress(progress:PlayerProgress){
    this.progress=progress;
    const preferred=characters.find(c=>c.id===progress.activeCharacterId && progress.unlockedCharacterIds.includes(c.id));
    if(preferred) this.selected=preferred;
    if(!this.running) this.showCharacterSelect();
    void this.refreshCharacterProgress();
  }
  persistProgress(){
    this.progress={...this.progress,coins:Math.max(0,this.progress.coins),bestDistance:Math.max(this.progress.bestDistance,Math.floor(this.distance)),activeCharacterId:this.selected.id,updatedAt:new Date().toISOString()};
    saveLocalProgress(this.progress);
    if(this.progress.userId!=='guest') void saveCloudProgress(this.progress);
  }
  async refreshCharacterProgress(){
    if(this.progress.userId==='guest'){this.characterProgress=[];return;}
    const snapshot=await getCharacterProgress();
    this.characterProgress=snapshot.characters;
    if(!this.running)this.showCharacterSelect();
  }
  selectedCharacterProgress(){return this.characterProgress.find(x=>x.characterId===this.selected.id);}
  async refreshMissions(){
    if(this.progress.userId==='guest'){ this.missionSnapshot=null; return; }
    this.missionSnapshot=await getMissionSnapshot();
    if(this.running && this.missionText){ this.missionText.setText(this.missionSummary()); }
  }
  async claimReadyMission(){
    const mission=this.missionSnapshot?.missions.find(x=>!x.claimed&&x.completed);
    if(!mission || this.progress.userId==='guest') return;
    const reward=await claimMission(mission.id);
    if(!reward) return;
    this.progress={...this.progress,coins:Number(reward.coins),xp:Number(reward.xp),updatedAt:new Date().toISOString()};
    saveLocalProgress(this.progress);
    await this.refreshMissions();
  }
  missionSummary(){
    const m=this.missionSnapshot?.missions.find(x=>!x.claimed && x.completed);
    if(m) return `🎯 مأموریت آماده دریافت: ${m.title}`;
    const active=this.missionSnapshot?.missions.find(x=>!x.claimed && x.progress>0) ?? this.missionSnapshot?.missions[0];
    return active ? `🎯 ${active.title} ${Math.min(active.progress,active.target)}/${active.target}` : '🎯 مأموریت‌های روزانه';
  }
  create(){
    this.cameras.main.setBackgroundColor('#07101f');
    this.groundY=this.scale.height*0.78;
    this.drawWorld();
    this.showCharacterSelect();
    void this.refreshMissions();
    void this.refreshCharacterProgress();
    this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>this.tap(p.x,p.y));
    this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(p.isDown){}});
    this.input.keyboard?.on('keydown-LEFT',()=>this.changeLane(-1));
    this.input.keyboard?.on('keydown-RIGHT',()=>this.changeLane(1));
    this.input.keyboard?.on('keydown-UP',()=>this.jump());
  }
  drawWorld(){
    const w=this.scale.width,h=this.scale.height;
    const g=this.add.graphics();
    g.fillGradientStyle(0x07101f,0x102a43,0x1a365d,0x07101f,1); g.fillRect(0,0,w,h);
    g.fillStyle(0x101827,1); g.fillRect(0,this.groundY,w,h-this.groundY);
    g.lineStyle(4,0x334155,1);
    for(let i=0;i<4;i++)g.lineBetween(i*w/4,this.groundY,(i+0.5)*w/4,h);
    for(let y=this.groundY+30;y<h;y+=55)g.lineBetween(0,y,w,y);
    for(let i=0;i<12;i++){const x=(i*137)%w; const bh=80+(i%5)*32; g.fillStyle(i%2?0x17233a:0x1d2b45,1);g.fillRect(x,this.groundY-bh,75,bh);}
  }
  showCharacterSelect(){
    this.running=false;
    this.clearActors();
    const w=this.scale.width,h=this.scale.height;
    this.add.text(w/2,55,'RUNNER LEGENDS',{fontFamily:'Arial',fontSize:'30px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5);
    this.add.text(w/2,92,'قهرمانت را انتخاب کن',{fontFamily:'Arial',fontSize:'18px',color:'#94a3b8'}).setOrigin(.5);
    characters.forEach((c,i)=>{
      const x=80+(i%3)*(w-160)/2,y=175+Math.floor(i/3)*210;
      const unlocked=this.progress.unlockedCharacterIds.includes(c.id);
      const card=this.add.rectangle(x,y,170,170,unlocked?0x111c2f:0x0b1222,.95).setStrokeStyle(2,unlocked?c.accent:0x475569,.8).setInteractive({useHandCursor:true});
      this.add.text(x,y-57,c.name,{fontFamily:'Arial',fontSize:'20px',fontStyle:'bold',color:unlocked?'#fff':'#64748b'}).setOrigin(.5);
      this.makeCharacter(x,y+8,c,0.85);
      if(!unlocked) this.add.text(x,y+8,'🔒',{fontFamily:'Arial',fontSize:'30px'}).setOrigin(.5).setDepth(5);
      this.add.text(x,y+58,unlocked?c.ability:'قفل است',{fontFamily:'Arial',fontSize:'13px',color:unlocked?'#cbd5e1':'#64748b'}).setOrigin(.5);
      if(unlocked) card.on('pointerdown',()=>{this.selected=c;this.startGame();});
    });
    this.add.text(w/2,h-28,`🪙 موجودی: ${this.progress.coins}  •  برای شروع روی یک شخصیت بزن`,{fontFamily:'Arial',fontSize:'14px',color:'#94a3b8'}).setOrigin(.5);
    if(this.progress.userId!=='guest') this.add.text(w/2,h-58,'⭐ ارتقا و باز کردن شخصیت‌ها از دکمه بالای صفحه',{fontFamily:'Arial',fontSize:'13px',color:'#c4b5fd'}).setOrigin(.5);
  }
  makeCharacter(x:number,y:number,c:Character,scale=1){
    const group=this.add.container(x,y).setScale(scale).setData('runnerActor',true);
    const body=this.add.graphics(); body.fillStyle(c.color,1);body.fillRoundedRect(-22,-10,44,55,18);
    body.fillStyle(c.color,1);body.fillCircle(0,-31,22);
    body.fillStyle(0x111827,1);body.fillCircle(-8,-34,3);body.fillCircle(8,-34,3);
    body.lineStyle(4,c.accent,1);body.strokeCircle(0,-31,22);
    body.fillStyle(c.accent,1);body.fillRoundedRect(-23,32,18,9,4);body.fillRoundedRect(5,32,18,9,4);
    group.add(body); return group;
  }
  startGame(){
    this.clearActors(); this.distance=0;this.coins=0;
    const stats=this.selectedCharacterProgress();
    const base=characters.find(c=>c.id===this.selected.id) ?? this.selected;
    this.speed=390 + ((stats?.speed ?? base.speed)-base.speed)*20;this.lane=1;this.velocityY=0;this.playerY=0;this.lastSpawn=0;this.lastCoin=0;this.secureRunId=null;
    if(this.progress.userId!=='guest') void startSecureRun().then(runId=>{if(this.running)this.secureRunId=runId;});
    const w=this.scale.width,h=this.scale.height;
    this.player=this.makeCharacter(this.laneX(),this.groundY-48,this.selected,1);
    const jumpStrength=13 + ((stats?.jump ?? base.jump)-base.jump)*0.7;
    this.ui=this.add.text(22,20,'',{fontFamily:'Arial',fontSize:'19px',fontStyle:'bold',color:'#fff'}).setDepth(20);
    this.coinText=this.add.text(w-22,20,'🪙 0',{fontFamily:'Arial',fontSize:'19px',fontStyle:'bold',color:'#fbbf24'}).setOrigin(1,0).setDepth(20);
    this.missionText=this.add.text(w/2,54,this.missionSummary(),{fontFamily:'Arial',fontSize:'14px',color:'#cbd5e1'}).setOrigin(.5).setDepth(20).setInteractive({useHandCursor:true});
    this.missionText.on('pointerdown',()=>void this.claimReadyMission());
    this.running=true;
    void this.refreshMissions();
  }
  update(_:number,dt:number){
    if(!this.running)return;
    const d=dt/1000; this.distance+=this.speed*d/10; this.speed=Math.min(780,this.speed+d*7);
    this.ui.setText(`🏃 ${Math.floor(this.distance)} متر`);
    this.coinText.setText(`🪙 ${this.coins}`);
    this.player.x=Phaser.Math.Linear(this.player.x,this.laneX(),.18);
    this.velocityY+=28*d; this.playerY+=this.velocityY*d;
    if(this.playerY>0){this.playerY=0;this.velocityY=0;} this.player.y=this.groundY-48+this.playerY;
    this.lastSpawn+=dt;this.lastCoin+=dt;
    if(this.lastSpawn>Math.max(520,1050-this.distance*1.5)){this.spawnObstacle();this.lastSpawn=0;}
    if(this.lastCoin>360){this.spawnCoin();this.lastCoin=0;}
    [...this.obstacles].forEach(o=>{o.x-=this.speed*d;if(o.x<-100){o.destroy();this.obstacles=this.obstacles.filter(x=>x!==o);}else if(o.getData('lane')===this.lane && Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(),o.getBounds()))this.gameOver();});
    [...this.coinObjs].forEach(c=>{c.x-=this.speed*d;if(c.x<-50){c.destroy();this.coinObjs=this.coinObjs.filter(x=>x!==c);}else if(Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(),c.getBounds())){this.coins++;c.destroy();this.coinObjs=this.coinObjs.filter(x=>x!==c);}});
  }
  spawnObstacle(){const lane=Phaser.Math.Between(0,2),o=this.add.container(this.scale.width+80,this.groundY-35);const g=this.add.graphics();g.fillStyle(0xef4444,1);g.fillRoundedRect(-25,-35,50,70,10);g.fillStyle(0xfca5a5,1);g.fillRect(-17,-27,34,7);o.add(g);o.x=this.scale.width+80;o.setData('lane',lane);o.y=this.groundY-35;this.obstacles.push(o);o.x+=lane*0;this.positionLaneObject(o,lane);}
  spawnCoin(){const lane=Phaser.Math.Between(0,2),c=this.add.circle(this.scale.width+50,this.groundY-100-Phaser.Math.Between(0,80),15,0xfbbf24);c.setStrokeStyle(4,0xf59e0b);this.positionLaneObject(c,lane);this.coinObjs.push(c);}
  positionLaneObject(o:Phaser.GameObjects.GameObject,lane:number){o.x=this.scale.width+80; o.y=(o.y as number); (o as any).x+=lane===0?-this.scale.width/6:lane===2?this.scale.width/6:0;}
  laneX(){return this.scale.width/2+(this.lane-1)*Math.min(150,this.scale.width*.25);}
  changeLane(n:number){if(!this.running)return;this.lane=Phaser.Math.Clamp(this.lane+n,0,2);}
  jump(){if(this.running&&this.playerY===0)this.velocityY=-jumpStrength;}
  tap(x:number,y:number){if(!this.running)return; if(y<this.scale.height*.45)this.jump();else this.changeLane(x<this.scale.width/2?-1:1);}
  async gameOver(){
    if(!this.running)return;
    this.running=false;
    const finalDistance=Math.floor(this.distance);
    const collectedCoins=this.coins;
    let awardedCoins=collectedCoins;
    let awardedXp=Math.floor(finalDistance/10)+collectedCoins;
    let bestDistance=Math.max(this.progress.bestDistance,finalDistance);
    let onlineReward=true;

    if(this.progress.userId!=='guest'){
      const runId=this.secureRunId;
      if(runId){
        const reward=await finishSecureRun(runId,finalDistance,collectedCoins,this.selected.id);
        if(reward){
          awardedCoins=reward.awardedCoins;
          awardedXp=reward.awardedXp;
          bestDistance=reward.bestDistance;
          this.progress={...this.progress,coins:reward.coins,xp:reward.xp,bestDistance:reward.bestDistance,activeCharacterId:this.selected.id,updatedAt:new Date().toISOString()};
          this.persistProgress();
          void this.refreshMissions();
        }else{
          onlineReward=false;
        }
      }else{
        onlineReward=false;
      }
    }else{
      this.progress={...this.progress,coins:this.progress.coins+awardedCoins,bestDistance,xp:this.progress.xp+awardedXp,activeCharacterId:this.selected.id,updatedAt:new Date().toISOString()};
      this.persistProgress();
      void this.refreshMissions();
    }

    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,w,h,0x020617,.78).setDepth(30);
    this.add.text(w/2,h/2-70,'بازی تمام شد!',{fontFamily:'Arial',fontSize:'34px',fontStyle:'bold',color:'#fff'}).setOrigin(.5).setDepth(31);
    const rewardText=onlineReward
      ? `🏃 ${finalDistance} متر   🪙 +${awardedCoins}   ✨ +${awardedXp} XP`
      : `🏃 ${finalDistance} متر   ⚠️ پاداش آنلاین ثبت نشد`;
    this.add.text(w/2,h/2-20,rewardText,{fontFamily:'Arial',fontSize:'18px',color:'#fbbf24',align:'center',wordWrap:{width:w-40}}).setOrigin(.5).setDepth(31);
    const b=this.add.rectangle(w/2,h/2+55,210,58,0x7c3aed).setInteractive().setDepth(31);
    this.add.text(w/2,h/2+55,'دوباره بازی کن',{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:'#fff'}).setOrigin(.5).setDepth(32);
    b.on('pointerdown',()=>this.startGame());
  }
  clearActors(){this.children.list.filter(o=>(o as any).getData?.('runnerActor')||o instanceof Phaser.GameObjects.Text).forEach(o=>{if(o!==this.children.list[0])o.destroy();});this.obstacles.forEach(o=>o.destroy());this.coinObjs.forEach(o=>o.destroy());this.obstacles=[];this.coinObjs=[];}
}
const game=new Phaser.Game({type:Phaser.AUTO,parent:'app',width:'100%',height:'100%',scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},backgroundColor:'#07101f',scene:RunnerScene,render:{antialias:true,roundPixels:false}});
let shopUi: ShopUi;
const authUi=new AuthUi((state)=>{const scene=game.scene.getScene('RunnerScene') as RunnerScene | undefined;if(scene && state.progress) scene.setProgress(state.progress);
  if(shopUi && state.progress) shopUi.setProgress(state.progress);
});
shopUi = new ShopUi(
  () => (game.scene.getScene('RunnerScene') as RunnerScene).progress,
  (progress) => { const scene = game.scene.getScene('RunnerScene') as RunnerScene; scene.setProgress(progress); scene.persistProgress(); }
);
window.addEventListener('beforeunload',()=>authUi.destroy());
