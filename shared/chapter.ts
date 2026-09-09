import type { GameState, Wallet } from './types';

export type ChapterTaskId = 'first_win' | 'equip' | 'upgrade' | 'craft' | 'tactics' | 'target' | 'level10';
export interface ChapterTask {
  id: ChapterTaskId;
  title: string;
  objective: string;
  destination: 'journey' | 'hero' | 'workshop' | 'map';
  action: string;
  reward: Wallet;
}

export const chapterTasks: ChapterTask[] = [
  { id: 'first_win', title: 'Первый стежок', objective: 'Победить на Солнечном тракте', destination: 'journey', action: 'К пути', reward: { coins: 200, thread: 4, catalyst: 0 } },
  { id: 'upgrade', title: 'Крепкая основа', objective: 'Усилить любой слот снаряжения', destination: 'workshop', action: 'В мастерскую', reward: { coins: 600, thread: 12, catalyst: 0 } },
  { id: 'equip', title: 'Свой инструмент', objective: 'Надеть другой предмет', destination: 'hero', action: 'К снаряжению', reward: { coins: 100, thread: 2, catalyst: 0 } },
  { id: 'craft', title: 'Работа по мерке', objective: 'Создать тонкую вещь', destination: 'workshop', action: 'В мастерскую', reward: { coins: 150, thread: 3, catalyst: 0 } },
  { id: 'tactics', title: 'Собственный ритм', objective: 'Изменить навыки или правила боя', destination: 'hero', action: 'К сборке', reward: { coins: 100, thread: 2, catalyst: 0 } },
  { id: 'target', title: 'Нужная находка', objective: 'Выбрать целевой слот добычи', destination: 'map', action: 'К маршрутам', reward: { coins: 50, thread: 2, catalyst: 0 } },
  { id: 'level10', title: 'Имя проводника', objective: 'Достичь 10-го уровня', destination: 'journey', action: 'К пути', reward: { coins: 300, thread: 6, catalyst: 0 } },
];

export function awardChapter(state: GameState, id: ChapterTaskId): Wallet {
  if (state.chapter.legacy || state.chapter.completed.includes(id)) return { coins: 0, thread: 0, catalyst: 0 };
  const task = chapterTasks.find(task => task.id === id)!;
  for (const key of ['coins', 'thread', 'catalyst'] as const) state.wallet[key] += task.reward[key];
  state.chapter.completed.push(id);
  return { ...task.reward };
}
