import type { Affix, Catalog, Family, Slot } from './types';

export const slots: Slot[] = ['weapon', 'focus', 'head', 'armor', 'gloves', 'boots', 'amulet', 'ring'];
export const families: Family[] = ['blade', 'glass', 'needle'];
const affixesBySlot: Record<Slot, Affix[]> = {
  weapon: ['hp', 'haste', 'crit', 'direct', 'dot'],
  focus: ['hp', 'armor', 'haste', 'crit', 'direct', 'dot', 'support'],
  head: ['hp', 'armor', 'support'],
  armor: ['hp', 'armor', 'support'],
  gloves: ['hp', 'haste', 'crit', 'direct', 'dot'],
  boots: ['hp', 'armor', 'haste'],
  amulet: ['hp', 'haste', 'crit', 'direct', 'dot', 'support'],
  ring: ['hp', 'haste', 'crit', 'direct', 'dot', 'support'],
};
export function allowedAffixes(slot: Slot): Affix[] { return [...affixesBySlot[slot]]; }
export function upgradeCap(level: number): number {
  return level >= 80 ? 12 : level >= 60 ? 10 : level >= 40 ? 8 : level >= 25 ? 6 : 3;
}

export const catalog: Catalog = {
  slots,
  slotNames: { weapon: 'Оружие', focus: 'Фокус', head: 'Головной убор', armor: 'Доспех', gloves: 'Перчатки', boots: 'Обувь', amulet: 'Амулет', ring: 'Кольцо' },
  familyNames: { blade: 'Клинок-камертон', glass: 'Стекольный жезл', needle: 'Игломёт' },
  affixNames: { hp: 'Живучесть · +4% здоровья', armor: 'Плотность · +5% защиты', haste: 'Темп · +3% скорости', crit: 'Точность · +3% крита', direct: 'Нажим · +3% прямого урона', dot: 'Глубина · +5% урона следов', support: 'Забота · +4% лечения и щитов' },
  rarityNames: { common: 'Обычный', fine: 'Тонкий', resonant: 'Резонансный', named: 'Именной' },
  skills: [
    { id: 'ringing', name: 'Звонкий удар', family: 'blade', description: '180% силы прямым уроном.', cooldown: 5, unlockLevel: 1, icon: 'swords' },
    { id: 'wedge', name: 'Клин щита', family: 'blade', description: '90% силы уроном и щит 80% силы на 4 с.', cooldown: 8, unlockLevel: 1, icon: 'shield' },
    { id: 'counter', name: 'Ответный такт', family: 'blade', description: '160% силы уроном. Входящий урон −10% на 3 с.', cooldown: 10, unlockLevel: 5, icon: 'shield-check' },
    { id: 'fracture', name: 'Разлом', family: 'blade', description: '280% силы прямым уроном.', cooldown: 12, unlockLevel: 10, icon: 'zap' },
    { id: 'shard', name: 'Осколок', family: 'glass', description: '220% силы прямым уроном.', cooldown: 6, unlockLevel: 1, icon: 'gem' },
    { id: 'lens', name: 'Линза', family: 'glass', description: '100% силы уроном. Надлом: входящий урон врага +8% на 6 с.', cooldown: 8, unlockLevel: 1, icon: 'focus' },
    { id: 'flash', name: 'Белая вспышка', family: 'glass', description: '300% силы уроном; 360% против надломленной цели.', cooldown: 12, unlockLevel: 5, icon: 'sun' },
    { id: 'shell', name: 'Оболочка', family: 'glass', description: '100% силы уроном и щит 70% силы на 5 с.', cooldown: 10, unlockLevel: 10, icon: 'hexagon' },
    { id: 'stitch', name: 'Стежок', family: 'needle', description: '70% силы уроном и след: 25% силы каждую секунду, 6 с.', cooldown: 4, unlockLevel: 1, icon: 'crosshair' },
    { id: 'spool', name: 'Шпуля', family: 'needle', description: '140% силы уроном и один след. Не больше трёх следов.', cooldown: 8, unlockLevel: 1, icon: 'orbit' },
    { id: 'fasten', name: 'Закреп', family: 'needle', description: '200% силы уроном; при трёх следах лечит на 80% силы.', cooldown: 12, unlockLevel: 5, icon: 'heart-pulse' },
    { id: 'cut', name: 'Срез', family: 'needle', description: '220% силы +60% за каждый снятый след. Снимает все следы.', cooldown: 10, unlockLevel: 10, icon: 'scissors' },
    { id: 'mend', name: 'Перевязь', family: 'common', description: 'Восстанавливает здоровье на 140% силы.', cooldown: 14, unlockLevel: 1, icon: 'heart' },
    { id: 'barrier', name: 'Заслон', family: 'common', description: 'Щит 150% силы на 5 с; общий предел 35% здоровья.', cooldown: 14, unlockLevel: 1, icon: 'shield-plus' },
    { id: 'cleanse', name: 'Чистый шов', family: 'common', description: 'Снимает все отрицательные эффекты с героя.', cooldown: 16, unlockLevel: 10, icon: 'sparkles' },
    { id: 'hush', name: 'Глухой удар', family: 'common', description: '110% силы уроном. Исходящий урон врага −10% на 4 с.', cooldown: 12, unlockLevel: 10, icon: 'volume-x' },
  ],
  routes: [
    { id: 'sunny', name: 'Солнечный тракт', subtitle: 'Осколочные сады · I', description: 'Путь через цветущую керамику. Стражи бьют размеренно, стеклянные осколки оставляют снимаемые следы.', difficulty: 1, enemyIds: ['porcelain', 'splinter', 'gardener'], reward: { coins: 1200, thread: 24, catalyst: 0, xp: 21600 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 8, unlockWins: 0, unlockLevel: 1, boss: false, color: '#72c7aa' },
    { id: 'glass', name: 'Стеклянный уступ', subtitle: 'Осколочные сады · II', description: 'Острые гребни над трактом. Тяжёлые удары объявляются заранее, и тактика решает исход.', difficulty: 2, enemyIds: ['keeper', 'rose', 'loom'], reward: { coins: 3600, thread: 72, catalyst: 2, xp: 36000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 12, unlockWins: 5, unlockLevel: 10, boss: false, color: '#ec829b' },
    { id: 'tower', name: 'Башня шва', subtitle: 'Осколочные сады · Босс', description: 'Певчий раскола усиливает удары по мере потери здоровья. На подготовку защиты есть две секунды.', difficulty: 3, enemyIds: ['cantor'], reward: { coins: 4200, thread: 84, catalyst: 3, xp: 42000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 16, unlockWins: 5, unlockLevel: 12, boss: true, color: '#e6bd64' },
  ],
  enemies: [
    { id: 'porcelain', name: 'Фарфоровый дозорный', level: 8, hp: 1950, power: 115, armor: 75, intervalMs: 2100, kind: 'sentinel', mechanic: 'regular', description: 'Ровные удары. Проверяет устойчивость сборки.' },
    { id: 'splinter', name: 'Живой осколок', level: 8, hp: 1750, power: 105, armor: 45, intervalMs: 2000, kind: 'shard', mechanic: 'dot', description: 'Каждый третий удар оставляет снимаемый след.' },
    { id: 'gardener', name: 'Садовник трещин', level: 9, hp: 2350, power: 140, armor: 110, intervalMs: 3000, kind: 'weaver', mechanic: 'heavy', description: 'Объявляет каждый третий тяжёлый удар за две секунды.' },
    { id: 'keeper', name: 'Хранитель уступа', level: 12, hp: 3600, power: 205, armor: 170, intervalMs: 2300, kind: 'sentinel', mechanic: 'heavy', description: 'Толстая керамика и редкие удары двойной силы.' },
    { id: 'rose', name: 'Стеклянная роза', level: 12, hp: 3150, power: 175, armor: 75, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые острые выпады оставляют мало времени на разгон.' },
    { id: 'loom', name: 'Ткач багряной нити', level: 13, hp: 4100, power: 155, armor: 95, intervalMs: 2000, kind: 'weaver', mechanic: 'dot', description: 'Следы постепенно истощают героя; очищение снимает их все.' },
    { id: 'cantor', name: 'Певчий раскола', level: 16, hp: 9200, power: 245, armor: 200, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'На 65% и 30% здоровья усиливает удары. Каждый второй удар тяжёлый.' },
  ],
  upgradeCosts: [
    { coins: 200, thread: 4, catalyst: 0 }, { coins: 400, thread: 8, catalyst: 0 }, { coins: 800, thread: 16, catalyst: 0 },
    { coins: 1600, thread: 32, catalyst: 1 }, { coins: 2600, thread: 52, catalyst: 2 }, { coins: 4000, thread: 80, catalyst: 3 },
    { coins: 6000, thread: 120, catalyst: 6 }, { coins: 8500, thread: 170, catalyst: 10 }, { coins: 12000, thread: 240, catalyst: 14 },
    { coins: 17000, thread: 340, catalyst: 20 }, { coins: 24000, thread: 480, catalyst: 28 }, { coins: 34000, thread: 680, catalyst: 40 },
  ],
};
