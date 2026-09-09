import { catalog } from './content';
import type { GameState, RegionId, Wallet } from './types';

export type ChapterTaskId = 'first_win' | 'equip' | 'upgrade' | 'craft' | 'tactics' | 'target' | 'level10'
  | 'first_boss' | 'level15' | 'frost_region' | 'reforge' | 'level25' | 'frost_boss' | 'ash_region'
  | 'level40' | 'dragon_boss' | 'level60' | 'level80' | 'level100';
export interface ChapterTask {
  id: ChapterTaskId;
  title: string;
  objective: string;
  destination: 'journey' | 'hero' | 'workshop' | 'map';
  action: string;
  reward: Wallet;
  phase: 'prologue' | 'adventure';
  minLevel: number;
  requirement?: { level: number } | { routeId: string } | { regionId: RegionId };
}

export const chapterTasks: ChapterTask[] = [
  { id: 'first_win', title: 'Первый бой', objective: 'Победить на Лесной тропе', destination: 'journey', action: 'К пути', reward: { coins: 200, thread: 4, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'upgrade', title: 'Крепкая основа', objective: 'Усилить любой слот снаряжения', destination: 'workshop', action: 'В мастерскую', reward: { coins: 600, thread: 12, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'equip', title: 'Новое снаряжение', objective: 'Надеть другой предмет', destination: 'hero', action: 'К снаряжению', reward: { coins: 100, thread: 2, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'craft', title: 'Работа кузнеца', objective: 'Создать редкий предмет', destination: 'workshop', action: 'В мастерскую', reward: { coins: 150, thread: 3, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'tactics', title: 'Боевая тактика', objective: 'Изменить навыки или правила боя', destination: 'hero', action: 'К сборке', reward: { coins: 100, thread: 2, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'target', title: 'Нужная находка', objective: 'Выбрать целевой слот добычи', destination: 'map', action: 'К добыче', reward: { coins: 50, thread: 2, catalyst: 0 }, phase: 'prologue', minLevel: 1 },
  { id: 'level10', title: 'Начало приключения', objective: 'Достичь 10-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 300, thread: 6, catalyst: 0 }, phase: 'prologue', minLevel: 1, requirement: { level: 10 } },
  { id: 'first_boss', title: 'Первый босс', objective: 'Победить Короля гоблинов в Крепости гоблинов', destination: 'map', action: 'К маршрутам', reward: { coins: 1200, thread: 24, catalyst: 1 }, phase: 'adventure', minLevel: 10, requirement: { routeId: 'tower' } },
  { id: 'level15', title: 'Опытный искатель', objective: 'Достичь 15-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 900, thread: 18, catalyst: 1 }, phase: 'adventure', minLevel: 10, requirement: { level: 15 } },
  { id: 'frost_region', title: 'За снежным перевалом', objective: 'Победить в любом бою в Морозных горах', destination: 'map', action: 'К маршрутам', reward: { coins: 1600, thread: 32, catalyst: 1 }, phase: 'adventure', minLevel: 10, requirement: { regionId: 'glassgarden' } },
  { id: 'reforge', title: 'Любимое снаряжение', objective: 'Повысить уровень любого предмета перековкой', destination: 'workshop', action: 'К перековке', reward: { coins: 500, thread: 10, catalyst: 0 }, phase: 'adventure', minLevel: 10 },
  { id: 'frost_boss', title: 'Покоритель льдов', objective: 'Победить Ледяного великана на Троне великана', destination: 'map', action: 'К маршрутам', reward: { coins: 2400, thread: 48, catalyst: 2 }, phase: 'adventure', minLevel: 10, requirement: { routeId: 'heartwood' } },
  { id: 'level25', title: 'Мастер своего дела', objective: 'Достичь 25-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 2000, thread: 40, catalyst: 2 }, phase: 'adventure', minLevel: 10, requirement: { level: 25 } },
  { id: 'ash_region', title: 'Земля огня', objective: 'Победить в любом бою в Пепельных землях', destination: 'map', action: 'К маршрутам', reward: { coins: 2600, thread: 52, catalyst: 2 }, phase: 'adventure', minLevel: 10, requirement: { regionId: 'carmine' } },
  { id: 'dragon_boss', title: 'Победитель дракона', objective: 'Победить Пепельного дракона в Логове дракона', destination: 'map', action: 'К маршрутам', reward: { coins: 4800, thread: 96, catalyst: 4 }, phase: 'adventure', minLevel: 10, requirement: { routeId: 'floodgate' } },
  { id: 'level40', title: 'Прославленный герой', objective: 'Достичь 40-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 4000, thread: 80, catalyst: 4 }, phase: 'adventure', minLevel: 10, requirement: { level: 40 } },
  { id: 'level60', title: 'Чемпион королевства', objective: 'Достичь 60-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 6000, thread: 120, catalyst: 6 }, phase: 'adventure', minLevel: 10, requirement: { level: 60 } },
  { id: 'level80', title: 'Живая легенда', objective: 'Достичь 80-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 9000, thread: 180, catalyst: 8 }, phase: 'adventure', minLevel: 10, requirement: { level: 80 } },
  { id: 'level100', title: 'Вершина мастерства', objective: 'Достичь 100-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 12000, thread: 240, catalyst: 12 }, phase: 'adventure', minLevel: 10, requirement: { level: 100 } },
];

export function availableChapterTasks(state: Pick<GameState, 'level' | 'chapter'>): ChapterTask[] {
  return chapterTasks.filter(task => state.level >= task.minLevel && (!state.chapter.legacy || task.phase !== 'prologue'));
}

export function awardChapter(state: GameState, id: ChapterTaskId): Wallet {
  const task = chapterTasks.find(task => task.id === id)!;
  if ((state.chapter.legacy && task.phase === 'prologue') || state.chapter.completed.includes(id) || state.level < task.minLevel) return { coins: 0, thread: 0, catalyst: 0 };
  for (const key of ['coins', 'thread', 'catalyst'] as const) state.wallet[key] += task.reward[key];
  state.chapter.completed.push(id);
  return { ...task.reward };
}

export function awardProgressChapters(state: GameState): Wallet {
  const rewards: Wallet = { coins: 0, thread: 0, catalyst: 0 };
  for (const task of availableChapterTasks(state)) {
    const condition = task.requirement;
    if (!condition || state.chapter.completed.includes(task.id)) continue;
    const done = 'level' in condition ? state.level >= condition.level
      : 'routeId' in condition ? (state.routeWins[condition.routeId] ?? 0) > 0
        : catalog.routes.some(route => route.regionId === condition.regionId && (state.routeWins[route.id] ?? 0) > 0);
    if (!done) continue;
    const reward = awardChapter(state, task.id);
    for (const key of ['coins', 'thread', 'catalyst'] as const) rewards[key] += reward[key];
  }
  return rewards;
}
