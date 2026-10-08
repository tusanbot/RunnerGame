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
  obstacleVariant?: 'crate' | 'cone' | 'barrier' | 'gate' | 'sign';
};

class RunnerScene extends Phaser.Scene {
  selected = characters[0];
  running = false;
  viewMode: 'menu' | 'character' | 'game' = 'menu';
  distance = 0;
  coins = 0;
  speed = 390;
  lane = 1;

  player!: Phaser.GameObjects.Container;
  playerY = 0;
  velocityY = 0;
  jumpStrength = 13;
  jumpBufferUntil = 0;
  coyoteUntil = 0;
  jumpHeld = false;
  groundY = 0;
  pausedByUser = false;
  pauseOverlay?: Phaser.GameObjects.Container;
  lastObstacleLane = -1;
  lastObstacleKind: StageObstacleKind | null = null;
  lastObstacleAt = 0;
  lastObstacleX = 0;
  totalRuns = 0;
  totalCoinsCollected = 0;

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
  secureRunPromise: ReturnType<typeof startSecureRun> | null = null;
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
  menuButton?: Phaser.GameObjects.Container;
  pauseButton?: Phaser.GameObjects.Container;
  navHint?: Phaser.GameObjects.Text;

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

    if (this.viewMode === 'character') this.showCharacterSelect();
    else if (this.viewMode === 'menu') this.showMainMenu();
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
    const snapshot = await getCharacterProgress();
    this.characterProgress = snapshot.characters;

    if (this.viewMode === 'character') this.showCharacterSelect();
    else if (this.viewMode === 'menu') this.showMainMenu();
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
    this.drawStageWorld();
    this.roadGlow = this.add.graphics().setDepth(3);
    this.stage = RUNNER_STAGES[0];
    this.stageAtmosphere = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(1)
      .setData('persistentUI', true);
    this.createStageBadge();
    this.createSpeedLines();
    this.loadRunStats();
    this.showMainMenu();
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
      .setStrokeStyle(1, 0x334155, 0.9)
      .setData('persistentUI', true);
    const title = this.add.text(16, 8, '', {
      fontFamily: 'Tahoma',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fff',
    }).setData('persistentUI', true);
    const subtitle = this.add.text(16, 28, '', {
      fontFamily: 'Tahoma',
      fontSize: '10px',
      color: '#cbd5e1',
    }).setData('persistentUI', true);
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
      this.drawStageWorld();
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
      fontFamily: 'Tahoma',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#fff',
    }).setOrigin(0.5);
    const subtitle = this.add.text(0, 18, stage.subtitle, {
      fontFamily: 'Tahoma',
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

  drawStageWorld() {
    if (!this.skyline) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const g = this.skyline;
    const stage = this.stage ?? RUNNER_STAGES[0];
    g.clear();

    // Layered sky gradient: soft atmospheric depth instead of a flat background.
    const sky = [
      [0x07111f, 0x14243b],
      [0x172235, 0x3b5269],
      [0x090b1f, 0x241448],
      [0x210b13, 0x5b2024],
    ][stage.id - 1] ?? [0x07111f, 0x14243b];
    g.fillGradientStyle(sky[0], sky[0], sky[1], sky[1], 1);
    g.fillRect(0, 0, w, this.groundY);

    // Sun/moon and atmospheric haze.
    const celestialX = stage.id === 3 ? w * 0.76 : w * 0.18;
    const celestialY = stage.id === 3 ? h * 0.18 : h * 0.22;
    const celestialColor = stage.id === 3 ? 0xdbeafe : stage.id === 4 ? 0xfda4af : 0xffd58a;
    g.fillStyle(celestialColor, 0.08);
    g.fillCircle(celestialX, celestialY, 68);
    g.fillStyle(celestialColor, 0.16);
    g.fillCircle(celestialX, celestialY, 46);
    g.fillStyle(celestialColor, 0.95);
    g.fillCircle(celestialX, celestialY, 27);

    // Thin clouds / haze bands create scale and depth.
    g.fillStyle(0xe2e8f0, stage.id === 3 ? 0.035 : 0.07);
    for (let i = 0; i < 5; i++) {
      const x = ((i * 241 + stage.id * 83) % (w + 180)) - 90;
      const y = 72 + (i % 3) * 48;
      g.fillEllipse(x, y, 150 + (i % 2) * 60, 24);
      g.fillEllipse(x + 45, y - 7, 95, 30);
    }

    // Far skyline: varied widths, heights and rooftop silhouettes.
    for (let i = 0; i < 24; i++) {
      const x = ((i * 151 + stage.id * 73) % (w + 130)) - 65;
      const bh = 58 + ((i * 43 + stage.id * 31) % 150);
      const bw = 34 + ((i * 29) % 76);
      const depth = i % 3;
      const buildingColor = depth === 0 ? 0x111c2f : depth === 1 ? 0x17243a : 0x1d2b40;
      g.fillStyle(buildingColor, 0.96);
      g.fillRect(x, this.groundY - bh, bw, bh);

      // Rooftop details.
      if (i % 5 === 0) {
        g.fillRect(x + bw * 0.35, this.groundY - bh - 16, 4, 16);
        g.fillCircle(x + bw * 0.37, this.groundY - bh - 19, 4);
      }
      if (i % 7 === 0) g.fillRect(x + 5, this.groundY - bh - 5, bw - 10, 4);

      // Windows become warm in city stages and warning-red in the danger zone.
      const windowColor = stage.id === 3 ? 0xfbbf24 : stage.id === 4 ? 0xfb7185 : 0x93c5fd;
      for (let wy = this.groundY - bh + 15; wy < this.groundY - 12; wy += 23) {
        for (let wx = x + 8; wx < x + bw - 8; wx += 20) {
          if (((Math.floor(wx) + Math.floor(wy) + i) % 5) < 3) {
            g.fillStyle(windowColor, stage.id >= 3 ? 0.42 : 0.22);
            g.fillRect(wx, wy, 7, 5);
          }
        }
      }
    }

    // Foreground landmarks by zone.
    if (stage.id === 1) {
      // Trees + street lamps.
      for (let i = 0; i < 6; i++) {
        const x = 24 + i * (w / 5.4);
        g.fillStyle(0x3f2b1f, 1);
        g.fillRect(x - 3, this.groundY - 78, 6, 78);
        g.fillStyle(0x14532d, 0.95);
        g.fillCircle(x, this.groundY - 99, 23);
        g.fillCircle(x - 15, this.groundY - 88, 17);
        g.fillCircle(x + 15, this.groundY - 88, 17);
        g.fillStyle(0xfde68a, 0.5);
        g.fillCircle(x + 14, this.groundY - 111, 4);
      }
    } else if (stage.id === 2) {
      // Highway gantry and reflectors.
      g.fillStyle(0x475569, 0.95);
      g.fillRect(w * 0.08, this.groundY - 142, 7, 142);
      g.fillRect(w * 0.92 - 7, this.groundY - 142, 7, 142);
      g.fillRect(w * 0.08, this.groundY - 142, w * 0.84, 7);
      for (let i = 0; i < 10; i++) {
        const x = w * 0.1 + i * (w * 0.8 / 9);
        g.fillStyle(i % 2 ? 0xf59e0b : 0xe2e8f0, 0.7);
        g.fillRect(x, this.groundY - 133, 10, 4);
      }
      g.fillStyle(0x64748b, 0.7);
      g.fillRect(0, this.groundY - 72, w, 5);
    } else if (stage.id === 3) {
      // Neon storefronts and signs.
      for (let i = 0; i < 7; i++) {
        const x = 18 + i * (w / 6.2);
        const neon = i % 2 ? 0x22d3ee : 0xf472b6;
        g.fillStyle(0x020617, 0.7);
        g.fillRoundedRect(x, this.groundY - 118 - (i % 2) * 24, 64, 34, 6);
        g.lineStyle(2, neon, 0.7);
        g.strokeRoundedRect(x, this.groundY - 118 - (i % 2) * 24, 64, 34, 6);
        g.fillStyle(neon, 0.28);
        g.fillRect(x + 10, this.groundY - 108 - (i % 2) * 24, 44, 4);
      }
    } else {
      // Industrial zone: towers, pipes and warning lights.
      for (let i = 0; i < 7; i++) {
        const x = 20 + i * (w / 6.3);
        g.fillStyle(0x3f1d24, 0.95);
        g.fillRect(x, this.groundY - 128, 7, 128);
        g.fillRect(x + 28, this.groundY - 94, 7, 94);
        g.lineStyle(3, 0x7f1d1d, 0.8);
        g.lineBetween(x, this.groundY - 105, x + 35, this.groundY - 70);
        g.fillStyle(0xef4444, 0.7);
        g.fillCircle(x + 3, this.groundY - 138, 5);
      }
      g.fillStyle(0xef4444, 0.08);
      g.fillRect(0, this.groundY - 210, w, 95);
    }

    // Road: dark asphalt, shoulder, lane separators and perspective markings.
    g.fillStyle(0x080d16, 1);
    g.fillRect(0, this.groundY - 2, w, h - this.groundY + 2);
    g.fillStyle(stage.id === 4 ? 0x7f1d1d : stage.id === 3 ? 0x312e81 : 0x334155, 0.7);
    g.fillRect(0, this.groundY - 5, w, 7);
    g.fillStyle(0x0f172a, 0.9);
    g.fillRect(0, this.groundY + 2, w, 5);

    // Three-lane perspective.
    g.lineStyle(3, 0xe2e8f0, 0.26);
    for (let i = 1; i < 3; i++) {
      const topX = this.laneX(i) - 75;
      const bottomX = this.laneX(i) - 75;
      g.lineBetween(topX, this.groundY, bottomX - (i === 1 ? 28 : -28), h);
    }
    for (let i = 0; i < 11; i++) {
      const t = i / 11;
      const y = this.groundY + 14 + t * (h - this.groundY - 14);
      const half = 26 + t * w * 0.43;
      g.lineStyle(2, stage.id === 3 ? 0x818cf8 : 0x94a3b8, 0.18 + t * 0.22);
      g.lineBetween(w / 2 - half, y, w / 2 + half, y);
    }

    // Roadside lights / reflective posts.
    for (let i = 0; i < 8; i++) {
      const x = i % 2 === 0 ? 18 : w - 18;
      const y = this.groundY - 22 - (i % 4) * 6;
      g.fillStyle(0x94a3b8, 0.75);
      g.fillRect(x - 2, y, 4, 24);
      g.fillStyle(stage.id === 4 ? 0xfb7185 : 0xfef3c7, 0.8);
      g.fillCircle(x, y - 3, 5);
    }

    // Soft foreground vignette.
    g.fillStyle(0x020617, 0.18);
    g.fillRect(0, 0, 18, h);
    g.fillRect(w - 18, 0, 18, h);
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
    const label = this.add.text(x, y - 38, '🛡️ نجات!', { fontFamily: 'Tahoma', fontSize: '16px', fontStyle: 'bold', color: '#67e8f9' }).setOrigin(0.5).setDepth(28);
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
    this.viewMode = 'character';
    this.running = false;
    this.pausedByUser = false;
    this.clearActors();
    this.createNavigation('character');

    const w = this.scale.width;
    const h = this.scale.height;
    const compact = w < 620;

    // Modern selection backdrop: layered panels, glow and depth instead of flat cards.
    const glow = this.add.circle(w / 2, h * 0.44, Math.min(w, h) * 0.32, 0x7c3aed, 0.07)
      .setData('runnerActor', true);
    this.tweens.add({
      targets: glow,
      scale: 1.12,
      alpha: 0.035,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const title = this.add.text(w / 2, compact ? 54 : 48, 'RUNNER LEGENDS', {
      fontFamily: 'Tahoma',
      fontSize: compact ? '26px' : '32px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#020617',
      strokeThickness: 6,
    }).setOrigin(0.5).setData('runnerActor', true);

    this.add.text(w / 2, compact ? 82 : 84, 'قهرمانت را انتخاب کن', {
      fontFamily: 'Tahoma',
      fontSize: compact ? '15px' : '18px',
      color: '#c4b5fd',
      fontStyle: 'bold',
    }).setOrigin(0.5).setData('runnerActor', true);

    const columns = compact ? 2 : 3;
    const cardW = compact ? Math.min(178, (w - 42) / 2) : 190;
    const cardH = compact ? 185 : 205;
    const gapX = compact ? 12 : 18;
    const gapY = compact ? 12 : 16;
    const totalW = columns * cardW + (columns - 1) * gapX;
    const startX = (w - totalW) / 2 + cardW / 2;
    const startY = compact ? 132 : 142;

    characters.forEach((character, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const cloudState = this.characterProgress.find((item) => item.characterId === character.id);
      const unlocked = this.progress.unlockedCharacterIds.includes(character.id) || Boolean(cloudState?.unlocked);
      const unlockCost = cloudState?.unlockCost ?? ({reza:150,taha:250,mohna:400,abolfazl:600,mohammad:900}[character.id] ?? 0);

      const card = this.add.rectangle(x, y, cardW, cardH, 0x0b1222, 0.94)
        .setStrokeStyle(2, unlocked ? character.accent : 0x334155, unlocked ? 0.9 : 0.65)
        .setInteractive({ useHandCursor: true })
        .setData('runnerActor', true);

      const inner = this.add.rectangle(x, y + 5, cardW - 8, cardH - 8, 0x111c31, 0.82)
        .setStrokeStyle(1, unlocked ? 0xffffff : 0x475569, 0.08)
        .setData('runnerActor', true);

      this.add.text(x, y - cardH / 2 + 25, character.name, {
        fontFamily: 'Tahoma',
        fontSize: compact ? '17px' : '19px',
        fontStyle: 'bold',
        color: unlocked ? '#ffffff' : '#64748b',
      }).setOrigin(0.5).setData('runnerActor', true);

      const hero = this.makeCharacter(x, y + 4, character, compact ? 0.72 : 0.82);
      hero.setData('runnerActor', true);

      const stat = this.add.text(x, y + cardH / 2 - 31, unlocked ? `⚡ ${character.ability}` : `🔒 نیاز به ${unlockCost.toLocaleString('fa-IR')} سکه`, {
        fontFamily: 'Tahoma',
        fontSize: compact ? '11px' : '12px',
        fontStyle: 'bold',
        color: unlocked ? '#e2e8f0' : '#64748b',
        align: 'center',
      }).setOrigin(0.5).setData('runnerActor', true);

      const accent = this.add.rectangle(x, y + cardH / 2 - 9, cardW * 0.54, 3, character.accent, unlocked ? 0.9 : 0.2)
        .setOrigin(0.5).setData('runnerActor', true);

      if (!unlocked) {
        this.add.text(x, y + 4, `🔒\n${unlockCost.toLocaleString('fa-IR')} 🪙`, {
          fontFamily: 'Tahoma',
          fontSize: '19px',
        }).setOrigin(0.5).setDepth(6).setData('runnerActor', true);
        card.setAlpha(0.78);
        inner.setAlpha(0.55);
      } else {
        card.on('pointerover', () => {
          this.tweens.add({ targets: [card, inner], scale: 1.025, duration: 120 });
          this.tweens.add({ targets: hero, y: y - 2, duration: 120, ease: 'Cubic.easeOut' });
        });
        card.on('pointerout', () => {
          this.tweens.add({ targets: [card, inner], scale: 1, duration: 120 });
          this.tweens.add({ targets: hero, y, duration: 120, ease: 'Cubic.easeOut' });
        });
        card.on('pointerdown', () => {
          this.selected = character;
          this.startGame();
        });
      }

      void stat;
      void accent;
    });

    this.add.text(w / 2, h - (compact ? 24 : 30),
      `🪙 ${this.progress.coins.toLocaleString('fa-IR')} سکه  •  برای شروع یک قهرمان را انتخاب کن`, {
        fontFamily: 'Tahoma',
        fontSize: compact ? '12px' : '14px',
        color: '#94a3b8',
        fontStyle: 'bold',
      }).setOrigin(0.5).setData('runnerActor', true);
  }

  updatePlayerAnimation() {
    if (!this.player) return;
    const sprite = this.player.getData('sprite') as Phaser.GameObjects.Image | undefined;
    const shadow = this.player.getData('shadow') as any;
    if (!sprite) return;

    const state = this.playerState;
    const airborne = this.playerY < -2;
    const baseScale = state === 'slide' ? 0.58 : state === 'jump' ? 0.86 : state === 'hit' ? 0.92 : 0.82;

    sprite.setScale(
      state === 'slide' ? 0.82 : baseScale,
      state === 'slide' ? 0.50 : baseScale,
    );
    sprite.y = state === 'slide' ? 13 : 0;
    sprite.rotation =
      state === 'hit'
        ? Math.sin(this.worldTime / 35) * 0.16
        : state === 'slide'
          ? -0.16
          : state === 'run'
            ? Math.sin(this.worldTime / 110) * 0.025
            : state === 'jump'
              ? -0.05
              : 0;

    if (shadow) {
      shadow.setScale(airborne ? 0.72 : state === 'slide' ? 1.05 : 1);
      shadow.setAlpha(airborne ? 0.18 : 0.32);
    }
  }

  makeCharacter(x: number, y: number, c: Character, scale = 1) {
    const silhouetteScale: Record<string, number> = {
      amirreza: 0.92,
      reza: 1.04,
      taha: 1.12,
      mohna: 0.82,
      abolfazl: 0.96,
      mohammad: 0.94,
    };
    const group = this.add.container(x, y).setScale(scale).setData('runnerActor', true);
    const shadow = this.add.ellipse(0, 48, c.id === 'taha' ? 62 : 52, 13, 0x020617, 0.32);
    const sprite = this.add.image(0, 0, `character-${c.id}`)
      .setOrigin(0.5, 0.64)
      .setScale(0.82 * (silhouetteScale[c.id] ?? 1));

    group.add([shadow, sprite]);
    group.setData('sprite', sprite);
    group.setData('shadow', shadow);
    group.setData('characterId', c.id);
    return group;
  }

  startGame() {
    this.viewMode = 'game';
    this.clearActors();
    this.pausedByUser = false;
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
    this.createNavigation('game');

    this.distance = 0;
    this.stage = RUNNER_STAGES[0];
    this.coins = 0;
    this.lane = 1;
    this.velocityY = 0;
    this.playerY = 0;
    this.lastSpawn = 0;
    this.lastCoin = 0;
    this.lastObstacleLane = -1;
    this.lastObstacleKind = null;
    this.lastObstacleAt = 0;
    this.lastObstacleX = this.scale.width + 600;
    this.jumpBufferUntil = 0;
    this.coyoteUntil = 0;
    this.jumpHeld = false;
    this.playerState = 'idle';
    this.updateStagePresentation(true);
    this.obstacleCount = 0;
    this.slideUntil = 0;
    this.secureRunId = null;
    this.secureRunPromise = null;
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
      this.secureRunPromise = startSecureRun(loadout);
      void this.secureRunPromise.then((run) => {
        if (!run) return;
        clearRunnerLoadout();
        this.secureRunId = run.runId;
        this.runEffects = run.effects;
        if (run.effects.turbo) this.turboUntil = this.time.now + 8000;
      });
    }

    const w = this.scale.width;

    this.player = this.makeCharacter(this.laneX(), this.groundY - 48, this.selected, 1);
    this.player.setData('runnerActor', true);

    this.ui = this.add
      .text(22, 20, '', {
        fontFamily: 'Tahoma',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setDepth(20);

    this.coinText = this.add
      .text(w - 22, 20, '🪙 0', {
        fontFamily: 'Tahoma',
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#fbbf24',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.missionText = this.add
      .text(w / 2, 54, this.missionSummary(), {
        fontFamily: 'Tahoma',
        fontSize: '14px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    this.missionText.on('pointerdown', () => void this.claimReadyMission());

    this.effectsText = this.add
      .text(w / 2, 104, '', { fontFamily: 'Tahoma', fontSize: '12px', color: '#fbbf24' })
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
        fontFamily: 'Tahoma',
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
        fontFamily: 'Tahoma',
        fontSize: '12px',
        color: '#64748b',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.running = true;
    this.loadRunStats();
    this.totalRuns += 1;
    this.persistRunStats();
    void this.refreshMissions();
  }

  update(_: number, dt: number) {
    if (!this.running || this.gameOverInProgress || this.pausedByUser) return;

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

    // Runner physics: tuned for a readable ~0.75s jump arc with enough clearance.
    // Negative playerY is above the road in Phaser's coordinate system.
    const gravity = 1450;
    this.velocityY += gravity * d;
    this.playerY += this.velocityY * d;

    if (this.playerY >= 0) {
      this.playerY = 0;
      this.velocityY = 0;
      this.coyoteUntil = this.time.now + 95;
    }
    if (this.jumpBufferUntil > this.time.now && this.playerY === 0) {
      this.jumpBufferUntil = 0;
      this.velocityY = -this.jumpStrength * 42;
      this.playerState = 'jump';
    }
    const groundedNow = this.playerY === 0;
    if (groundedNow && !this.lastGrounded) this.emitLandingFx();
    this.lastGrounded = groundedNow;

    this.player.y = this.groundY - 48 + this.playerY;
    if (this.playerState !== 'hit') {
      this.playerState = this.playerY < -2 ? 'jump' : this.isSliding() ? 'slide' : 'run';
    }
    this.updatePlayerAnimation();
    const runBob = this.playerY === 0 ? Math.sin(this.worldTime / 85) * 3 : 0;
    this.player.rotation = this.isSliding() ? -0.08 : Math.sin(this.worldTime / 140) * 0.025;
    this.player.y += runBob;

    const sliding = this.isSliding();
    this.player.setScale(1, sliding ? 0.62 : 1);

    this.lastSpawn += dt;
    this.lastCoin += dt;

    // Spacing is distance-based, so increasing speed never silently removes
    // the player's reaction window. A stage may become harder, but it stays playable.
    const speedGapMs = (this.stage.minGapPx / Math.max(1, this.speed)) * 1000;
    const reactionGapMs = this.stage.reactionMs;
    const randomGapMs = Phaser.Math.Between(this.stage.spawnMinMs, this.stage.spawnMaxMs);
    const spawnInterval = Math.max(speedGapMs, reactionGapMs, randomGapMs * 0.72);
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
      const coinCore = coin.getData('coinCore') as Phaser.GameObjects.Arc | undefined;
      if (coinCore) { coinCore.x = coin.x; coinCore.y = coin.y; }

      if (coin.x < -50) {
        coinCore?.destroy();
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
        continue;
      }
    }
  }

  private playerRect() {
    const sliding = this.isSliding();
    // The hitbox follows the gameplay posture, not the decorative sprite scale.
    // Sliding lowers the collision body so overhead barriers can be passed.
    const width = sliding ? 58 : 54;
    const height = sliding ? 36 : 82;
    const centerY = this.groundY - (sliding ? 21 : 49) + this.playerY;

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
    const laneCenter = this.laneX(obstacle.obstacleLane ?? this.lane);
    if (Math.abs(obstacle.x - laneCenter) > 90 && obstacle.obstacleLane !== this.lane) return false;

    // Overhead barriers are specifically the slide mechanic: standing/jumping
    // into them is dangerous, while a low slide passes underneath.
    if (obstacle.obstacleKind === 'overhead' && this.isSliding()) return false;

    return Phaser.Geom.Intersects.RectangleToRectangle(this.playerRect(), this.obstacleRect(obstacle));
  }

  private coinHitsPlayer(coin: Phaser.GameObjects.Arc) {
    const lane = Number(coin.getData('lane') ?? 1);
    if (lane !== this.lane) return false;

    const dx = Math.abs(coin.x - this.player.x);
    const dy = Math.abs(coin.y - this.player.y);
    const radius = this.runEffects.magnet ? 138 : this.selected.id === 'taha' ? 96 : 82;
    const vertical = this.runEffects.magnet ? 150 : 118;
    return dx < radius && dy < vertical;
  }

  private collectCoin(coin: Phaser.GameObjects.Arc) {
    this.coins += 1;
    this.totalCoinsCollected += 1;
    this.persistRunStats();
    this.emitPickupFx(coin.x, coin.y);
    this.feedback('light');

    const burst = this.add.text(coin.x, coin.y - 12, '+1', {
      fontFamily: 'Tahoma',
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

    const coinCore = coin.getData('coinCore') as Phaser.GameObjects.Arc | undefined;
    coinCore?.destroy();
    coin.destroy();
    this.coinObjs = this.coinObjs.filter((x) => x !== coin);
  }

  spawnObstaclePattern() {
    // Readable three-lane rhythm. Each pattern explicitly leaves one lane safe.
    const rhythms = [
      [0, 1, 2, 1, 0, 2],
      [1, 2, 1, 0, 1, 2],
      [2, 1, 0, 1, 2, 0],
    ];
    const rhythm = rhythms[(this.stage.id - 1) % rhythms.length];
    const firstLane = rhythm[this.obstacleCount % rhythm.length];
    const doubleAllowed = this.stage.id >= 2 && this.obstacleCount > 6;
    const makeDouble = doubleAllowed && this.obstacleCount % (this.stage.id >= 3 ? 5 : 8) === 3;
    const overheadAllowed = this.stage.id >= 2 && this.obstacleCount > 9;
    const makeOverhead = overheadAllowed && this.obstacleCount % (this.stage.id >= 4 ? 7 : 9) === 4;

    this.spawnObstacle(firstLane, makeOverhead ? 'overhead' : 'ground', 0);

    if (makeDouble) {
      // Two blocked lanes + one guaranteed safe lane. Never stack a second
      // obstacle only 240px behind the first one.
      const safeLane = (firstLane + 1) % 3;
      const secondLane = [0, 1, 2].find((lane) => lane !== firstLane && lane !== safeLane) ?? ((firstLane + 2) % 3);
      const secondKind: StageObstacleKind = this.stage.id >= 3 && this.obstacleCount % 6 === 1 ? 'overhead' : 'ground';
      this.spawnObstacle(secondLane, secondKind, 390);
    }
  }

  spawnObstacle(lane: number, kind: StageObstacleKind, xOffset: number) {
    const obstacle = this.add.container(this.scale.width + 110 + xOffset, 0) as Obstacle;
    obstacle.obstacleLane = lane;
    obstacle.obstacleKind = kind;

    const g = this.add.graphics();
    const variant = kind === 'overhead'
      ? 'gate'
      : (['crate', 'cone', 'barrier', 'sign'] as const)[this.obstacleCount % 4];
    obstacle.obstacleVariant = variant;

    if (kind === 'overhead') {
      obstacle.y = this.groundY - 82;
      if (variant === 'gate') {
        g.fillStyle(0x334155, 1);
        g.fillRoundedRect(-48, -70, 10, 88, 5);
        g.fillRoundedRect(38, -70, 10, 88, 5);
        g.fillStyle(this.stage.id >= 4 ? 0xef4444 : 0xf97316, 1);
        g.fillRoundedRect(-42, -18, 84, 28, 8);
        g.fillStyle(0xfef3c7, 1);
        for (let i = -30; i <= 30; i += 20) g.fillRect(i, -11, 10, 5);
        g.lineStyle(3, 0xfb923c, 0.55);
        g.strokeRoundedRect(-45, -21, 90, 34, 9);
      }
    } else {
      obstacle.y = this.groundY - 42;
      if (variant === 'crate') {
        g.fillStyle(0x713f12, 1);
        g.fillRoundedRect(-31, -40, 62, 80, 7);
        g.fillStyle(0xa16207, 1);
        g.fillRoundedRect(-26, -35, 52, 70, 5);
        g.lineStyle(5, 0x422006, 0.8);
        g.lineBetween(-24, -32, 24, 32);
        g.lineBetween(24, -32, -24, 32);
      } else if (variant === 'cone') {
        g.fillStyle(0xf97316, 1);
        g.fillTriangle(0, -43, -27, 38, 27, 38);
        g.fillStyle(0xffedd5, 1);
        g.fillRect(-19, 3, 38, 8);
        g.fillStyle(0x9a3412, 1);
        g.fillRoundedRect(-31, 36, 62, 9, 4);
      } else if (variant === 'sign') {
        g.fillStyle(0x475569, 1);
        g.fillRect(-4, -48, 8, 48);
        g.fillStyle(this.stage.accent, 1);
        g.fillRoundedRect(-30, -48, 60, 38, 7);
        g.fillStyle(0x0f172a, 0.8);
        g.fillTriangle(-8, -29, 12, -20, -8, -11);
      } else {
        g.fillStyle(0x7f1d1d, 1);
        g.fillRoundedRect(-31, -45, 62, 90, 11);
        g.fillStyle(0xef4444, 1);
        g.fillRoundedRect(-27, -41, 54, 82, 9);
        g.fillStyle(0xfef3c7, 1);
        for (let i = -23; i <= 15; i += 19) g.fillRect(i, -28, 10, 7);
        g.fillStyle(0x991b1b, 1);
        g.fillRect(-23, -12, 46, 8);
        g.fillStyle(0xfca5a5, 0.8);
        g.fillRect(-18, 4, 36, 5);
        g.lineStyle(3, 0xff8a8a, 0.65);
        g.strokeRoundedRect(-30, -44, 60, 88, 11);
      }
    }

    obstacle.add(g);
    obstacle.setScale(0.84);
    this.tweens.add({ targets: obstacle, scale: 1, duration: 160, ease: 'Back.easeOut' });
    obstacle.setDepth(8);
    obstacle.setData('runnerActor', true);
    this.obstacles.push(obstacle);
    this.obstacleCount += 1;
    this.lastObstacleLane = lane;
    this.lastObstacleKind = kind;
    this.lastObstacleAt = this.time.now;
    this.lastObstacleX = obstacle.x;
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
        this.scale.width + 70 + i * (pattern === 'burst' ? 52 : 64),
        this.groundY - height,
        18,
        0xfbbf24,
      );

      coin.setStrokeStyle(4, 0xf59e0b);
      const coinCore = this.add.circle(coin.x, coin.y, 8, 0xfff7b2, 0.95).setDepth(8);
      coinCore.setData('coinCore', coin);
      coinCore.setData('runnerActor', true);
      coin.setData('coinCore', coinCore);
      this.tweens.add({ targets: coin, scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: coinCore, scale: 0.75, alpha: 0.45, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
      fontFamily: 'Tahoma',
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
    const grounded = this.playerY === 0;
    const canUseCoyote = this.time.now <= this.coyoteUntil;
    if (grounded || canUseCoyote) {
      this.velocityY = -this.jumpStrength * 42;
      this.playerY = Math.min(this.playerY, -1);
      this.jumpBufferUntil = 0;
      this.coyoteUntil = 0;
      this.jumpHeld = true;
      this.playerState = 'jump';
      this.feedback('light');
    } else {
      // Queue a jump for the instant the runner lands; this removes the
      // frustrating "pressed a little too early" feeling on mobile.
      this.jumpBufferUntil = this.time.now + 150;
    }
  }

  slide() {
    if (!this.running || this.gameOverInProgress || this.playerY !== 0) return;
    this.slideUntil = this.time.now + 620;
    this.playerState = 'slide';
    this.feedback('light');
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

    if (this.pausedByUser) {
      this.pausedByUser = false;
      this.pauseOverlay?.destroy();
      this.pauseOverlay = undefined;
      return;
    } else {
      this.pausedByUser = true;
      const overlay = this.add.container(this.scale.width / 2, this.scale.height / 2).setName('pause-overlay').setDepth(100);
      const panel = this.add.rectangle(0, 0, 280, 150, 0x020617, 0.94).setStrokeStyle(2, 0x64748b, 0.9);
      const title = this.add.text(0, -42, '⏸ بازی متوقف شد', {
        fontFamily: 'Tahoma',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#fff',
      }).setOrigin(0.5);
      const resume = this.add.rectangle(0, 28, 190, 48, 0x7c3aed).setInteractive({ useHandCursor: true });
      const resumeText = this.add.text(0, 28, '▶ ادامه بازی', {
        fontFamily: 'Tahoma',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#fff',
      }).setOrigin(0.5);
      resume.on('pointerdown', () => {
        this.pausedByUser = false;
        overlay.destroy();
        this.pauseOverlay = undefined;
      });
      overlay.add([panel, title, resume, resumeText]);
      this.pauseOverlay = overlay;
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
      if (!this.secureRunId && this.secureRunPromise) {
        const started = await this.secureRunPromise;
        if (started) {
          this.secureRunId = started.runId;
          this.runEffects = started.effects;
        }
      }
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

      // Always preserve a local record even if the online claim failed.
      this.progress = {
        ...this.progress,
        bestDistance: Math.max(this.progress.bestDistance, finalDistance),
        activeCharacterId: this.selected.id,
        updatedAt: new Date().toISOString(),
      };
      saveLocalProgress(this.progress);
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

    this.add.rectangle(w / 2, h / 2, w, h, 0x020617, 0.78).setDepth(30).setData('runnerActor', true);

    this.add
      .text(w / 2, h / 2 - 80, 'برخورد کردی!', {
        fontFamily: 'Tahoma',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setData('runnerActor', true);

    const rewardText = onlineReward
      ? `🏃 ${finalDistance} متر   🪙 +${awardedCoins}   ✨ +${awardedXp} XP`
      : `🏃 ${finalDistance} متر   ⚠️ پاداش آنلاین ثبت نشد`;

    this.add
      .text(w / 2, h / 2 - 25, rewardText, {
        fontFamily: 'Tahoma',
        fontSize: '18px',
        color: '#fbbf24',
        align: 'center',
        wordWrap: { width: w - 40 },
      })
      .setOrigin(0.5)
      .setDepth(31)
      .setData('runnerActor', true);

    const b = this.add
      .rectangle(w / 2, h / 2 + 55, 210, 58, 0x7c3aed)
      .setInteractive({ useHandCursor: true })
      .setDepth(31)
      .setData('runnerActor', true);

    this.add
      .text(w / 2, h / 2 + 55, 'دوباره بازی کن', {
        fontFamily: 'Tahoma',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fff',
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setData('runnerActor', true);

    b.on('pointerdown', () => this.startGame());
  }

  createNavigation(mode: 'character' | 'game') {
    this.menuButton?.destroy();
    this.pauseButton?.destroy();
    this.navHint?.destroy();

    const makeButton = (x: number, y: number, width: number, label: string, color: number, onClick: () => void) => {
      const panel = this.add.rectangle(x, y, width, 42, color, 0.92)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0xffffff, 0.22)
        .setInteractive({ useHandCursor: true })
        .setDepth(60)
        .setData('runnerActor', true);
      const text = this.add.text(x, y, label, {
        fontFamily: 'Tahoma', fontSize: '14px', fontStyle: 'bold', color: '#fff',
      }).setOrigin(0.5).setDepth(61).setData('runnerActor', true);
      panel.on('pointerover', () => panel.setScale(1.04));
      panel.on('pointerout', () => panel.setScale(1));
      panel.on('pointerdown', onClick);
      const group = this.add.container(0, 0, [panel, text]).setData('runnerActor', true);
      group.setDepth(60);
      return group;
    };

    this.menuButton = makeButton(18, 26, 112, '🏠 منوی اصلی', 0x1e293b, () => this.showMainMenu());
    if (mode === 'game') {
      this.pauseButton = makeButton(this.scale.width - 18, 26, 112, '⏸ مکث', 0x334155, () => this.togglePause());
      this.menuButton.setDepth(60);
      this.pauseButton.setDepth(60);
    }
  }

  showMainMenu() {
    this.viewMode = 'menu';
    this.running = false;
    this.pausedByUser = false;
    this.gameOverInProgress = false;
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
    this.stageBadge?.setVisible(false);
    this.clearActors();
    this.createNavigation('character');

    const w = this.scale.width;
    const h = this.scale.height;
    const compact = w < 620;
    const overlay = this.add.rectangle(w / 2, h / 2, w, h, 0x020617, 0.88)
      .setDepth(50).setData('runnerActor', true);
    const title = this.add.text(w / 2, h * 0.20, 'RUNNER LEGENDS', {
      fontFamily: 'Tahoma', fontSize: compact ? '30px' : '38px', fontStyle: 'bold', color: '#fff',
      stroke: '#020617', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(51).setData('runnerActor', true);
    const subtitle = this.add.text(w / 2, h * 0.27, 'دونده‌ی خودت را بساز و رکورد بزن', {
      fontFamily: 'Tahoma', fontSize: '16px', color: '#c4b5fd', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51).setData('runnerActor', true);

    const heroHalo = this.add.circle(w / 2, h * 0.33, compact ? 58 : 72, this.selected.accent, 0.10).setDepth(51).setData('runnerActor', true);
    this.tweens.add({ targets: heroHalo, scale: 1.12, alpha: 0.045, duration: 1500, yoyo: true, repeat: -1 });
    const hero = this.makeCharacter(w / 2, h * 0.34, this.selected, compact ? 0.82 : 1.02);
    hero.setDepth(52).setData('runnerActor', true);
    this.add.text(w / 2, h * 0.405, `✦ ${this.selected.name} • ${this.selected.ability} • رکورد ${this.progress.bestDistance.toLocaleString('fa-IR')} متر`, { fontFamily: 'Trebuchet MS', fontSize: compact ? '11px' : '13px', fontStyle: 'bold', color: '#e2e8f0' }).setOrigin(0.5).setDepth(52).setData('runnerActor', true);

    const buttons: Array<[string, number, () => void]> = [
      ['▶️ شروع بازی', 0x7c3aed, () => this.showCharacterSelect()],
      ['🎯 مأموریت‌ها', 0x0f766e, () => this.showMetaPanel('missions')],
      ['🏆 رکورد و رتبه‌بندی', 0x1d4ed8, () => document.querySelector<HTMLButtonElement>('.runner-leaderboard-open')?.click()],
      ['🏅 دستاوردها', 0xb45309, () => this.showMetaPanel('achievements')],
      ['🛒 فروشگاه', 0x9333ea, () => document.querySelector<HTMLButtonElement>('.runner-shop-open')?.click()],
      ['⭐ شخصیت‌ها و ارتقا', 0x0f766e, () => void characterProgressUi?.open()],
      ['📊 آمار من', 0x334155, () => this.showMetaPanel('stats')],
    ];
    buttons.forEach(([label, color, onClick], index) => {
      const columns = 2;
      const row = Math.floor(index / columns);
      const col = index % columns;
      const buttonWidth = Math.min(285, (w - 52) / 2);
      const x = col === 0 ? w * 0.33 : w * 0.67;
      const y = h * 0.47 + row * (compact ? 52 : 55);
      const b = this.add.rectangle(x, y, buttonWidth, 48, color, 0.94)
        .setStrokeStyle(1, 0xffffff, 0.24).setInteractive({ useHandCursor: true }).setDepth(51).setData('runnerActor', true);
      const t = this.add.text(x, y, label, { fontFamily: 'Tahoma', fontSize: '16px', fontStyle: 'bold', color: '#fff' })
        .setOrigin(0.5).setDepth(52).setData('runnerActor', true);
      b.on('pointerover', () => b.setScale(1.035));
      b.on('pointerout', () => b.setScale(1));
      b.on('pointerdown', onClick);
      void t;
    });

    this.add.text(w / 2, h - 48, `🪙 ${this.progress.coins.toLocaleString('fa-IR')} سکه  •  ${this.progress.displayName}`, {
      fontFamily: 'Tahoma', fontSize: '13px', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51).setData('runnerActor', true);
  }

  persistRunStats() {
    const key = 'runner-legends:stats:v1';
    try {
      localStorage.setItem(key, JSON.stringify({ totalRuns: this.totalRuns, totalCoinsCollected: this.totalCoinsCollected }));
    } catch { /* ignore */ }
  }

  loadRunStats() {
    try {
      const raw = localStorage.getItem('runner-legends:stats:v1');
      if (!raw) return;
      const data = JSON.parse(raw) as { totalRuns?: number; totalCoinsCollected?: number };
      this.totalRuns = Number(data.totalRuns ?? 0);
      this.totalCoinsCollected = Number(data.totalCoinsCollected ?? 0);
    } catch { /* ignore */ }
  }

  showMetaPanel(kind: 'missions' | 'achievements' | 'stats') {
    const w = this.scale.width;
    const h = this.scale.height;
    const overlay = this.add.container(w / 2, h / 2).setDepth(120).setData('runnerActor', true);
    const panel = this.add.rectangle(0, 0, Math.min(560, w - 30), Math.min(500, h - 70), 0x07111f, 0.98).setStrokeStyle(2, 0x7c3aed, 0.7);
    const title = this.add.text(0, -Math.min(220, h / 2 - 45), kind === 'missions' ? '🎯 مأموریت‌ها' : kind === 'achievements' ? '🏅 دستاوردها' : '📊 آمار من', { fontFamily:'Arial', fontSize:'25px', fontStyle:'bold', color:'#fff' }).setOrigin(0.5);
    const close = this.add.rectangle(Math.min(245, w / 2 - 45), -Math.min(220, h / 2 - 45), 34, 34, 0x1e293b, 1).setInteractive({useHandCursor:true});
    const closeText = this.add.text(close.x, close.y, '×', {fontFamily:'Arial',fontSize:'24px',color:'#fff'}).setOrigin(0.5);
    const body = this.add.text(0, 0, '', {fontFamily:'Arial',fontSize:'15px',color:'#e2e8f0',align:'right',lineSpacing:10,wordWrap:{width:Math.min(490,w-70)}}).setOrigin(0.5);
    const claim = this.add.rectangle(0, Math.min(205,h/2-85), 220, 46, 0x7c3aed, 1).setInteractive({useHandCursor:true});
    const claimText = this.add.text(0, claim.y, '🎁 دریافت مأموریت آماده', {fontFamily:'Arial',fontSize:'14px',fontStyle:'bold',color:'#fff'}).setOrigin(0.5);
    close.on('pointerdown',()=>overlay.destroy());
    claim.on('pointerdown',async()=>{ await this.claimReadyMission(); overlay.destroy(); });
    overlay.add([panel,title,close,closeText,body,claim,claimText]);

    if(kind==='stats') {
      body.setText('👤 '+this.progress.displayName+'\n\n🪙 موجودی: '+this.progress.coins.toLocaleString('fa-IR')+'\n🏆 بهترین رکورد: '+this.progress.bestDistance.toLocaleString('fa-IR')+' متر\n⭐ سطح: '+this.progress.level+'\n✨ تجربه: '+this.progress.xp.toLocaleString('fa-IR')+' XP\n🎮 تعداد بازی‌ها: '+this.totalRuns.toLocaleString('fa-IR')+'\n🪙 سکه‌های جمع‌شده: '+this.totalCoinsCollected.toLocaleString('fa-IR'));
      claim.setVisible(false); claimText.setVisible(false);
    } else if(kind==='achievements') {
      const best=this.progress.bestDistance;
      const achievements=[
        [best>=100,'🏃 اولین ۱۰۰ متر','۱۰۰ متر بدو'],[best>=1000,'🔥 دونده حرفه‌ای','۱۰۰۰ متر رکورد بزن'],[best>=5000,'👑 افسانه','۵۰۰۰ متر رکورد بزن'],[this.totalCoinsCollected>=25,'🪙 جمع‌کننده','۲۵ سکه جمع کن'],[this.totalCoinsCollected>=250,'💰 معدن‌چی','۲۵۰ سکه جمع کن'],[this.totalRuns>=10,'🎮 سمج','۱۰ بازی انجام بده'],[this.progress.level>=5,'⭐ سطح ۵','به سطح ۵ برس']
      ];
      body.setText(achievements.map(a=>(a[0]?'✅':'⬜')+' '+a[1]+'\n   '+a[2]).join('\n\n'));
      claim.setVisible(false); claimText.setVisible(false);
    } else {
      const snapshot=this.missionSnapshot;
      if(!snapshot?.missions.length) body.setText(this.progress.userId==='guest' ? 'برای مأموریت‌های روزانه وارد حساب شو.\n\nمأموریت‌ها پس از اتصال Supabase به صورت روزانه و هفتگی نمایش داده می‌شوند.' : 'مأموریتی برای نمایش وجود ندارد.');
      else body.setText(snapshot.missions.map(m=>(m.completed?'✅':'🎯')+' '+m.title+'\n'+m.description+'\nپیشرفت: '+Math.min(m.progress,m.target)+'/'+m.target+'  •  🪙 '+m.rewardCoins+'  •  ✨ '+m.rewardXp+(m.claimed?'\nدریافت شده':'')).join('\n\n'));
      const ready=Boolean(snapshot?.missions.some(m=>m.completed&&!m.claimed));
      claim.setVisible(ready); claimText.setVisible(ready);
    }
  }

  clearActors() {
    this.obstacles.forEach((o) => o.destroy());
    this.coinObjs.forEach((o) => o.destroy());
    this.obstacles = [];
    this.coinObjs = [];

    [...this.children.list]
      .filter((o) => {
        const object = o as Phaser.GameObjects.GameObject;
        return object.getData?.('runnerActor') === true;
      })
      .forEach((o) => o.destroy());

    this.stageToast?.destroy();
    this.stageToast = undefined;
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
