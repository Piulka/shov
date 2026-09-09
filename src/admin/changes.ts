import type {
  AdminOperation,
  AdminPlayerDetail,
  AdminItemInput,
} from "../../shared/admin";
import type { Build, Catalog, Item } from "../../shared/types";
import { number } from "./ui";

export interface ChangeRow {
  label: string;
  before: string;
  after: string;
}
export const operationNames: Record<AdminOperation["type"], string> = {
  profile: "Профиль",
  wallet: "Ресурсы",
  upgrades: "Усиления слотов",
  route: "Маршрут",
  mode: "Режим пути",
  target: "Целевая добыча",
  item_add: "Выдача предмета",
  item_update: "Изменение предмета",
  item_delete: "Удаление предмета",
  equip: "Смена экипировки",
  build: "Активная сборка",
  preset: "Сохранённая сборка",
  block: "Доступ к игре",
};
export const modeName = (mode: string) =>
  mode === "push" ? "Продвижение" : "Добыча";

export function describeChanges(
  player: AdminPlayerDetail,
  operations: AdminOperation[],
  catalog: Catalog,
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const state = player.state;
  const itemName = (id: string | undefined) =>
    state.inventory.find((item) => item.id === id)?.name ?? id ?? "Нет";
  const skillNames = (ids: string[]) =>
    ids
      .map((id) => catalog.skills.find((skill) => skill.id === id)?.name ?? id)
      .join(", ");
  const row = (
    label: string,
    before: string | number | undefined | null,
    after: string | number | undefined | null,
  ) => {
    const text = (value: typeof before) =>
      typeof value === "number" ? number(value) : value || "Нет";
    if (text(before) !== text(after))
      rows.push({ label, before: text(before), after: text(after) });
  };
  const describeItem = (before: Item | undefined, after: AdminItemInput) => {
    row("Название предмета", before?.name, after.name);
    row(
      "Слот",
      before && catalog.slotNames[before.slot],
      catalog.slotNames[after.slot],
    );
    row("Уровень предмета", before?.level, after.level);
    row(
      "Качество",
      before && catalog.rarityNames[before.rarity],
      catalog.rarityNames[after.rarity],
    );
    row(
      "Оружие",
      before?.family && catalog.familyNames[before.family],
      after.family && catalog.familyNames[after.family],
    );
    row(
      "Свойства",
      before?.affixes.map((affix) => catalog.affixNames[affix]).join(", "),
      after.affixes.map((affix) => catalog.affixNames[affix]).join(", "),
    );
    const special = (value: string | undefined) =>
      value === "long_thread"
        ? "Длинная нить"
        : value === "mirror"
          ? "Зеркало"
          : "Нет";
    row("Особое свойство", special(before?.special), special(after.special));
    row(
      "Защита от разбора",
      before?.locked ? "Да" : "Нет",
      after.locked ? "Да" : "Нет",
    );
  };
  const describeBuild = (before: Build | undefined, after: Build) => {
    row("Название сборки", before?.name, after.name);
    for (const slot of catalog.slots)
      row(
        catalog.slotNames[slot],
        before && itemName(before.equipment[slot]),
        itemName(after.equipment[slot]),
      );
    row(
      "Умения",
      before && skillNames(before.skills),
      skillNames(after.skills),
    );
    for (
      let index = 0;
      index < Math.max(before?.rules.length ?? 0, after.rules.length);
      index++
    ) {
      const text = (rule: Build["rules"][number] | undefined) =>
        rule
          ? `${conditionNames[rule.condition]}${rule.condition === "hp_below" ? ` ${rule.threshold}%` : ""}: ${skillNames([rule.skillId])}`
          : "Нет";
      row(
        `Правило ${index + 1}`,
        text(before?.rules[index]),
        text(after.rules[index]),
      );
    }
  };
  for (const operation of operations) {
    switch (operation.type) {
      case "profile":
        if (operation.name !== undefined)
          row("Имя героя", state.name, operation.name);
        if (operation.publicName !== undefined)
          row("Имя в сообществе", player.publicName, operation.publicName);
        if (operation.level !== undefined)
          row("Уровень героя", state.level, operation.level);
        if (operation.xp !== undefined)
          row("Опыт на уровне", state.xp, operation.xp);
        break;
      case "wallet":
        for (const key of ["coins", "thread", "catalyst"] as const)
          if (operation.values[key] !== undefined)
            row(walletNames[key], state.wallet[key], operation.values[key]);
        break;
      case "upgrades":
        for (const slot of catalog.slots)
          if (operation.values[slot] !== undefined)
            row(
              catalog.slotNames[slot],
              state.upgrades[slot],
              operation.values[slot],
            );
        break;
      case "route":
        row(
          "Маршрут",
          catalog.routes.find((route) => route.id === state.routeId)?.name,
          catalog.routes.find((route) => route.id === operation.routeId)?.name,
        );
        row("Режим", modeName(state.mode), modeName(operation.mode));
        break;
      case "mode":
        row("Режим", modeName(state.mode), modeName(operation.mode));
        break;
      case "target":
        row(
          "Целевая добыча",
          state.targetSlot && catalog.slotNames[state.targetSlot],
          operation.slot && catalog.slotNames[operation.slot],
        );
        break;
      case "item_add":
        describeItem(undefined, operation.item);
        break;
      case "item_update":
        describeItem(
          state.inventory.find((item) => item.id === operation.itemId),
          operation.item,
        );
        break;
      case "item_delete":
        row("Удаление предмета", itemName(operation.itemId), "Будет удалён");
        break;
      case "equip": {
        const item = state.inventory.find(
          (entry) => entry.id === operation.itemId,
        );
        if (item)
          row(
            catalog.slotNames[item.slot],
            itemName(state.build.equipment[item.slot]),
            item.name,
          );
        break;
      }
      case "build":
        describeBuild(state.build, operation.build);
        break;
      case "preset":
        describeBuild(state.presets[operation.index], operation.build);
        break;
      case "block":
        row(
          "Доступ",
          player.blocked ? "Заблокирован" : "Открыт",
          operation.blocked ? "Заблокирован" : "Открыт",
        );
        break;
    }
  }
  return rows;
}

export const walletNames = {
  coins: "Монеты",
  thread: "Нить",
  catalyst: "Катализаторы",
};
export const conditionNames = {
  always: "По готовности",
  hp_below: "Здоровье ниже",
  no_shield: "Нет щита",
  enemy_windup: "Враг готовит удар",
  has_debuff: "Есть отрицательный эффект",
  vulnerable: "Цель надломлена",
  no_vulnerable: "Нет надлома",
  three_marks: "На цели три следа",
  under_three_marks: "На цели меньше трёх следов",
};

export function auditSummary(operation: AdminOperation, catalog: Catalog | null): string {
  const slot = (value: string) => catalog?.slotNames[value as keyof Catalog['slotNames']] ?? value;
  switch (operation.type) {
    case 'profile': return [operation.name !== undefined && `Имя героя: ${operation.name}`, operation.publicName !== undefined && `Имя в сообществе: ${operation.publicName}`, operation.level !== undefined && `Уровень: ${operation.level}`, operation.xp !== undefined && `Опыт: ${number(operation.xp)}`].filter(Boolean).join(' · ');
    case 'wallet': return Object.entries(operation.values).map(([key, value]) => `${walletNames[key as keyof typeof walletNames]}: ${number(value)}`).join(' · ');
    case 'upgrades': return Object.entries(operation.values).map(([key, value]) => `${slot(key)}: +${value}`).join(' · ');
    case 'route': return `${catalog?.routes.find(route => route.id === operation.routeId)?.name ?? operation.routeId} · ${modeName(operation.mode)}`;
    case 'mode': return modeName(operation.mode);
    case 'target': return `Целевая добыча: ${operation.slot ? slot(operation.slot) : 'Любой слот'}`;
    case 'item_add':
    case 'item_update': return `${operation.item.name} · ${slot(operation.item.slot)} · ур. ${operation.item.level} · ${catalog?.rarityNames[operation.item.rarity] ?? operation.item.rarity}${operation.item.affixes.length ? ` · ${operation.item.affixes.map(affix => catalog?.affixNames[affix] ?? affix).join(', ')}` : ''}`;
    case 'item_delete': return `Удалён предмет ${operation.itemId}`;
    case 'equip': return `Надет предмет ${operation.itemId}`;
    case 'build':
    case 'preset': return `${operation.type === 'preset' ? `Набор ${operation.index + 1}: ` : ''}${operation.build.name} · ${operation.build.skills.map(id => catalog?.skills.find(skill => skill.id === id)?.name ?? id).join(', ')} · Правил: ${operation.build.rules.length}`;
    case 'block': return operation.blocked ? 'Доступ к игре заблокирован' : 'Доступ к игре восстановлен';
  }
}
