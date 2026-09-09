export type Slot =
  | "weapon"
  | "focus"
  | "head"
  | "armor"
  | "gloves"
  | "boots"
  | "amulet"
  | "ring";
export type Family = "blade" | "glass" | "needle";
export type RegionId = "terraces" | "glassgarden" | "carmine";
export type Rarity = "common" | "fine" | "resonant" | "named";
export type Affix =
  | "hp"
  | "armor"
  | "haste"
  | "crit"
  | "direct"
  | "dot"
  | "support";
export type Condition =
  | "always"
  | "hp_below"
  | "no_shield"
  | "enemy_windup"
  | "has_debuff"
  | "vulnerable"
  | "no_vulnerable"
  | "three_marks"
  | "under_three_marks";
export interface Item {
  id: string;
  name: string;
  slot: Slot;
  level: number;
  rarity: Rarity;
  family?: Family;
  affixes: Affix[];
  special?: "long_thread" | "mirror";
  locked?: boolean;
}
export interface Rule {
  condition: Condition;
  threshold?: number;
  skillId: string;
}
export interface Build {
  name: string;
  equipment: Record<Slot, string>;
  skills: string[];
  rules: Rule[];
}
export interface Wallet {
  coins: number;
  thread: number;
  catalyst: number;
}
export interface Stats {
  power: number;
  hp: number;
  armor: number;
  haste: number;
  crit: number;
  direct: number;
  dot: number;
  support: number;
}
export interface Skill {
  id: string;
  name: string;
  family: Family | "common";
  description: string;
  cooldown: number;
  unlockLevel: number;
  icon: string;
}
export interface Enemy {
  id: string;
  name: string;
  level: number;
  hp: number;
  power: number;
  armor: number;
  intervalMs: number;
  kind: "sentinel" | "shard" | "weaver" | "boss";
  mechanic: "regular" | "heavy" | "dot";
  description: string;
}
export interface Region {
  id: RegionId;
  name: string;
  subtitle: string;
  description: string;
  order: number;
  color: string;
  image: string;
  sceneFilter: string;
}
export interface Route {
  id: string;
  regionId: RegionId;
  name: string;
  subtitle: string;
  description: string;
  difficulty: number;
  enemyIds: string[];
  reward: Wallet & { xp: number };
  rewardPeriodMs: number;
  lootIntervalMs: number;
  itemLevel: number;
  unlockWins: number;
  unlockLevel: number;
  boss: boolean;
  color: string;
  resonant?: boolean;
}
export interface BattleEvent {
  at: number;
  actor: "hero" | "enemy" | "system";
  kind:
    | "attack"
    | "skill"
    | "shield"
    | "heal"
    | "dot"
    | "cleanse"
    | "windup"
    | "win"
    | "loss";
  label: string;
  value: number;
  heroHp: number;
  enemyHp: number;
  heroShield: number;
  skillId?: string;
  critical?: boolean;
}
export interface BattleRun {
  regionId?: RegionId;
  startedAt: number;
  endsAt: number;
  combatMs: number;
  enemy: Enemy;
  stats: Stats;
  events: BattleEvent[];
  outcome: "win" | "loss";
  reason: string;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shielding: number;
  family: Family;
  production?: {
    version: 2;
    reward: Wallet & { xp: number };
    rewardPeriodMs: number;
    lootIntervalMs: number;
  };
}
export interface JourneyReport {
  from: number;
  to: number;
  seconds: number;
  wins: number;
  losses: number;
  rewards: Wallet & { xp: number };
  itemIds: string[];
  levels: number;
  stopped: boolean;
}
export interface GameState {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: number;
  lastSimulatedAt: number;
  autonomyUntil: number;
  level: number;
  xp: number;
  wallet: Wallet;
  inventory: Item[];
  upgrades: Record<Slot, number>;
  build: Build;
  pendingBuild: Build | null;
  presets: Build[];
  routeId: string;
  pendingRoute: { routeId: string; mode: "farm" | "push" } | null;
  mode: "farm" | "push";
  unlockedRoutes: string[];
  routeWins: Record<string, number>;
  lootCounters: Record<string, number>;
  progression: {
    rewardRemainders: Record<string, Wallet & { xp: number }>;
    lootElapsedMs: Record<string, number>;
  };
  chapter: { completed: string[]; legacy: boolean };
  targetSlot: Slot | null;
  consecutiveLosses: number;
  rng: number;
  nextItemId: number;
  battle: BattleRun;
  lastBattle: BattleRun | null;
  totals: { wins: number; losses: number; coins: number; items: number };
}
export interface GameView {
  state: Omit<GameState, "rng" | "nextItemId">;
  now: number;
  stats: Stats;
  xpToNext: number;
  report: JourneyReport | null;
  revision: number;
  catalog: Catalog;
}
export interface Catalog {
  regions: Region[];
  slots: Slot[];
  slotNames: Record<Slot, string>;
  familyNames: Record<Family, string>;
  affixNames: Record<Affix, string>;
  skills: Skill[];
  routes: Route[];
  enemies: Enemy[];
  upgradeCosts: Wallet[];
  rarityNames: Record<Rarity, string>;
}
export type GameCommand =
  | { type: "equip"; itemId: string }
  | { type: "build"; skills: string[]; rules: Rule[] }
  | { type: "route"; routeId: string; mode: "farm" | "push" }
  | { type: "mode"; mode: "farm" | "push" }
  | { type: "upgrade"; slot: Slot }
  | { type: "craft"; slot: Slot; family?: Family; affix: Affix; rarity?: "fine" | "resonant"; secondAffix?: Affix }
  | { type: "reforge"; itemId: string; level: number }
  | { type: "dismantle"; itemIds: string[] }
  | { type: "lock"; itemId: string; locked: boolean }
  | { type: "target"; slot: Slot | null }
  | { type: "preset_save"; index: number; name: string }
  | { type: "preset_load"; index: number };
export interface TrainingResult {
  build: string;
  runs: number;
  wins: number;
  averageSeconds: number;
  averageDamage: number;
  averageRemainingHp: number;
  expectedHourlyRewards: Wallet & { xp: number };
  expectedItemsPerDay: number;
  blockedEnemyNames: string[];
  sample: BattleRun;
}
