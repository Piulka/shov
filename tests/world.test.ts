import { describe, expect, it } from 'vitest';
import { allowedAffixes, catalog, slots } from '../shared/content';
import { applyCommand, computeStats, createGame, migrateGame, settle, train } from '../shared/engine';
import { canCraftResonant, craftingCost, gearLevelCap, reforgeCost } from '../shared/equipment';
import type { Build, Family, GameCommand, GameState } from '../shared/types';

const START = 1_800_000_000_000;
const HOUR = 3_600_000;

function tactics(family: Family, routeId: string): Pick<Build, 'skills' | 'rules'> {
  if (family === 'glass') return {
    skills: ['shard', 'lens', 'mend', routeId === 'weft' ? 'cleanse' : 'barrier'],
    rules: [{ condition: 'hp_below', threshold: 55, skillId: 'mend' }, routeId === 'weft' ? { condition: 'has_debuff', skillId: 'cleanse' } : { condition: 'enemy_windup', skillId: 'barrier' }, { condition: 'no_vulnerable', skillId: 'lens' }],
  };
  if (family === 'needle' && routeId === 'floodgate') return {
    skills: ['stitch', 'spool', 'mend', 'barrier'],
    rules: [{ condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'enemy_windup', skillId: 'barrier' }, { condition: 'under_three_marks', skillId: 'stitch' }],
  };
  if (family === 'needle') return {
    skills: ['stitch', 'spool', 'fasten', 'cleanse'],
    rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'three_marks', skillId: 'fasten' }, { condition: 'under_three_marks', skillId: 'stitch' }],
  };
  return {
    skills: ['wedge', 'ringing', 'mend', 'cleanse'],
    rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'no_shield', skillId: 'wedge' }],
  };
}

function hero(routeId = 'sunny', level = 35, itemLevel = 36, family: Family = 'blade'): GameState {
  const state = createGame('world-test', START, 147);
  state.level = level;
  state.chapter.legacy = true;
  state.wallet = { coins: 100_000, thread: 2000, catalyst: 100 };
  state.inventory.forEach((item) => {
    item.level = itemLevel;
    item.rarity = 'fine';
    item.affixes = [item.slot === 'weapon' || item.slot === 'gloves' ? 'direct' : 'hp'];
  });
  slots.forEach((slot) => { state.upgrades[slot] = 3; });
  state.unlockedRoutes = catalog.routes.slice(0, catalog.routes.findIndex((route) => route.id === routeId) + 1).map((route) => route.id);
  state.routeId = routeId;
  state.build.equipment.weapon = state.inventory.find((item) => item.family === family)!.id;
  Object.assign(state.build, tactics(family, routeId));
  const run = train(state, routeId).sample;
  state.battle = { ...run, startedAt: START, endsAt: START + run.endsAt };
  return state;
}

function finish(state: GameState): void { settle(state, state.battle.endsAt); }

describe('regions and route progression', () => {
  it('requires both the previous route victories and the hero level at every new gate', () => {
    for (const route of catalog.routes.slice(3)) {
      const index = catalog.routes.indexOf(route);
      const previous = catalog.routes[index - 1];
      const state = hero(previous.id, route.unlockLevel - 1);
      state.routeWins[previous.id] = route.unlockWins - 1;
      finish(state);
      expect(state.routeWins[previous.id]).toBe(route.unlockWins);
      expect(state.unlockedRoutes).not.toContain(route.id);
      expect(gearLevelCap(state)).toBe(previous.itemLevel);
      state.level = route.unlockLevel;
      finish(state);
      expect(state.unlockedRoutes).toContain(route.id);
      expect(gearLevelCap(state)).toBe(route.itemLevel);
      const early = hero(previous.id, route.unlockLevel);
      early.routeWins[previous.id] = route.unlockWins - 2;
      finish(early);
      expect(early.unlockedRoutes).not.toContain(route.id);
      finish(early);
      expect(early.unlockedRoutes).toContain(route.id);
    }
  });

  it.each(catalog.routes.slice(3).map((route, index) => ({ route, priorLevel: catalog.routes[index + 2].itemLevel })))('supports all three weapon families at entry to $route.id with previous-region equipment', ({ route, priorLevel }) => {
    for (const family of ['blade', 'glass', 'needle'] as const) {
      const state = hero(route.id, route.unlockLevel, priorLevel, family);
      const before = structuredClone(state);
      const result = train(state, route.id);
      expect(result.wins, `${route.id}: ${family}`).toBe(12);
      expect(result.blockedEnemyNames).toEqual([]);
      expect(result.averageSeconds).toBeLessThan(route.boss ? 60 : 40);
      expect(result.expectedItemsPerDay).toBe(48);
      expect(result.sample.regionId).toBe(route.regionId);
      expect(state).toEqual(before);
    }
  });

  it('makes cleansing matter in the later river encounters and defense matter at the final boss', () => {
    const glass = hero('weft', 30, 29, 'glass');
    const prepared = train(glass, 'weft');
    Object.assign(glass.build, tactics('glass', 'glasswood'));
    const withoutCleanse = train(glass, 'weft');
    expect(prepared.wins).toBe(12);
    expect(withoutCleanse.wins).toBeLessThan(prepared.wins);
    expect(withoutCleanse.blockedEnemyNames).toContain('Узловой ткач');
    const needle = hero('floodgate', 35, 33, 'needle');
    expect(train(needle, 'floodgate').wins).toBe(12);
    Object.assign(needle.build, tactics('needle', 'glasswood'));
    expect(train(needle, 'floodgate').wins).toBeLessThan(12);
  });

  it('retreats after repeated losses and retains earned regional progress', () => {
    const state = hero('floodgate', 35, 1, 'glass');
    state.routeWins.floodgate = 4;
    state.progression.lootElapsedMs.floodgate = 345_678;
    const wallet = { ...state.wallet };
    for (let index = 0; index < 3; index++) finish(state);
    expect(state.routeId).toBe('weft');
    expect(state.mode).toBe('farm');
    expect(state.routeWins.floodgate).toBe(4);
    expect(state.progression.lootElapsedMs.floodgate).toBe(345_678);
    expect(state.wallet).toEqual(wallet);
    expect(state.battle.regionId).toBe('carmine');
  });

  it('keeps older schema-two heroes and their running battles intact until the next event', () => {
    const state = hero('tower', 35);
    delete state.battle.regionId;
    state.routeWins.tower = 8;
    const before = structuredClone(state);
    expect(migrateGame(state)).toBe(false);
    expect(state).toEqual(before);
    finish(state);
    expect(state.unlockedRoutes).toContain('glasswood');
    expect(state.lastBattle).toEqual(before.battle);
    expect(state.battle.regionId).toBe('terraces');
  });
});

describe('regional production and resonant loot', () => {
  it('settles a day in the later regions identically in one request or hourly, including rare drops', () => {
    const once = hero('carmine', 25);
    const often = structuredClone(once);
    const initialWallet = { ...once.wallet };
    settle(once, START + 24 * HOUR);
    for (let hour = 1; hour <= 24; hour++) settle(often, START + hour * HOUR);
    expect(often).toEqual(once);
    expect(once.totals.items).toBeGreaterThanOrEqual(47);
    expect(once.totals.items).toBeLessThanOrEqual(48);
    expect(once.wallet.coins - initialWallet.coins).toBeGreaterThanOrEqual(7990);
    expect(once.wallet.coins - initialWallet.coins).toBeLessThanOrEqual(8000);
    const drops = once.inventory.slice(10);
    expect(drops.some((item) => item.rarity === 'resonant')).toBe(true);
    for (const item of drops) {
      expect(item.level).toBeGreaterThanOrEqual(26);
      expect(item.level).toBeLessThanOrEqual(29);
      expect(item.rarity).not.toBe('named');
      expect(item.affixes).toHaveLength(item.rarity === 'resonant' ? 2 : item.rarity === 'fine' ? 1 : 0);
      expect(new Set(item.affixes).size).toBe(item.affixes.length);
      expect(item.affixes.every((affix) => allowedAffixes(item.slot).includes(affix))).toBe(true);
    }
  });

  it('does not drop resonant gear in an earlier region even for a mature hero', () => {
    const state = hero('heartwood', 35);
    settle(state, START + 24 * HOUR);
    expect(state.totals.items).toBeGreaterThanOrEqual(47);
    expect(state.inventory.every((item) => item.rarity === 'common' || item.rarity === 'fine')).toBe(true);
    expect(state.unlockedRoutes).toContain('carmine');
    expect(canCraftResonant(state)).toBe(true);
  });

  it('does not grant resonant drops below level 25 even when testing an unlocked advanced route', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const state = hero('carmine', 24);
      state.rng = seed;
      settle(state, START + HOUR);
      expect(state.level).toBe(24);
      expect(state.totals.items).toBeGreaterThanOrEqual(1);
      expect(state.inventory.some((item) => item.rarity === 'resonant')).toBe(false);
    }
  });
});

describe('deterministic crafting and reforging', () => {
  it('unlocks exact resonant crafting through level and region and preserves legacy fine requests', () => {
    const state = hero('carmine', 25);
    expect(canCraftResonant(state)).toBe(true);
    const before = { ...state.wallet };
    applyCommand(state, { type: 'craft', slot: 'weapon', family: 'needle', rarity: 'resonant', affix: 'dot', secondAffix: 'haste' }, START);
    expect(state.inventory.at(-1)).toMatchObject({ family: 'needle', rarity: 'resonant', level: 29, affixes: ['dot', 'haste'] });
    expect(state.wallet).toEqual({ coins: before.coins - 18000, thread: before.thread - 360, catalyst: before.catalyst - 24 });
    applyCommand(state, { type: 'craft', slot: 'head', affix: 'hp' }, START);
    expect(state.inventory.at(-1)).toMatchObject({ rarity: 'fine', level: 29, affixes: ['hp'] });
    expect(state.wallet).toEqual({ coins: before.coins - 18600, thread: before.thread - 372, catalyst: before.catalyst - 24 });
  });

  it('rejects unavailable recipes and invalid affix combinations without altering state', () => {
    const command: GameCommand = { type: 'craft', slot: 'head', rarity: 'resonant', affix: 'hp', secondAffix: 'armor' };
    for (const state of [hero('heartwood', 25), hero('carmine', 24)]) {
      const before = structuredClone(state);
      expect(canCraftResonant(state)).toBe(false);
      expect(() => applyCommand(state, command, START)).toThrow('25-го уровня');
      expect(state).toEqual(before);
    }
    const state = hero('carmine', 25);
    const invalid: GameCommand[] = [
      { type: 'craft', slot: 'head', rarity: 'resonant', affix: 'hp' },
      { type: 'craft', slot: 'head', rarity: 'resonant', affix: 'hp', secondAffix: 'hp' },
      { type: 'craft', slot: 'head', rarity: 'resonant', affix: 'hp', secondAffix: 'crit' },
      { type: 'craft', slot: 'head', rarity: 'fine', affix: 'hp', secondAffix: 'armor' },
    ];
    const before = structuredClone(state);
    for (const input of invalid) {
      expect(() => applyCommand(state, input, START)).toThrow();
      expect(state).toEqual(before);
    }
    state.wallet.catalyst = 23;
    const poor = structuredClone(state);
    expect(() => applyCommand(state, command, START)).toThrow('Не хватает');
    expect(state).toEqual(poor);
  });

  it('reforges an equipped locked favorite without changing identity, affixes, saved builds or already simulated battles', () => {
    const state = hero('sunny');
    state.unlockedRoutes = catalog.routes.map((route) => route.id);
    const item = state.inventory.find((entry) => entry.slot === 'ring')!;
    Object.assign(item, { level: 12, rarity: 'named', affixes: ['hp', 'support'], special: 'mirror', locked: true });
    finish(state);
    const before = structuredClone(state);
    const stats = computeStats(state);
    applyCommand(state, { type: 'reforge', itemId: item.id, level: 36 }, state.lastSimulatedAt);
    expect(item).toEqual({ ...before.inventory.find((entry) => entry.id === item.id), level: 36 });
    expect(state.inventory).toHaveLength(before.inventory.length);
    expect(state.build).toEqual(before.build);
    expect(state.presets).toEqual(before.presets);
    expect(state.upgrades).toEqual(before.upgrades);
    expect(state.battle).toEqual(before.battle);
    expect(state.lastBattle).toEqual(before.lastBattle);
    expect(state.rng).toBe(before.rng);
    expect(state.nextItemId).toBe(before.nextItemId);
    expect(state.totals).toEqual(before.totals);
    const cost = reforgeCost(12, 36);
    expect(state.wallet).toEqual({ coins: before.wallet.coins - cost.coins, thread: before.wallet.thread - cost.thread, catalyst: before.wallet.catalyst });
    expect(computeStats(state).hp).toBeGreaterThan(stats.hp);
    finish(state);
    expect(state.lastBattle).toEqual(before.battle);
    expect(state.battle.stats.hp).toBeGreaterThan(before.battle.stats.hp);
  });

  it('rejects unknown items, locked levels, noninteger targets, downgrades and insufficient funds atomically', () => {
    const state = hero('tower', 16, 12);
    const invalid: GameCommand[] = [
      { type: 'reforge', itemId: 'missing', level: 16 },
      ...[0, 11, 12, 16.5, 17, 101, NaN, Infinity].map((level): GameCommand => ({ type: 'reforge', itemId: 'item-1', level })),
    ];
    const before = structuredClone(state);
    for (const command of invalid) {
      expect(() => applyCommand(state, command, START)).toThrow();
      expect(state).toEqual(before);
    }
    state.wallet.coins = 0;
    const poor = structuredClone(state);
    expect(() => applyCommand(state, { type: 'reforge', itemId: 'item-1', level: 16 }, START)).toThrow('Не хватает');
    expect(state).toEqual(poor);
  });

  it('uses a telescoping price and never creates thread through crafting, reforging and salvage', () => {
    expect(reforgeCost(60, 65)).toEqual({ coins: 12500, thread: 250, catalyst: 0 });
    const direct = reforgeCost(12, 36);
    const first = reforgeCost(12, 24);
    const second = reforgeCost(24, 36);
    expect(first.coins + second.coins).toBe(direct.coins);
    expect(first.thread + second.thread).toBeGreaterThanOrEqual(direct.thread);
    for (let level = 1; level <= 100; level++) {
      expect(craftingCost(level).thread).toBeGreaterThan(2 * Math.ceil(level / 10));
      expect(craftingCost(level, 'resonant').thread).toBeGreaterThan(3 * Math.ceil(level / 10));
      if (level < 100) {
        const extraSalvage = 4 * (Math.ceil((level + 1) / 10) - Math.ceil(level / 10));
        expect(reforgeCost(level, level + 1).thread).toBeGreaterThanOrEqual(extraSalvage);
      }
    }
  });
});
