export type StageObstacleKind = 'ground' | 'overhead';

export type RunnerStage = {
  id: number;
  name: string;
  subtitle: string;
  startDistance: number;
  endDistance: number | null;
  maxSpeed: number;
  spawnMinMs: number;
  spawnMaxMs: number;
  obstacleDensity: number;
  doubleObstacleChance: number;
  overheadChance: number;
  coinPattern: 'line' | 'stairs' | 'zigzag' | 'burst';
  tint: number;
  accent: number;
};

export const RUNNER_STAGES: RunnerStage[] = [
  {
    id: 1,
    name: 'شهر شروع',
    subtitle: 'مسیر امن برای گرم شدن',
    startDistance: 0,
    endDistance: 500,
    maxSpeed: 560,
    spawnMinMs: 620,
    spawnMaxMs: 900,
    obstacleDensity: 0.82,
    doubleObstacleChance: 0.04,
    overheadChance: 0.06,
    coinPattern: 'line',
    tint: 0x38bdf8,
    accent: 0x60a5fa,
  },
  {
    id: 2,
    name: 'بزرگراه',
    subtitle: 'سرعت بالاتر و موانع ترکیبی',
    startDistance: 500,
    endDistance: 1500,
    maxSpeed: 650,
    spawnMinMs: 520,
    spawnMaxMs: 780,
    obstacleDensity: 0.92,
    doubleObstacleChance: 0.18,
    overheadChance: 0.18,
    coinPattern: 'stairs',
    tint: 0xf59e0b,
    accent: 0xfbbf24,
  },
  {
    id: 3,
    name: 'شهر شب',
    subtitle: 'دید کمتر، الگوهای سخت‌تر',
    startDistance: 1500,
    endDistance: 3000,
    maxSpeed: 730,
    spawnMinMs: 460,
    spawnMaxMs: 690,
    obstacleDensity: 1,
    doubleObstacleChance: 0.30,
    overheadChance: 0.28,
    coinPattern: 'zigzag',
    tint: 0xa78bfa,
    accent: 0xc4b5fd,
  },
  {
    id: 4,
    name: 'منطقه خطر',
    subtitle: 'فقط برای بازیکن‌های حرفه‌ای',
    startDistance: 3000,
    endDistance: null,
    maxSpeed: 820,
    spawnMinMs: 390,
    spawnMaxMs: 610,
    obstacleDensity: 1,
    doubleObstacleChance: 0.42,
    overheadChance: 0.34,
    coinPattern: 'burst',
    tint: 0xf43f5e,
    accent: 0xfb7185,
  },
];

export function getRunnerStage(distance: number): RunnerStage {
  return RUNNER_STAGES.reduce(
    (current, stage) => (distance >= stage.startDistance ? stage : current),
    RUNNER_STAGES[0],
  );
}
