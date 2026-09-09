import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import type {
  AdminItemInput,
  AdminOperation,
  AdminPlayerDetail,
} from "../../shared/admin";
import type {
  Affix,
  Build,
  Catalog,
  Condition,
  Family,
  Item,
  Rarity,
  Slot,
} from "../../shared/types";
import { allowedAffixes, upgradeCap } from "../../shared/content";
import { conditionNames, modeName, walletNames } from "./changes";
import { date, Empty, Field, Modal, number, Section } from "./ui";

export type PrepareChange = (
  title: string,
  operations: AdminOperation[],
) => void;
interface EditorProps {
  player: AdminPlayerDetail;
  catalog: Catalog;
  prepare: PrepareChange;
}

function changedFields<T extends object>(initial: T, current: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (current[key] !== initial[key]) result[key] = current[key];
  }
  return result;
}

export function ProfileEditor({ player, catalog, prepare }: EditorProps) {
  const [initialProfile] = useState({
    name: player.state.name,
    publicName: player.publicName ?? "",
    level: player.state.level,
    xp: player.state.xp,
  });
  const [profile, setProfile] = useState(initialProfile);
  const [initialWallet] = useState({ ...player.state.wallet });
  const [wallet, setWallet] = useState(initialWallet);
  const [initialUpgrades] = useState({ ...player.state.upgrades });
  const [upgrades, setUpgrades] = useState(initialUpgrades);
  const [initialRoute] = useState({
    routeId: player.state.routeId,
    mode: player.state.mode,
  });
  const [route, setRoute] = useState(initialRoute);
  const [initialTarget] = useState<Slot | "">(
    player.state.targetSlot ?? "",
  );
  const [target, setTarget] = useState(initialTarget);
  const submit = (
    event: FormEvent,
    title: string,
    operations: AdminOperation[],
  ) => {
    event.preventDefault();
    prepare(title, operations);
  };
  return (
    <>
      <Section title="Профиль">
        <form
          onSubmit={(event) =>
            submit(event, "Изменить профиль", [
              {
                type: "profile",
                ...changedFields(initialProfile, profile),
                publicName: profile.publicName !== initialProfile.publicName ? profile.publicName.trim() || undefined : undefined,
              },
            ])
          }
        >
          <div className="admin-form-grid">
            <Field label="Имя героя">
              <input
                value={profile.name}
                maxLength={80}
                required
                onChange={(event) =>
                  setProfile({ ...profile, name: event.target.value })
                }
              />
            </Field>
            <Field label="Имя в сообществе">
              <input
                value={profile.publicName}
                minLength={2}
                maxLength={24}
                onChange={(event) =>
                  setProfile({ ...profile, publicName: event.target.value })
                }
              />
            </Field>
            <Field label="Уровень героя">
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={profile.level}
                onChange={(event) =>
                  setProfile({ ...profile, level: Number(event.target.value), xp: 0 })
                }
              />
            </Field>
            <Field label="Опыт на уровне">
              <input
                type="number"
                min={0}
                step={1}
                required
                value={profile.xp}
                onChange={(event) =>
                  setProfile({ ...profile, xp: Number(event.target.value) })
                }
              />
            </Field>
          </div>
          <p className="admin-inline-note">
            Следующий уровень: {number(player.xpToNext)} опыта. Создан:{" "}
            {date(player.state.createdAt)}.
          </p>
          <div className="admin-form-footer">
            <button>
              <Pencil size={16} />
              Изменить профиль
            </button>
          </div>
        </form>
      </Section>
      <Section title="Ресурсы">
        <form
          onSubmit={(event) =>
            submit(event, "Изменить ресурсы", [
              { type: "wallet", values: changedFields(initialWallet, wallet) },
            ])
          }
        >
          <div className="admin-form-grid">
            {(["coins", "thread", "catalyst"] as const).map((key) => (
              <Field key={key} label={walletNames[key]}>
                <input
                  type="number"
                  min={0}
                  max={1_000_000_000}
                  step={1}
                  value={wallet[key]}
                  required
                  onChange={(event) =>
                    setWallet({ ...wallet, [key]: Number(event.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="admin-form-footer">
            <button>
              <Pencil size={16} />
              Изменить ресурсы
            </button>
          </div>
        </form>
      </Section>
      <Section title="Путешествие">
        <form
          onSubmit={(event) =>
            submit(event, "Изменить путешествие", [
              ...(route.routeId !== initialRoute.routeId ? [{ type: "route" as const, ...route }]
                : route.mode !== initialRoute.mode ? [{ type: "mode" as const, mode: route.mode }] : []),
              ...(target !== initialTarget ? [{ type: "target" as const, slot: target || null }] : []),
            ])
          }
        >
          <div className="admin-form-grid">
            <Field label="Маршрут">
              <select
                value={route.routeId}
                onChange={(event) =>
                  setRoute({ ...route, routeId: event.target.value })
                }
              >
                {catalog.routes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · ур. {entry.unlockLevel}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Режим пути">
              <select
                value={route.mode}
                onChange={(event) =>
                  setRoute({
                    ...route,
                    mode: event.target.value as "farm" | "push",
                  })
                }
              >
                <option value="farm">Добыча</option>
                <option value="push">Продвижение</option>
              </select>
            </Field>
            <Field label="Целевая добыча">
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value as Slot | "")}
              >
                <option value="">Любой слот</option>
                {catalog.slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {catalog.slotNames[slot]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {player.state.pendingRoute && (
            <p className="admin-inline-note">
              В очереди:{" "}
              {
                catalog.routes.find(
                  (entry) => entry.id === player.state.pendingRoute?.routeId,
                )?.name
              }{" "}
              · {modeName(player.state.pendingRoute.mode)}
            </p>
          )}
          <p className="admin-inline-note">
            Автономность до {date(player.state.autonomyUntil)}. Победы:{" "}
            {number(player.state.totals.wins)}. Поражения:{" "}
            {number(player.state.totals.losses)}.
          </p>
          <div className="admin-form-footer">
            <button>
              <Pencil size={16} />
              Изменить путешествие
            </button>
          </div>
        </form>
      </Section>
      <Section title="Усиления слотов">
        <form
          onSubmit={(event) =>
            submit(event, "Изменить усиления", [
              { type: "upgrades", values: changedFields(initialUpgrades, upgrades) },
            ])
          }
        >
          <div className="admin-form-grid">
            {catalog.slots.map((slot) => (
              <Field key={slot} label={catalog.slotNames[slot]}>
                <input
                  type="number"
                  min={0}
                  max={upgradeCap(player.state.level)}
                  step={1}
                  required
                  value={upgrades[slot]}
                  onChange={(event) =>
                    setUpgrades({
                      ...upgrades,
                      [slot]: Number(event.target.value),
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="admin-form-footer">
            <button>
              <Pencil size={16} />
              Изменить усиления
            </button>
          </div>
        </form>
      </Section>
    </>
  );
}

export function InventoryEditor({ player, catalog, prepare }: EditorProps) {
  const [selected, setSelected] = useState<Item | "new" | null>(null);
  const [filter, setFilter] = useState<Slot | "">("");
  const items = player.state.inventory.filter(
    (item) => !filter || item.slot === filter,
  );
  const equipped = (id: string) =>
    Object.values(player.state.build.equipment).includes(id);
  const referenced = (id: string) =>
    [
      player.state.build,
      player.state.pendingBuild,
      ...player.state.presets,
    ].some((build) => build && Object.values(build.equipment).includes(id));
  return (
    <Section
      title={`Инвентарь · ${player.state.inventory.length}`}
      action={
        <button className="admin-primary" onClick={() => setSelected("new")}>
          <Plus size={17} />
          Выдать предмет
        </button>
      }
    >
      <div className="admin-toolbar">
        <Field label="Слот инвентаря">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as Slot | "")}
          >
            <option value="">Все слоты</option>
            {catalog.slots.map((slot) => (
              <option key={slot} value={slot}>
                {catalog.slotNames[slot]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Предмет</th>
              <th>Уровень</th>
              <th className="admin-optional">Свойства</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>
                    {catalog.slotNames[item.slot]}
                    {item.family && ` · ${catalog.familyNames[item.family]}`}
                  </small>
                  <div className="admin-item-subtitle">
                    <span className={`admin-badge rarity-${item.rarity}`}>
                      {catalog.rarityNames[item.rarity]}
                    </span>
                    {equipped(item.id) && (
                      <span className="admin-badge">
                        <Check size={12} />
                        Надет
                      </span>
                    )}
                    {item.locked && (
                      <span className="admin-badge">
                        <ShieldCheck size={12} />
                        Защищён
                      </span>
                    )}
                  </div>
                </td>
                <td>{item.level}</td>
                <td className="admin-optional">
                  <span className="admin-item-affixes">
                    {item.affixes
                      .map((affix) => catalog.affixNames[affix])
                      .join(", ") || "Без свойств"}
                  </span>
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button
                      className="admin-icon"
                      aria-label={`Редактировать ${item.name}`}
                      title="Редактировать предмет"
                      onClick={() => setSelected(item)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="admin-icon"
                      aria-label={`Надеть ${item.name}`}
                      title={equipped(item.id) ? "Уже надет" : "Надеть"}
                      disabled={equipped(item.id)}
                      onClick={() =>
                        prepare("Сменить экипировку", [
                          { type: "equip", itemId: item.id },
                        ])
                      }
                    >
                      <Check size={17} />
                    </button>
                    <button
                      className="admin-icon admin-danger"
                      aria-label={`Удалить ${item.name}`}
                      title={
                        item.locked ? "Предмет защищён от разбора" : referenced(item.id)
                          ? "Предмет используется в сборке"
                          : "Удалить предмет"
                      }
                      disabled={!!item.locked || referenced(item.id)}
                      onClick={() =>
                        prepare("Удалить предмет", [
                          { type: "item_delete", itemId: item.id },
                        ])
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && <Empty>Предметы не найдены.</Empty>}
      {selected && (
        <ItemEditor
          key={selected === "new" ? "new" : selected.id}
          item={selected === "new" ? undefined : selected}
          catalog={catalog}
          onClose={() => setSelected(null)}
          onSubmit={(item) => {
            prepare(
              selected === "new" ? "Выдать предмет" : "Изменить предмет",
              [
                selected === "new"
                  ? { type: "item_add", item }
                  : { type: "item_update", itemId: selected.id, item },
              ],
            );
            setSelected(null);
          }}
        />
      )}
    </Section>
  );
}

function ItemEditor({
  item,
  catalog,
  onClose,
  onSubmit,
}: {
  item?: Item;
  catalog: Catalog;
  onClose: () => void;
  onSubmit: (item: AdminItemInput) => void;
}) {
  const [draft, setDraft] = useState<AdminItemInput>(
    item
      ? { ...item }
      : {
          name: "",
          slot: "ring",
          level: 1,
          rarity: "fine",
          affixes: ["hp"],
          locked: false,
        },
  );
  const affixCount =
    draft.rarity === "common" ? 0 : draft.rarity === "fine" ? 1 : 2;
  const choices = allowedAffixes(draft.slot);
  const changeItem = (patch: Partial<AdminItemInput>) => {
    const next = { ...draft, ...patch };
    if (next.slot !== "weapon") delete next.family;
    else next.family ??= "blade";
    const namedAllowed =
      next.slot === "ring" ||
      next.slot === "amulet" ||
      (next.slot === "weapon" && next.family === "needle");
    if (next.rarity === "named" && !namedAllowed) next.rarity = "resonant";
    const compatible = allowedAffixes(next.slot);
    const count = next.rarity === "common" ? 0 : next.rarity === "fine" ? 1 : 2;
    const affixes = next.affixes
      .filter(
        (affix, index, all) =>
          compatible.includes(affix) && all.indexOf(affix) === index,
      )
      .slice(0, count);
    while (affixes.length < count)
      affixes.push(compatible.find((affix) => !affixes.includes(affix))!);
    next.affixes = affixes;
    if (next.rarity !== "named") delete next.special;
    else next.special = next.slot === "weapon" ? "long_thread" : "mirror";
    setDraft(next);
  };
  return (
    <Modal
      title={item ? "Редактировать предмет" : "Новый предмет"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const { id: _id, ...input } = draft as Item;
          onSubmit(input);
        }}
      >
        <div className="admin-form-grid two">
          <Field label="Название предмета" wide>
            <input
              autoFocus
              value={draft.name}
              required
              minLength={2}
              maxLength={60}
              onChange={(event) => changeItem({ name: event.target.value })}
            />
          </Field>
          <Field label="Слот предмета">
            <select
              value={draft.slot}
              onChange={(event) =>
                changeItem({ slot: event.target.value as Slot })
              }
            >
              {catalog.slots.map((slot) => (
                <option key={slot} value={slot}>
                  {catalog.slotNames[slot]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Уровень предмета">
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              required
              value={draft.level}
              onChange={(event) =>
                changeItem({ level: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="Качество предмета">
            <select
              value={draft.rarity}
              onChange={(event) =>
                changeItem({ rarity: event.target.value as Rarity })
              }
            >
              {Object.entries(catalog.rarityNames).map(([id, name]) => (
                <option key={id} value={id} disabled={id === "named" && !["ring", "amulet"].includes(draft.slot) && !(draft.slot === "weapon" && draft.family === "needle")}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          {draft.slot === "weapon" && (
            <Field label="Семейство оружия">
              <select
                value={draft.family ?? "blade"}
                onChange={(event) =>
                  changeItem({ family: event.target.value as Family })
                }
              >
                {Object.entries(catalog.familyNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {Array.from({ length: affixCount }, (_, index) => (
            <Field key={index} label={`Свойство ${index + 1}`}>
              <select
                value={draft.affixes[index] ?? ""}
                onChange={(event) =>
                  changeItem({
                    affixes: draft.affixes.map((affix, i) =>
                      i === index ? (event.target.value as Affix) : affix,
                    ),
                  })
                }
              >
                {choices.map((affix) => (
                  <option
                    key={affix}
                    value={affix}
                    disabled={draft.affixes.some(
                      (entry, i) => i !== index && entry === affix,
                    )}
                  >
                    {catalog.affixNames[affix]}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          {draft.rarity === "named" && (
            <Field label="Особое свойство">
              <select
                value={draft.special ?? "mirror"}
                onChange={(event) =>
                  changeItem({
                    special: event.target.value as "mirror" | "long_thread",
                  })
                }
              >
                {draft.slot === "weapon" ? (
                  <option value="long_thread">Длинная нить</option>
                ) : (
                  <option value="mirror">Зеркало</option>
                )}
              </select>
            </Field>
          )}
          <label className="admin-checkbox admin-field-wide">
            <input
              type="checkbox"
              checked={!!draft.locked}
              onChange={(event) => changeItem({ locked: event.target.checked })}
            />
            Защитить от разбора
          </label>
        </div>
        <div className="admin-actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="admin-primary">
            <Check size={17} />К подтверждению
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function BuildsEditor({ player, catalog, prepare }: EditorProps) {
  const [selection, setSelection] = useState("active");
  const original =
    selection === "active"
      ? player.state.build
      : (player.state.presets[Number(selection)] ?? player.state.build);
  return (
    <Section title="Сборки">
      <div className="admin-toolbar">
        <Field label="Редактируемая сборка">
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="active">Активная сборка</option>
            {[0, 1, 2].map((index) => (
              <option key={index} value={index}>
                Набор {index + 1}:{" "}
                {player.state.presets[index]?.name ?? "Не сохранён"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {player.state.pendingBuild && selection === "active" && (
        <p className="admin-notice">
          В очереди игрока другая сборка: {player.state.pendingBuild.name}.
        </p>
      )}
      <BuildEditor
        key={selection}
        initial={original}
        player={player}
        catalog={catalog}
        onSubmit={(build) =>
          prepare(
            selection === "active"
              ? "Изменить активную сборку"
              : `Изменить набор ${Number(selection) + 1}`,
            [
              selection === "active"
                ? { type: "build", build }
                : { type: "preset", index: Number(selection), build },
            ],
          )
        }
      />
    </Section>
  );
}

function BuildEditor({
  initial,
  player,
  catalog,
  onSubmit,
}: {
  initial: Build;
  player: AdminPlayerDetail;
  catalog: Catalog;
  onSubmit: (build: Build) => void;
}) {
  const [build, setBuild] = useState<Build>(() => structuredClone(initial));
  const family =
    player.state.inventory.find((item) => item.id === build.equipment.weapon)
      ?.family ?? "blade";
  const available = catalog.skills.filter(
    (skill) =>
      skill.unlockLevel <= player.state.level &&
      (skill.family === "common" || skill.family === family),
  );
  const equipment = (slot: Slot, itemId: string) => {
    const next = {
      ...build,
      equipment: { ...build.equipment, [slot]: itemId },
    };
    const nextFamily =
      player.state.inventory.find((item) => item.id === next.equipment.weapon)
        ?.family ?? "blade";
    if (family !== nextFamily) {
      const availableNext = catalog.skills.filter(
        (skill) =>
          skill.unlockLevel <= player.state.level &&
          (skill.family === "common" || skill.family === nextFamily),
      );
      next.skills = availableNext.slice(0, 4).map((skill) => skill.id);
      next.rules = next.rules.filter((rule) =>
        next.skills.includes(rule.skillId),
      );
    }
    setBuild(next);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(build);
      }}
    >
      <div className="admin-form-grid">
        <Field label="Название сборки" wide>
          <input
            value={build.name}
            maxLength={30}
            required
            onChange={(event) =>
              setBuild({ ...build, name: event.target.value })
            }
          />
        </Field>
        {catalog.slots.map((slot) => (
          <Field key={slot} label={`Сборка: ${catalog.slotNames[slot]}`}>
            <select
              value={build.equipment[slot]}
              onChange={(event) => equipment(slot, event.target.value)}
            >
              {player.state.inventory
                .filter((item) => item.slot === slot)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · ур. {item.level}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>
      <Section title="Активные умения">
        <div className="admin-form-grid two">
          {build.skills.map((id, index) => (
            <Field key={index} label={`Умение ${index + 1}`}>
              <select
                value={id}
                onChange={(event) => {
                  const skills = build.skills.map((skill, i) =>
                    i === index ? event.target.value : skill,
                  );
                  setBuild({
                    ...build,
                    skills,
                    rules: build.rules.filter((rule) =>
                      skills.includes(rule.skillId),
                    ),
                  });
                }}
              >
                {available.map((skill) => (
                  <option
                    key={skill.id}
                    value={skill.id}
                    disabled={build.skills.some(
                      (chosen, i) => i !== index && chosen === skill.id,
                    )}
                  >
                    {skill.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </Section>
      <Section
        title="Приоритеты действий"
        action={
          <button
            type="button"
            disabled={build.rules.length >= 3}
            onClick={() =>
              setBuild({
                ...build,
                rules: [
                  ...build.rules,
                  { condition: "always", skillId: build.skills[0] },
                ],
              })
            }
          >
            <Plus size={16} />
            Правило
          </button>
        }
      >
        {build.rules.map((rule, index) => (
          <div className="admin-rule" key={index}>
            <strong>{index + 1}</strong>
            <Field label={`Условие ${index + 1}`}>
              <select
                value={rule.condition}
                onChange={(event) =>
                  setBuild({
                    ...build,
                    rules: build.rules.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            condition: event.target.value as Condition,
                            ...(event.target.value === "hp_below"
                              ? { threshold: 40 }
                              : { threshold: undefined }),
                          }
                        : entry,
                    ),
                  })
                }
              >
                {Object.entries(conditionNames).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Порог ${index + 1}`}>
              <select
                disabled={rule.condition !== "hp_below"}
                value={rule.threshold ?? 40}
                onChange={(event) =>
                  setBuild({
                    ...build,
                    rules: build.rules.map((entry, i) =>
                      i === index
                        ? { ...entry, threshold: Number(event.target.value) }
                        : entry,
                    ),
                  })
                }
              >
                {[25, 40, 55, 70].map((threshold) => (
                  <option key={threshold} value={threshold}>
                    {threshold}%
                  </option>
                ))}
              </select>
            </Field>
            <div className="admin-rule-skill">
              <Field label={`Действие ${index + 1}`}>
                <select
                  value={rule.skillId}
                  onChange={(event) =>
                    setBuild({
                      ...build,
                      rules: build.rules.map((entry, i) =>
                        i === index
                          ? { ...entry, skillId: event.target.value }
                          : entry,
                      ),
                    })
                  }
                >
                  {build.skills.map((id) => (
                    <option key={id} value={id}>
                      {catalog.skills.find((skill) => skill.id === id)?.name ??
                        id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              type="button"
              className="admin-icon admin-danger"
              aria-label={`Удалить правило ${index + 1}`}
              title="Удалить правило"
              onClick={() =>
                setBuild({
                  ...build,
                  rules: build.rules.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {!build.rules.length && <Empty>Правила не заданы.</Empty>}
      </Section>
      <div className="admin-form-footer">
        <button className="admin-primary">
          <Save size={17} />
          Изменить сборку
        </button>
      </div>
    </form>
  );
}
