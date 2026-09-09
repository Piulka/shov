import type { Build, Catalog, GameState, Item, Slot, Stats, Wallet } from './types';

export interface AdminSession { authenticated: boolean; expiresAt?: number }
export type AdminItemInput = Omit<Item, 'id'>;
export function withPreservedAffixRolls(input: AdminItemInput, previous?: Item): AdminItemInput {
  if (input.affixRolls !== undefined || previous?.affixRolls === undefined) return input;
  const affixRolls = Object.fromEntries(input.affixes.filter(affix => previous.affixRolls?.[affix] !== undefined).map(affix => [affix, previous.affixRolls![affix]]));
  return { ...input, affixRolls };
}
export type AdminOperation =
  | { type: 'profile'; name?: string; publicName?: string; level?: number; xp?: number }
  | { type: 'wallet'; values: Partial<Wallet> }
  | { type: 'upgrades'; values: Partial<Record<Slot, number>> }
  | { type: 'route'; routeId: string; mode: 'farm' | 'push' }
  | { type: 'mode'; mode: 'farm' | 'push' }
  | { type: 'target'; slot: Slot | null }
  | { type: 'item_add'; item: AdminItemInput }
  | { type: 'item_update'; itemId: string; item: AdminItemInput }
  | { type: 'item_delete'; itemId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'build'; build: Build }
  | { type: 'preset'; index: number; build: Build }
  | { type: 'block'; blocked: boolean };
export interface AdminMutation {
  requestId: string;
  revision: number;
  reason: string;
  operations: AdminOperation[];
}
export interface AdminPlayerSummary {
  id: string;
  name: string;
  publicName: string | null;
  level: number;
  routeId: string;
  wallet: Wallet;
  revision: number;
  updatedAt: number;
  createdAt: number;
  blocked: boolean;
}
export interface AdminPage<T> { items: T[]; page: number; pageSize: number; total: number }
export interface AdminAuditEntry {
  id: number;
  accountId: string;
  requestId: string;
  reason: string;
  operations: AdminOperation[];
  beforeRevision: number;
  afterRevision: number;
  createdAt: number;
  effects: { appliedAt: number; battleRestarted: boolean; clearedPendingBuild: boolean; clearedPendingRoute: boolean };
  beforePublicName: string | null;
  afterPublicName: string | null;
}
export interface AdminPlayerDetail {
  revision: number;
  storedUpdatedAt: number;
  previewAt: number;
  publicName: string | null;
  state: Omit<GameState, 'rng' | 'nextItemId'>;
  stats: Stats;
  xpToNext: number;
  blocked: boolean;
  blockReason: string | null;
  audit: AdminAuditEntry[];
}
export interface AdminOverview {
  now: number;
  totalPlayers: number;
  updated24h: number;
  updated7d: number;
  blockedPlayers: number;
  totalClans: number | null;
  wins: number;
  losses: number;
  wealth: Wallet;
  levelDistribution: { label: string; count: number }[];
  routeDistribution: { routeId: string; count: number }[];
  wealthDistribution: { label: string; count: number }[];
}
export type AdminCatalog = Catalog;
export interface AdminError { error: string; code: string; revision?: number }
