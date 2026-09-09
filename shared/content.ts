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
    { id: 'terraces', name: 'Зеленолесье', subtitle: 'Дорога первых приключений', description: 'Лесные тропы, разбойничьи лагеря и крепость гоблинов за зелёными холмами.', order: 1, color: '#72c7aa', image: '/art/fantasy/terraces.png', sceneFilter: 'none' },
    { id: 'glassgarden', name: 'Морозные горы', subtitle: 'Снег, камень и древняя магия', description: 'Снежные перевалы ведут к ледяным пещерам и трону великана.', order: 2, color: '#69bed4', image: '/art/fantasy/glassgarden.png', sceneFilter: 'none' },
    { id: 'carmine', name: 'Пепельные земли', subtitle: 'Испытание огнём', description: 'За лавовыми реками стоит огненная цитадель. В её недрах просыпается дракон.', order: 3, color: '#de7394', image: '/art/fantasy/carmine.png', sceneFilter: 'none' },
  ],
  slotNames: { weapon: 'Оружие', focus: 'Талисман', head: 'Шлем', armor: 'Доспех', gloves: 'Перчатки', boots: 'Сапоги', amulet: 'Амулет', ring: 'Кольцо' },
  familyNames: { blade: 'Меч · Воин', glass: 'Посох · Маг', needle: 'Лук · Лучник' },
  affixNames: { hp: 'Здоровье · +4% здоровья', armor: 'Броня · +5% защиты', haste: 'Скорость · +3% скорости', crit: 'Критический удар · +3% крита', direct: 'Сила удара · +3% прямого урона', dot: 'Яд · +5% периодического урона', support: 'Исцеление · +4% лечения и щитов' },
  rarityNames: { common: 'Обычный', fine: 'Редкий', resonant: 'Эпический', named: 'Легендарный' },
  skills: [
    { id: 'ringing', name: 'Удар мечом', family: 'blade', description: '180% силы прямым уроном.', cooldown: 5, unlockLevel: 1, icon: 'swords' },
    { id: 'wedge', name: 'Удар щитом', family: 'blade', description: '90% силы уроном и щит 80% силы на 4 с.', cooldown: 8, unlockLevel: 1, icon: 'shield' },
    { id: 'counter', name: 'Контратака', family: 'blade', description: '160% силы уроном. Входящий урон −10% на 3 с.', cooldown: 10, unlockLevel: 5, icon: 'shield-check' },
    { id: 'fracture', name: 'Мощный удар', family: 'blade', description: '280% силы прямым уроном.', cooldown: 12, unlockLevel: 10, icon: 'sword' },
    { id: 'shard', name: 'Огненный шар', family: 'glass', description: '220% силы прямым уроном.', cooldown: 6, unlockLevel: 1, icon: 'flame' },
    { id: 'lens', name: 'Ледяная стрела', family: 'glass', description: '100% силы уроном. Уязвимость: входящий урон врага +8% на 6 с.', cooldown: 8, unlockLevel: 1, icon: 'snowflake' },
    { id: 'flash', name: 'Огненная буря', family: 'glass', description: '300% силы уроном; 360% против уязвимой цели.', cooldown: 12, unlockLevel: 5, icon: 'flame' },
    { id: 'shell', name: 'Ледяной щит', family: 'glass', description: '100% силы уроном и щит 70% силы на 5 с.', cooldown: 10, unlockLevel: 10, icon: 'shield' },
    { id: 'stitch', name: 'Ядовитая стрела', family: 'needle', description: '70% силы уроном и яд: 25% силы каждую секунду, 6 с.', cooldown: 4, unlockLevel: 1, icon: 'bow' },
    { id: 'spool', name: 'Отравленный выстрел', family: 'needle', description: '140% силы уроном и один заряд яда. Не больше трёх зарядов.', cooldown: 8, unlockLevel: 1, icon: 'target' },
    { id: 'fasten', name: 'Охотничий азарт', family: 'needle', description: '200% силы уроном; при трёх зарядах яда лечит на 80% силы.', cooldown: 12, unlockLevel: 5, icon: 'heart-pulse' },
    { id: 'cut', name: 'Смертельный выстрел', family: 'needle', description: '220% силы +60% за каждый снятый заряд яда. Снимает весь яд.', cooldown: 10, unlockLevel: 10, icon: 'crosshair' },
    { id: 'mend', name: 'Исцеление', family: 'common', description: 'Восстанавливает здоровье на 140% силы.', cooldown: 14, unlockLevel: 1, icon: 'heart' },
    { id: 'barrier', name: 'Защитный барьер', family: 'common', description: 'Щит 150% силы на 5 с; общий предел 35% здоровья.', cooldown: 14, unlockLevel: 1, icon: 'shield-plus' },
    { id: 'cleanse', name: 'Очищение', family: 'common', description: 'Снимает все отрицательные эффекты с героя.', cooldown: 16, unlockLevel: 10, icon: 'sparkles' },
    { id: 'hush', name: 'Ослабляющий удар', family: 'common', description: '110% силы уроном. Исходящий урон врага −10% на 4 с.', cooldown: 12, unlockLevel: 10, icon: 'swords' },
  ],
  routes: [
    { id: 'sunny', regionId: 'terraces', name: 'Лесная тропа', subtitle: 'Зеленолесье · I', description: 'Гоблины и слизни прячутся у лесной дороги. Место для первых побед и знакомства с умениями.', difficulty: 1, enemyIds: ['porcelain', 'splinter', 'gardener'], reward: { coins: 1200, thread: 24, catalyst: 0, xp: 21600 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 8, unlockWins: 0, unlockLevel: 1, boss: false, color: '#72c7aa' },
    { id: 'glass', regionId: 'terraces', name: 'Лагерь разбойников', subtitle: 'Зеленолесье · II', description: 'Разбойники заняли старый лагерь. От тяжёлых ударов спасают щиты, от яда — очищение.', difficulty: 2, enemyIds: ['keeper', 'rose', 'loom'], reward: { coins: 3600, thread: 72, catalyst: 2, xp: 36000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 12, unlockWins: 5, unlockLevel: 10, boss: false, color: '#ec829b' },
    { id: 'tower', regionId: 'terraces', name: 'Крепость гоблинов', subtitle: 'Зеленолесье · Босс', description: 'Король гоблинов усиливает удары по мере потери здоровья. На подготовку защиты есть две секунды.', difficulty: 3, enemyIds: ['cantor'], reward: { coins: 4200, thread: 84, catalyst: 3, xp: 42000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 16, unlockWins: 5, unlockLevel: 12, boss: true, color: '#e6bd64' },
    { id: 'glasswood', regionId: 'glassgarden', name: 'Снежный перевал', subtitle: 'Морозные горы · I', description: 'Снежные волки, тролли и колдуны охраняют горный проход. Пригодятся стойкость и очищение.', difficulty: 4, enemyIds: ['barkguard', 'chime', 'dewweaver'], reward: { coins: 4800, thread: 96, catalyst: 3, xp: 43200 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 20, unlockWins: 5, unlockLevel: 16, boss: false, color: '#69bed4' },
    { id: 'dew', regionId: 'glassgarden', name: 'Ледяные пещеры', subtitle: 'Морозные горы · II', description: 'Под горой скрываются ледяные големы и тёмные маги. Частые выпады сменяются тяжёлыми ударами.', difficulty: 5, enemyIds: ['cupkeeper', 'dewsplinter', 'memoryweaver'], reward: { coins: 5600, thread: 112, catalyst: 3, xp: 45600 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 24, unlockWins: 5, unlockLevel: 20, boss: false, color: '#8dc69a' },
    { id: 'heartwood', regionId: 'glassgarden', name: 'Трон великана', subtitle: 'Морозные горы · Босс', description: 'Ледяной великан охраняет вершину. Его тяжёлые удары требуют лечения и заранее подготовленной защиты.', difficulty: 6, enemyIds: ['heartchoir'], reward: { coins: 6400, thread: 128, catalyst: 4, xp: 48000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 26, unlockWins: 5, unlockLevel: 24, boss: true, color: '#7cace0' },
    { id: 'carmine', regionId: 'carmine', name: 'Пепельный тракт', subtitle: 'Пепельные земли · I', description: 'Орки и огненные духи заняли дорогу к вулкану. Здесь добывают эпическое снаряжение.', difficulty: 7, enemyIds: ['bankguard', 'redshard', 'floodweaver'], reward: { coins: 8000, thread: 160, catalyst: 6, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 29, unlockWins: 5, unlockLevel: 25, boss: false, resonant: true, color: '#de7394' },
    { id: 'weft', regionId: 'carmine', name: 'Огненная цитадель', subtitle: 'Пепельные земли · II', description: 'Чёрные рыцари и культисты защищают цитадель. Очищение снимает ожоги, защита выдерживает натиск.', difficulty: 8, enemyIds: ['weftguard', 'scarletshard', 'knotweaver'], reward: { coins: 8800, thread: 176, catalyst: 6, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 33, unlockWins: 5, unlockLevel: 30, boss: false, resonant: true, color: '#d987ad' },
    { id: 'floodgate', regionId: 'carmine', name: 'Логово дракона', subtitle: 'Пепельные земли · Босс', description: 'Пепельный дракон становится опаснее по мере потери здоровья. Лечение и щиты помогут пережить его ярость.', difficulty: 9, enemyIds: ['lockmaster'], reward: { coins: 9600, thread: 192, catalyst: 7, xp: 84000 }, rewardPeriodMs: 86_400_000, lootIntervalMs: 1_800_000, itemLevel: 36, unlockWins: 5, unlockLevel: 35, boss: true, resonant: true, color: '#dc7790' },
  ],
  enemies: [
    { id: 'porcelain', name: 'Лесной гоблин', level: 8, hp: 1950, power: 115, armor: 75, intervalMs: 2100, kind: 'sentinel', mechanic: 'regular', description: 'Ровные удары. Проверяет устойчивость сборки.' },
    { id: 'splinter', name: 'Ядовитый слизень', level: 8, hp: 1750, power: 105, armor: 45, intervalMs: 2000, kind: 'shard', mechanic: 'dot', description: 'Каждый третий удар отравляет героя. Яд можно снять очищением.' },
    { id: 'gardener', name: 'Гоблин-громила', level: 9, hp: 2350, power: 140, armor: 110, intervalMs: 3000, kind: 'weaver', mechanic: 'heavy', description: 'Объявляет каждый третий тяжёлый удар за две секунды.' },
    { id: 'keeper', name: 'Разбойник-щитоносец', level: 12, hp: 3600, power: 205, armor: 170, intervalMs: 2300, kind: 'sentinel', mechanic: 'heavy', description: 'Крепкая броня и редкие удары двойной силы.' },
    { id: 'rose', name: 'Лесной волк', level: 12, hp: 3150, power: 175, armor: 75, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые острые выпады оставляют мало времени на разгон.' },
    { id: 'loom', name: 'Разбойник-алхимик', level: 13, hp: 4100, power: 155, armor: 95, intervalMs: 2000, kind: 'weaver', mechanic: 'dot', description: 'Яд постепенно истощает героя; очищение снимает его.' },
    { id: 'cantor', name: 'Король гоблинов', level: 16, hp: 9200, power: 245, armor: 200, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'На 65% и 30% здоровья усиливает удары. Каждый второй удар тяжёлый.' },
    { id: 'barkguard', name: 'Снежный тролль', level: 16, hp: 6600, power: 240, armor: 180, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Каждый третий удар наносит двойной урон. Подготовка занимает две секунды.' },
    { id: 'chime', name: 'Снежный волк', level: 16, hp: 6600, power: 240, armor: 180, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые ровные удары требуют постоянной устойчивости.' },
    { id: 'dewweaver', name: 'Морозный колдун', level: 17, hp: 7260, power: 240, armor: 180, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Каждый третий удар накладывает снимаемое обморожение.' },
    { id: 'cupkeeper', name: 'Ледяной голем', level: 20, hp: 8300, power: 285, armor: 220, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Тяжёлый удар объявлен заранее; щит даёт время восстановиться.' },
    { id: 'dewsplinter', name: 'Ледяной дух', level: 20, hp: 8300, power: 285, armor: 220, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Частые выпады мешают медленной сборке пережить разгон.' },
    { id: 'memoryweaver', name: 'Скелет-маг', level: 21, hp: 9130, power: 285, armor: 220, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Проклятие истощает героя; очищение снимает его.' },
    { id: 'heartchoir', name: 'Ледяной великан', level: 24, hp: 14500, power: 325, armor: 260, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'Каждый второй удар тяжёлый; на 65% и 30% здоровья сила великана растёт.' },
    { id: 'bankguard', name: 'Орк-берсерк', level: 25, hp: 10300, power: 345, armor: 260, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Каждый третий удар берсерка наносит двойной урон.' },
    { id: 'redshard', name: 'Огненный дух', level: 25, hp: 10300, power: 345, armor: 260, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Ровный поток быстрых ударов проверяет лечение.' },
    { id: 'floodweaver', name: 'Пепельный шаман', level: 26, hp: 11330, power: 345, armor: 260, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Ожоги истощают здоровье без своевременного очищения.' },
    { id: 'weftguard', name: 'Чёрный рыцарь', level: 30, hp: 12500, power: 400, armor: 300, intervalMs: 3000, kind: 'sentinel', mechanic: 'heavy', description: 'Объявляет тяжёлые удары, давая две секунды на щит.' },
    { id: 'scarletshard', name: 'Огненная гончая', level: 30, hp: 12500, power: 400, armor: 300, intervalMs: 1700, kind: 'shard', mechanic: 'regular', description: 'Быстрые острые удары не оставляют длинных пауз.' },
    { id: 'knotweaver', name: 'Культист пламени', level: 31, hp: 13750, power: 400, armor: 300, intervalMs: 2200, kind: 'weaver', mechanic: 'dot', description: 'Заклинания оставляют ожоги; очищение помогает пережить их.' },
    { id: 'lockmaster', name: 'Пепельный дракон', level: 35, hp: 21000, power: 430, armor: 340, intervalMs: 3000, kind: 'boss', mechanic: 'heavy', description: 'Каждый второй удар тяжёлый. Дважды усиливается по мере потери здоровья.' },
  ],
  upgradeCosts: [
    { coins: 200, thread: 4, catalyst: 0 }, { coins: 400, thread: 8, catalyst: 0 }, { coins: 800, thread: 16, catalyst: 0 },
    { coins: 1600, thread: 32, catalyst: 1 }, { coins: 2600, thread: 52, catalyst: 2 }, { coins: 4000, thread: 80, catalyst: 3 },
    { coins: 6000, thread: 120, catalyst: 6 }, { coins: 8500, thread: 170, catalyst: 10 }, { coins: 12000, thread: 240, catalyst: 14 },
    { coins: 17000, thread: 340, catalyst: 20 }, { coins: 24000, thread: 480, catalyst: 28 }, { coins: 34000, thread: 680, catalyst: 40 },
  ],
};
