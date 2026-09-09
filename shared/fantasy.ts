import type { Family, RegionId, Slot } from './types';

const itemNames: Record<RegionId, Record<Exclude<Slot, 'weapon'>, string> & Record<Family, string>> = {
  terraces: { blade: 'Меч искателя', glass: 'Посох ученика', needle: 'Охотничий лук', focus: 'Талисман искателя', head: 'Шлем разведчика', armor: 'Доспех искателя', gloves: 'Перчатки охотника', boots: 'Походные сапоги', amulet: 'Амулет рассвета', ring: 'Кольцо лесного стража' },
  glassgarden: { blade: 'Меч ледяного стража', glass: 'Посох северного мага', needle: 'Лук горного следопыта', focus: 'Талисман мороза', head: 'Шлем северного стража', armor: 'Доспех ледяного стража', gloves: 'Перчатки следопыта', boots: 'Сапоги горного прохода', amulet: 'Амулет вечного льда', ring: 'Кольцо снежной вершины' },
  carmine: { blade: 'Меч драконоборца', glass: 'Посох пламени', needle: 'Лук пепельного охотника', focus: 'Талисман пламени', head: 'Шлем драконоборца', armor: 'Доспех огненной крепости', gloves: 'Перчатки кузнеца', boots: 'Сапоги пепельных земель', amulet: 'Сердце дракона', ring: 'Кольцо хранителя огня' },
};

export function fantasyItemName(slot: Slot, family?: Family, regionId: RegionId = 'terraces'): string {
  return itemNames[regionId][slot === 'weapon' ? family ?? 'blade' : slot];
}

// Exact system names only: custom player names must survive the setting change.
export const legacyItemNames: Record<string, string> = {
  'Клинок первого звона': itemNames.terraces.blade, 'Жезл светлого стекла': itemNames.terraces.glass, 'Игломёт красной нити': itemNames.terraces.needle,
  'Фарфоровый резонатор': itemNames.terraces.focus, 'Венец садовника': itemNames.terraces.head, 'Керамический панцирь': itemNames.terraces.armor,
  'Перчатки шовника': itemNames.terraces.gloves, 'Сапоги солнечного тракта': itemNames.terraces.boots, 'Осколок рассвета': itemNames.terraces.amulet, 'Кольцо тихого сада': itemNames.terraces.ring,
  'Клинок прозрачной коры': itemNames.glassgarden.blade, 'Жезл стеклянной памяти': itemNames.glassgarden.glass, 'Игломёт росных чаш': itemNames.glassgarden.needle,
  'Резонатор сердцевины': itemNames.glassgarden.focus, 'Венец стеклосада': itemNames.glassgarden.head, 'Панцирь прозрачной коры': itemNames.glassgarden.armor,
  'Перчатки собирателя росы': itemNames.glassgarden.gloves, 'Сапоги звенящего леса': itemNames.glassgarden.boots, 'Капля стеклянной памяти': itemNames.glassgarden.amulet, 'Кольцо росных чаш': itemNames.glassgarden.ring,
  'Клинок алого переплетения': itemNames.carmine.blade, 'Жезл карминного разлива': itemNames.carmine.glass, 'Игломёт багряного шлюза': itemNames.carmine.needle,
  'Резонатор половодья': itemNames.carmine.focus, 'Венец багряного берега': itemNames.carmine.head, 'Панцирь переплетения': itemNames.carmine.armor,
  'Перчатки узлового ткача': itemNames.carmine.gloves, 'Сапоги нитяных проток': itemNames.carmine.boots, 'Сердце карминной нити': itemNames.carmine.amulet, 'Кольцо смотрителя шлюза': itemNames.carmine.ring,
};

export const legacyBuildNames: Record<string, string> = {
  'Ровный звон': 'Воин', 'Светлая линза': 'Маг', 'Белая вспышка': 'Боевой маг', 'Красная нить': 'Лучник',
};
