import type { Affix, Item } from './types';

export const affixRollValues = [80, 90, 100, 110, 120] as const;
const baseAmounts: Record<Affix, number> = { hp: 4, armor: 5, haste: 3, crit: 3, direct: 3, dot: 5, support: 4 };
const labels: Record<Affix, string> = {
  hp: 'здоровья', armor: 'защиты', haste: 'скорости', crit: 'шанса крита',
  direct: 'прямого урона', dot: 'периодического урона', support: 'лечения и щитов',
};

export function affixAmount(item: Pick<Item, 'affixRolls'>, affix: Affix): number {
  const roll = item.affixRolls?.[affix] ?? 100;
  return baseAmounts[affix] * (affixRollValues.some(value => value === roll) ? roll : 100) / 100;
}

export function formatItemAffix(item: Pick<Item, 'affixRolls'>, affix: Affix): string {
  return `+${affixAmount(item, affix).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% ${labels[affix]}`;
}
