import balance from '../model/balance.json' with { type: 'json' };
import { catalog } from './content';
import type { GameState, Wallet } from './types';

type EquipmentProgress = Pick<GameState, 'level' | 'unlockedRoutes'>;

export function gearLevelCap(state: EquipmentProgress): number {
  return Math.max(1, ...catalog.routes.filter((route) => state.unlockedRoutes.includes(route.id)).map((route) => route.itemLevel));
}

export function canCraftResonant(state: EquipmentProgress): boolean {
  return state.level >= 25 && catalog.routes.some((route) => route.resonant && state.unlockedRoutes.includes(route.id));
}

export function craftingCost(level: number, rarity: 'fine' | 'resonant' = 'fine'): Wallet {
  if (!Number.isInteger(level) || level < 1 || level > balance.gearLevelCap) throw new Error('Некорректный уровень предмета.');
  if (rarity === 'resonant') return { ...balance.crafting.resonant };
  if (rarity !== 'fine') throw new Error('Эта редкость недоступна для изготовления.');
  return { coins: balance.crafting.fine.coins, thread: Math.max(balance.crafting.fine.threadBase, 2 * Math.ceil(level / 10) + balance.crafting.fine.threadSalvageMargin), catalyst: 0 };
}

export function reforgeCost(from: number, to: number): Wallet {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to <= from || to > balance.gearLevelCap) throw new Error('Выберите более высокий уровень предмета.');
  const difference = to * to - from * from;
  return { coins: balance.reforge.coinsPerSquaredGearLevelDelta * difference, thread: Math.ceil(balance.reforge.threadPerSquaredGearLevelDelta * difference), catalyst: balance.reforge.catalystCost };
}
