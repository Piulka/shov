import { describe, expect, it } from 'vitest';
import { allowedAffixes, catalog } from '../shared/content';
import { applyCommand, computeStats, createGame, settle, train, xpToNext } from '../shared/engine';
import type { GameCommand, GameState } from '../shared/types';

const START = 1_800_000_000_000;
const HOUR = 3_600_000;
const game = () => {
  const state = createGame('engine-test', START, 147);
  state.level = 10;
  state.wallet = { coins: 1600, thread: 32, catalyst: 0 };
  state.chapter.legacy = true;
  state.inventory.forEach((item) => { item.level = 8; item.rarity = 'fine'; });
  Object.assign(state.presets[0], { skills: ['wedge', 'ringing', 'mend', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'no_shield', skillId: 'wedge' }] });
  Object.assign(state.presets[1], { skills: ['shard', 'lens', 'flash', 'barrier'], rules: [{ condition: 'hp_below', threshold: 40, skillId: 'barrier' }, { condition: 'vulnerable', skillId: 'flash' }, { condition: 'no_vulnerable', skillId: 'lens' }] });
  Object.assign(state.presets[2], { skills: ['stitch', 'spool', 'fasten', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'three_marks', skillId: 'fasten' }, { condition: 'under_three_marks', skillId: 'stitch' }] });
  state.build = structuredClone(state.presets[0]);
  const battle = train(state, 'sunny').sample;
  state.battle = { ...battle, startedAt: START, endsAt: START + battle.endsAt };
  return state;
};
function finish(state: GameState, count = 1): void {
  for (let i = 0; i < count; i++) settle(state, state.battle.endsAt);
}

describe('campaign determinism and offline clock', () => {
  it('reproduces the complete state and combat timeline from the same seed', () => {
    const first = game();
    const second = game();
    settle(first, START + HOUR);
    settle(second, START + HOUR);
    expect(first).toEqual(second);
    expect(first.totals.wins).toBeGreaterThan(100);
  });

  it('gives identical rewards, equipment and battles for 24h once or 24 hourly settlements', () => {
    const once = game();
    const hourly = game();
    settle(once, START + 24 * HOUR);
    for (let hour = 1; hour <= 24; hour++) settle(hourly, START + hour * HOUR);
    expect(hourly).toEqual(once);
  });

  it('caps absence at 48h, does not renew autonomy, and cannot collect twice', () => {
    const state = game();
    const report = settle(state, START + 72 * HOUR);
    expect(report.seconds).toBe(48 * 3600);
    expect(report.stopped).toBe(true);
    expect(state.lastSimulatedAt).toBe(START + 48 * HOUR);
    expect(state.autonomyUntil).toBe(START + 48 * HOUR);
    const snapshot = structuredClone(state);
    const duplicate = settle(state, START + 96 * HOUR);
    expect(duplicate.wins).toBe(0);
    expect(duplicate.rewards).toEqual({ coins: 0, thread: 0, catalyst: 0, xp: 0 });
    expect(state).toEqual(snapshot);
  });

  it('does not rewind time or award an unfinished encounter', () => {
    const state = game();
    const end = state.battle.endsAt;
    settle(state, end - 1);
    expect(state.totals.wins).toBe(0);
    expect(state.lastBattle).toBeNull();
    const snapshot = structuredClone(state);
    settle(state, START - 1);
    expect(state).toEqual(snapshot);
    settle(state, end);
    expect(state.totals.wins).toBe(1);
    expect(state.battle.startedAt).toBe(end);
  });

  it('preserves the current battle when a weapon, build or slot upgrade changes', () => {
    const state = game();
    const battle = structuredClone(state.battle);
    applyCommand(state, { type: 'equip', itemId: 'item-9' }, START + 1000);
    applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START + 1000);
    expect(state.battle).toEqual(battle);
    expect(state.build.equipment.weapon).toBe('item-1');
    expect(state.pendingBuild?.equipment.weapon).toBe('item-9');
    finish(state);
    expect(state.lastBattle).toEqual(battle);
    expect(state.battle.family).toBe('glass');
    expect(state.battle.stats.power).toBeGreaterThan(battle.stats.power);
    expect(state.pendingBuild).toBeNull();
  });

  it('keeps the interrupted battle intact across a rest gap handled by the server', () => {
    const state = game();
    state.autonomyUntil = START + 2500;
    settle(state, START + 100_000);
    const run = structuredClone(state.battle);
    const gap = START + 100_000 - state.autonomyUntil;
    state.battle.startedAt += gap;
    state.battle.endsAt += gap;
    state.lastSimulatedAt = START + 100_000;
    state.autonomyUntil = state.lastSimulatedAt + 48 * HOUR;
    expect(state.battle.events).toEqual(run.events);
    settle(state, state.battle.endsAt - 1);
    expect(state.totals.wins).toBe(0);
    finish(state);
    expect(state.totals.wins).toBe(1);
  });
});

describe('commands and economy', () => {
  it('validates gear ownership and protects all saved presets from dismantling', () => {
    const state = game();
    const before = structuredClone(state);
    expect(() => applyCommand(state, { type: 'equip', itemId: 'missing' }, START)).toThrow('предмета');
    expect(() => applyCommand(state, { type: 'dismantle', itemIds: ['item-9'] }, START)).toThrow('сборки');
    expect(state).toEqual(before);
  });

  it('crafts a deterministic compatible item and never profits from dismantling it', () => {
    const state = game();
    const before = { ...state.wallet };
    applyCommand(state, { type: 'craft', slot: 'weapon', family: 'needle', affix: 'dot' }, START);
    const item = state.inventory.at(-1)!;
    expect(item).toMatchObject({ slot: 'weapon', family: 'needle', affixes: ['dot'], rarity: 'fine', level: 8 });
    expect(state.wallet).toEqual({ coins: before.coins - 600, thread: before.thread - 12, catalyst: 0 });
    applyCommand(state, { type: 'dismantle', itemIds: [item.id] }, START);
    expect(state.wallet.thread).toBe(before.thread - 10);
    expect(() => applyCommand(state, { type: 'equip', itemId: item.id }, START)).toThrow('больше нет');
  });

  it('rejects invalid commands atomically, including incompatible affixes and duplicate salvage', () => {
    const state = game();
    const before = structuredClone(state);
    const invalid: GameCommand[] = [
      { type: 'craft', slot: 'head', affix: 'crit' },
      { type: 'craft', slot: 'weapon', affix: 'dot' },
      { type: 'craft', slot: 'ring', affix: 'hp', family: 'blade' },
      { type: 'dismantle', itemIds: ['item-1', 'item-1'] },
      { type: 'route', routeId: 'tower', mode: 'farm' },
      { type: 'build', skills: ['wedge', 'ringing', 'mend', 'mend'], rules: [] },
      { type: 'build', skills: ['wedge', 'ringing', 'mend', 'cleanse'], rules: [{ condition: 'hp_below', threshold: 99, skillId: 'mend' }] },
      { type: 'build', skills: ['wedge', 'ringing', 'mend', 'cleanse'], rules: [{ condition: 'always', skillId: 'flash' }] },
      { type: 'preset_save', index: 3, name: 'Неверная ячейка' },
    ];
    for (const command of invalid) {
      expect(() => applyCommand(state, command, START)).toThrow();
      expect(state).toEqual(before);
    }
  });

  it('checks funds and upgrade caps while retaining upgrades after weapon replacement', () => {
    const state = game();
    applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START);
    applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START);
    applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START);
    expect(state.upgrades.weapon).toBe(3);
    expect(() => applyCommand(state, { type: 'upgrade', slot: 'weapon' }, START)).toThrow('предел');
    expect(() => applyCommand(state, { type: 'craft', slot: 'ring', affix: 'hp' }, START)).toThrow('Не хватает');
    applyCommand(state, { type: 'equip', itemId: 'item-10' }, START);
    finish(state);
    expect(state.upgrades.weapon).toBe(3);
  });

  it('locks crafted items, refuses the whole salvage batch, and allows unlock', () => {
    const state = game();
    applyCommand(state, { type: 'craft', slot: 'ring', affix: 'hp' }, START);
    const id = state.inventory.at(-1)!.id;
    applyCommand(state, { type: 'lock', itemId: id, locked: true }, START);
    expect(() => applyCommand(state, { type: 'dismantle', itemIds: [id] }, START)).toThrow('закреплённую');
    applyCommand(state, { type: 'lock', itemId: id, locked: false }, START);
    applyCommand(state, { type: 'dismantle', itemIds: [id] }, START);
    expect(state.inventory.some((item) => item.id === id)).toBe(false);
  });

  it('unlocks routes after five wins at level 10 and grants an item for 30 minutes of victories', () => {
    const state = game();
    finish(state, 5);
    expect(state.unlockedRoutes).toEqual(['sunny', 'glass']);
    expect(state.progression.lootElapsedMs.sunny).toBeGreaterThan(0);
    settle(state, START + 30 * 60_000);
    finish(state);
    expect(state.progression.lootElapsedMs.sunny).toBeLessThan(30_000);
    expect(state.inventory).toHaveLength(11);
    for (const item of state.inventory) {
      expect(new Set(item.affixes).size).toBe(item.affixes.length);
      expect(item.affixes.every((affix) => allowedAffixes(item.slot).includes(affix))).toBe(true);
    }
  });
});

describe('combat and training', () => {
  it('has sixteen usable skills and all three starter styles win the introductory route', () => {
    expect(catalog.skills).toHaveLength(16);
    const state = game();
    const times: number[] = [];
    for (let index = 0; index < 3; index++) {
      applyCommand(state, { type: 'preset_load', index }, START);
      const snapshot = structuredClone(state);
      const result = train(state, 'sunny');
      expect(result.wins).toBe(12);
      expect(state).toEqual(snapshot);
      expect(result.sample.family).toBe(['blade', 'glass', 'needle'][index]);
      times.push(result.averageSeconds);
    }
    expect(new Set(times).size).toBe(3);
  });

  it('shows shield, healing, marks, cleansing, vulnerability and announced heavy attacks', () => {
    const state = game();
    state.unlockedRoutes.push('glass', 'tower');
    const blade = train(state, 'tower');
    expect(blade.sample.events.some((event) => event.kind === 'windup')).toBe(true);
    expect(blade.sample.events.some((event) => event.kind === 'heal')).toBe(true);
    expect(blade.sample.events.some((event) => event.kind === 'shield')).toBe(true);
    for (const windup of blade.sample.events.filter((event) => event.kind === 'windup')) {
      expect(blade.sample.events.some((event) => event.at === windup.at + 2000 && event.label === 'Раскалывающий удар')).toBe(true);
    }
    applyCommand(state, { type: 'preset_load', index: 2 }, START);
    const needle = train(state, 'tower');
    expect(needle.sample.events.some((event) => event.kind === 'dot' && event.actor === 'hero')).toBe(true);
    applyCommand(state, { type: 'preset_load', index: 1 }, START);
    const glass = train(state, 'tower');
    expect(glass.sample.events.some((event) => event.skillId === 'lens')).toBe(true);
    expect(glass.sample.events.some((event) => event.skillId === 'flash')).toBe(true);
    expect(glass.sample.events.every((event) => event.heroHp >= 0 && event.enemyHp >= 0 && event.heroShield <= glass.sample.stats.hp * 0.35)).toBe(true);
  });

  it('executes all family skills and removes enemy damage-over-time with cleansing', () => {
    const state = game();
    state.unlockedRoutes.push('glass', 'tower');
    for (let index = 0; index < 3; index++) {
      applyCommand(state, { type: 'preset_load', index }, START);
      const family = ['blade', 'glass', 'needle'][index];
      const skills = catalog.skills.filter((skill) => skill.family === family).map((skill) => skill.id);
      applyCommand(state, { type: 'build', skills, rules: [] }, START);
      const run = train(state, 'tower').sample;
      for (const id of skills) expect(run.events.some((event) => event.skillId === id)).toBe(true);
    }
    applyCommand(state, { type: 'preset_load', index: 0 }, START);
    applyCommand(state, { type: 'route', routeId: 'glass', mode: 'farm' }, START);
    finish(state);
    finish(state, 2);
    expect(state.battle.enemy.id).toBe('loom');
    expect(state.battle.events.some((event) => event.kind === 'cleanse')).toBe(true);
    const cleanse = state.battle.events.find((event) => event.kind === 'cleanse')!;
    expect(state.battle.events.some((event) => event.kind === 'dot' && event.actor === 'enemy' && event.at > cleanse.at && event.at < cleanse.at + 1000)).toBe(false);
  });

  it('uses the approved experience bands and increases stats with real equipment', () => {
    expect(xpToNext(10)).toBe(6000);
    expect(xpToNext(25)).toBe(63_000);
    expect(xpToNext(100)).toBe(0);
    const state = game();
    const baseline = computeStats(state);
    state.inventory[0].level = 16;
    expect(computeStats(state).power).toBeGreaterThan(baseline.power);
    state.inventory.forEach((item) => { item.affixes = ['hp']; });
    const stats = computeStats(state);
    expect(stats.hp).toBe(Math.floor((500 + 20 * 9 + 678) * 1.3));
  });
});
