import Phaser from 'phaser';
import './styles.css';
import { AuthUi } from './ui/authUi';
import { loadLocalProgress, saveCloudProgress, saveLocalProgress, type PlayerProgress } from './services/playerProgress';
import { finishSecureRun, startSecureRun } from './services/runnerRewards';
import { claimMission, getMissionSnapshot, type MissionSnapshot } from './services/missions';
import { ShopUi } from './ui/shopUi';
import { clearRunnerLoadout, getRunnerLoadout, type RunnerLoadout } from './services/shop';
import { getCharacterProgress, type CharacterProgress } from './services/characterProgression';
import { CharacterProgressUi } from './ui/characterProgressUi';
import { LeaderboardUi } from './ui/leaderboardUi';
import { getRunnerStage, RUNNER_STAGES, type RunnerStage, type StageObstacleKind } from './game/stages';

type Character = {
  id: string;
  name: string;
  color: number;
  accent: number;
  ability: string;
  speed: number;
  jump: number;
};

const characters: Character[] = [
  { id: 'amirreza', name: 'امیررضا', color: 0x8b5a3c, accent: 0xff4d6d, ability: 'توربو', speed: 8, jump: 9 },
  { id: 'reza', name: 'رضا', color: 0xf2c29b, accent: 0xffc94d, ability: 'مقاومت', speed: 7, jump: 8 },
  { id: 'taha', name: 'طاها', color: 0xf0b58a, accent: 0x8b5cf6, ability: 'سکه‌خور', speed: 6, jump: 8 },
  { id: 'mohna', name: 'محنا', color: 0xf3c4a8, accent: 0x22d3ee, ability: 'پرش خرگوشی', speed: 8, jump: 11 },
  { id: 'abolfazl', name: 'ابوالفضل', color: 0xc78f68, accent: 0x22c55e, ability: 'شوت', speed: 9, jump: 9 },
  { id: 'mohammad', name: 'محمد', color: 0xd59b78, accent: 0xf97316, ability: 'شیطنت', speed: 10, jump: 8 },
];

type Obstacle = Phaser.GameObjects.Container & {
  obstacleLane?: number;
  obstacleKind?: 'ground' | 'overhead';
};

class RunnerScene extends Phaser.Scene {
  selected = characters[0];
  running = false;
  distance = 0;
  coins = 0;
  speed = 390;
  lane = 1;

  player!: Phaser.GameObjects.Container;
  playerY = 0;
  velocityY = 0;
  jumpStrength = 13;
  groundY = 0;

  obstacles: Obstacle[] = [];
  coinObjs: Phaser.GameObjects.Arc[] = [];

  ui!: Phaser.GameObjects.Text;
  coinText!: Phaser.GameObjects.Text;
  missionText!: Phaser.GameObjects.Text;

  lastSpawn = 0;
  lastCoin = 0;
  obstacleCount = 0;
  worldTime = 0;
  backgroundLayers: Phaser.GameObjects.Graphics[] = [];
  playerBob = 0;
  fxTimer = 0;
  playerState: 'idle' | 'run' | 'jump' | 'slide' | 'hit' = 'idle';
  speedLines: Phaser.GameObjects.Rectangle[] = [];
  skyline!: Phaser.GameObjects.Graphics;
  roadGlow!: Phaser.GameObjects.Graphics;
  lastGrounded = true;

  secureRunId: string | null = null;
  gameOverInProgress = false;
  slideUntil = 0;
  swipeStartX: number | null = null;
  swipeStartY: number | null = null;

  missionSnapshot: MissionSnapshot | null = null;
  characterProgress: CharacterProgress[] = [];
  runEffects: { shield: boolean; magnet: boolean; turbo: boolean; coinBoost: boolean; coinMultiplier: number } = { shield: false, magnet: false, turbo: false, coinBoost: false, coinMultiplier: 1 };
  turboUntil = 0;
  baseRunSpeed = 390;
  effectsText!: Phaser.GameObjects.Text;
  abilityButton!: Phaser.GameObjects.Rectangle;
  abilityButtonText!: Phaser.GameObjects.Text;
  abilityCooldownUntil = 0;
  abilityActiveUntil = 0;
  abilityUses = 0;
  resistanceReady = false;
  stage!: RunnerStage;
  stageBadge!: Phaser.GameObjects.Container;
  stageToast?: Phaser.GameObjects.Container;
  stageAtmosphere!: Phaser.GameObjects.Rectangle;

  progress: PlayerProgress =
    loadLocalProgress() ??
    {
      userId: 'guest',
      displayName: 'بازیکن',
      coins: 0,
      bestDistance: 0,
      level: 1,
      xp: 0,
      activeCharacterId: 'amirreza',
      unlockedCharacterIds: ['amirreza'],
      inventory: {},
      completedMissionIds: [],
      updatedAt: new Date().toISOString(),
    };

  constructor() {
    super('RunnerScene');
  }

  setProgress(progress: PlayerProgress) {
    this.progress = progress;
    const preferred = characters.find(
      (c) => c.id === progress.activeCharacterId && progress.unlockedCharacterIds.includes(c.id),
    );
    if (preferred) this.selected = preferred;

    if (!this.running) this.showCharacterSelect();
    void this.refreshCharacterProgress();
  }

  persistProgress() {
    this.progress = {
      ...this.progress,
      coins: Math.max(0, this.progress.coins),
      bestDistance: Math.max(this.progress.bestDistance, Math.floor(this.distance)),
      activeCharacterId: this.selected.id,
      updatedAt: new Date().toISOString(),
    };

    saveLocalProgress(this.progress);
    if (this.progress.userId !== 'guest') void saveCloudProgress(this.progress);
  }

  async refreshCharacterProgress() {
    if (this.progress.userId === 'guest') {
      this.characterProgress = [];
      return;
    }

    const snapshot = await getCharacterProgress();
    this.characterProgress = snapshot.characters;

    if (!this.running) this.showCharacterSelect();
  }

  selectedCharacterProgress() {
    return this.characterProgress.find((x) => x.characterId === this.selected.id);
  }

  async refreshMissions() {
    if (this.progress.userId === 'guest') {
      this.missionSnapshot = null;
      return;
    }

    this.missionSnapshot = await getMissionSnapshot();
    if (this.running && this.missionText) {
      this.missionText.setText(this.missionSummary());
    }
  }

  async claimReadyMission() {
    const mission = this.missionSnapshot?.missions.find((x) => !x.claimed && x.completed);
    if (!mission || this.progress.userId === 'guest') return;

    const reward = await claimMission(mission.id);
    if (!reward) return;

    this.progress = {
      ...this.progress,
      coins: Number(reward.coins),
      xp: Number(reward.xp),
      updatedAt: new Date().toISOString(),
    };

    saveLocalProgress(this.progress);
    await this.refreshMissions();
  }

  missionSummary() {
    const ready = this.missionSnapshot?.missions.find((m) => !m.claimed && m.completed);
    if (ready) return `🎯 مأموریت آماده دریافت: ${ready.title}`;

    const active =
      this.missionSnapshot?.missions.find((m) => !m.claimed && m.progress > 0) ??
      this.missionSnapshot?.missions[0];

    return active
      ? `🎯 ${active.title} ${Math.min(active.progress, active.target)}/${active.target}`
      : '🎯 مأموریت‌های روزانه';
  }

  preload() {
    for (const character of characters) {
      this.load.svg(`character-${character.id}`, `assets/characters/${character.id}.svg`, { width: 128, height: 160 });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor('#07101f');
    this.groundY = this.scale.height * 0.78;

    this.drawWorld();
    this.roadGlow = this.add.graphics().setDepth(3);
    this.stage = RUNNER_STAGES[0];
    this.stageAtmosphere = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0).setOrigin(0).setDepth(1);
    this.createStageBadge();
    this.createSpeedLines();
    this.showCharacterSelect();
    void this.refreshMissions();
    void this.refreshCharacterProgress();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.swipeStartX = pointer.x;
      this.swipeStartY = pointer.y;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.running || this.swipeStartX === null || this.swipeStartY === null) return;

      const dx = pointer.x - this.swipeStartX;
      const dy = pointer.y - this.swipeStartY;
      this.swipeStartX = null;
      this.swipeStartY = null;

      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        this.changeLane(dx > 0 ? 1 : -1);
      } else if (dy < -35) {
        this.jump();
      } else if (dy > 35) {
        this.slide();
      } else {
        this.tap(pointer.x, pointer.y);
      }
    });

    this.input.keyboard?.on('keydown-LEFT', () => this.changeLane(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.changeLane(1));
    this.input.keyboard?.on('keydown-UP', () => this.jump());
    this.input.keyboard?.on('keydown-DOWN', () => this.slide());
    this.input.keyboard?.on('keydown-SPACE', () => this.jump());
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
  }

  drawWorld() {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.add.graphics();
    this.skyline = g;

    g.fillGradientStyle(0x050816, 0x0b1630, 0x17325b, 0x050816, 1);
    g.fillRect(0, 0, w, h);

    g.fillStyle(0x101827, 1);
    g.fillRect(0, this.groundY, w, h - this.groundY);

    g.lineStyle(3, 0x334155, 1);
    for (let i = 1; i < 3; i++) {
      const x = this.laneX(i);
      g.lineBetween(x - 75, this.groundY, x - 45, h);
    }

    for (let y = this.groundY + 30; y < h; y += 55) {
      g.lineBetween(0, y, w, y);
    }

    for (let i = 0; i < 18; i++) {
      const x = (i * 137) % w;
      const bh = 70 + (i % 6) * 30;
      g.fillStyle(i % 2 ? 0x111b31 : 0x17243d, 1);
      g.fillRect(x, this.groundY - bh, 75, bh);
      g.fillStyle(0x38bdf8, 0.10);
      for (let wy = this.groundY - bh + 14; wy < this.groundY - 12; wy += 22) {
        g.fillRect(x + 10, wy, 8, 5);
        g.fillRect(x + 30, wy, 8, 5);
        g.fillRect(x + 50, wy, 8, 5);
      }
    }

    g.fillStyle(0x020617, 0.8);
    g.fillRect(0, this.groundY - 4, w, 6);
    g.fillStyle(0x38bdf8, 0.12);
    g.fillRect(0, this.groundY + 6, w, 3);

    // Perspective road markers and atmospheric glow.
    g.lineStyle(2, 0x60a5fa, 0.16);
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const y = this.groundY + 18 + t * (h - this.groundY - 18);
      const half = 24 + t * w * 0.42;
      g.lineBetween(w / 2 - half, y, w / 2 + half, y);
    }
  }

  createStageBadge() {
    const w = this.scale.width;
    const panel = this.add.rectangle(0, 0, 236, 48, 0x020617, 0.76)
      .setOrigin(0)
      .setStrokeStyle(1, 0x334155, 0.9);
    const title = this.add.text(16, 8, '', {
      fontFamily: 'Arial',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fff',
    });
    const subtitle = this.add.text(16, 28, '', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#cbd5e1',
    });
    this.stageBadge = this.add.container(14, 122, [panel, title, subtitle]).setDepth(20);
    this.stageBadge.setVisible(false);
    this.stageBadge.setData('title', title);
    this.stageBadge.setData('subtitle', subtitle);
  }

  updateStagePresentation(initial = false) {
    const next = getRunnerStage(this.distance);
    if (!this.stage || next.id !== this.stage.id) {
      const previous = this.stage;
      this.stage = next;
      if (!initial && previous && previous.id !== next.id) {
        this.showStageToast(next);
      }
    }

    if (!this.stageBadge) return;
    const title = this.stageBadge.getData('title') as Phaser.GameObjects.Text;
    const subtitle = this.stageBadge.getData('subtitle') as Phaser.GameObjects.Text;
    title.setText(`مرحله ${this.stage.id} • ${this.stage.name}`);
    subtitle.setText(this.stage.subtitle);
    title.setColor(`#${this.stage.accent.toString(16).padStart(6, '0')}`);
    this.stageBadge.setVisible(this.running);

    if (this.stageAtmosphere) {
      this.stageAtmosphere.setSize(this.scale.width, this.scale.height);
      this.stageAtmosphere.setFillStyle(this.stage.tint, this.stage.id === 1 ? 0.015 : 0.035);
    }
  }

  showStageToast(stage: RunnerStage) {
    this.stageToast?.destroy();
    const w = this.scale.width;
    const panel = this.add.rectangle(0, 0, Math.min(330, w - 32), 92, 0x020617, 0.92)
      .setOrigin(0.5)
      .setStrokeStyle(2, stage.accent, 0.85);
    const title = this.add.text(0, -18, `مرحله ${stage.id}: ${stage.name}`, {
      fontFamily: 'Arial',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#fff',
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, 18, stage.subtitle, {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#cbd5e1',
    }).setOrigin(0.5);
    this.stageToast = this.add.container(w / 2, 165, [panel, title, subtitle]).setDepth(40).setAlpha(0);
    this.tweens.add({
      targets: this.stageToast,
      alpha: 1,
      y: 145,
      duration: 300,
      ease: 'Cubic.easeOut',
      hold: 1300,
      yoyo: true,
      onComplete: () => {
        this.stageToast?.destroy();
        this.stageToast = undefined;
      },
    });
  }

  createSpeedLines() {
    this.speedLines = [];
    for (let i = 0; i < 10; i++) {
      const line = this.add.rectangle(0, 0, Phaser.Math.Between(18, 55), 2, 0x93c5fd, 0.18)
        .setDepth(2)
        .setVisible(false);
      this.speedLines.push(line);
    }
  }

  updateSpeedLines() {
    const active = this.running && this.speed > 470;
    this.speedLines.forEach((line, index) => {
      if (!active) { line.setVisible(false); return; }
      if (!line.visible || line.x < -80) {
        line.x = this.scale.width + Phaser.Math.Between(0, 120);
        line.y = this.groundY * (0.22 + (index % 7) * 0.07);
        line.width = Phaser.Math.Between(18, 55) + (this.speed - 470) * 0.05;
        line.alpha = 0.10 + Math.min(0.22, (this.speed - 470) / 1800);
        line.setVisible(true);
      }
      line.x -= this.speed * 0.32 * (index % 3 === 0 ? 1.35 : 1) * Math.min(1.8, this.speed / 500);
    });
  }

  updateRoadGlow() {
    if (!this.roadGlow) return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.roadGlow.clear();

    const pulse = 0.06 + (Math.sin(this.worldTime / 240) + 1) * 0.025;
    this.roadGlow.fillStyle(this.stage?.accent ?? 0x60a5fa, pulse);
    this.roadGlow.fillTriangle(
      w / 2, this.groundY,
      w / 2 - w * 0.48, h,
      w / 2 + w * 0.48, h,
    );

    if (this.running && this.speed > 600) {
      this.roadGlow.lineStyle(3, this.stage?.accent ?? 0x60a5fa, 0.12);
      for (let i = 0; i < 3; i++) {
        const offset = Math.sin(this.worldTime / 180 + i * 2) * 18;
        this.roadGlow.lineBetween(
          w / 2 + offset,
          this.groundY + 12,
          w / 2 + offset * 7,
          h,
        );
      }
    }
  }

  feedback(kind: 'light' | 'medium' | 'heavy') {
    const ms = kind === 'heavy' ? 45 : kind === 'medium' ? 24 : 12;
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch { /* unsupported */ }
    }
  }

  emitLandingFx() {
    const x = this.player.x;
    const y = this.groundY - 4;
    for (let i = 0; i < 7; i++) {
      const dust = this.add.circle(x + Phaser.Math.Between(-24, 24), y, Phaser.Math.Between(2, 4), 0xcbd5e1, 0.32).setDepth(9);
      this.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(-34, 34),
        y: dust.y + Phaser.Math.Between(-8, 5),
        alpha: 0,
        scale: 0.15,
        duration: 280,
        onComplete: () => dust.destroy(),
      });
    }
    this.feedback('light');
  }

  emitObstacleBreakFx(x: number, y: number) {
    for (let i = 0; i < 9; i++) {
      const piece = this.add.rectangle(x, y, Phaser.Math.Between(4, 8), Phaser.Math.Between(4, 10), 0xef4444, 0.95)
        .setDepth(28)
        .setRotation(Phaser.Math.FloatBetween(-0.5, 0.5));
      this.tweens.add({
        targets: piece,
        x: x + Phaser.Math.Between(-42, 42),
        y: y + Phaser.Math.Between(-48, 42),
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: Phaser.Math.Between(280, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
    this.feedback('medium');
  }

  emitHitFx() {
    this.cameras.main.shake(180, 0.008);
    this.feedback('heavy');
  }

  emitShieldFx(x: number, y: number) {
    const ring = this.add.circle(x, y, 20, 0x38bdf8, 0.18).setStrokeStyle(4, 0x67e8f9, 0.95).setDepth(27);
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const label = this.add.text(x, y - 38, '🛡️ نجات!', { fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: '#67e8f9' }).setOrigin(0.5).setDepth(28);
    this.tweens.add({ targets: label, y: label.y - 25, alpha: 0, duration: 500, onComplete: () => label.destroy() });
  }

  emitPickupFx(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const p = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xfbbf24, 0.95).setDepth(26);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-24, 24),
        y: y + Phaser.Math.Between(-34, 10),
        alpha: 0,
        scale: 0.2,
        duration: 260,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  showCharacterSelect() {
    this.running = false;
    this.clearActors();

    const w = this.scale.width;
    const h = this.scale.height;

    this.add
      .text(w / 2, 55, 'RUNNER LEGENDS', {
        fontFamily: 'Arial',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, 92, 'قهرمانت را انتخاب کن', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    characters.forEach((c, i) => {
      const x = 80 + (i % 3) * (w - 160) / 2;
      const y = 175 + Math.floor(i / 3) * 210;
      const unlocked = this.progress.unlockedCharacterIds.includes(c.id);

      const card = this.add
        .rectangle(x, y, 170, 170, unlocked ? 0x111c2f : 0x0b1222, 0.95)
        .setStrokeStyle(2, unlocked ? c.accent : 0x475569, 0.8)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(x, y - 57, c.name, {
          fontFamily: 'Arial',
          fontSize: '20px',
          fontStyle: 'bold',
          color: unlocked ? '#fff' : '#64748b',
        })
        .setOrigin(0.5);

      this.makeCharacter(x, y + 8, c, 0.85);

      if (!unlocked) {
        this.add.text(x, y + 8, '🔒', { fontFamily: 'Arial', fontSize: '30px' }).setOrigin(0.5).setDepth(5);
      }

      this.add
        .text(x, y + 58, unlocked ? c.ability : 'قفل است', {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: unlocked ? '#cbd5e1' : '#64748b',
        })
        .setOrigin(0.5);

      if (unlocked) {
        card.on('pointerdown', () => {
          this.selected = c;
          this.startGame();
        });
      }
    });

    this.add
      .text(
        w / 2,
        h - 28,
        `🪙 موجودی: ${this.progress.coins}  •  برای شروع روی یک شخصیت بزن`,
        { fontFamily: 'Arial', fontSize: '14px', color: '#94a3b8' },
      )
      .setOrigin(0.5);

    if (this.progress.userId !== 'guest') {
      this.add
        .text(w / 2, h - 58, '⭐ ارتقا و باز کردن شخصیت‌ها از دکمه بالای صفحه', {
          fontFamily: 'Arial',
          fontSize: '13px',
          color: '#c4b5fd',
        })
        .setOrigin(0.5);
    }
  }

  updatePlayerAnimation() {
    if (!this.player) return;
    const sprite = this.player.getData('sprite') as Phaser.GameObjects.Image | undefined;
    const shadow = this.player.getData('shadow') as any;
    if (!sprite) return;

    const state = this.playerState;
    const airborne = this.playerY > 2;
    const baseScale = state === 'slide' ? 0.52 : state === 'jump' ? 0.76 : state === 'hit' ? 0.82 : 0.72;

    sprite.setScale(baseScale);
    sprite.rotation =
      state === 'hit'
        ? Math.sin(this.worldTime / 35) * 0.16
        : state === 'run'
          ? Math.sin(this.worldTime / 110) * 0.025
          : 0;

    if (shadow) {
      shadow.setScale(airborne ? 0.72 : state === 'slide' ? 1.05 : 1);
      shadow.setAlpha(airborne ? 0.18 : 0.32);
    }
  }

  makeCharacter(x: number, y: number, c: Character, scale = 1) {
    const group = this.add.container(x, y).setScale(scale).setData('runnerActor', true);
    const shadow = this.add.ellipse(0, 48, 52, 13, 0x020617, 0.32);
    const sprite = this.add.image(0, 0, `character-${c.id}`)
      .setOrigin(0.5, 0.64)
      .setScale(0.72);

    group.add([shadow, sprite]);
    group.setData('sprite', sprite);
    group.setData('shadow', shadow);
    group.setData('characterId', c.id);
    return group;
  }

  startGame() {
    this.clearActors();

    this.distance = 0;
    this.stage = RUNNER_STAGES[0];
    this.coins = 0;
    this.lane = 1;
    this.velocityY = 0;
    this.playerY = 0;
    this.lastSpawn = 0;
    this.lastCoin = 0;
    this.playerState = 'idle';
    this.updateStagePresentation(true);
    this.obstacleCount = 0;
    this.slideUntil = 0;
    this.secureRunId = null;
    this.gameOverInProgress = false;

    const stats = this.selectedCharacterProgress();
    const base = characters.find((c) => c.id === this.selected.id) ?? this.selected;

    this.baseRunSpeed = 390 + ((stats?.speed ?? base.speed) - base.speed) * 20;
    this.speed = this.baseRunSpeed;
    this.runEffects = { shield: false, magnet: false, turbo: false, coinBoost: false, coinMultiplier: 1 };
    this.turboUntil = 0;
    this.abilityCooldownUntil = this.time.now + 3500;
    this.abilityActiveUntil = 0;
    this.abilityUses = 0;
    this.resistanceReady = false;
    this.jumpStrength = 13 + ((stats?.jump ?? base.jump) - base.jump) * 0.7;

    if (this.progress.userId !== 'guest') {
      const loadout: RunnerLoadout = getRunnerLoadout();
      void startSecureRun(loadout).then((run) => {
        if (!run) return;
        clearRunnerLoadout();
        if (!this.running) return;
        this.secureRunId = run.runId;
        this.runEffects = run.effects;
        if (run.effects.turbo) this.turboUntil = this.time.now + 8000;
      });
    }

    const w = this.scale.width;

    this.player = this.makeCharacter(this.laneX(), this.groundY - 48, this.selected, 1);

    this.ui = this.add
      .text(22, 20, '', {
        fontFamily: 'Arial',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setDepth(20);

    this.coinText = this.add
      .text(w - 22, 20, '🪙 0', {
        fontFamily: 'Arial',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#fbbf24',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.missionText = this.add
      .text(w / 2, 54, this.missionSummary(), {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    this.missionText.on('pointerdown', () => void this.claimReadyMission());

    this.effectsText = this.add
      .text(w / 2, 104, '', { fontFamily: 'Arial', fontSize: '12px', color: '#fbbf24' })
      .setOrigin(0.5)
      .setDepth(20);

    this.abilityButton = this.add
      .rectangle(w - 82, this.scale.height - 72, 142, 52, this.selected.accent, 0.92)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff, 0.24)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);

    this.abilityButtonText = this.add
      .text(w - 82, this.scale.height - 72, '', {
        fontFamily: 'Arial',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#fff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.abilityButton.on('pointerdown', () => {
      this.activateCharacterAbility();
    });

    this.add
      .text(w / 2, 82, '← → حرکت  •  ↑ پرش  •  ↓ سر خوردن  •  P مکث', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#64748b',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.running = true;
    void this.refreshMissions();
  }

  update(_: number, dt: number) {
    if (!this.running || this.gameOverInProgress) return;

    const d = Math.min(dt / 1000, 0.05);

    this.distance += this.speed * d / 10;
    this.worldTime += dt;
    this.updateStagePresentation();
    const normalStageCap = this.stage.maxSpeed;
    this.speed = Math.min(this.runEffects.turbo ? 900 : normalStageCap, this.speed + d * 7);
    if (this.runEffects.turbo && this.time.now < this.turboUntil) {
      this.speed = Math.min(900, Math.max(this.speed, this.baseRunSpeed + 155));
    } else if (this.runEffects.turbo && this.turboUntil > 0) {
      this.runEffects.turbo = false;
      this.speed = Math.min(780, Math.max(this.speed, this.baseRunSpeed));
    }

    if (this.selected.id === 'mohna' && this.abilityActiveUntil > 0 && this.time.now >= this.abilityActiveUntil) {
      this.jumpStrength = 13 + ((this.selectedCharacterProgress()?.jump ?? this.selected.jump) - this.selected.jump) * 0.7;
      this.abilityActiveUntil = 0;
    }
    if (this.selected.id === 'taha' && this.abilityActiveUntil > 0 && this.time.now >= this.abilityActiveUntil) {
      this.runEffects.magnet = false;
      this.abilityActiveUntil = 0;
    }
    if (this.selected.id === 'reza' && this.abilityActiveUntil > 0 && this.time.now >= this.abilityActiveUntil) {
      this.resistanceReady = false;
      this.abilityActiveUntil = 0;
    }

    this.fxTimer += dt;
    this.updateSpeedLines();
    this.updateRoadGlow();

    this.ui.setText(`🏃 ${Math.floor(this.distance)} متر`);

    if (this.abilityButton && this.abilityButtonText) {
      const remaining = Math.max(0, this.abilityCooldownUntil - this.time.now);
      const active = this.abilityActiveUntil > this.time.now;
      const ready = remaining <= 0;
      this.abilityButton.setFillStyle(active ? 0x16a34a : ready ? this.selected.accent : 0x334155, ready || active ? 0.94 : 0.82);
      this.abilityButtonText.setText(
        active
          ? `⚡ ${this.selected.ability}\nفعال`
          : ready
            ? `✨ ${this.selected.ability}\nاستفاده`
            : `⏳ ${Math.ceil(remaining / 1000)}ث`
      );
    }
    this.coinText.setText(`🪙 ${this.coins}`);
    if (this.effectsText) {
      const active = [this.runEffects.shield ? '🛡️ سپر' : '', this.runEffects.magnet ? '🧲 مگنت' : '', this.runEffects.turbo ? '⚡ توربو' : '', this.runEffects.coinBoost ? `💰 ×${this.runEffects.coinMultiplier}` : ''].filter(Boolean);
      this.effectsText.setText(active.join('  •  '));
    }

    this.player.x = Phaser.Math.Linear(this.player.x, this.laneX(), 1 - Math.exp(-12 * d));

    this.velocityY += 32 * d;
    this.playerY += this.velocityY * d;

    if (this.playerY > 0) {
      this.playerY = 0;
      this.velocityY = 0;
    }
    const groundedNow = this.playerY === 0;
    if (groundedNow && !this.lastGrounded) this.emitLandingFx();
    this.lastGrounded = groundedNow;

    this.player.y = this.groundY - 48 + this.playerY;
    this.updatePlayerAnimation();
    const runBob = this.playerY === 0 ? Math.sin(this.worldTime / 85) * 3 : 0;
    this.player.rotation = this.isSliding() ? -0.08 : Math.sin(this.worldTime / 140) * 0.025;
    this.player.y += runBob;

    const sliding = this.isSliding();
    this.player.setScale(1, sliding ? 0.62 : 1);

    this.lastSpawn += dt;
    this.lastCoin += dt;

    const spawnInterval = Phaser.Math.Clamp(
      Phaser.Math.Between(this.stage.spawnMinMs, this.stage.spawnMaxMs) - this.distance * 0.025,
      this.stage.spawnMinMs,
      this.stage.spawnMaxMs,
    );
    if (this.lastSpawn >= spawnInterval) {
      this.spawnObstaclePattern();
      this.lastSpawn = 0;
    }

    if (this.lastCoin >= (this.stage.id >= 3 ? 270 : 300)) {
      this.spawnCoinPattern();
      this.lastCoin = 0;
    }

    for (const obstacle of [...this.obstacles]) {
      obstacle.x -= this.speed * d;

      if (obstacle.x < -100) {
        obstacle.destroy();
        this.obstacles = this.obstacles.filter((x) => x !== obstacle);
        continue;
      }

      if (this.obstacleHitsPlayer(obstacle)) {
        if (this.resistanceReady) {
          this.resistanceReady = false;
          this.abilityActiveUntil = 0;
          this.emitAbilityFx('🧱 مقاومت!', obstacle.x, obstacle.y, 0x60a5fa);
          this.emitObstacleBreakFx(obstacle.x, obstacle.y);
          obstacle.destroy();
          this.obstacles = this.obstacles.filter((x) => x !== obstacle);
          continue;
        }
        if (this.runEffects.shield) {
          this.runEffects.shield = false;
          this.emitShieldFx(obstacle.x, obstacle.y);
          this.emitObstacleBreakFx(obstacle.x, obstacle.y);
          obstacle.destroy();
          this.obstacles = this.obstacles.filter((x) => x !== obstacle);
          continue;
        }
        this.gameOver();
        return;
      }
    }

    for (const coin of [...this.coinObjs]) {
      coin.x -= this.speed * d;

      if (coin.x < -50) {
        coin.destroy();
        this.coinObjs = this.coinObjs.filter((x) => x !== coin);
        continue;
      }

      if (this.runEffects.magnet) {
        const dx = this.player.x - coin.x;
        const dy = this.player.y - coin.y;
        if (Math.abs(dx) < 190 && Math.abs(dy) < 120) {
          coin.x += dx * Math.min(1, d * 8);
          coin.y += dy * Math.min(1, d * 8);
        }
      }

      coin.rotation += d * 4.5;
      coin.scale = 0.92 + Math.sin(this.worldTime / 90 + coin.x * 0.02) * 0.10;

      if (this.coinHitsPlayer(coin)) {
        this.collectCoin(coin);
      }
    }
  }

  private playerRect() {
    const width = this.isSliding() ? 48 : 44;
    const height = this.isSliding() ? 36 : 78;
    const centerY = this.groundY - 48 + this.playerY - (this.isSliding() ? 0 : 2);

    return new Phaser.Geom.Rectangle(
      this.player.x - width / 2,
      centerY - height / 2,
      width,
      height,
    );
  }

  private obstacleRect(obstacle: Obstacle) {
    const kind = obstacle.obstacleKind ?? 'ground';

    if (kind === 'overhead') {
      return new Phaser.Geom.Rectangle(obstacle.x - 36, obstacle.y - 18, 72, 36);
    }

    return new Phaser.Geom.Rectangle(obstacle.x - 28, obstacle.y - 42, 56, 84);
  }

  private obstacleHitsPlayer(obstacle: Obstacle) {
    if (obstacle.obstacleLane !== this.lane) return false;

    const playerRect = this.playerRect();
    const obstacleRect = this.obstacleRect(obstacle);

    return Phaser.Geom.Intersects.RectangleToRectangle(playerRect, obstacleRect);
  }

  private coinHitsPlayer(coin: Phaser.GameObjects.Arc) {
    const lane = Number(coin.getData('lane') ?? 1);
    if (lane !== this.lane) return false;

    const dx = Math.abs(coin.x - this.player.x);
    const dy = Math.abs(coin.y - this.player.y);

    const tahaBoost = this.selected.id === 'taha' ? 1.25 : 1;
    return dx < (this.runEffects.magnet ? 105 : 52) * tahaBoost && dy < (this.runEffects.magnet ? 105 : 70) * tahaBoost;
  }

  private collectCoin(coin: Phaser.GameObjects.Arc) {
    this.coins += 1;
    this.emitPickupFx(coin.x, coin.y);
    this.feedback('light');

    const burst = this.add.text(coin.x, coin.y - 12, '+1', {
      fontFamily: 'Arial',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fbbf24',
    }).setOrigin(0.5).setDepth(25);

    this.tweens.add({
      targets: burst,
      y: burst.y - 28,
      alpha: 0,
      duration: 320,
      onComplete: () => burst.destroy(),
    });

    coin.destroy();
    this.coinObjs = this.coinObjs.filter((x) => x !== coin);
  }

  spawnObstaclePattern() {
    const firstLane = Phaser.Math.Between(0, 2);
    const roll = Math.random();
    const makeDouble = roll < this.stage.doubleObstacleChance;
    const makeOverhead = this.obstacleCount > 2 && Math.random() < this.stage.overheadChance;

    this.spawnObstacle(firstLane, makeOverhead ? 'overhead' : 'ground', 0);

    if (makeDouble) {
      const safeLane = Phaser.Math.Between(0, 2);
      const secondLane = safeLane === firstLane ? (firstLane + 1 + Phaser.Math.Between(0, 1)) % 3 : safeLane;
      const secondKind: StageObstacleKind = this.stage.id >= 3 && Math.random() < this.stage.overheadChance * 0.65 ? 'overhead' : 'ground';
      this.spawnObstacle(secondLane, secondKind, 185);
    }
  }

  spawnObstacle(lane: number, kind: StageObstacleKind, xOffset: number) {
    const obstacle = this.add.container(this.scale.width + 90 + xOffset, 0) as Obstacle;
    obstacle.obstacleLane = lane;
    obstacle.obstacleKind = kind;

    const g = this.add.graphics();

    if (kind === 'overhead') {
      obstacle.y = this.groundY - 105;
      g.fillStyle(0xf97316, 1);
      g.fillRoundedRect(-36, -18, 72, 36, 9);
      g.fillStyle(0xffedd5, 1);
      g.fillRect(-22, -5, 44, 5);
    } else {
      obstacle.y = this.groundY - 42;
      g.fillStyle(0xef4444, 1);
      g.fillRoundedRect(-28, -42, 56, 84, 10);
      g.fillStyle(0xfca5a5, 1);
      g.fillRect(-20, -31, 40, 8);
    }

    obstacle.add(g);
    obstacle.setScale(0.88);
    this.tweens.add({ targets: obstacle, scale: 1, duration: 180, ease: 'Back.easeOut' });
    obstacle.x = this.scale.width + 90 + xOffset;
    obstacle.setDepth(8);
    this.obstacles.push(obstacle);
    this.obstacleCount += 1;
  }

  spawnCoinPattern() {
    const lane = Phaser.Math.Between(0, 2);
    const count = this.stage.id >= 3 ? Phaser.Math.Between(3, 5) : Phaser.Math.Between(2, 4);
    const pattern = this.stage.coinPattern;

    for (let i = 0; i < count; i++) {
      const laneForCoin = pattern === 'zigzag' ? (lane + i) % 3 : lane;
      const height = pattern === 'stairs' || pattern === 'zigzag'
        ? 58 + (i % 3) * 24
        : pattern === 'burst' && i % 2 === 1
          ? 112
          : 72;
      const coin = this.add.circle(
        this.scale.width + 70 + i * (pattern === 'burst' ? 48 : 58),
        this.groundY - height,
        15,
        0xfbbf24,
      );

      coin.setStrokeStyle(4, 0xf59e0b);
      this.tweens.add({ targets: coin, scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      coin.setDepth(7);
      coin.setData('lane', laneForCoin);
      coin.y = this.groundY - height;
      coin.x = this.scale.width + 70 + i * (pattern === 'burst' ? 48 : 58);
      this.coinObjs.push(coin);
    }
  }

  laneX(lane = this.lane) {
    const spacing = Math.min(150, this.scale.width * 0.25);
    return this.scale.width / 2 + (lane - 1) * spacing;
  }

  emitAbilityFx(label: string, x: number, y: number, color: number) {
    const ring = this.add.circle(x, y, 18, color, 0.18).setStrokeStyle(4, color, 0.95).setDepth(45);
    this.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    const text = this.add.text(x, y - 42, label, {
      fontFamily: 'Arial',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#fff',
      stroke: '#020617',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(46);

    this.tweens.add({
      targets: text,
      y: text.y - 28,
      alpha: 0,
      duration: 520,
      onComplete: () => text.destroy(),
    });
  }

  activateCharacterAbility() {
    if (!this.running || this.gameOverInProgress || this.time.now < this.abilityCooldownUntil) return;

    this.abilityCooldownUntil = this.time.now + 14000;
    this.abilityUses += 1;
    this.feedback('medium');

    switch (this.selected.id) {
      case 'amirreza':
        this.runEffects.turbo = true;
        this.turboUntil = this.time.now + 6000;
        this.abilityActiveUntil = this.turboUntil;
        this.speed = Math.min(900, Math.max(this.speed, this.baseRunSpeed + 190));
        this.emitAbilityFx('⚡ توربو!', this.player.x, this.player.y, 0xff4d6d);
        break;
      case 'reza':
        this.resistanceReady = true;
        this.abilityActiveUntil = this.time.now + 9000;
        this.emitAbilityFx('🧱 مقاومت!', this.player.x, this.player.y, 0xffc94d);
        break;
      case 'taha':
        this.runEffects.magnet = true;
        this.abilityActiveUntil = this.time.now + 7000;
        this.emitAbilityFx('🪙 سکه‌خور!', this.player.x, this.player.y, 0x8b5cf6);
        break;
      case 'mohna':
        this.abilityActiveUntil = this.time.now + 8000;
        this.jumpStrength *= 1.45;
        this.emitAbilityFx('🐰 پرش خرگوشی!', this.player.x, this.player.y, 0x22d3ee);
        break;
      case 'abolfazl': {
        const targets = this.obstacles
          .filter((o) => (o.obstacleLane ?? 1) === this.lane && o.x > this.player.x && o.x < this.player.x + 330)
          .sort((a, b) => a.x - b.x);
        const target = targets[0];
        if (target) {
          this.emitAbilityFx('⚽ شوت!', target.x, target.y, 0x22c55e);
          this.emitObstacleBreakFx(target.x, target.y);
          target.destroy();
          this.obstacles = this.obstacles.filter((x) => x !== target);
        }
        this.abilityActiveUntil = this.time.now + 900;
        break;
      }
      case 'mohammad': {
        const targets = this.obstacles
          .filter((o) => o.x > this.player.x && o.x < this.player.x + 500)
          .slice(0, 4);
        targets.forEach((target, index) => {
          target.x += 90 + index * 35;
          target.setAlpha(0.55);
          this.tweens.add({ targets: target, alpha: 1, duration: 260, delay: index * 35 });
        });
        this.abilityActiveUntil = this.time.now + 3000;
        this.speed = Math.min(820, this.speed + 70);
        this.emitAbilityFx('😈 شیطنت!', this.player.x, this.player.y, 0xf97316);
        break;
      }
    }
  }

  changeLane(n: number) {
    if (!this.running || this.gameOverInProgress) return;
    this.lane = Phaser.Math.Clamp(this.lane + n, 0, 2);
  }

  jump() {
    if (!this.running || this.gameOverInProgress) return;
    if (this.playerY === 0) {
      this.velocityY = -this.jumpStrength * 2.1;
      this.feedback('light');
    }
  }

  slide() {
    if (!this.running || this.gameOverInProgress || this.playerY !== 0) return;
    this.slideUntil = this.time.now + 520;
  }

  isSliding() {
    return this.time.now < this.slideUntil;
  }

  tap(x: number, y: number) {
    if (!this.running) return;

    if (y < this.scale.height * 0.48) {
      this.jump();
    } else {
      this.changeLane(x < this.scale.width / 2 ? -1 : 1);
    }
  }

  togglePause() {
    if (!this.running || this.gameOverInProgress) return;

    if (this.scene.isPaused()) {
      this.scene.resume();
    } else {
      this.scene.pause();
      const overlay = this.add.container(this.scale.width / 2, this.scale.height / 2).setName('pause-overlay').setDepth(100);
      const panel = this.add.rectangle(0, 0, 280, 150, 0x020617, 0.94).setStrokeStyle(2, 0x64748b, 0.9);
      const title = this.add.text(0, -42, '⏸ بازی متوقف شد', {
        fontFamily: 'Arial',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#fff',
      }).setOrigin(0.5);
      const resume = this.add.rectangle(0, 28, 190, 48, 0x7c3aed).setInteractive({ useHandCursor: true });
      const resumeText = this.add.text(0, 28, '▶ ادامه بازی', {
        fontFamily: 'Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#fff',
      }).setOrigin(0.5);
      resume.on('pointerdown', () => {
        overlay.destroy();
        this.scene.resume();
      });
      overlay.add([panel, title, resume, resumeText]);
    }
  }

  async gameOver() {
    if (!this.running || this.gameOverInProgress) return;

    this.gameOverInProgress = true;
    this.running = false;
    this.emitHitFx();
    this.playerState = 'hit';
    if (this.player) {
      this.tweens.killTweensOf(this.player);
      this.tweens.add({ targets: this.player, angle: 10, alpha: 0.55, duration: 90, yoyo: true, repeat: 2 });
    }

    const finalDistance = Math.floor(this.distance);
    const collectedCoins = this.coins;

    let awardedCoins = collectedCoins;
    let awardedXp = Math.floor(finalDistance / 10) + collectedCoins;
    const bestDistance = Math.max(this.progress.bestDistance, finalDistance);
    let onlineReward = true;

    if (this.progress.userId !== 'guest') {
      const runId = this.secureRunId;

      if (runId) {
        const reward = await finishSecureRun(runId, finalDistance, collectedCoins, this.selected.id);

        if (reward) {
          awardedCoins = reward.awardedCoins;
          awardedXp = reward.awardedXp;

          this.progress = {
            ...this.progress,
            coins: reward.coins,
            xp: reward.xp,
            bestDistance: reward.bestDistance,
            activeCharacterId: this.selected.id,
            updatedAt: new Date().toISOString(),
          };

          this.persistProgress();
          void this.refreshMissions();
        } else {
          onlineReward = false;
        }
      } else {
        onlineReward = false;
      }
    } else {
      this.progress = {
        ...this.progress,
        coins: this.progress.coins + awardedCoins,
        bestDistance,
        xp: this.progress.xp + awardedXp,
        activeCharacterId: this.selected.id,
        updatedAt: new Date().toISOString(),
      };

      this.persistProgress();
      void this.refreshMissions();
    }

    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x020617, 0.78).setDepth(30);

    this.add
      .text(w / 2, h / 2 - 80, 'برخورد کردی!', {
        fontFamily: 'Arial',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31);

    const rewardText = onlineReward
      ? `🏃 ${finalDistance} متر   🪙 +${awardedCoins}   ✨ +${awardedXp} XP`
      : `🏃 ${finalDistance} متر   ⚠️ پاداش آنلاین ثبت نشد`;

    this.add
      .text(w / 2, h / 2 - 25, rewardText, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#fbbf24',
        align: 'center',
        wordWrap: { width: w - 40 },
      })
      .setOrigin(0.5)
      .setDepth(31);

    const b = this.add
      .rectangle(w / 2, h / 2 + 55, 210, 58, 0x7c3aed)
      .setInteractive({ useHandCursor: true })
      .setDepth(31);

    this.add
      .text(w / 2, h / 2 + 55, 'دوباره بازی کن', {
        fontFamily: 'Arial',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(32);

    b.on('pointerdown', () => this.startGame());
  }

  clearActors() {
    this.obstacles.forEach((o) => o.destroy());
    this.coinObjs.forEach((o) => o.destroy());
    this.obstacles = [];
    this.coinObjs = [];

    this.children.list
      .filter((o) => {
        const data = (o as Phaser.GameObjects.GameObject).getData?.('runnerActor');
        return data === true || o instanceof Phaser.GameObjects.Text || o instanceof Phaser.GameObjects.Rectangle;
      })
      .forEach((o) => o.destroy());
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: '100%',
  height: '100%',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: '#07101f',
  scene: RunnerScene,
  render: {
    antialias: true,
    roundPixels: false,
  },
});

let shopUi: ShopUi;
let characterProgressUi: CharacterProgressUi;
let leaderboardUi: LeaderboardUi;

const authUi = new AuthUi((state) => {
  const scene = game.scene.getScene('RunnerScene') as RunnerScene | undefined;

  if (scene && state.progress) scene.setProgress(state.progress);
  if (shopUi && state.progress) shopUi.setProgress(state.progress);
});

shopUi = new ShopUi(
  () => (game.scene.getScene('RunnerScene') as RunnerScene).progress,
  (progress) => {
    const scene = game.scene.getScene('RunnerScene') as RunnerScene;
    scene.setProgress(progress);
    scene.persistProgress();
  },
);

leaderboardUi = new LeaderboardUi();

characterProgressUi = new CharacterProgressUi(
  () => (game.scene.getScene('RunnerScene') as RunnerScene).progress,
  (progress) => {
    const scene = game.scene.getScene('RunnerScene') as RunnerScene;
    scene.setProgress(progress);
    scene.persistProgress();
  },
  () => {
    const scene = game.scene.getScene('RunnerScene') as RunnerScene;
    void scene.refreshCharacterProgress();
  },
);

window.addEventListener('beforeunload', () => {
  authUi.destroy();
  shopUi.destroy();
  characterProgressUi.destroy();
  leaderboardUi.destroy();
});
