import { allowedAffixes, catalog, families, slots, upgradeCap } from './content';
import balance from '../model/balance.json' with { type: 'json' };
import { awardChapter } from './chapter';
import { canCraftResonant, craftingCost, gearLevelCap, reforgeCost } from './equipment';
import type { Affix, BattleEvent, BattleRun, Build, Condition, Enemy, Family, GameCommand, GameState, Item, JourneyReport, Rarity, RegionId, Route, Rule, Slot, Stats, TrainingResult, Wallet } from './types';

const HOUR = 3_600_000;
const skillById = new Map(catalog.skills.map((skill) => [skill.id, skill]));
const base: Record<Slot, [number, number, number]> = {
  weapon: [100, 0, 0], focus: [25, 0, 25], head: [0, 100, 20], armor: [0, 180, 40],
  gloves: [10, 40, 0], boots: [0, 80, 15], amulet: [10, 40, 0], ring: [5, 40, 0],
};
const conditions: Condition[] = ['always', 'hp_below', 'no_shield', 'enemy_windup', 'has_debuff', 'vulnerable', 'no_vulnerable', 'three_marks', 'under_three_marks'];

function random(stream: { rng: number }): number {
  let x = stream.rng || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  stream.rng = x >>> 0;
  return stream.rng / 4294967296;
}

function routeFor(id: string): Route {
  const route = catalog.routes.find((entry) => entry.id === id);
  if (!route) throw new Error('Неизвестный маршрут.');
  return route;
}

function owned(state: GameState, id: string): Item {
  const item = state.inventory.find((entry) => entry.id === id);
  if (!item) throw new Error('Этого предмета больше нет в инвентаре.');
  return item;
}

function familyFor(state: GameState, build: Build): Family {
  return owned(state, build.equipment.weapon).family ?? 'blade';
}

function defaultSkills(family: Family, level: number): Pick<Build, 'name' | 'skills' | 'rules'> {
  if (level < 10) {
    if (family === 'glass') return { name: 'Светлая линза', skills: ['shard', 'lens', level >= 5 ? 'flash' : 'mend', 'barrier'], rules: [{ condition: 'hp_below', threshold: 40, skillId: 'barrier' }, { condition: 'no_vulnerable', skillId: 'lens' }, ...(level < 5 ? [{ condition: 'hp_below' as const, threshold: 55, skillId: 'mend' }] : [])] };
    if (family === 'needle') return { name: 'Красная нить', skills: ['stitch', 'spool', level >= 5 ? 'fasten' : 'mend', 'barrier'], rules: [{ condition: 'hp_below', threshold: 40, skillId: 'barrier' }, { condition: 'under_three_marks', skillId: 'stitch' }, ...(level < 5 ? [{ condition: 'hp_below' as const, threshold: 55, skillId: 'mend' }] : [{ condition: 'three_marks' as const, skillId: 'fasten' }])] };
    return { name: 'Ровный звон', skills: ['wedge', 'ringing', 'mend', 'barrier'], rules: [{ condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'no_shield', skillId: 'wedge' }] };
  }
  if (family === 'glass') return { name: 'Белая вспышка', skills: ['shard', 'lens', 'flash', 'barrier'], rules: [{ condition: 'hp_below', threshold: 40, skillId: 'barrier' }, { condition: 'vulnerable', skillId: 'flash' }, { condition: 'no_vulnerable', skillId: 'lens' }] };
  if (family === 'needle') return { name: 'Красная нить', skills: ['stitch', 'spool', 'fasten', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'three_marks', skillId: 'fasten' }, { condition: 'under_three_marks', skillId: 'stitch' }] };
  return { name: 'Ровный звон', skills: ['wedge', 'ringing', 'mend', 'cleanse'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'no_shield', skillId: 'wedge' }] };
}

export function computeStats(state: GameState, build = state.pendingBuild ?? state.build): Stats {
  let power = 50 + 3 * (state.level - 1);
  let hp = 500 + 20 * (state.level - 1);
  let armor = 0;
  const bonus: Record<Affix, number> = { hp: 0, armor: 0, haste: 0, crit: 0, direct: 0, dot: 0, support: 0 };
  const amounts: Record<Affix, number> = { hp: 4, armor: 5, haste: 3, crit: 3, direct: 3, dot: 5, support: 4 };
  for (const slot of slots) {
    const item = owned(state, build.equipment[slot]);
    const scale = (100 + 6 * (item.level - 1)) * (1000 + 15 * state.upgrades[slot]);
    power += Math.floor(base[slot][0] * scale / 100_000);
    hp += Math.floor(base[slot][1] * scale / 100_000);
    armor += Math.floor(base[slot][2] * scale / 100_000);
    for (const affix of item.affixes) bonus[affix] += amounts[affix];
  }
  return { power, hp: Math.floor(hp * (100 + Math.min(30, bonus.hp)) / 100), armor: Math.floor(armor * (100 + Math.min(30, bonus.armor)) / 100), haste: Math.min(40, bonus.haste) / 100, crit: Math.min(45, 5 + bonus.crit) / 100, direct: Math.min(30, bonus.direct) / 100, dot: Math.min(40, bonus.dot) / 100, support: Math.min(30, bonus.support) / 100 };
}

export function xpToNext(level: number): number {
  if (level >= 100) return 0;
  const band = balance.progression.bands.find((entry) => level >= entry.fromLevel && level < entry.toLevel) ?? balance.progression.bands[0];
  const hours = band.firstLevelHours + (band.lastLevelHours - band.firstLevelHours) * (level - band.fromLevel) / Math.max(1, band.toLevel - band.fromLevel - 1);
  return Math.round(hours * band.referenceXpPerHour);
}

interface Mark { expires: number; next: number; power: number; bonus: number }
interface Shield { expires: number; value: number }

export function simulate(state: GameState, build: Build, enemy: Enemy, startedAt: number, stream: { rng: number }, durationLimitMs?: number): BattleRun {
  const stats = computeStats(state, build);
  const family = familyFor(state, build);
  const weapon = owned(state, build.equipment.weapon);
  const accessory = [owned(state, build.equipment.amulet), owned(state, build.equipment.ring)].find((item) => item.special);
  const longThread = weapon.special === 'long_thread';
  const mirror = accessory?.special === 'mirror';
  let heroHp = stats.hp;
  let enemyHp = enemy.hp;
  let marks: Mark[] = [];
  let debuffs: Mark[] = [];
  let shields: Shield[] = [];
  let vulnerableUntil = 0;
  let hushUntil = 0;
  let stanceUntil = 0;
  let nextHero = 0;
  let heroAction = 0;
  let nextEnemy = enemy.intervalMs;
  let enemyAction = 1;
  let windupAt = -1;
  let damageDealt = 0;
  let damageTaken = 0;
  let healing = 0;
  let shielding = 0;
  const ready: Record<string, number> = {};
  const events: BattleEvent[] = [];
  const maxMs = Math.min(enemy.kind === 'boss' ? 180_000 : 90_000, durationLimitMs ?? Infinity);
  const boundSkills = new Set(build.rules.map((rule) => rule.skillId));
  const heroShield = () => shields.reduce((sum, shield) => sum + shield.value, 0);
  const push = (at: number, actor: BattleEvent['actor'], kind: BattleEvent['kind'], label: string, value = 0, skillId?: string, critical?: boolean) => events.push({ at, actor, kind, label, value, heroHp, enemyHp, heroShield: heroShield(), ...(skillId ? { skillId } : {}), ...(critical ? { critical } : {}) });
  const reduction = (armor: number, level: number) => Math.min(0.6, armor / (armor + 400 + 12 * (level - 1)));
  const dealToHero = (raw: number, at: number, kind: BattleEvent['kind'], label: string) => {
    let remaining = raw;
    shields.sort((a, b) => a.expires - b.expires);
    for (const shield of shields) {
      const absorbed = Math.min(shield.value, remaining);
      shield.value -= absorbed;
      remaining -= absorbed;
    }
    const actual = Math.min(heroHp, remaining);
    heroHp -= actual;
    damageTaken += actual;
    push(at, 'enemy', kind, label, actual);
  };
  const dealToEnemy = (raw: number, at: number, kind: BattleEvent['kind'], label: string, skillId?: string, critical?: boolean) => {
    const actual = Math.min(enemyHp, raw);
    enemyHp -= actual;
    damageDealt += actual;
    push(at, 'hero', kind, label, actual, skillId, critical);
  };
  const ruleTrue = (rule: Rule, at: number) => {
    switch (rule.condition) {
      case 'always': return true;
      case 'hp_below': return heroHp * 100 < stats.hp * (rule.threshold ?? 55);
      case 'no_shield': return heroShield() === 0;
      case 'enemy_windup': return windupAt >= 0 && at <= nextEnemy;
      case 'has_debuff': return debuffs.length > 0;
      case 'vulnerable': return vulnerableUntil > at;
      case 'no_vulnerable': return vulnerableUntil <= at;
      case 'three_marks': return marks.length === 3;
      case 'under_three_marks': return marks.length < 3;
    }
  };
  const legal = (id: string, at: number) => {
    if ((ready[id] ?? 0) > at) return false;
    if (id === 'mend') return heroHp < stats.hp;
    if (id === 'cleanse') return debuffs.length > 0;
    if (id === 'barrier') return heroShield() < Math.floor(stats.hp * 0.35);
    return true;
  };
  const addMark = (list: Mark[], at: number, duration: number, power: number, bonus: number) => {
    if (list.length >= 3) list.splice(list.reduce((best, mark, i) => mark.expires < list[best].expires ? i : best, 0), 1);
    list.push({ expires: at + duration, next: at + 1000, power, bonus });
  };

  let combatMs = maxMs;
  let outcome: BattleRun['outcome'] = 'loss';
  let reason = 'Время боя истекло';
  for (let at = 0; at <= maxMs; at += 100) {
    shields = shields.filter((shield) => shield.expires > at && shield.value > 0);
    marks = marks.filter((mark) => mark.expires >= at);
    debuffs = debuffs.filter((mark) => mark.expires >= at);
    const heavy = enemy.mechanic === 'heavy' && enemyAction % (enemy.kind === 'boss' ? 2 : 3) === 0;
    if (heavy && nextEnemy - at === 2000) {
      windupAt = at;
      push(at, 'enemy', 'windup', 'Тяжёлый удар через 2 с');
    }
    const enemyActs = nextEnemy === at;
    const heroActs = nextHero === at;
    const wasVulnerable = vulnerableUntil > at;
    const markCount = marks.length;
    let skillId: string | undefined;
    if (heroActs) {
      skillId = build.rules.find((rule) => ruleTrue(rule, at) && legal(rule.skillId, at))?.skillId;
      skillId ??= build.skills.find((id) => !boundSkills.has(id) && legal(id, at));
      if (skillId) ready[skillId] = at + skillById.get(skillId)!.cooldown * 1000;
      heroAction++;
      nextHero = Math.ceil(10 * heroAction / (1 + stats.haste)) * 100;
    }
    const phase = enemy.kind === 'boss' ? (enemyHp <= enemy.hp * 0.3 ? 1.3 : enemyHp <= enemy.hp * 0.65 ? 1.15 : 1) : 1;

    // Both actions are selected from the same living snapshot before any damage.
    let coefficient = heroActs ? 0.85 : 0;
    let heal = 0;
    let shield = 0;
    let shieldDuration = 0;
    switch (skillId) {
      case 'ringing': coefficient = 1.8; break;
      case 'wedge': coefficient = 0.9; shield = 0.8; shieldDuration = 4000; break;
      case 'counter': coefficient = 1.6; stanceUntil = at + 3000; break;
      case 'fracture': coefficient = 2.8; break;
      case 'shard': coefficient = 2.2; break;
      case 'lens': coefficient = 1; vulnerableUntil = at + 6000; break;
      case 'flash': coefficient = wasVulnerable ? 3.6 : 3; break;
      case 'shell': coefficient = 1; shield = 0.7; shieldDuration = 5000; break;
      case 'stitch': coefficient = 0.7; addMark(marks, at, longThread ? 8000 : 6000, stats.power, stats.dot); break;
      case 'spool': coefficient = 1.4; addMark(marks, at, longThread ? 8000 : 6000, stats.power, stats.dot); break;
      case 'fasten': coefficient = 2; if (markCount === 3) heal = 0.8; break;
      case 'cut': coefficient = 2.2 + 0.6 * markCount; marks = []; break;
      case 'mend': coefficient = 0; heal = 1.4; break;
      case 'barrier': coefficient = 0; shield = 1.5; shieldDuration = 5000; break;
      case 'cleanse': coefficient = 0; debuffs = []; push(at, 'hero', 'cleanse', 'Чистый шов · эффекты сняты', 0, skillId); break;
      case 'hush': coefficient = 1.1; hushUntil = at + 4000; break;
    }
    if (shield > 0) {
      const amount = Math.max(0, Math.min(Math.floor(stats.hp * 0.35) - heroShield(), Math.floor(stats.power * shield * (1 + Math.min(0.3, stats.support + (mirror ? 0.2 : 0))))));
      if (amount) shields.push({ expires: at + shieldDuration, value: amount });
      shielding += amount;
      push(at, 'hero', 'shield', skillById.get(skillId!)!.name, amount, skillId);
    }
    if (heal > 0) {
      const amount = Math.min(stats.hp - heroHp, Math.floor(stats.power * heal * (1 + stats.support) * (mirror ? 0.8 : 1)));
      heroHp += amount;
      healing += amount;
      push(at, 'hero', 'heal', skillById.get(skillId!)!.name, amount, skillId);
    }
    if (coefficient > 0) {
      const critical = random(stream) < stats.crit;
      const raw = Math.max(1, Math.floor(stats.power * coefficient * (1 + stats.direct) * (critical ? 1.5 : 1) * (vulnerableUntil > at ? 1.08 : 1) * (1 - reduction(enemy.armor, state.level)) * (longThread ? 0.9 : 1)));
      dealToEnemy(raw, at, skillId ? 'skill' : 'attack', skillId ? skillById.get(skillId)!.name : 'Базовая атака', skillId, critical);
    }
    if (enemyActs) {
      const dampening = Math.min(0.2, (hushUntil > at ? 0.1 : 0) + (stanceUntil > at ? 0.1 : 0));
      const raw = Math.max(1, Math.floor(enemy.power * (heavy ? 2 : 0.85) * phase * (1 - reduction(stats.armor, enemy.level)) * (1 - dampening)));
      dealToHero(raw, at, 'attack', heavy ? 'Раскалывающий удар' : 'Удар противника');
      if (enemy.mechanic === 'dot' && enemyAction % 3 === 0) {
        addMark(debuffs, at, 6000, enemy.power, 0);
        push(at, 'enemy', 'skill', 'Рваный след · 6 с');
      }
      enemyAction++;
      nextEnemy += enemy.intervalMs;
      windupAt = -1;
    }
    for (const mark of marks) {
      if (mark.next !== at) continue;
      const raw = Math.max(1, Math.floor(mark.power * 0.25 * (1 + mark.bonus) * (vulnerableUntil > at ? 1.08 : 1) * (1 - reduction(enemy.armor, state.level))));
      dealToEnemy(raw, at, 'dot', 'След нити');
      mark.next += 1000;
    }
    for (const mark of debuffs) {
      if (mark.next !== at) continue;
      const dampening = Math.min(0.2, (hushUntil > at ? 0.1 : 0) + (stanceUntil > at ? 0.1 : 0));
      const raw = Math.max(1, Math.floor(mark.power * 0.25 * (1 - reduction(stats.armor, enemy.level)) * (1 - dampening)));
      dealToHero(raw, at, 'dot', 'Рваный след');
      mark.next += 1000;
    }
    if (heroHp <= 0 || enemyHp <= 0 || at === maxMs) {
      combatMs = at;
      outcome = heroHp > 0 && enemyHp <= 0 ? 'win' : 'loss';
      reason = outcome === 'win' ? 'Противник повержен' : heroHp <= 0 ? 'Здоровье закончилось' : 'Время боя истекло';
      push(at, 'system', outcome, reason);
      break;
    }
  }
  return { startedAt, endsAt: startedAt + combatMs + 3000, combatMs, enemy: structuredClone(enemy), stats, events, outcome, reason, damageDealt, damageTaken, healing, shielding, family };
}

export function startBattle(state: GameState, at: number): BattleRun {
  const route = routeFor(state.routeId);
  const enemyId = route.enemyIds[(state.routeWins[route.id] ?? 0) % route.enemyIds.length];
  const enemy = catalog.enemies.find((entry) => entry.id === enemyId)!;
  return { ...simulate(state, state.build, enemy, at, state), regionId: route.regionId, production: productionFor(route) };
}

function productionFor(route: Route): NonNullable<BattleRun['production']> {
  return { version: 2, reward: { ...route.reward }, rewardPeriodMs: route.rewardPeriodMs, lootIntervalMs: route.lootIntervalMs };
}

export function migrateGame(state: GameState): boolean {
  const version = (state as { schemaVersion: number }).schemaVersion;
  if (version === 2) return false;
  if (version !== 1) throw new Error('Неизвестная версия сохранения.');
  state.schemaVersion = 2;
  state.chapter = { completed: [], legacy: true };
  state.progression = {
    rewardRemainders: {},
    lootElapsedMs: Object.fromEntries(catalog.routes.filter((route) => state.lootCounters[route.id] !== undefined).map((route) => [route.id, Math.floor(state.lootCounters[route.id] / 12 * route.lootIntervalMs)])),
  };
  state.battle.production = productionFor(routeFor(state.routeId));
  return true;
}

function nextId(state: GameState): string { return `item-${state.nextItemId++}`; }

function itemName(slot: Slot, family?: Family, regionId: RegionId = 'terraces'): string {
  if (regionId === 'glassgarden') {
    if (slot === 'weapon') return family === 'glass' ? 'Жезл стеклянной памяти' : family === 'needle' ? 'Игломёт росных чаш' : 'Клинок прозрачной коры';
    return { focus: 'Резонатор сердцевины', head: 'Венец стеклосада', armor: 'Панцирь прозрачной коры', gloves: 'Перчатки собирателя росы', boots: 'Сапоги звенящего леса', amulet: 'Капля стеклянной памяти', ring: 'Кольцо росных чаш' }[slot];
  }
  if (regionId === 'carmine') {
    if (slot === 'weapon') return family === 'glass' ? 'Жезл карминного разлива' : family === 'needle' ? 'Игломёт багряного шлюза' : 'Клинок алого переплетения';
    return { focus: 'Резонатор половодья', head: 'Венец багряного берега', armor: 'Панцирь переплетения', gloves: 'Перчатки узлового ткача', boots: 'Сапоги нитяных проток', amulet: 'Сердце карминной нити', ring: 'Кольцо смотрителя шлюза' }[slot];
  }
  if (slot === 'weapon') return family === 'glass' ? 'Жезл светлого стекла' : family === 'needle' ? 'Игломёт красной нити' : 'Клинок первого звона';
  return { focus: 'Фарфоровый резонатор', head: 'Венец садовника', armor: 'Керамический панцирь', gloves: 'Перчатки шовника', boots: 'Сапоги солнечного тракта', amulet: 'Осколок рассвета', ring: 'Кольцо тихого сада' }[slot];
}

export function createGame(id: string, now: number, seed = 0x51a7f00d): GameState {
  const inventory: Item[] = slots.map((slot, i) => ({ id: `item-${i + 1}`, name: itemName(slot, slot === 'weapon' ? 'blade' : undefined), slot, level: 1, rarity: 'common', affixes: [], ...(slot === 'weapon' ? { family: 'blade' as const } : {}) }));
  inventory.push({ id: 'item-9', name: itemName('weapon', 'glass'), slot: 'weapon', level: 1, rarity: 'common', family: 'glass', affixes: [] }, { id: 'item-10', name: itemName('weapon', 'needle'), slot: 'weapon', level: 1, rarity: 'common', family: 'needle', affixes: [] });
  const equipment = Object.fromEntries(slots.map((slot, i) => [slot, `item-${i + 1}`])) as Record<Slot, string>;
  const presets = families.map((family, index) => ({ ...defaultSkills(family, 1), equipment: { ...equipment, weapon: index === 0 ? 'item-1' : `item-${index + 8}` } }));
  const state: GameState = {
    schemaVersion: 2, id, name: 'Шовник', createdAt: now, lastSimulatedAt: now, autonomyUntil: now + 48 * HOUR,
    level: 1, xp: 0, wallet: { coins: 0, thread: 0, catalyst: 0 }, inventory,
    upgrades: Object.fromEntries(slots.map((slot) => [slot, 0])) as Record<Slot, number>,
    build: structuredClone(presets[0]), pendingBuild: null, presets, routeId: 'sunny', pendingRoute: null, mode: 'farm',
    unlockedRoutes: ['sunny'], routeWins: { sunny: 0, glass: 0, tower: 0 }, lootCounters: { sunny: 0, glass: 0, tower: 0 },
    progression: { rewardRemainders: {}, lootElapsedMs: {} }, chapter: { completed: [], legacy: false },
    targetSlot: null, consecutiveLosses: 0, rng: seed >>> 0 || 1, nextItemId: 11,
    battle: undefined as unknown as BattleRun, lastBattle: null, totals: { wins: 0, losses: 0, coins: 0, items: 0 },
  };
  state.battle = startBattle(state, now);
  return state;
}

function dropItem(state: GameState, route: Route): Item {
  const otherSlots = state.targetSlot ? slots.filter((slot) => slot !== state.targetSlot) : slots;
  const slot = state.targetSlot && random(state) < 0.5 ? state.targetSlot : otherSlots[Math.floor(random(state) * otherSlots.length)];
  const roll = random(state);
  const rarity: Rarity = roll >= 0.6 && roll < 0.9 ? 'fine' : roll >= 0.9 && roll < 0.99 && state.level >= 25 && route.resonant ? 'resonant' : 'common';
  const family = slot === 'weapon' ? families[Math.floor(random(state) * families.length)] : undefined;
  const level = Math.max(1, Math.min(route.itemLevel, gearLevelCap(state)) - 3 + Math.floor(random(state) * 4));
  const pool = allowedAffixes(slot);
  const affixes: Affix[] = [];
  const count = rarity === 'common' ? 0 : rarity === 'resonant' ? 2 : 1;
  while (affixes.length < count) affixes.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
  return { id: nextId(state), name: itemName(slot, family, route.regionId), slot, level, rarity, affixes, ...(family ? { family } : {}) };
}

function battleRewards(state: GameState, route: Route): Wallet & { xp: number } {
  const production = state.battle.production ?? productionFor(route);
  const duration = state.battle.combatMs + 3000;
  const remainders = state.progression.rewardRemainders[route.id] ??= { coins: 0, thread: 0, catalyst: 0, xp: 0 };
  const rewards = { coins: 0, thread: 0, catalyst: 0, xp: 0 };
  // Retain integer numerators across battles and settlements, including rates below one unit per battle.
  for (const key of ['coins', 'thread', 'catalyst', 'xp'] as const) {
    const numerator = remainders[key] + duration * production.reward[key];
    rewards[key] = Math.floor(numerator / production.rewardPeriodMs);
    remainders[key] = numerator % production.rewardPeriodMs;
  }
  return rewards;
}

export function settle(state: GameState, now: number): JourneyReport {
  if (!Number.isFinite(now)) throw new Error('Некорректное время.');
  const from = state.lastSimulatedAt;
  const target = Math.max(from, Math.min(now, state.autonomyUntil));
  const report: JourneyReport = { from, to: target, seconds: (target - from) / 1000, wins: 0, losses: 0, rewards: { coins: 0, thread: 0, catalyst: 0, xp: 0 }, itemIds: [], levels: 0, stopped: now >= state.autonomyUntil };
  while (state.battle.endsAt <= target) {
    const at = state.battle.endsAt;
    const route = routeFor(state.routeId);
    if (state.battle.outcome === 'win') {
      report.wins++;
      state.totals.wins++;
      state.consecutiveLosses = 0;
      state.routeWins[route.id] = (state.routeWins[route.id] ?? 0) + 1;
      const rewards = battleRewards(state, route);
      for (const key of ['coins', 'thread', 'catalyst'] as const) { state.wallet[key] += rewards[key]; report.rewards[key] += rewards[key]; }
      state.totals.coins += rewards.coins;
      if (state.level < 100) { state.xp += rewards.xp; report.rewards.xp += rewards.xp; }
      while (state.level < 100 && state.xp >= xpToNext(state.level)) {
        state.xp -= xpToNext(state.level);
        state.level++;
        report.levels++;
      }
      if (state.level >= 100) state.xp = 0;
      const chapterIds: Array<'first_win' | 'level10'> = [];
      if (route.id === 'sunny') chapterIds.push('first_win');
      if (state.level >= 10) chapterIds.push('level10');
      for (const chapterId of chapterIds) {
        const grant = awardChapter(state, chapterId);
        for (const key of ['coins', 'thread', 'catalyst'] as const) report.rewards[key] += grant[key];
      }
      const lootInterval = (state.battle.production ?? productionFor(route)).lootIntervalMs;
      state.progression.lootElapsedMs[route.id] = (state.progression.lootElapsedMs[route.id] ?? 0) + state.battle.combatMs + 3000;
      while (state.progression.lootElapsedMs[route.id] >= lootInterval) {
        state.progression.lootElapsedMs[route.id] -= lootInterval;
        const item = dropItem(state, route);
        state.inventory.push(item);
        report.itemIds.push(item.id);
        state.totals.items++;
      }
      for (let index = 1; index < catalog.routes.length; index++) {
        const candidate = catalog.routes[index];
        const previous = catalog.routes[index - 1];
        if (state.level >= candidate.unlockLevel && (state.routeWins[previous.id] ?? 0) >= candidate.unlockWins && !state.unlockedRoutes.includes(candidate.id)) state.unlockedRoutes.push(candidate.id);
      }
    } else {
      report.losses++;
      state.totals.losses++;
      state.consecutiveLosses++;
    }
    state.lastBattle = state.battle;
    if (state.pendingBuild) { state.build = state.pendingBuild; state.pendingBuild = null; }
    if (state.pendingRoute) {
      state.routeId = state.pendingRoute.routeId;
      state.mode = state.pendingRoute.mode;
      state.pendingRoute = null;
      state.consecutiveLosses = 0;
    } else if (state.consecutiveLosses >= 3 && state.routeId !== catalog.routes[0].id) {
      state.routeId = catalog.routes[Math.max(0, catalog.routes.findIndex((entry) => entry.id === state.routeId) - 1)].id;
      state.mode = 'farm';
      state.consecutiveLosses = 0;
    } else if (state.mode === 'push' && state.battle.outcome === 'win') {
      const nextRoute = catalog.routes[catalog.routes.findIndex((entry) => entry.id === state.routeId) + 1];
      if (nextRoute && state.unlockedRoutes.includes(nextRoute.id)) state.routeId = nextRoute.id;
    }
    state.battle = startBattle(state, at);
  }
  state.lastSimulatedAt = target;
  return report;
}

export function validateBuild(state: GameState, build: Build): void {
  for (const slot of slots) if (owned(state, build.equipment[slot]).slot !== slot) throw new Error('Предмет установлен в неподходящий слот.');
  const family = familyFor(state, build);
  if (!Array.isArray(build.skills) || build.skills.length !== 4 || new Set(build.skills).size !== 4) throw new Error('Выберите четыре разных умения.');
  const skills = build.skills.map((id) => skillById.get(id));
  if (skills.some((skill) => !skill || skill.unlockLevel > state.level || (skill.family !== 'common' && skill.family !== family))) throw new Error('Умение недоступно для этого оружия или уровня.');
  if (skills.filter((skill) => skill!.family === family).length < 2) throw new Error('В сборке должно быть минимум два оружейных умения.');
  if (!Array.isArray(build.rules) || build.rules.length > 3) throw new Error('Можно задать не больше трёх правил.');
  for (const rule of build.rules) {
    if (!rule || !conditions.includes(rule.condition) || !build.skills.includes(rule.skillId)) throw new Error('Правило должно ссылаться на выбранное умение и допустимое условие.');
    if (rule.condition === 'hp_below' && ![25, 40, 55, 70].includes(rule.threshold ?? 0)) throw new Error('Допустимые пороги здоровья: 25, 40, 55 и 70%.');
    if (rule.condition !== 'hp_below' && rule.threshold !== undefined) throw new Error('У этого условия нет числового порога.');
  }
}

function requireSlot(slot: Slot): void { if (!slots.includes(slot)) throw new Error('Неизвестный слот.'); }
function pay(state: GameState, cost: Wallet): void {
  if (state.wallet.coins < cost.coins || state.wallet.thread < cost.thread || state.wallet.catalyst < cost.catalyst) throw new Error('Не хватает материалов.');
  state.wallet.coins -= cost.coins;
  state.wallet.thread -= cost.thread;
  state.wallet.catalyst -= cost.catalyst;
}

export function applyCommand(state: GameState, command: GameCommand, now: number): void {
  if (!Number.isFinite(now)) throw new Error('Некорректное время.');
  const current = state.pendingBuild ?? state.build;
  switch (command.type) {
    case 'equip': {
      const item = owned(state, command.itemId);
      if (current.equipment[item.slot] === item.id) return;
      const next = structuredClone(current);
      next.equipment[item.slot] = item.id;
      if (item.slot === 'weapon' && item.family !== familyFor(state, current)) Object.assign(next, defaultSkills(item.family!, state.level));
      validateBuild(state, next);
      state.pendingBuild = next;
      awardChapter(state, 'equip');
      return;
    }
    case 'build': {
      const next = { ...structuredClone(current), skills: structuredClone(command.skills), rules: structuredClone(command.rules) };
      validateBuild(state, next);
      if (JSON.stringify(next.skills) === JSON.stringify(current.skills) && JSON.stringify(next.rules) === JSON.stringify(current.rules)) return;
      state.pendingBuild = next;
      awardChapter(state, 'tactics');
      return;
    }
    case 'route': {
      routeFor(command.routeId);
      if (!state.unlockedRoutes.includes(command.routeId)) throw new Error('Этот маршрут ещё не открыт.');
      if (!['farm', 'push'].includes(command.mode)) throw new Error('Неизвестный режим маршрута.');
      state.pendingRoute = { routeId: command.routeId, mode: command.mode };
      return;
    }
    case 'mode': {
      if (!['farm', 'push'].includes(command.mode)) throw new Error('Неизвестный режим маршрута.');
      state.mode = command.mode;
      if (state.pendingRoute) state.pendingRoute.mode = command.mode;
      return;
    }
    case 'upgrade': {
      requireSlot(command.slot);
      const cap = upgradeCap(state.level);
      const upgrade = state.upgrades[command.slot];
      if (upgrade >= cap) throw new Error(`Достигнут предел усиления +${cap} для текущего уровня.`);
      pay(state, catalog.upgradeCosts[upgrade]);
      state.upgrades[command.slot]++;
      awardChapter(state, 'upgrade');
      return;
    }
    case 'craft': {
      requireSlot(command.slot);
      if (!allowedAffixes(command.slot).includes(command.affix)) throw new Error('Это свойство недоступно для выбранного слота.');
      if (command.slot === 'weapon' && (!command.family || !families.includes(command.family))) throw new Error('Выберите семейство оружия.');
      if (command.slot !== 'weapon' && command.family !== undefined) throw new Error('Семейство есть только у оружия.');
      const rarity = command.rarity ?? 'fine';
      if (rarity !== 'fine' && rarity !== 'resonant') throw new Error('Эта редкость недоступна для изготовления.');
      const affixes = [command.affix];
      if (rarity === 'resonant') {
        if (!canCraftResonant(state)) throw new Error('Резонансные рецепты открываются с 25-го уровня в Карминных поймах.');
        if (!command.secondAffix || command.secondAffix === command.affix || !allowedAffixes(command.slot).includes(command.secondAffix)) throw new Error('Выберите два разных допустимых свойства.');
        affixes.push(command.secondAffix);
      } else if (command.secondAffix !== undefined) throw new Error('У тонкого предмета может быть только одно свойство.');
      const level = gearLevelCap(state);
      const regionId = catalog.routes.find((route) => route.itemLevel === level && state.unlockedRoutes.includes(route.id))?.regionId;
      pay(state, craftingCost(level, rarity));
      state.inventory.push({ id: nextId(state), name: itemName(command.slot, command.family, regionId), slot: command.slot, level, rarity, affixes, ...(command.family ? { family: command.family } : {}) });
      state.totals.items++;
      awardChapter(state, 'craft');
      return;
    }
    case 'reforge': {
      const item = owned(state, command.itemId);
      const cost = reforgeCost(item.level, command.level);
      if (command.level > gearLevelCap(state)) throw new Error('Этот уровень предметов ещё не открыт.');
      pay(state, cost);
      item.level = command.level;
      return;
    }
    case 'dismantle': {
      if (!Array.isArray(command.itemIds) || !command.itemIds.length || new Set(command.itemIds).size !== command.itemIds.length) throw new Error('Выберите предметы для разбора без повторений.');
      const protectedIds = new Set([state.build, ...(state.pendingBuild ? [state.pendingBuild] : []), ...state.presets].flatMap((build) => Object.values(build.equipment)));
      const items = command.itemIds.map((id) => owned(state, id));
      if (items.some((item) => item.locked || protectedIds.has(item.id))) throw new Error('Нельзя разобрать закреплённую вещь или предмет из сохранённой сборки.');
      const multipliers: Record<Rarity, number> = { common: 1, fine: 2, resonant: 3, named: 4 };
      state.wallet.thread += items.reduce((sum, item) => sum + Math.ceil(item.level / 10) * multipliers[item.rarity], 0);
      const selected = new Set(command.itemIds);
      state.inventory = state.inventory.filter((item) => !selected.has(item.id));
      return;
    }
    case 'lock': {
      if (typeof command.locked !== 'boolean') throw new Error('Некорректный статус закрепления.');
      owned(state, command.itemId).locked = command.locked;
      return;
    }
    case 'target': {
      if (command.slot !== null) requireSlot(command.slot);
      if (command.slot === state.targetSlot) return;
      state.targetSlot = command.slot;
      if (command.slot !== null) awardChapter(state, 'target');
      return;
    }
    case 'preset_save': {
      if (!Number.isInteger(command.index) || command.index < 0 || command.index >= 3) throw new Error('Доступны три ячейки сборок.');
      if (typeof command.name !== 'string' || !command.name.trim() || command.name.trim().length > 30) throw new Error('Название сборки должно содержать от 1 до 30 символов.');
      const next = { ...structuredClone(current), name: command.name.trim() };
      validateBuild(state, next);
      state.presets[command.index] = next;
      return;
    }
    case 'preset_load': {
      if (!Number.isInteger(command.index) || command.index < 0 || command.index >= state.presets.length) throw new Error('Такой сборки нет.');
      const next = structuredClone(state.presets[command.index]);
      validateBuild(state, next);
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      state.pendingBuild = next;
      if (slots.some((slot) => current.equipment[slot] !== next.equipment[slot])) awardChapter(state, 'equip');
      return;
    }
    default: throw new Error('Неизвестное действие.');
  }
}

export function train(state: GameState, routeId: string): TrainingResult {
  const route = routeFor(routeId);
  if (!state.unlockedRoutes.includes(routeId)) throw new Error('Этот маршрут ещё не открыт.');
  const build = state.pendingBuild ?? state.build;
  const runs: BattleRun[] = [];
  for (let i = 0; i < 12; i++) {
    const enemy = catalog.enemies.find((entry) => entry.id === route.enemyIds[i % route.enemyIds.length])!;
    runs.push({ ...simulate(state, build, enemy, 0, { rng: 0x7a110000 + i }), regionId: route.regionId });
  }
  const totalMs = runs.reduce((sum, run) => sum + run.combatMs + 3000, 0);
  const winningMs = runs.reduce((sum, run) => sum + (run.outcome === 'win' ? run.combatMs + 3000 : 0), 0);
  const blockedEnemyNames = route.enemyIds.flatMap((id) => {
    const samples = runs.filter((run) => run.enemy.id === id);
    return samples.length && samples.every((run) => run.outcome === 'loss') ? [samples[0].enemy.name] : [];
  });
  const successfulShare = blockedEnemyNames.length ? 0 : winningMs / totalMs;
  const expectedHourlyRewards = { coins: 0, thread: 0, catalyst: 0, xp: 0 };
  for (const key of ['coins', 'thread', 'catalyst', 'xp'] as const) expectedHourlyRewards[key] = state.level >= 100 && key === 'xp' ? 0 : route.reward[key] * HOUR / route.rewardPeriodMs * successfulShare;
  return { build: build.name, runs: runs.length, wins: runs.filter((run) => run.outcome === 'win').length, averageSeconds: Math.round(runs.reduce((sum, run) => sum + run.combatMs, 0) / runs.length / 100) / 10, averageDamage: Math.round(runs.reduce((sum, run) => sum + run.damageDealt, 0) / runs.length), averageRemainingHp: Math.round(runs.reduce((sum, run) => sum + run.events.at(-1)!.heroHp, 0) / runs.length), expectedHourlyRewards, expectedItemsPerDay: 24 * HOUR / route.lootIntervalMs * successfulShare, blockedEnemyNames, sample: runs[0] };
}
