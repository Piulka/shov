import { catalog, families, slots } from './content';
import { createGame, simulate, validateBuild } from './engine';
import type { BattleRun, Enemy, Family, Rule } from './types';

export type RaidRole = 'rupture' | 'bulwark' | 'cleanse';
export interface RaidLoadout { family: Family; skills: string[]; rules: Rule[] }
export interface RaidResult {
  role: RaidRole;
  score: number;
  completed: number;
  durationSeconds: number;
  components: { label: string; points: number }[];
  battles: BattleRun[];
}

export const raidRoles: { id: RaidRole; name: string; description: string }[] = [
  { id: 'rupture', name: 'Разрыв', description: 'По 2 000 за победу. При трёх победах: за каждую волну до 1 000 × min(урон с 4-й по 8-ю секунду / 1 800, 1); убийство до конца окна даёт 1 000. Ещё до 1 000 × clamp((180 − общее время в секундах) / 90, 0, 1). Дробные бонусы округляются вниз.' },
  { id: 'bulwark', name: 'Опора', description: 'По 2 000 за победу. При трёх победах: по 500 × (1 − урон здоровью от удара / двойную силу врага) за тяжёлые удары на 9-й и 18-й секунде каждой волны; убийство до удара даёт 500. Щиты и защита учитываются, лечение не даёт очков. Ещё до 1 000 × clamp((180 − общее время в секундах) / 90, 0, 1). Бонус каждой волны округляется вниз.' },
  { id: 'cleanse', name: 'Очищение', description: 'По 2 000 за победу. При трёх победах: за каждую волну 1 000 × среднее трёх оценок следов на 6-й, 12-й и 18-й секунде. Оценка = clamp((4 − задержка снятия в секундах) / 3, 0, 1); без снятия 0, убийство в течение 4 секунд после наложения или раньше даёт 1. Ещё до 1 000 × clamp((180 − общее время в секундах) / 90, 0, 1). Бонус каждой волны округляется вниз.' },
];

const defaults: Record<RaidRole, RaidLoadout> = {
  rupture: { family: 'glass', skills: ['shard', 'lens', 'flash', 'shell'], rules: [{ condition: 'vulnerable', skillId: 'flash' }, { condition: 'no_vulnerable', skillId: 'lens' }] },
  bulwark: { family: 'blade', skills: ['wedge', 'counter', 'barrier', 'hush'], rules: [{ condition: 'enemy_windup', skillId: 'barrier' }, { condition: 'enemy_windup', skillId: 'counter' }, { condition: 'no_shield', skillId: 'wedge' }] },
  cleanse: { family: 'needle', skills: ['stitch', 'spool', 'cleanse', 'mend'], rules: [{ condition: 'has_debuff', skillId: 'cleanse' }, { condition: 'hp_below', threshold: 55, skillId: 'mend' }, { condition: 'under_three_marks', skillId: 'stitch' }] },
};

export function raidDefaults(role: RaidRole): RaidLoadout {
  requireRole(role);
  return structuredClone(defaults[role]);
}

function requireRole(role: RaidRole): void {
  if (!raidRoles.some((entry) => entry.id === role)) throw new Error('Неизвестная роль рейда.');
}

function encounters(role: RaidRole): Enemy[] {
  const ids = role === 'rupture' ? ['porcelain', 'rose', 'keeper'] : role === 'bulwark' ? ['gardener', 'keeper', 'porcelain'] : ['splinter', 'loom', 'gardener'];
  return ids.map((id, index) => ({
    ...structuredClone(catalog.enemies.find((entry) => entry.id === id)!),
    level: 10,
    hp: (role === 'cleanse' ? 6_000 : role === 'bulwark' ? 4_500 : 4_000) + 500 * index,
    power: role === 'bulwark' ? 240 + 20 * index : 135 + 15 * index,
    armor: 80 + 15 * index,
    intervalMs: role === 'bulwark' ? 3_000 : 2_000,
    mechanic: role === 'bulwark' ? 'heavy' : role === 'cleanse' ? 'dot' : 'regular',
    description: role === 'bulwark' ? 'Зачётные тяжёлые удары на 9-й и 18-й секунде.' : role === 'cleanse' ? 'Зачётные следы на 6-й, 12-й и 18-й секунде.' : 'Зачётное окно урона: с 4-й по 8-ю секунду, квота 1 800.',
  }));
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function objective(role: RaidRole, battle: BattleRun): number {
  if (role === 'rupture') {
    if (battle.combatMs <= 8_000) return 1;
    const damage = battle.events.filter((event) => event.actor === 'hero' && ['attack', 'skill', 'dot'].includes(event.kind) && event.at >= 4_000 && event.at <= 8_000).reduce((sum, event) => sum + event.value, 0);
    return clamp(damage / 1_800);
  }
  if (role === 'bulwark') {
    return [9_000, 18_000].reduce((sum, at) => {
      if (battle.combatMs < at) return sum + 1;
      const hit = battle.events.find((event) => event.actor === 'enemy' && event.kind === 'attack' && event.at === at);
      return sum + (hit ? clamp(1 - hit.value / (2 * battle.enemy.power)) : 0);
    }, 0) / 2;
  }
  return [6_000, 12_000, 18_000].reduce((sum, at) => {
    if (battle.combatMs <= at + 4_000) return sum + 1;
    const removal = battle.events.find((event) => event.kind === 'cleanse' && event.at > at && event.at <= at + 4_000);
    return sum + (removal ? clamp((4 - (removal.at - at) / 1_000) / 3) : 0);
  }, 0) / 3;
}

export function runRaid(role: RaidRole, loadout: RaidLoadout, weekStart: number, practice: boolean): RaidResult {
  requireRole(role);
  if (!loadout || !families.includes(loadout.family)) throw new Error('Выберите оружие рейда.');
  if (!Number.isSafeInteger(weekStart) || weekStart < 0) throw new Error('Некорректное начало рейдовой недели.');
  if (typeof practice !== 'boolean') throw new Error('Выберите режим рейда.');
  const state = createGame('raid-normalized', 0);
  state.level = 10;
  state.inventory = slots.map((slot) => ({ id: state.build.equipment[slot], name: catalog.slotNames[slot], slot, level: 8, rarity: 'common', affixes: [], ...(slot === 'weapon' ? { family: loadout.family } : {}) }));
  for (const slot of slots) state.upgrades[slot] = 0;
  state.build = { name: raidRoles.find((entry) => entry.id === role)!.name, equipment: { ...state.build.equipment }, skills: structuredClone(loadout.skills), rules: structuredClone(loadout.rules) };
  validateBuild(state, state.build);

  const roleIndex = raidRoles.findIndex((entry) => entry.id === role);
  const seed = (Math.imul(Math.floor(weekStart / 86_400_000), 0x45d9f3b) ^ Math.imul(roleIndex + 1, 0x9e3779b9) ^ (practice ? 0x7a11cafe : 0x51a7f00d)) >>> 0;
  const battles: BattleRun[] = [];
  let elapsedMs = 0;
  for (const enemy of encounters(role)) {
    if (elapsedMs >= 180_000) break;
    const battle = simulate(state, state.build, enemy, elapsedMs, { rng: (seed + Math.imul(battles.length, 0x6d2b79f5)) >>> 0 }, 180_000 - elapsedMs);
    // The expedition has no production/rest time; each wave starts at full HP.
    battle.endsAt = battle.startedAt + battle.combatMs;
    battles.push(battle);
    elapsedMs += battle.combatMs;
    if (battle.outcome !== 'win') break;
  }
  const completed = battles.filter((battle) => battle.outcome === 'win').length;
  const components = [{ label: `Победы: ${completed} из 3`, points: completed * 2_000 }];
  if (completed === 3) {
    battles.forEach((battle, index) => components.push({ label: `Волна ${index + 1}: ${raidRoles.find((entry) => entry.id === role)!.name}`, points: Math.floor(1_000 * objective(role, battle)) }));
    components.push({ label: 'Общее время', points: Math.floor(1_000 * clamp((180_000 - elapsedMs) / 90_000)) });
  }
  return { role, score: components.reduce((sum, entry) => sum + entry.points, 0), completed, durationSeconds: elapsedMs / 1_000, components, battles };
}
