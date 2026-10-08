import Phaser from 'phaser';
import './styles.css';
import { AuthUi } from './ui/authUi';
import { loadLocalProgress, saveCloudProgress, saveLocalProgress, type PlayerProgress } from './services/playerProgress';
import { finishSecureRun, startSecureRun } from './services/runnerRewards';
import { claimMission, getMissionSnapshot, type MissionSnapshot } from './services/missions';
import { ShopUi } from './ui/shopUi';
import { getCharacterProgress, type CharacterProgress } from './services/characterProgression';
import { CharacterProgressUi } from './ui/characterProgressUi';
import { LeaderboardUi } from './ui/leaderboardUi';

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

  secureRunId: string | null = null;
  gameOverInProgress = false;
  slideUntil = 0;
  swipeStartX: number | null = null;
  swipeStartY: number | null = null;

  missionSnapshot: MissionSnapshot | null = null;
  characterProgress: CharacterProgress[] = [];

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

  create() {
    this.cameras.main.setBackgroundColor('#07101f');
    this.groundY = this.scale.height * 0.78;

    this.drawWorld();
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

  makeCharacter(x: number, y: number, c: Character, scale = 1) {
    const group = this.add.container(x, y).setScale(scale).setData('runnerActor', true);
    const body = this.add.graphics();

    body.fillStyle(c.color, 1);
    body.fillRoundedRect(-22, -10, 44, 55, 18);
    body.fillCircle(0, -31, 22);

    // Face + character-specific silhouette details
    body.fillStyle(0x111827, 1);
    body.fillCircle(-8, -34, 3);
    body.fillCircle(8, -34, 3);
    body.lineStyle(2, 0x111827, 1);
    body.lineBetween(-5, -24, 5, -24);
    if (c.id === 'amirreza') {
      body.fillStyle(0x1f2937, 1);
      body.fillTriangle(-19, -45, -7, -58, -2, -44);
      body.fillTriangle(-6, -48, 3, -60, 7, -43);
    } else if (c.id === 'reza') {
      body.fillStyle(0xf5d0a9, 1);
      body.fillCircle(-13, -30, 3);
      body.fillCircle(13, -30, 3);
      body.fillStyle(0xf5d0a9, 1);
      body.fillRect(-25, -13, 7, 34);
      body.fillRect(18, -13, 7, 34);
    } else if (c.id === 'taha') {
      body.fillStyle(c.color, 1);
      body.fillCircle(0, 3, 28);
    } else if (c.id === 'mohna') {
      body.lineStyle(5, c.accent, 1);
      body.lineBetween(-14, -49, -20, -70);
      body.lineBetween(14, -49, 20, -70);
      body.strokeCircle(-20, -70, 6);
      body.strokeCircle(20, -70, 6);
    } else if (c.id === 'abolfazl') {
      body.fillStyle(0xffffff, 1);
      body.fillRect(-19, 1, 38, 22);
      body.fillStyle(0x22c55e, 1);
      body.fillCircle(0, 12, 7);
    } else if (c.id === 'mohammad') {
      body.lineStyle(5, c.accent, 1);
      body.lineBetween(-22, 3, -40, -12);
      body.lineBetween(22, 3, 40, -12);
      body.fillCircle(-42, -14, 4);
      body.fillCircle(42, -14, 4);
    }

    body.lineStyle(4, c.accent, 1);
    body.strokeCircle(0, -31, 22);

    body.fillStyle(c.accent, 1);
    body.fillRoundedRect(-23, 32, 18, 9, 4);
    body.fillRoundedRect(5, 32, 18, 9, 4);
    body.lineStyle(3, 0x0f172a, 1);
    body.lineBetween(-12, 30, -18, 47);
    body.lineBetween(12, 30, 18, 47);

    group.add(body);
    return group;
  }

  startGame() {
    this.clearActors();

    this.distance = 0;
    this.coins = 0;
    this.lane = 1;
    this.velocityY = 0;
    this.playerY = 0;
    this.lastSpawn = 0;
    this.lastCoin = 0;
    this.playerState = 'idle';
    this.obstacleCount = 0;
    this.slideUntil = 0;
    this.secureRunId = null;
    this.gameOverInProgress = false;

    const stats = this.selectedCharacterProgress();
    const base = characters.find((c) => c.id === this.selected.id) ?? this.selected;

    this.speed = 390 + ((stats?.speed ?? base.speed) - base.speed) * 20;
    this.jumpStrength = 13 + ((stats?.jump ?? base.jump) - base.jump) * 0.7;

    if (this.progress.userId !== 'guest') {
      void startSecureRun().then((runId) => {
        if (this.running) this.secureRunId = runId;
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
    this.speed = Math.min(780, this.speed + d * 7);
    this.fxTimer += dt;
    this.updateSpeedLines();

    this.ui.setText(`🏃 ${Math.floor(this.distance)} متر`);
    this.coinText.setText(`🪙 ${this.coins}`);

    this.player.x = Phaser.Math.Linear(this.player.x, this.laneX(), 1 - Math.exp(-12 * d));

    this.velocityY += 32 * d;
    this.playerY += this.velocityY * d;

    if (this.playerY > 0) {
      this.playerY = 0;
      this.velocityY = 0;
    }

    this.player.y = this.groundY - 48 + this.playerY;
    this.updatePlayerAnimation();
    const runBob = this.playerY === 0 ? Math.sin(this.worldTime / 85) * 3 : 0;
    this.player.rotation = this.isSliding() ? -0.08 : Math.sin(this.worldTime / 140) * 0.025;
    this.player.y += runBob;

    const sliding = this.isSliding();
    this.player.setScale(1, sliding ? 0.62 : 1);

    this.lastSpawn += dt;
    this.lastCoin += dt;

    const spawnInterval = Math.max(430, 930 - this.distance * 1.35);
    if (this.lastSpawn >= spawnInterval) {
      this.spawnObstacle();
      this.lastSpawn = 0;
    }

    if (this.lastCoin >= 300) {
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

    return dx < 52 && dy < 70;
  }

  private collectCoin(coin: Phaser.GameObjects.Arc) {
    this.coins += 1;
    this.emitPickupFx(coin.x, coin.y);

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

  spawnObstacle() {
    const lane = Phaser.Math.Between(0, 2);
    const kind: 'ground' | 'overhead' =
      this.obstacleCount > 2 && Phaser.Math.Between(0, 4) === 0 ? 'overhead' : 'ground';

    const obstacle = this.add.container(this.scale.width + 90, 0) as Obstacle;
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
    obstacle.x = this.laneX(lane) + this.scale.width / 2;
    obstacle.setDepth(8);
    this.obstacles.push(obstacle);
    this.obstacleCount += 1;
  }

  spawnCoinPattern() {
    const lane = Phaser.Math.Between(0, 2);
    const count = Phaser.Math.Between(2, 4);

    for (let i = 0; i < count; i++) {
      const coin = this.add.circle(
        this.scale.width + 70 + i * 58,
        this.groundY - 72 - (i % 2 === 0 ? 0 : 28),
        15,
        0xfbbf24,
      );

      coin.setStrokeStyle(4, 0xf59e0b);
      this.tweens.add({ targets: coin, scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      coin.setDepth(7);
      coin.setData('lane', lane);
      coin.y = this.groundY - 72 - (i % 2 === 0 ? 0 : 28);
      coin.x = this.scale.width + 70 + i * 58;
      this.coinObjs.push(coin);
    }
  }

  laneX(lane = this.lane) {
    const spacing = Math.min(150, this.scale.width * 0.25);
    return this.scale.width / 2 + (lane - 1) * spacing;
  }

  changeLane(n: number) {
    if (!this.running || this.gameOverInProgress) return;
    this.lane = Phaser.Math.Clamp(this.lane + n, 0, 2);
  }

  jump() {
    if (!this.running || this.gameOverInProgress) return;
    if (this.playerY === 0) {
      this.velocityY = -this.jumpStrength * 2.1;
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
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '⏸ مکث\nبرای ادامه P را بزن', {
          fontFamily: 'Arial',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#fff',
          align: 'center',
        })
        .setOrigin(0.5)
        .setName('pause-overlay')
        .setDepth(100);
    }
  }

  async gameOver() {
    if (!this.running || this.gameOverInProgress) return;

    this.gameOverInProgress = true;
    this.running = false;
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
