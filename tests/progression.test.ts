import { describe, expect, it } from 'vitest';
import { catalog } from '../shared/content';
import { applyCommand, createGame, migrateGame, settle, train } from '../shared/engine';
import type { GameState } from '../shared/types';

const START = 1_800_000_000_000;
const HOUR = 3_600_000;
const game = () => createGame('progression-test', START, 147);
const finish = (state: GameState) => settle(state, state.battle.endsAt);

describe('new hero progression', () => {
  it('starts with a complete ordinary level-one kit and legal winning builds for every family', () => {
    const state = game();
    expect(state).toMatchObject({ schemaVersion: 2, level: 1, xp: 0, wallet: { coins: 0, thread: 0, catalyst: 0 } });
    expect(state.inventory).toHaveLength(10);
    expect(state.inventory.every((item) => item.level === 1 && item.rarity === 'common' && item.affixes.length === 0)).toBe(true);
    for (let index = 0; index < 3; index++) {
      applyCommand(state, { type: 'preset_load', index }, START);
      const result = train(state, 'sunny');
      expect(result.wins).toBe(12);
      expect(result.averageSeconds).toBeLessThan(20);
      expect(result.expectedHourlyRewards).toEqual({ coins: 50, thread: 1, catalyst: 0, xp: 900 });
      expect(result.expectedItemsPerDay).toBe(48);
      expect(result.blockedEnemyNames).toEqual([]);
      const build = state.pendingBuild ?? state.build;
      expect(build.skills.every((id) => catalog.skills.find((skill) => skill.id === id)!.unlockLevel === 1)).toBe(true);
    }
  });

  it('funds the first upgrade and craft through actual completed actions and grants them only once', () => {
    const state = game();
    const first = finish(state);
    expect(first.rewards).toMatchObject({ coins: 200, thread: 4 });
    expect(state.chapter.completed).toEqual(['first_win']);
    applyCommand(state, { type: 'upgrade', slot: 'weapon' }, state.lastSimulatedAt);
    expect(state.wallet).toEqual({ coins: 600, thread: 12, catalyst: 0 });
    applyCommand(state, { type: 'craft', slot: 'weapon', family: 'blade', affix: 'direct' }, state.lastSimulatedAt);
    expect(state.wallet).toEqual({ coins: 150, thread: 3, catalyst: 0 });
    const crafted = state.inventory.at(-1)!;
    expect(crafted).toMatchObject({ rarity: 'fine', level: 8 });
    applyCommand(state, { type: 'equip', itemId: crafted.id }, state.lastSimulatedAt);
    expect(state.wallet).toEqual({ coins: 250, thread: 5, catalyst: 0 });
    const snapshot = structuredClone(state);
    applyCommand(state, { type: 'equip', itemId: crafted.id }, state.lastSimulatedAt);
    expect(state).toEqual(snapshot);
    finish(state);
    expect(state.chapter.completed.filter((id) => id === 'first_win')).toHaveLength(1);
  });

  it('does not grant rewards for unchanged tactics, an empty target, invalid skills or failed purchases', () => {
    const state = game();
    const before = structuredClone(state);
    applyCommand(state, { type: 'build', skills: state.build.skills, rules: state.build.rules }, START);
    applyCommand(state, { type: 'target', slot: null }, START);
    expect(state).toEqual(before);
    expect(() => applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START)).toThrow('Не хватает');
    expect(() => applyCommand(state, { type: 'build', skills: ['wedge', 'ringing', 'mend', 'cleanse'], rules: [] }, START)).toThrow('недоступно');
    expect(state).toEqual(before);
    applyCommand(state, { type: 'target', slot: 'weapon' }, START);
    expect(state.wallet).toEqual({ coins: 50, thread: 2, catalyst: 0 });
    applyCommand(state, { type: 'target', slot: 'head' }, START);
    expect(state.wallet).toEqual({ coins: 50, thread: 2, catalyst: 0 });
  });

  it('counts equipment changes through presets but not repeatedly selecting the same build', () => {
    const state = game();
    const initial = structuredClone(state);
    applyCommand(state, { type: 'preset_load', index: 0 }, START);
    expect(state).toEqual(initial);
    applyCommand(state, { type: 'preset_load', index: 1 }, START);
    expect(state.chapter.completed).toEqual(['equip']);
    expect(state.wallet).toEqual({ coins: 100, thread: 2, catalyst: 0 });
    const switched = structuredClone(state);
    applyCommand(state, { type: 'preset_load', index: 1 }, START);
    expect(state).toEqual(switched);
    applyCommand(state, { type: 'preset_load', index: 2 }, START);
    expect(state.wallet).toEqual({ coins: 100, thread: 2, catalyst: 0 });
    expect(state.chapter.completed).toEqual(['equip']);
  });

  it('requires level 10 as well as victories to unlock the second route', () => {
    const state = game();
    for (let index = 0; index < 5; index++) finish(state);
    expect(state.unlockedRoutes).toEqual(['sunny']);
    settle(state, START + HOUR - 30_000);
    expect(state.level).toBeLessThan(10);
    settle(state, START + HOUR + 30_000);
    expect(state.level).toBe(10);
    expect(state.unlockedRoutes).toEqual(['sunny', 'glass']);
    expect(state.chapter.completed).toContain('level10');
    expect(state.battle.endsAt - state.battle.startedAt).toBe(state.battle.combatMs + 3000);
  });
});

describe('production accounting and migration', () => {
  it('makes 3600 frequent settlements identical to a single hour, including one-time rewards', () => {
    const once = game();
    const often = game();
    settle(once, START + HOUR);
    for (let seconds = 1; seconds <= 3600; seconds++) settle(often, START + seconds * 1000);
    expect(often).toEqual(once);
  });

  it('accrues fractional income and at most 48 items per day without extending battle pauses', () => {
    const state = game();
    state.chapter.legacy = true;
    settle(state, START + 24 * HOUR);
    expect(state.wallet.coins).toBeGreaterThanOrEqual(1199);
    expect(state.wallet.coins).toBeLessThanOrEqual(1200);
    expect(state.wallet.thread).toBeGreaterThanOrEqual(23);
    expect(state.wallet.thread).toBeLessThanOrEqual(24);
    expect(state.wallet.catalyst).toBe(0);
    expect(state.totals.items).toBeGreaterThanOrEqual(47);
    expect(state.totals.items).toBeLessThanOrEqual(48);
    expect(state.battle.endsAt - state.battle.startedAt - state.battle.combatMs).toBe(3000);
  });

  it('does not reward losses and training forecasts include unsuccessful time', () => {
    const state = game();
    state.unlockedRoutes.push('tower');
    const result = train(state, 'tower');
    expect(result.wins).toBe(0);
    expect(result.expectedHourlyRewards).toEqual({ coins: 0, thread: 0, catalyst: 0, xp: 0 });
    expect(result.expectedItemsPerDay).toBe(0);
    expect(result.blockedEnemyNames).toEqual(['Певчий раскола']);
    state.routeId = 'tower';
    state.battle = { ...result.sample, startedAt: START, endsAt: START + result.sample.endsAt };
    const report = finish(state);
    expect(report.rewards).toEqual({ coins: 0, thread: 0, catalyst: 0, xp: 0 });
    expect(state.chapter.completed).toEqual([]);
    expect(state.progression.lootElapsedMs.tower ?? 0).toBe(0);
  });

  it('reports a blocked enemy and no sustainable income even if the other route encounters succeed', () => {
    const state = game();
    state.level = 10;
    state.unlockedRoutes.push('glass');
    applyCommand(state, { type: 'build', skills: ['ringing', 'counter', 'fracture', 'cleanse'], rules: [] }, START);
    const before = structuredClone(state);
    const result = train(state, 'glass');
    expect(state).toEqual(before);
    expect(result.wins).toBe(8);
    expect(result.blockedEnemyNames).toEqual(['Хранитель уступа']);
    expect(result.expectedHourlyRewards).toEqual({ coins: 0, thread: 0, catalyst: 0, xp: 0 });
    expect(result.expectedItemsPerDay).toBe(0);
  });

  it('preserves route-specific partial loot and does not transfer it to a newly selected route', () => {
    const state = game();
    settle(state, START + 15 * 60_000);
    state.level = 10;
    state.unlockedRoutes.push('glass');
    applyCommand(state, { type: 'route', routeId: 'glass', mode: 'farm' }, state.lastSimulatedAt);
    finish(state);
    const sunnyElapsed = state.progression.lootElapsedMs.sunny;
    finish(state);
    expect(state.progression.lootElapsedMs.sunny).toBe(sunnyElapsed);
    expect(state.progression.lootElapsedMs.glass ?? 0).toBeLessThan(sunnyElapsed);
  });

  it('migrates legacy saves without altering progress or battle timing, preserving partial loot', () => {
    const legacy = JSON.parse(JSON.stringify(game()));
    legacy.schemaVersion = 1;
    legacy.level = 37;
    legacy.wallet = { coins: 123456, thread: 6789, catalyst: 14 };
    legacy.lootCounters = { sunny: 11, glass: 6, tower: 1 };
    delete legacy.chapter;
    delete legacy.progression;
    delete legacy.battle.production;
    const before = structuredClone(legacy);
    expect(migrateGame(legacy)).toBe(true);
    expect(legacy).toMatchObject({ schemaVersion: 2, level: 37, wallet: before.wallet, inventory: before.inventory, build: before.build, presets: before.presets, routeWins: before.routeWins, chapter: { completed: [], legacy: true } });
    expect(legacy.battle).toMatchObject(before.battle);
    expect(legacy.progression.lootElapsedMs).toEqual({ sunny: 1_650_000, glass: 900_000, tower: 150_000 });
    expect(legacy.battle.production.version).toBe(2);
    const migrated = structuredClone(legacy);
    expect(migrateGame(legacy)).toBe(false);
    expect(legacy).toEqual(migrated);
    finish(legacy);
    expect(legacy.chapter.completed).toEqual([]);
  });

  it('does not count a rest gap as production when an interrupted battle resumes', () => {
    const state = game();
    state.chapter.legacy = true;
    const reference = structuredClone(state);
    state.battle.startedAt += 72 * HOUR;
    state.battle.endsAt += 72 * HOUR;
    state.lastSimulatedAt += 72 * HOUR;
    state.autonomyUntil += 72 * HOUR;
    finish(state);
    finish(reference);
    expect(state.wallet).toEqual(reference.wallet);
    expect(state.progression).toEqual(reference.progression);
    expect(state.xp).toBe(reference.xp);
  });

  it('keeps the current reward rate until its battle ends when catalog rates change', () => {
    const state = game();
    state.chapter.legacy = true;
    const route = catalog.routes[0];
    const original = route.reward.coins;
    const duration = state.battle.combatMs + 3000;
    try {
      route.reward.coins = original * 2;
      finish(state);
      expect(state.wallet.coins).toBe(Math.floor(duration * original / route.rewardPeriodMs));
      expect(state.progression.rewardRemainders.sunny.coins).toBe(duration * original % route.rewardPeriodMs);
      expect(state.battle.production!.reward.coins).toBe(original * 2);
    } finally {
      route.reward.coins = original;
    }
  });
});
