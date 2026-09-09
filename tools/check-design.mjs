import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const model = JSON.parse(await readFile(resolve(root, 'model/balance.json'), 'utf8'));
let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}
function close(actual, expected, message) {
  check(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
}
const currencies = model.currencies;
check(new Set(currencies).size === 3, 'Exactly three distinct economic currencies');
check(model.slotCount === 8 && model.heroLevelCap === 100, 'Hero and slot limits');
check(model.maxUpgradeLevel === 12, 'Upgrade cap');
check(model.offlineRewardWindowHours === 48 && model.restIncomeMultiplier === 0, 'Autonomy contract');
close(model.upgradeBaseStatIncreasePerLevel * model.maxUpgradeLevel, 0.18, 'Max base bonus');

const sumCosts = (costs) => Object.fromEntries(currencies.map(currency => [
  currency, costs.reduce((total, cost) => total + cost[currency], 0),
]));
const multiplyCost = (cost, count) => Object.fromEntries(currencies.map(currency => [currency, cost[currency] * count]));
const incomeAt = (level) => model.dailyReferenceIncome.find(row => row.minLevel <= level && level <= row.maxLevel);
const daysTo = (cost, income) => Math.max(...currencies.map(currency => {
  if (cost[currency] === 0) return 0;
  return income[currency] === 0 ? Infinity : cost[currency] / income[currency];
}));
const upgradeCost = (example) => multiplyCost(sumCosts(model.upgradeCosts.filter(row =>
  row.level > example.fromUpgrade && row.level <= example.toUpgrade)), example.slotCount);
function compareCosts(actual, expected, label) {
  for (const currency of currencies) close(actual[currency], expected[currency], `${label}/${currency}`);
}

let hours = 0;
let transitions = 0;
let nextLevel = 1;
let lastLevelHours = 0;
for (const band of model.progression.bands) {
  check(band.fromLevel === nextLevel, 'No missing or overlapping XP band');
  const count = band.toLevel - band.fromLevel;
  check(count > 1, 'Interpolated band needs at least two transitions');
  let bandHours = 0;
  for (let index = 0; index < count; index += 1) {
    const levelHours = band.firstLevelHours + (band.lastLevelHours - band.firstLevelHours) * index / (count - 1);
    check(levelHours >= lastLevelHours - 1e-7, 'Level time must not decrease');
    const xp = levelHours * band.referenceXpPerHour;
    close(xp, Math.round(xp), 'XP threshold supports integer accounting');
    lastLevelHours = levelHours;
    bandHours += levelHours;
  }
  close(bandHours, band.totalHours, 'XP band total');
  hours += bandHours;
  transitions += count;
  nextLevel = band.toLevel;
}
close(hours, model.progression.targetTotalHours, 'Total progression hours');
check(nextLevel === model.heroLevelCap && transitions === 99, 'Exactly 99 level transitions');
for (let level = 1; level <= model.heroLevelCap; level += 1) {
  const matches = model.dailyReferenceIncome.filter(row => row.minLevel <= level && level <= row.maxLevel);
  check(matches.length === 1, `Exactly one reference income for level ${level}`);
  for (const currency of currencies) check(Number.isInteger(matches[0][currency]) && matches[0][currency] >= 0, 'Nonnegative integer income');
}
check(model.upgradeCosts.length === model.maxUpgradeLevel, 'One price per upgrade level');
for (const [index, cost] of model.upgradeCosts.entries()) {
  check(cost.level === index + 1, 'Upgrade levels are ordered and complete');
  for (const currency of currencies) {
    check(Number.isInteger(cost[currency]) && cost[currency] >= 0, 'Nonnegative integer cost');
    if (index > 0) check(cost[currency] >= model.upgradeCosts[index - 1][currency], 'Upgrade prices do not decrease');
  }
}
for (const unlock of model.upgradeUnlocks) {
  for (const cost of model.upgradeCosts.filter(row => row.level <= unlock.maxUpgradeLevel)) {
    check(Number.isFinite(daysTo(cost, incomeAt(unlock.heroLevel))), 'Unlocked upgrade has a producible resource path');
  }
}

const examples = model.examples;
const reference = incomeAt(examples.referenceHeroLevel);
compareCosts(reference, examples.referenceDailyIncome, 'Reference income');
for (const name of ['meaningfulUpgrade', 'setUpgrade', 'fullUpgrade', 'lateUpgrade']) {
  const example = examples[name];
  const cost = upgradeCost(example);
  compareCosts(cost, example.expectedCost, name);
  const income = incomeAt(example.referenceHeroLevel ?? examples.referenceHeroLevel);
  const days = daysTo(cost, income);
  close(days, example.expectedDays ?? example.expectedDaysAtReferenceIncome ?? example.expectedHours / 24, `${name} duration`);
  if (example.expectedRemainder) {
    compareCosts(Object.fromEntries(currencies.map(currency => [currency, income[currency] * days - cost[currency]])), example.expectedRemainder, `${name} remainder`);
  }
}
close(daysTo(model.crafting.resonant, reference) * 24, examples.resonantCraft.expectedHoursAtReferenceIncome, 'Single resonant craft');
close(daysTo(multiplyCost(model.crafting.resonant, examples.resonantSetCraft.count), reference), examples.resonantSetCraft.expectedDaysAtReferenceIncome, 'Resonant set craft');
const combined = sumCosts([upgradeCost(examples.setCraftAndUpgrade), multiplyCost(model.crafting.resonant, examples.setCraftAndUpgrade.craftCount)]);
close(daysTo(combined, reference), examples.setCraftAndUpgrade.expectedDaysAtReferenceIncome, 'Craft and upgrade share the same resources');
const reforgeCost = (from, to) => {
  const delta = to ** 2 - from ** 2;
  return {
    coins: model.reforge.coinsPerSquaredGearLevelDelta * delta,
    thread: Math.ceil(model.reforge.threadPerSquaredGearLevelDelta * delta),
    catalyst: model.reforge.catalystCost,
  };
};
const reforge = reforgeCost(examples.reforge.fromGearLevel, examples.reforge.toGearLevel);
compareCosts(reforge, examples.reforge.expectedCost, 'Reforge example');
close(daysTo(reforge, reference) * 24, examples.reforge.expectedHoursAtReferenceIncome, 'Reforge duration');

// Check resource creation through direct crafting and through all upward reforges.
for (let ilvl = 1; ilvl <= model.gearLevelCap; ilvl += 1) {
  const baseSalvage = Math.ceil(ilvl / 10);
  for (const rarity of ['fine', 'resonant', 'named']) {
    const recipe = model.crafting[rarity];
    const spentThread = rarity === 'fine'
      ? Math.max(recipe.threadBase, model.salvage.rarityMultipliers.fine * baseSalvage + recipe.threadSalvageMargin)
      : recipe.thread;
    for (let target = ilvl; target <= model.gearLevelCap; target += 1) {
      const returned = Math.ceil(target / 10) * model.salvage.rarityMultipliers[rarity];
      check(spentThread + reforgeCost(ilvl, target).thread > returned, `No material creation: ${rarity} ${ilvl}->${target}`);
    }
  }
}

const documentPaths = ['README.md', ...(await readdir(resolve(root, 'docs'))).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const loot = model.loot;
check(loot.slots.length === model.slotCount && new Set(loot.slots).size === model.slotCount, 'Loot covers all distinct slots');
check(Number.isInteger(loot.winsPerItem) && loot.winsPerItem > 0, 'Item counter has a finite positive threshold');
check(!loot.countIndividualWaves && !loot.countLosses, 'Only completed won encounters advance loot');
check(loot.counterPersistsOnLogout && loot.counterPersistsOnRouteChange && !loot.counterTransfersBetweenRoutes, 'Loot counters preserve progress without cheap route transfer');
const weights = Object.values(loot.rarityWeights);
check(weights.every(weight => Number.isInteger(weight) && weight >= 0), 'Rarity weights are nonnegative integers');
close(weights.reduce((sum, value) => sum + value, 0), 100, 'Rarity weights sum to 100');
close(loot.slotTargeting.targetSlotProbability + loot.slotTargeting.remainingProbability, 1, 'Targeted slot probabilities sum to one');
check(loot.slotTargeting.targetSlotProbability >= 0 && loot.slotTargeting.targetSlotProbability <= 1, 'Valid targeted slot probability');
check(loot.rarityEligibility.named.allowedSlots.every(slot => loot.slots.includes(slot)), 'Named slots exist');
check(loot.affixValuesRolled && JSON.stringify(loot.affixRolls.valuesPercent) === '[80,90,100,110,120]', 'Dropped affix rolls use the bounded 80-120% range');
close(loot.affixRolls.valuesPercent.reduce((sum, value) => sum + value, 0) / loot.affixRolls.valuesPercent.length, loot.affixRolls.legacyAndCraftPercent, 'Mean drop roll equals legacy and crafted bonuses');
check(loot.affixRolls.reforgePreservesRolls && loot.affixRolls.totalBonusCapsUnchanged, 'Reforging preserves rolls and total bonus limits');
for (let enabled = 0; enabled < 8; enabled += 1) {
  let commonWeight = loot.rarityWeights.common;
  let availableWeight = 0;
  for (const [index, rarity] of ['fine', 'resonant', 'named'].entries()) {
    if (enabled & (1 << index)) availableWeight += loot.rarityWeights[rarity];
    else commonWeight += loot.rarityWeights[rarity];
  }
  close(commonWeight + availableWeight, 100, 'Unavailable rarity weights preserve the distribution');
}
for (let cap = 1; cap <= model.gearLevelCap; cap += 1) {
  const lower = Math.max(loot.gearLevel.minLevel, cap - loot.gearLevel.maxOffsetBelowUpperBound);
  check(lower >= 1 && lower <= cap && cap <= model.gearLevelCap, 'Drop level stays within unlocked bounds');
}
let localLinks = 0;
for (const documentPath of documentPaths) {
  const body = await readFile(resolve(root, documentPath), 'utf8');
  for (const match of body.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    await access(resolve(root, dirname(documentPath), target));
    localLinks += 1;
  }
}

console.log(JSON.stringify({
  status: 'passed', checks, documents: documentPaths.length, localLinks,
  progressionHours: Math.round(hours), progressionDays: hours / 24,
  oneSlotUpgradeHours: daysTo(upgradeCost(examples.meaningfulUpgrade), reference) * 24,
  eightSlotUpgradeDays: daysTo(upgradeCost(examples.setUpgrade), reference),
  craftAndUpgradeDays: daysTo(combined, reference),
  scope: 'Arithmetic and document links only. Combat, retention and server behavior are not simulated.',
}, null, 2));
