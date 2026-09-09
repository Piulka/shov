import { describe, expect, it } from 'vitest';
import { catalog } from '../shared/content';
import { applyCommand, computeStats, createGame, migrateGame, routeEnemy, settle, startBattle, train } from '../shared/engine';
import { itemProtection, salvageValue } from '../shared/equipment';
import { fantasyItemName } from '../shared/fantasy';
import { affixAmount, affixRollValues, formatItemAffix } from '../shared/item-affixes';

describe('rolled item bonuses', () => {
  it('preserves old fixed bonuses and shows the same rolled amount used by combat', () => {
    const state = createGame('rolls', 0);
    const item = state.inventory.find(item => item.slot === 'ring')!;
    item.affixes = ['hp'];
    const originalHp = computeStats(state).hp;
    expect(affixAmount(item, 'hp')).toBe(4);
    item.affixRolls = { hp: 100 };
    expect(computeStats(state).hp).toBe(originalHp);
    item.affixRolls.hp = 80;
    expect(affixAmount(item, 'hp')).toBe(3.2);
    expect(formatItemAffix(item, 'hp')).toBe('+3,2% здоровья');
    const weakerHp = computeStats(state).hp;
    item.affixRolls.hp = 120;
    expect(affixAmount(item, 'hp')).toBe(4.8);
    expect(computeStats(state).hp).toBeGreaterThan(originalHp);
    expect(originalHp).toBeGreaterThan(weakerHp);
  });

  it('keeps total bonus limits and ignores unsupported roll values', () => {
    const state = createGame('caps', 0);
    const baseline = computeStats(state);
    for (const item of state.inventory) { item.affixes = ['hp', 'direct']; item.affixRolls = { hp: 120, direct: 120 }; }
    expect(computeStats(state).hp).toBe(Math.floor(baseline.hp * 1.3));
    expect(computeStats(state).direct).toBeLessThanOrEqual(0.3);
    expect(affixAmount({ affixRolls: { hp: Infinity } }, 'hp')).toBe(4);
    expect(affixAmount({ affixRolls: { hp: 999 } }, 'hp')).toBe(4);
  });

  it('rolls drop values deterministically across offline settlement boundaries', () => {
    const once = createGame('drops', 0, 147);
    const hourly = structuredClone(once);
    settle(once, 48 * 3_600_000);
    for (let hour = 1; hour <= 48; hour++) settle(hourly, hour * 3_600_000);
    expect(hourly).toEqual(once);
    const values = once.inventory.slice(10).flatMap(item => item.affixes.map(affix => item.affixRolls?.[affix]));
    expect(values.length).toBeGreaterThan(10);
    expect(values.every(value => affixRollValues.some(roll => roll === value))).toBe(true);
    expect(new Set(values)).toEqual(new Set(affixRollValues));
    const restored = JSON.parse(JSON.stringify(once));
    expect(migrateGame(restored)).toBe(false);
    expect(restored).toEqual(once);
  });

  it('keeps crafting deterministic and preserves rolled bonuses through equipping and reforging', () => {
    const state = createGame('reforge', 0);
    state.level = 10;
    state.wallet = { coins: 100_000, thread: 100_000, catalyst: 0 };
    applyCommand(state, { type: 'craft', slot: 'ring', affix: 'hp' }, 0);
    const item = state.inventory.at(-1)!;
    expect(item.affixRolls).toBeUndefined();
    expect(affixAmount(item, 'hp')).toBe(4);
    item.level = 3;
    item.affixRolls = { hp: 120 };
    applyCommand(state, { type: 'equip', itemId: item.id }, 0);
    const before = structuredClone(item);
    const rng = state.rng;
    applyCommand(state, { type: 'reforge', itemId: item.id, level: 8 }, 0);
    expect(item).toEqual({ ...before, level: 8 });
    expect(state.rng).toBe(rng);
    expect(state.chapter.completed.filter(id => id === 'reforge')).toHaveLength(1);
  });
});

describe('introductory enemies and existing equipment', () => {
  it('starts at level one with actual matching enemy stats and retains later-route difficulty', () => {
    const state = createGame('intro', 0);
    const route = catalog.routes.find(route => route.id === 'sunny')!;
    const first = state.battle.enemy;
    const template = catalog.enemies.find(enemy => enemy.id === first.id)!;
    expect(first.level).toBe(1);
    expect(first.hp).toBeLessThan(template.hp);
    expect(first.power).toBeLessThan(template.power);
    expect(first.armor).toBeLessThan(template.armor);
    expect(train(state, 'sunny').sample.enemy).toEqual(first);
    state.level = 5;
    const middle = startBattle(state, 0).enemy;
    expect(middle.level).toBe(5);
    expect(middle.hp).toBeGreaterThan(first.hp);
    expect(middle.hp).toBeLessThan(template.hp);
    state.level = 100;
    expect(routeEnemy(state, route, first.id)).toEqual(template);
    const bossRoute = catalog.routes.find(route => route.id === 'tower')!;
    const boss = catalog.enemies.find(enemy => enemy.id === bossRoute.enemyIds[0])!;
    expect(routeEnemy({ level: 1 }, bossRoute, boss.id)).toEqual(boss);
  });

  it('migrates only known equipment and preset names and leaves progress and current battle intact', () => {
    const state = createGame('migration', 0);
    state.inventory[0].name = 'Клинок первого звона';
    state.inventory[1].name = 'Мой талисман';
    state.build.name = 'Ровный звон';
    state.presets[1].name = 'Моя сборка';
    const before = structuredClone(state);
    expect(migrateGame(state)).toBe(true);
    const expected = structuredClone(before);
    expected.inventory[0].name = fantasyItemName('weapon', 'blade');
    expected.build.name = 'Воин';
    expect(state).toEqual(expected);
    expect(migrateGame(state)).toBe(false);
  });

  it('explains preset, equipped, pending and locked protection and rejects mixed salvage atomically', () => {
    const state = createGame('salvage', 0);
    expect(itemProtection(state, state.inventory[0])).toBe('Надет на герое');
    expect(itemProtection(state, state.inventory[8])).toContain('Маг');
    const spare = { ...state.inventory[0], id: 'spare', level: 15, rarity: 'fine' as const };
    state.inventory.push(spare);
    expect(itemProtection(state, spare)).toBeNull();
    expect(salvageValue(spare)).toBe(4);
    const before = structuredClone(state);
    expect(() => applyCommand(state, { type: 'dismantle', itemIds: [spare.id, state.inventory[8].id] }, 0)).toThrow('сборки');
    expect(state).toEqual(before);
    state.pendingBuild = structuredClone(state.build);
    state.pendingBuild.equipment.weapon = spare.id;
    expect(itemProtection(state, spare)).toBe('Выбран для следующего боя');
    spare.locked = true;
    expect(itemProtection(state, spare)).toBe('Закреплён');
    state.pendingBuild = null;
    spare.locked = false;
    applyCommand(state, { type: 'dismantle', itemIds: [spare.id] }, 0);
    expect(state.wallet.thread).toBe(4);
    expect(state.inventory.some(item => item.id === spare.id)).toBe(false);
  });
});
