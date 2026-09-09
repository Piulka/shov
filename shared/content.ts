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
  regions: [
    { id: 'terraces', name: 'Белые террасы', subtitle: 'Цветущая керамика', description: 'Первые тропы между фарфоровыми садами и солнечными уступами.', order: 1, color: '#72c7aa', image: '/art/terraces.png', sceneFilter: 'none' },
    { id: 'glassgarden', name: 'Стеклосад', subtitle: 'Память в прозрачных стволах', description: 'Лес растёт из застывшего звона. В его сердцевине ещё слышны голоса прежних шовников.', order: 2, color: '#69bed4', image: '/art/terraces.png', sceneFilter: 'hue-rotate(38deg) saturate(1.12)' },
    { id: 'carmine', name: 'Карминные поймы', subtitle: 'Реки живой нити', description: 'Багряные течения несут целые узоры. Шлюз удерживает их от последнего разрыва.', order: 3, color: '#de7394', image: '/art/terraces.png', sceneFilter: 'hue-rotate(300deg) saturate(1.12)' },
  ],
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
    { id: 'sunny', regionId: 'terraces', name: 'Солнечный тракт', subtitle: 'Белые террасы · I', description: 'Путь через цветущую керамику. Стражи бьют размеренно, стеклянные осколки оставляют снимаемые следы.', difficulty: 1, enemyIds: ['porcelain', 'splinter', 'gardener'], reward: { coins: 1200, thread: 24, catalyst: 0, xp: 21600 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 8, unlockWins: 0, unlockLevel: 1, boss: false, color: '#72c7aa' },
    { id: 'glass', regionId: 'terraces', name: 'Стеклянный уступ', subtitle: 'Белые террасы · II', description: 'Острые гребни над трактом. Тяжёлые удары объявляются заранее, и тактика решает исход.', difficulty: 2, enemyIds: ['keeper', 'rose', 'loom'], reward: { coins: 3600, thread: 72, catalyst: 2, xp: 36000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 12, unlockWins: 5, unlockLevel: 10, boss: false, color: '#ec829b' },
    { id: 'tower', regionId: 'terraces', name: 'Башня шва', subtitle: 'Белые террасы · Босс', description: 'Певчий раскола усиливает удары по мере потери здоровья. На подготовку защиты есть две секунды.', difficulty: 3, enemyIds: ['cantor'], reward: { coins: 4200, thread: 84, catalyst: 3, xp: 42000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 16, unlockWins: 5, unlockLevel: 12, boss: true, color: '#e6bd64' },
    { id: 'glasswood', regionId: 'glassgarden', name: 'Лес звенящих стволов', subtitle: 'Стеклосад · I', description: 'Прозрачные дозорные охраняют вход в лес. Между тяжёлыми ударами стекает едкая стеклянная роса.', difficulty: 4, enemyIds: ['barkguard', 'chime', 'dewweaver'], reward: { coins: 4800, thread: 96, catalyst: 3, xp: 43200 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 20, unlockWins: 5, unlockLevel: 16, boss: false, color: '#69bed4' },
    { id: 'dew', regionId: 'glassgarden', name: 'Росные чаши', subtitle: 'Стеклосад · II', description: 'В чашах собираются осколки памяти. Частые выпады сменяются медленными ударами тяжёлых хранителей.', difficulty: 5, enemyIds: ['cupkeeper', 'dewsplinter', 'memoryweaver'], reward: { coins: 5600, thread: 112, catalyst: 3, xp: 45600 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 24, unlockWins: 5, unlockLevel: 20, boss: false, color: '#8dc69a' },
    { id: 'heartwood', regionId: 'glassgarden', name: 'Сердцевина стекла', subtitle: 'Стеклосад · Босс', description: 'Хор сердцевины ускоряет распад леса. Его раскалывающие удары требуют лечения и заранее подготовленной защиты.', difficulty: 6, enemyIds: ['heartchoir'], reward: { coins: 6400, thread: 128, catalyst: 4, xp: 48000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 26, unlockWins: 5, unlockLevel: 24, boss: true, color: '#7cace0' },
    { id: 'carmine', regionId: 'carmine', name: 'Карминный разлив', subtitle: 'Карминные поймы · I', description: 'Резонансная нить проступает сквозь берега. Устойчивый комплект и очищение открывают путь против течения.', difficulty: 7, enemyIds: ['bankguard', 'redshard', 'floodweaver'], reward: { coins: 8000, thread: 160, catalyst: 6, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 29, unlockWins: 5, unlockLevel: 25, boss: false, resonant: true, color: '#de7394' },
    { id: 'weft', regionId: 'carmine', name: 'Нитяные протоки', subtitle: 'Карминные поймы · II', description: 'Нити сжимают русло и оставляют глубокие следы. Очищение снимает накопленный урон, защита выдерживает напор.', difficulty: 8, enemyIds: ['weftguard', 'scarletshard', 'knotweaver'], reward: { coins: 8800, thread: 176, catalyst: 6, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 33, unlockWins: 5, unlockLevel: 30, boss: false, resonant: true, color: '#d987ad' },
    { id: 'floodgate', regionId: 'carmine', name: 'Багряный шлюз', subtitle: 'Карминные поймы · Босс', description: 'Смотритель шлюза с каждым расколом бьёт сильнее. Лечение и щиты важнее короткого всплеска урона.', difficulty: 9, enemyIds: ['lockmaster'], reward: { coins: 9600, thread: 192, catalyst: 7, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 36, unlockWins: 5, unlockLevel: 35, boss: true, resonant: true, color: '#dc7790' },
  ],
  enemies: [
    { id: 'porcelain', name: 'Фарфоровый дозорный', level: 8, hp: 1950, power: 115, armor: 75, intervalMs: 2100, kind: 'sentinel', mechanic: 'regular', description: 'Ровные удары. Проверяет устойчивость сборки.' },
    { id: 'splinter', name: 'Живой осколок', level: 8, hp: 1750, power: 105, armor: 45, intervalMs: 2000, kind: 'shard', mechanic: 'dot', description: 'Каждый третий удар оставляет снимаемый след.' },
    { id: 'gardener', name: 'Садовник трещин', level: 9, hp: 2350, power: 140, armor: 110, intervalMs: 3000, kind: 'weaver', mechanic: 'heavy', description: 'Объявляет каждый третий тяжёлый удар за две секунды.' },
    { id: 'keeper', name: 'Хранитель уступа', level: 12, hp: 3600, power: 205, armor: 170, intervalMs: 2300, kind: 'sentinel', mechanic: 'heavy', description: 'Толстая керамика и редкие удары двойной силы.' },
    { id: 'rose', name: 'Стеклянная роза', level: 12, hp: 3150, power: 175, armor: 75, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые острые выпады оставляют мало времени на разгон.' },
    { id: 'loom', name: 'Ткач багряной нити', level: 13, hp: 4100, power: 155, armor: 95, intervalMs: 2000, kind: 'weaver', mechanic: 'dot', description: 'Следы постепенно истощают героя; очищение снимает их все.' },
    { id: 'cantor', name: 'Певчий раскола', level: 16, hp: 9200, power: 245, armor: 200, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'На 65% и 30% здоровья усиливает удары. Каждый второй удар тяжёлый.' },
    { id: 'barkguard', name: 'Страж прозрачной коры', level: 16, hp: 6600, power: 240, armor: 180, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Каждый третий удар раскалывает щит. Подготовка занимает две секунды.' },
    { id: 'chime', name: 'Блуждающий перезвон', level: 16, hp: 6600, power: 240, armor: 180, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые ровные удары требуют постоянной устойчивости.' },
    { id: 'dewweaver', name: 'Собиратель росы', level: 17, hp: 7260, power: 240, armor: 180, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Каждый третий удар оставляет едкий снимаемый след.' },
    { id: 'cupkeeper', name: 'Хранитель росных чаш', level: 20, hp: 8300, power: 285, armor: 220, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Тяжёлый удар объявлен заранее; щит даёт время восстановиться.' },
    { id: 'dewsplinter', name: 'Росный осколок', level: 20, hp: 8300, power: 285, armor: 220, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Частые выпады мешают медленной сборке пережить разгон.' },
    { id: 'memoryweaver', name: 'Ткач стеклянной памяти', level: 21, hp: 9130, power: 285, armor: 220, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Накопленные следы истощают героя; очищение снимает их все.' },
    { id: 'heartchoir', name: 'Хор сердцевины', level: 24, hp: 14500, power: 325, armor: 260, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'Каждый второй удар тяжёлый; на 65% и 30% здоровья сила хора растёт.' },
    { id: 'bankguard', name: 'Страж багряного берега', level: 25, hp: 10300, power: 345, armor: 260, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Напор разлива усиливает каждый третий удар.' },
    { id: 'redshard', name: 'Карминный осколок', level: 25, hp: 10300, power: 345, armor: 260, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Ровный поток быстрых ударов проверяет лечение.' },
    { id: 'floodweaver', name: 'Ткач половодья', level: 26, hp: 11330, power: 345, armor: 260, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Три следа быстро истощают здоровье без своевременного очищения.' },
    { id: 'weftguard', name: 'Дозорный переплетения', level: 30, hp: 12500, power: 400, armor: 300, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Объявляет тяжёлые удары, давая две секунды на щит.' },
    { id: 'scarletshard', name: 'Алый скол', level: 30, hp: 12500, power: 400, armor: 300, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые острые удары не оставляют длинных пауз.' },
    { id: 'knotweaver', name: 'Узловой ткач', level: 31, hp: 13750, power: 400, armor: 300, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Узлы оставляют снимаемые следы; очищение важнее дополнительного урона.' },
    { id: 'lockmaster', name: 'Смотритель шлюза', level: 35, hp: 21000, power: 430, armor: 340, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'Каждый второй удар тяжёлый. Дважды усиливается по мере потери здоровья.' },
  ],
  upgradeCosts: [
    { coins: 200, thread: 4, catalyst: 0 }, { coins: 400, thread: 8, catalyst: 0 }, { coins: 800, thread: 16, catalyst: 0 },
    { coins: 1600, thread: 32, catalyst: 1 }, { coins: 2600, thread: 52, catalyst: 2 }, { coins: 4000, thread: 80, catalyst: 3 },
    { coins: 6000, thread: 120, catalyst: 6 }, { coins: 8500, thread: 170, catalyst: 10 }, { coins: 12000, thread: 240, catalyst: 14 },
    { coins: 17000, thread: 340, catalyst: 20 }, { coins: 24000, thread: 480, catalyst: 28 }, { coins: 34000, thread: 680, catalyst: 40 },
  ],
};
