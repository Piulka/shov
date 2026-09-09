import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Backpack,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  Compass,
  Crosshair,
  Diamond,
  FlaskConical,
  Gem,
  Hammer,
  Heart,
  Layers3,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Map,
  Mountain,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Save,
  ScrollText,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Unplug,
  UserRound,
  UsersRound,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  Affix,
  BattleRun,
  Build,
  Catalog,
  Condition,
  Family,
  GameCommand,
  GameView,
  Item,
  JourneyReport,
  Slot,
  TrainingResult,
  Wallet,
} from "../shared/types";
import { allowedAffixes, upgradeCap } from "../shared/content";
import { chapterTasks } from "../shared/chapter";
import BattleScene from "./components/BattleScene";
import ChapterProgress from "./components/ChapterProgress";
import ClanPage from "./components/ClanPage";
import { useGame } from "./api";

type Page = "journey" | "hero" | "workshop" | "map" | "clan";
type Command = (command: GameCommand) => Promise<boolean>;
const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
const decimal = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);
const compact = (n: number) =>
  n >= 10000
    ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n / 1000)}к`
    : fmt(n);
const duration = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)} мин`
      : `${Math.max(0, Math.floor(seconds))} с`;
const familyIcons: Record<Family, LucideIcon> = {
  blade: Swords,
  glass: WandSparkles,
  needle: Crosshair,
};
const slotIcons: Record<Slot, LucideIcon> = {
  weapon: Swords,
  focus: Diamond,
  head: UserRound,
  armor: Shield,
  gloves: Sparkles,
  boots: RouteIcon,
  amulet: Gem,
  ring: CircleHelp,
};
const conditions: Record<Condition, string> = {
  always: "По готовности",
  hp_below: "Здоровье ниже",
  no_shield: "Нет щита",
  enemy_windup: "Враг готовит удар",
  has_debuff: "Есть вредный эффект",
  vulnerable: "Враг уязвим",
  no_vulnerable: "Нет уязвимости",
  three_marks: "Три следа на враге",
  under_three_marks: "Меньше трёх следов",
};
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "journey", label: "Путешествие", icon: Compass },
  { id: "hero", label: "Герой", icon: UserRound },
  { id: "workshop", label: "Мастерская", icon: Hammer },
  { id: "map", label: "Карта мира", icon: Map },
  { id: "clan", label: "Клан", icon: UsersRound },
];
function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon size={18} />
    </button>
  );
}
function Money({ wallet, small = false }: { wallet: Wallet; small?: boolean }) {
  return (
    <div className={`money ${small ? "small" : ""}`}>
      <span title="Монеты">
        <Coins size={16} />
        <b>{compact(wallet.coins)}</b>
      </span>
      <span title="Нить">
        <Layers3 size={16} />
        <b>{compact(wallet.thread)}</b>
      </span>
      <span title="Катализаторы">
        <Gem size={16} />
        <b>{compact(wallet.catalyst)}</b>
      </span>
    </div>
  );
}
function Dialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current
      ?.querySelector<HTMLElement>("button, input, select")
      ?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        ) || [],
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`dialog ${wide ? "wide" : ""}`}
      >
        <header>
          <h2 id="dialog-title">{title}</h2>
          <IconButton icon={X} label="Закрыть" onClick={close} />
        </header>
        {children}
      </div>
    </div>
  );
}
function ItemImage({
  item,
  className = "",
}: {
  item: Pick<Item, "slot" | "family">;
  className?: string;
}) {
  return (
    <img
      className={`item-image ${className}`}
      src={`/art/item-${item.slot}${item.slot === "weapon" && item.family ? `-${item.family}` : ""}.png`}
      alt=""
      loading="lazy"
    />
  );
}
function ItemTile({
  item,
  catalog,
  selected,
  equipped,
  onClick,
}: {
  item: Item;
  catalog: Catalog;
  selected?: boolean;
  equipped?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`item-tile rarity-${item.rarity} ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="item-art">
        <ItemImage item={item} />
        {equipped && (
          <span className="equipped-marker" title="Надето">
            <Check size={12} />
          </span>
        )}
        {item.locked && <LockKeyhole className="locked-marker" size={12} />}
      </div>
      <div className="item-tile-copy">
        <span className="item-level">
          {catalog.slotNames[item.slot]} · ур. {item.level}
        </span>
        <strong>{item.name}</strong>
        <span className="item-affix">
          {item.affixes.length
            ? catalog.affixNames[item.affixes[0]]
            : "Без дополнительных свойств"}
        </span>
      </div>
    </button>
  );
}
function Health({
  name,
  current,
  maximum,
  shield = 0,
  enemy = false,
  level,
}: {
  name: string;
  current: number;
  maximum: number;
  shield?: number;
  enemy?: boolean;
  level?: number;
}) {
  return (
    <div className={`combatant ${enemy ? "enemy" : ""}`}>
      <div className="combatant-name">
        <b>{name}</b>
        <span>{level ? `Ур. ${level}` : ""}</span>
      </div>
      <div className="health-track">
        <span
          style={{
            width: `${Math.max(0, Math.min(100, (current / maximum) * 100))}%`,
          }}
        />
      </div>
      <div className="health-meta">
        <span>
          <Heart size={10} /> {fmt(current)} / {fmt(maximum)}
        </span>
        {shield > 0 && (
          <span>
            <Shield size={10} /> {fmt(shield)}
          </span>
        )}
      </div>
    </div>
  );
}
function battleFrame(battle: BattleRun, now: number) {
  return battle.events.filter((e) => e.at <= now - battle.startedAt).at(-1);
}
function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

function Journey({
  view,
  now,
  paused,
  setPaused,
  go,
  inspect,
  showReport,
}: {
  view: GameView;
  now: number;
  paused: boolean;
  setPaused: (v: boolean) => void;
  go: (p: Page) => void;
  inspect: (i: Item) => void;
  showReport: () => void;
}) {
  const { state, catalog } = view;
  const route = catalog.routes.find((r) => r.id === state.routeId)!;
  const frame = battleFrame(state.battle, now);
  const elapsed = Math.max(0, now - state.battle.startedAt);
  const recent = state.battle.events
    .filter((e) => e.at <= elapsed)
    .slice(-3)
    .reverse();
  const routeIndex = catalog.routes.findIndex((r) => r.id === route.id);
  const nextRoute = catalog.routes[routeIndex + 1];
  const wins = state.routeWins[route.id] || 0;
  const nextNeeded = nextRoute?.unlockWins || 1;
  const nextLevel = nextRoute?.unlockLevel || 1;
  const routeProgress = Math.min(1, wins / nextNeeded, state.level / nextLevel);
  const xpProgress = view.xpToNext ? Math.min(100, state.xp / view.xpToNext * 100) : 100;
  const lootRemaining = Math.max(0, route.lootIntervalMs - (state.progression?.lootElapsedMs[route.id] || 0));
  const finds = state.inventory
    .filter((i) => !Object.values(state.build.equipment).includes(i.id))
    .slice(-3)
    .reverse();
  const pending =
    state.pendingRoute &&
    catalog.routes.find((r) => r.id === state.pendingRoute!.routeId);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="chapter-mark">01</span> БЕЛЫЕ ТЕРРАСЫ
          </p>
          <h1>Путь продолжается</h1>
          <p className="subtitle">За каждой трещиной начинается новый мир.</p>
        </div>
        <button className="button secondary" onClick={() => go("map")}>
          <Map size={16} /> Выбрать маршрут
        </button>
      </div>
      <section className="battle-stage" aria-label="Текущее сражение">
        <BattleScene battle={state.battle} now={now} paused={paused} />
        <div className="stage-top">
          <div className="location-label">
            <Compass size={15} />
            <span>{route.name}</span>
            <span className="location-dot" />
            <span className="route-number">
              {String(routeIndex + 1).padStart(2, "0")} / {String(catalog.routes.length).padStart(2, "0")}
            </span>
          </div>
          <div className="stage-tools">
            <span className="battle-time">
              <Clock3 size={13} />
              {duration(Math.min(elapsed, state.battle.combatMs) / 1000)}
            </span>
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? "Продолжить анимацию" : "Приостановить анимацию"}
              onClick={() => setPaused(!paused)}
            />
          </div>
        </div>
        <div className="stage-bottom">
          <Health
            name={state.name}
            level={state.level}
            current={frame?.heroHp ?? state.battle.stats.hp}
            maximum={state.battle.stats.hp}
            shield={frame?.heroShield}
          />
          <span className="versus">
            <Swords size={18} />
          </span>
          <Health
            name={state.battle.enemy.name}
            level={state.battle.enemy.level}
            current={frame?.enemyHp ?? state.battle.enemy.hp}
            maximum={state.battle.enemy.hp}
            enemy
          />
        </div>
      </section>
      <div className="journey-strip">
        <span>
          <i className="live-dot" />
          {pending
            ? `Далее: ${pending.name}`
            : state.mode === "push"
              ? "Продвижение по маршруту"
              : "Сбор добычи"}
        </span>
        <button onClick={showReport}>
          <ScrollText size={15} /> Отчёт о путешествии{" "}
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="journey-progress">
        <div className="journey-level">
          <div><b>Уровень {state.level}</b><span>{view.xpToNext ? `${fmt(state.xp)} / ${fmt(view.xpToNext)} опыта` : 'Предел уровня'}</span></div>
          <div className="thin-progress xp" role="progressbar" aria-label="Опыт героя" aria-valuenow={state.xp} aria-valuemin={0} aria-valuemax={view.xpToNext || 1}><span style={{ width: `${xpProgress}%` }} /></div>
        </div>
        <span className="journey-next-loot"><Backpack size={17} /> Следующая находка: {duration(Math.ceil(lootRemaining / 1000))} успешного пути</span>
      </div>
      <div className="journey-lower">
        <section className="next-goal">
          {state.chapter && !state.chapter.legacy ? <ChapterProgress view={view} go={go} /> : <>
          <SectionTitle
            action={<span className="micro-label">ТЕКУЩАЯ ЦЕЛЬ</span>}
          >
            След за следом
          </SectionTitle>
          <div className="goal-title">
            <span className="goal-icon">
              <Mountain size={23} />
            </span>
            <div>
              <h3>{nextRoute ? nextRoute.name : "Хранитель Белых террас"}</h3>
              <p>
                {nextRoute
                  ? `Открытие: уровень ${nextLevel} и ${nextNeeded} побед`
                  : "Завершить путь через террасы"}
              </p>
            </div>
            <b>
              {Math.min(wins, nextNeeded)}
              <small> / {nextNeeded}</small>
            </b>
          </div>
          <div className="thin-progress">
            <span
              style={{ width: `${routeProgress * 100}%` }}
            />
          </div>
          <div className="journey-stats">
            <span>
              <Swords size={15} />
              <b>{fmt(state.totals.wins)}</b> побед
            </span>
            <span>
              <Backpack size={15} />
              <b>{fmt(state.totals.items)}</b> находок
            </span>
            <span>
              <Coins size={15} />
              <b>{fmt(state.totals.coins)}</b> добыто
            </span>
          </div>
          </>}
        </section>
        <section className="battle-journal">
          <SectionTitle
            action={<span className="micro-label">В ЭТОМ БОЮ</span>}
          >
            Хроника
          </SectionTitle>
          <div className="events" aria-live="off">
            {recent.map((event, index) => (
              <div
                className={`event ${event.actor}`}
                key={`${state.battle.startedAt}-${event.at}-${index}`}
              >
                <span className="event-time">
                  {(event.at / 1000).toFixed(1)}с
                </span>
                <i />
                <span>{event.label}</span>
                {event.value > 0 && (
                  <b className={event.critical ? "critical" : ""}>
                    {event.kind === "heal" || event.kind === "shield"
                      ? "+"
                      : ""}
                    {fmt(event.value)}
                  </b>
                )}
              </div>
            ))}
            {recent.length === 0 && (
              <p className="muted">Проводник выходит на тропу.</p>
            )}
          </div>
        </section>
      </div>
      <section className="finds">
        <SectionTitle
          action={
            <button className="text-button" onClick={() => go("hero")}>
              Весь рюкзак <ArrowRight size={15} />
            </button>
          }
        >
          В дорожной сумке{" "}
          <span className="count">{state.inventory.length}</span>
        </SectionTitle>
        <div className="finds-grid">
          {finds.map((item) => (
            <ItemTile
              key={item.id}
              item={item}
              catalog={catalog}
              onClick={() => inspect(item)}
            />
          ))}
          {finds.length === 0 && (
            <p className="muted">Пока все находки на герое.</p>
          )}
        </div>
      </section>
    </>
  );
}

function BuildEditor({
  view,
  command,
  busy,
  onTrain,
  onDirtyChange,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  onTrain: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const build = view.state.pendingBuild || view.state.build;
  const [skills, setSkills] = useState(build.skills);
  const [rules, setRules] = useState(build.rules);
  const [dirty, setDirty] = useState(false);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const signature = JSON.stringify(build);
  useEffect(() => {
    if (!dirty) {
      setSkills(build.skills);
      setRules(build.rules);
    }
  }, [signature, dirty]);
  const weapon = view.state.inventory.find(
    (i) => i.id === build.equipment.weapon,
  )!;
  const family = weapon.family || "blade";
  const available = view.catalog.skills.filter(
    (s) => s.family === "common" || s.family === family,
  );
  const nextUnlock = Math.min(...available.filter(skill => skill.unlockLevel > view.state.level).map(skill => skill.unlockLevel));
  const ruleUpdate = (
    index: number,
    values: Partial<Build["rules"][number]>,
  ) => {
    setDirty(true);
    setRules(rules.map((r, i) => (i === index ? { ...r, ...values } : r)));
  };
  const moveRule = (index: number, delta: number) => {
    const next = [...rules];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setRules(next);
    setDirty(true);
  };
  return (
    <section className="build-editor">
      <SectionTitle
        action={
          <button
            className="text-button"
            onClick={onTrain}
            disabled={busy || dirty}
          >
            <FlaskConical size={16} /> Испытать
          </button>
        }
      >
        Умения и тактика
      </SectionTitle>
      <div className="skill-grid">
        {skills.map((id, index) => {
          const skill = view.catalog.skills.find((s) => s.id === id);
          const Icon =
            skill?.family === "common" ? Shield : familyIcons[family];
          return (
            <label className="skill-control" key={index}>
              <span className="skill-symbol">
                <Icon size={22} />
                <small>{index + 1}</small>
              </span>
              <span>
                <select
                  aria-label={`Умение ${index + 1}`}
                  value={id}
                  onChange={(e) => {
                    const next = [...skills];
                    next[index] = e.target.value;
                    setSkills(next);
                    setRules(
                      rules.map((r) =>
                        r.skillId === id
                          ? { ...r, skillId: e.target.value }
                          : r,
                      ),
                    );
                    setDirty(true);
                  }}
                >
                  {available.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={s.unlockLevel > view.state.level || (s.id !== id && skills.includes(s.id))}
                    >
                      {s.name}{s.unlockLevel > view.state.level ? ` · ур. ${s.unlockLevel}` : ''}
                    </option>
                  ))}
                </select>
                <small>
                  {skill?.cooldown} с · {skill?.description}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      {Number.isFinite(nextUnlock) && <p className="skill-unlock"><LockKeyhole size={14} /> Уровень {nextUnlock}: {available.filter(skill => skill.unlockLevel === nextUnlock).map(skill => skill.name).join(', ')}</p>}
      <div className="rule-heading">
        <h3>Приоритет действий</h3>
        <span>{rules.length} / 3</span>
      </div>
      <div className="rules">
        {rules.map((rule, index) => (
          <div className="rule-row" key={index}>
            <span className="rule-index">{index + 1}</span>
            <select
              aria-label={`Условие ${index + 1}`}
              value={rule.condition}
              onChange={(e) =>
                ruleUpdate(index, {
                  condition: e.target.value as Condition,
                  threshold:
                    e.target.value === "hp_below"
                      ? rule.threshold || 55
                      : undefined,
                })
              }
            >
              {Object.entries(conditions).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {rule.condition === "hp_below" && (
              <select
                className="threshold"
                aria-label={`Порог здоровья ${index + 1}`}
                value={rule.threshold || 55}
                onChange={(e) =>
                  ruleUpdate(index, { threshold: Number(e.target.value) })
                }
              >
                {[25, 40, 55, 70].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            <ArrowRight size={13} className="rule-arrow" />
            <select
              aria-label={`Действие ${index + 1}`}
              value={rule.skillId}
              onChange={(e) => ruleUpdate(index, { skillId: e.target.value })}
            >
              {skills.map((id) => (
                <option value={id} key={id}>
                  {view.catalog.skills.find((s) => s.id === id)?.name}
                </option>
              ))}
            </select>
            <div className="rule-actions">
              <IconButton
                icon={ArrowUp}
                label="Повысить приоритет"
                disabled={index === 0}
                onClick={() => moveRule(index, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label="Понизить приоритет"
                disabled={index === rules.length - 1}
                onClick={() => moveRule(index, 1)}
              />
              <IconButton
                icon={X}
                label="Удалить правило"
                onClick={() => {
                  setRules(rules.filter((_, i) => i !== index));
                  setDirty(true);
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="editor-actions">
        {rules.length < 3 && (
          <button
            className="text-button"
            onClick={() => {
              setRules([...rules, { condition: "always", skillId: skills[0] }]);
              setDirty(true);
            }}
          >
            <Plus size={15} /> Добавить правило
          </button>
        )}
        <span className="save-state">
          {view.state.pendingBuild && !dirty
            ? "Применится со следующего боя"
            : dirty
              ? "Есть несохранённые изменения"
              : "Тактика сохранена"}
        </span>
        {dirty && (
          <>
            <IconButton
              icon={RotateCcw}
              label="Отменить изменения"
              onClick={() => {
                setDirty(false);
                setSkills(build.skills);
                setRules(build.rules);
              }}
            />
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (await command({ type: "build", skills, rules }))
                  setDirty(false);
              }}
            >
              <Check size={16} /> Применить
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Hero({
  view,
  command,
  busy,
  inspect,
  onTrain,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  inspect: (i: Item) => void;
  onTrain: () => void;
}) {
  const [filter, setFilter] = useState<Slot | "all">("all");
  const [buildDirty, setBuildDirty] = useState(false);
  const [rarity, setRarity] = useState("all");
  const [search, setSearch] = useState("");
  const [visibleItems, setVisibleItems] = useState(60);
  useEffect(() => setVisibleItems(60), [filter, rarity, search]);
  const build = view.state.pendingBuild || view.state.build;
  const family =
    view.state.inventory.find((i) => i.id === build.equipment.weapon)?.family ||
    "blade";
  const items = [...view.state.inventory]
    .reverse()
    .filter(
      (i) =>
        (filter === "all" || i.slot === filter) &&
        (rarity === "all" || i.rarity === rarity) &&
        i.name.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ПРОВОДНИК</p>
          <h1>{view.state.name}</h1>
          <p className="subtitle">
            {view.catalog.familyNames[family]} · Уровень {view.state.level}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={onTrain}
          disabled={busy || buildDirty}
        >
          <FlaskConical size={16} /> Проверить сборку
        </button>
      </div>
      <div className="hero-layout">
        <section className="hero-equipment">
          <div className="equipment-stage">
            <div className="equipment-column">
              {view.catalog.slots.slice(0, 4).map((slot) => (
                <EquipmentSlot
                  key={slot}
                  slot={slot}
                  view={view}
                  inspect={inspect}
                />
              ))}
            </div>
            <div className="character-portrait">
              <div className="portrait-ring" />
              <img
                src={`/art/hero-${family}.png`}
                alt={`Проводник, ${view.catalog.familyNames[family]}`}
              />
              <span className="character-level">{view.state.level}</span>
            </div>
            <div className="equipment-column">
              {view.catalog.slots.slice(4).map((slot) => (
                <EquipmentSlot
                  key={slot}
                  slot={slot}
                  view={view}
                  inspect={inspect}
                />
              ))}
            </div>
          </div>
          <div className="hero-stats">
            {[
              { Icon: Swords, label: "Сила", value: fmt(view.stats.power) },
              { Icon: Heart, label: "Здоровье", value: fmt(view.stats.hp) },
              { Icon: Shield, label: "Защита", value: fmt(view.stats.armor) },
              {
                Icon: Crosshair,
                label: "Крит. шанс",
                value: `${Math.round(view.stats.crit * 100)}%`,
              },
            ].map(({ Icon, label, value }) => (
              <div key={label}>
                <Icon size={17} />
                <b>{value}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="xp-heading">
            <span>Уровень {view.state.level}</span>
            <span>
              {fmt(view.state.xp)} / {fmt(view.xpToNext)} опыта
            </span>
          </div>
          <div className="thin-progress xp">
            <span
              style={{
                width: `${view.xpToNext ? Math.min(100, (view.state.xp / view.xpToNext) * 100) : 100}%`,
              }}
            />
          </div>
          <div className="preset-heading">
            <h3>Сохранённые сборки</h3>
            <span>3 / 3</span>
          </div>
          <div className="presets">
            {view.state.presets.map((preset, i) => (
              <div className="preset-row" key={i}>
                <button
                  disabled={busy}
                  onClick={() =>
                    void command({ type: "preset_load", index: i })
                  }
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <b>{preset.name}</b>
                  <ChevronRight size={15} />
                </button>
                <IconButton
                  icon={Save}
                  label={`Сохранить текущую сборку в «${preset.name}»`}
                  disabled={busy}
                  onClick={() =>
                    void command({
                      type: "preset_save",
                      index: i,
                      name: preset.name,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section className="inventory">
          <SectionTitle
            action={
              <span className="micro-label">
                {view.state.inventory.length} ПРЕДМЕТОВ
              </span>
            }
          >
            Рюкзак
          </SectionTitle>
          <div className="inventory-filters">
            <label className="search">
              <Search size={15} />
              <input
                aria-label="Поиск предмета"
                placeholder="Найти предмет"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Фильтр по слоту"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Slot | "all")}
            >
              <option value="all">Все слоты</option>
              {view.catalog.slots.map((slot) => (
                <option value={slot} key={slot}>
                  {view.catalog.slotNames[slot]}
                </option>
              ))}
            </select>
            <select
              aria-label="Фильтр по редкости"
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
            >
              <option value="all">Все редкости</option>
              {Object.entries(view.catalog.rarityNames).map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="inventory-grid">
            {items.slice(0, visibleItems).map((item) => (
              <ItemTile
                item={item}
                catalog={view.catalog}
                key={item.id}
                equipped={Object.values(build.equipment).includes(item.id)}
                onClick={() => inspect(item)}
              />
            ))}
          </div>
          {items.length > visibleItems && (
            <button
              className="text-button"
              onClick={() => setVisibleItems(visibleItems + 60)}
            >
              Показать ещё <ChevronDown size={15} />
            </button>
          )}
          {items.length === 0 && (
            <div className="empty-state">
              <Backpack size={28} />
              <p>Таких предметов пока нет</p>
              <button
                className="text-button"
                onClick={() => {
                  setFilter("all");
                  setRarity("all");
                  setSearch("");
                }}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
        </section>
      </div>
      <BuildEditor
        view={view}
        command={command}
        busy={busy}
        onTrain={onTrain}
        onDirtyChange={setBuildDirty}
      />
    </>
  );
}
function EquipmentSlot({
  slot,
  view,
  inspect,
}: {
  slot: Slot;
  view: GameView;
  inspect: (i: Item) => void;
}) {
  const build = view.state.pendingBuild || view.state.build;
  const item = view.state.inventory.find((i) => i.id === build.equipment[slot]);
  return (
    <button
      className={`equipment-slot rarity-${item?.rarity || "common"}`}
      title={item?.name}
      onClick={() => item && inspect(item)}
    >
      <small>{view.catalog.slotNames[slot]}</small>
      {item && <ItemImage item={item} />}
      <b>+{view.state.upgrades[slot]}</b>
    </button>
  );
}

function Workshop({
  view,
  command,
  busy,
  notify,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  notify: (message: string) => void;
}) {
  const [slot, setSlot] = useState<Slot>("weapon");
  const [craftSlot, setCraftSlot] = useState<Slot>("weapon");
  const [family, setFamily] = useState<Family>("blade");
  const [affix, setAffix] = useState<Affix>(allowedAffixes("weapon")[0]);
  const [confirmCraft, setConfirmCraft] = useState(false);
  const level = view.state.upgrades[slot];
  const cost = view.catalog.upgradeCosts[level];
  const cap = upgradeCap(view.state.level);
  const canAfford = (price: Wallet) =>
    Object.entries(price).every(
      ([key, value]) => view.state.wallet[key as keyof Wallet] >= value,
    );
  const item = view.state.inventory.find(
    (i) => i.id === view.state.build.equipment[slot],
  )!;
  const craftLevel = Math.max(...view.catalog.routes.filter(route => view.state.unlockedRoutes.includes(route.id)).map(route => route.itemLevel));
  const craftCost = { coins: 600, thread: Math.max(12, 2 * Math.ceil(craftLevel / 10) + 1), catalyst: 0 };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">РЕМЕСЛО ТЕРРАС</p>
          <h1>Мастерская</h1>
          <p className="subtitle">Вещи меняются. Мастерство остаётся.</p>
        </div>
        <Hammer className="heading-art" size={42} strokeWidth={1.2} />
      </div>
      <div className="workshop-layout">
        <section>
          <SectionTitle>Усиление снаряжения</SectionTitle>
          <div className="upgrade-slots">
            {view.catalog.slots.map((s) => {
              const Icon = slotIcons[s];
              return (
                <button
                  className={slot === s ? "active" : ""}
                  key={s}
                  onClick={() => setSlot(s)}
                >
                  <Icon size={20} />
                  <span>{view.catalog.slotNames[s]}</span>
                  <b>+{view.state.upgrades[s]}</b>
                </button>
              );
            })}
          </div>
          <div className="upgrade-detail">
            <div className="upgrade-item-art">
              <ItemImage item={item} />
              <span>+{level}</span>
            </div>
            <div>
              <p className="eyebrow">{view.catalog.slotNames[slot]}</p>
              <h2>{item.name}</h2>
              <p className="muted">Усиление сохраняется при замене предмета</p>
            </div>
          </div>
          <div className="upgrade-comparison">
            <div>
              <span>Сейчас</span>
              <b>+{level}</b>
              <small>+{(level * 1.5).toLocaleString("ru")}% к базе</small>
            </div>
            <ArrowRight size={22} />
            <div>
              <span>После усиления</span>
              <b>+{Math.min(cap, level + 1)}</b>
              <small>
                +{(Math.min(cap, level + 1) * 1.5).toLocaleString("ru")}% к базе
              </small>
            </div>
          </div>
          <div className="craft-footer">
            {level < cap && cost ? (
              <Money wallet={cost} />
            ) : (
              <span className="muted">
                <CheckCheck size={16} /> Ступени террас освоены
              </span>
            )}
            <button
              className="button primary"
              disabled={busy || level >= cap || !cost || !canAfford(cost)}
              onClick={async () => {
                if (await command({ type: "upgrade", slot }))
                  notify(
                    `${view.catalog.slotNames[slot]} усилен до +${level + 1}`,
                  );
              }}
            >
              <Hammer size={16} />{" "}
              {level >= cap ? `Максимум +${cap}` : "Усилить"}
            </button>
          </div>
          {level < cap && cost && !canAfford(cost) && (
            <p className="resource-note">
              Недостающие материалы можно добыть в путешествии.
            </p>
          )}
        </section>
        <section className="crafting">
          <SectionTitle
            action={<span className="micro-label">ТОЧНЫЙ РЕЦЕПТ</span>}
          >
            Создание вещи
          </SectionTitle>
          <div className="craft-visual">
            <ItemImage item={{ slot: craftSlot }} />
            <span className="rarity-label rarity-fine">Тонкое · ур. {craftLevel}</span>
          </div>
          <label className="field">
            Предмет
            <select
              value={craftSlot}
              onChange={(e) => {
                const value = e.target.value as Slot;
                setCraftSlot(value);
                setAffix(allowedAffixes(value)[0]);
              }}
            >
              {view.catalog.slots.map((s) => (
                <option value={s} key={s}>
                  {view.catalog.slotNames[s]}
                </option>
              ))}
            </select>
          </label>
          {craftSlot === "weapon" && (
            <label className="field">
              Семейство
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value as Family)}
              >
                {Object.entries(view.catalog.familyNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Свойство
            <select
              value={affix}
              onChange={(e) => setAffix(e.target.value as Affix)}
            >
              {allowedAffixes(craftSlot).map((a) => (
                <option key={a} value={a}>
                  {view.catalog.affixNames[a]}
                </option>
              ))}
            </select>
          </label>
          <p className="recipe-result">
            <Check size={14} /> Выбранное свойство гарантировано
          </p>
          <div className="craft-footer">
            <Money wallet={craftCost} small />
            <button
              className="button primary"
              disabled={busy || !canAfford(craftCost)}
              onClick={() => setConfirmCraft(true)}
            >
              <Sparkles size={16} /> Создать
            </button>
          </div>
        </section>
      </div>
      {confirmCraft && (
        <Dialog title="Создать предмет" close={() => setConfirmCraft(false)}>
          <div className="confirm-craft">
            <ItemImage item={{ slot: craftSlot }} />
            <h3>{view.catalog.slotNames[craftSlot]} · Тонкое · ур. {craftLevel}</h3>
            <p>{view.catalog.affixNames[affix]}</p>
            <Money wallet={craftCost} />
          </div>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={() => setConfirmCraft(false)}
            >
              Отмена
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await command({
                    type: "craft",
                    slot: craftSlot,
                    family: craftSlot === "weapon" ? family : undefined,
                    affix,
                  })
                ) {
                  setConfirmCraft(false);
                  notify("Новый предмет в рюкзаке");
                }
              }}
            >
              <Hammer size={16} /> Создать предмет
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function WorldMap({
  view,
  command,
  busy,
  go,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  go: (p: Page) => void;
}) {
  const [mode, setMode] = useState<"farm" | "push">(view.state.mode);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">АТЛАС ПРОВОДНИКА</p>
          <h1>Белые террасы</h1>
          <p className="subtitle">Там, где мир впервые разошёлся по шву.</p>
        </div>
        <span className="map-discovery">
          <Compass size={16} /> {view.state.unlockedRoutes.length} / {view.catalog.routes.length} участка
        </span>
      </div>
      <div className="map-banner">
        <img
          src="/art/terraces.png"
          alt="Керамические террасы над стеклянным садом"
        />
        <div>
          <span>ПЕРВАЯ ГЛАВА</span>
          <h2>Собрать мир заново</h2>
        </div>
      </div>
      <div className="route-options">
        <h2>Маршруты</h2>
        <div className="segmented" aria-label="Режим путешествия">
          <button
            className={mode === "farm" ? "active" : ""}
            onClick={() => setMode("farm")}
          >
            <Backpack size={15} /> Добыча
          </button>
          <button
            className={mode === "push" ? "active" : ""}
            onClick={() => setMode("push")}
          >
            <ArrowRight size={15} /> Продвижение
          </button>
        </div>
      </div>
      <div className="route-list">
        {view.catalog.routes.map((route, index) => {
          const unlocked = view.state.unlockedRoutes.includes(route.id);
          const current = view.state.routeId === route.id;
          const previous = view.catalog.routes[index - 1];
          const wins = previous ? view.state.routeWins[previous.id] || 0 : 0;
          return (
            <article
              className={`route-row ${!unlocked ? "locked" : ""}`}
              key={route.id}
            >
              <div className={`route-emblem route-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {route.boss ? (
                  <Swords size={30} />
                ) : index === 0 ? (
                  <Leaf size={30} />
                ) : (
                  <Diamond size={30} />
                )}
              </div>
              <div className="route-info">
                <div className="route-title">
                  <h3>{route.name}</h3>
                  {current && (
                    <span className="status-tag">
                      <i className="live-dot" />
                      Текущий путь
                    </span>
                  )}
                  {route.boss && <span className="boss-label">Хранитель</span>}
                </div>
                <p>{route.description}</p>
                <div className="route-reward">
                  <span>
                    <Mountain size={13} /> Сложность {route.difficulty}
                  </span>
                  <span>
                    <Backpack size={13} /> Вещи ур. {route.itemLevel}
                  </span>
                  <span>
                    <Coins size={13} /> {decimal(route.reward.coins * 3_600_000 / route.rewardPeriodMs)} / ч
                  </span>
                  <span><Layers3 size={13} /> {decimal(route.reward.thread * 3_600_000 / route.rewardPeriodMs)} / ч</span>
                  <span><Zap size={13} /> {fmt(route.reward.xp * 3_600_000 / route.rewardPeriodMs)} опыта / ч</span>
                </div>
                <p className="route-income-note">При победах · находка за {duration(route.lootIntervalMs / 1000)} успешного пути</p>
                {!unlocked && (
                  <p className="unlock-requirement">
                    <LockKeyhole size={12} /> Уровень {Math.min(view.state.level, route.unlockLevel)} / {route.unlockLevel} · Победы: {previous?.name} · {Math.min(wins, route.unlockWins)} / {route.unlockWins}
                  </p>
                )}
              </div>
              <button
                className={`button ${unlocked ? "primary" : "secondary"}`}
                disabled={!unlocked || busy}
                onClick={async () => {
                  if (await command({ type: "route", routeId: route.id, mode }))
                    go("journey");
                }}
              >
                {unlocked ? (
                  <>
                    <Compass size={15} /> Отправиться
                  </>
                ) : (
                  <>
                    <LockKeyhole size={15} /> Не открыт
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
      <section className="target-selection">
        <Target size={22} />
        <div>
          <h3>Цель добычи</h3>
          <p>Предметы выбранного слота будут встречаться чаще.</p>
        </div>
        <select
          aria-label="Целевой слот добычи"
          disabled={busy}
          value={view.state.targetSlot || "all"}
          onChange={(e) =>
            void command({
              type: "target",
              slot: e.target.value === "all" ? null : (e.target.value as Slot),
            })
          }
        >
          <option value="all">Любой предмет</option>
          {view.catalog.slots.map((slot) => (
            <option value={slot} key={slot}>
              {view.catalog.slotNames[slot]}
            </option>
          ))}
        </select>
      </section>
    </>
  );
}

function ItemDialog({
  item,
  view,
  close,
  command,
  busy,
  notify,
}: {
  item: Item;
  view: GameView;
  close: () => void;
  command: Command;
  busy: boolean;
  notify: (s: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const liveItem = view.state.inventory.find((i) => i.id === item.id) || item;
  const current = view.state.inventory.find(
    (i) =>
      i.id ===
      (view.state.pendingBuild || view.state.build).equipment[item.slot],
  );
  const equipped = current?.id === item.id;
  const protectedItem =
    Object.values(view.state.build.equipment).includes(item.id) ||
    Object.values(view.state.pendingBuild?.equipment || {}).includes(item.id) ||
    view.state.presets.some((p) =>
      Object.values(p.equipment).includes(item.id),
    );
  return (
    <Dialog title={view.catalog.slotNames[item.slot]} close={close}>
      <div className={`item-detail rarity-${item.rarity}`}>
        <div className="detail-art">
          <ItemImage item={item} />
        </div>
        <span className="rarity-label">
          {view.catalog.rarityNames[item.rarity]} · Уровень {item.level}
        </span>
        <h2>{item.name}</h2>
        {item.family && <p>{view.catalog.familyNames[item.family]}</p>}
        <div className="affix-list">
          {item.affixes.map((a) => (
            <span key={a}>
              <Plus size={12} />
              {view.catalog.affixNames[a]}
            </span>
          ))}
          {!item.affixes.length && <span>Базовое снаряжение</span>}
          {item.special && (
            <span>
              <Sparkles size={13} />
              {item.special === "long_thread"
                ? "Следы сохраняются дольше"
                : "Усиленные щиты, ослабленное лечение"}
            </span>
          )}
        </div>
      </div>
      {!equipped && current && (
        <div className="item-comparison">
          <span>Сейчас надето</span>
          <b>{current.name}</b>
          <small>
            Ур. {current.level}
            {item.level !== current.level && (
              <em
                className={item.level > current.level ? "positive" : "negative"}
              >
                {item.level > current.level ? "+" : ""}
                {item.level - current.level} ур.
              </em>
            )}
          </small>
        </div>
      )}
      <div className="item-detail-meta">
        <span>Усиление слота +{view.state.upgrades[item.slot]}</span>
        <button
          className={`text-button ${liveItem.locked ? "positive" : ""}`}
          disabled={busy}
          onClick={() =>
            void command({
              type: "lock",
              itemId: item.id,
              locked: !liveItem.locked,
            })
          }
        >
          <LockKeyhole size={14} />
          {liveItem.locked ? "Защищено" : "Защитить"}
        </button>
      </div>
      {confirmDelete ? (
        <div className="delete-confirm">
          <p>Разобрать «{item.name}»? Предмет будет утрачен.</p>
          <div>
            <button
              className="button secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Отмена
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await command({ type: "dismantle", itemIds: [item.id] })) {
                  close();
                  notify("Предмет разобран. Нить получена.");
                }
              }}
            >
              <Trash2 size={15} /> Разобрать
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-actions">
          <button
            className="button secondary"
            title={protectedItem ? "Используется в сборке" : undefined}
            disabled={busy || protectedItem || liveItem.locked}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={15} /> Разобрать
          </button>
          <button
            className="button primary"
            disabled={busy || equipped}
            onClick={async () => {
              if (await command({ type: "equip", itemId: item.id })) {
                close();
                notify("Предмет будет надет со следующего боя");
              }
            }}
          >
            <Check size={16} />
            {equipped ? "Надето" : "Надеть"}
          </button>
        </div>
      )}
    </Dialog>
  );
}

function ReportDialog({
  view,
  report,
  close,
}: {
  view: GameView;
  report: JourneyReport | null;
  close: () => void;
}) {
  const battle = view.state.lastBattle;
  return (
    <Dialog title="Отчёт о путешествии" close={close}>
      <div className="report-lead">
        <span className="report-icon">
          <ScrollText size={32} />
        </span>
        <h3>
          {report
            ? `${duration(report.seconds)} в пути`
            : "Следы на Белых террасах"}
        </h3>
        <p>
          {report?.stopped
            ? "Проводник отдохнул и снова отправился в путь."
            : "Всё найденное уже в дорожной сумке."}
        </p>
      </div>
      <div className="report-numbers">
        <div>
          <b>{fmt(report?.wins ?? view.state.totals.wins)}</b>
          <span>побед</span>
        </div>
        <div>
          <b>{fmt(report?.losses ?? view.state.totals.losses)}</b>
          <span>поражений</span>
        </div>
        <div>
          <b>{report?.itemIds.length ?? view.state.totals.items}</b>
          <span>находок</span>
        </div>
      </div>
      {report && (
        <div className="report-rewards">
          <Money wallet={report.rewards} />
          <span>
            <Sparkles size={14} /> +{fmt(report.rewards.xp)} опыта
          </span>
        </div>
      )}
      {battle && (
        <div className="last-battle">
          <span className="micro-label">ПОСЛЕДНИЙ БОЙ</span>
          <h3>{battle.enemy.name}</h3>
          <p>{battle.reason}</p>
          <div>
            <span>
              Урон нанесён <b>{fmt(battle.damageDealt)}</b>
            </span>
            <span>
              Поглощено щитом <b>{fmt(battle.shielding)}</b>
            </span>
            <span>
              Лечение <b>{fmt(battle.healing)}</b>
            </span>
          </div>
        </div>
      )}
      <button className="button primary full" onClick={close}>
        Продолжить путь <ArrowRight size={16} />
      </button>
    </Dialog>
  );
}

export default function App() {
  const game = useGame();
  const [page, setPage] = useState<Page>("journey");
  const [clock, setClock] = useState(Date.now());
  const [paused, setPaused] = useState(
    () =>
      localStorage.getItem("shov-reduced-motion") === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [item, setItem] = useState<Item | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [training, setTraining] = useState<
    (TrainingResult & { routeName: string }) | null
  >(null);
  const [toast, setToast] = useState("");
  const offset = useRef(0);
  const chapterSeen = useRef<{ account: string; completed: string[] } | null>(null);
  useEffect(() => {
    const state = game.view?.state;
    if (!state?.chapter) return;
    const previous = chapterSeen.current;
    chapterSeen.current = { account: state.id, completed: state.chapter.completed };
    if (!previous || previous.account !== state.id || state.chapter.legacy) return;
    const earned = chapterTasks.filter(task => state.chapter.completed.includes(task.id) && !previous.completed.includes(task.id));
    if (earned.length) {
      const coins = earned.reduce((sum, task) => sum + task.reward.coins, 0);
      const thread = earned.reduce((sum, task) => sum + task.reward.thread, 0);
      setToast(`${earned.map(task => task.title).join(', ')}: +${coins} монет, +${thread} нити`);
    }
  }, [game.view?.state]);
  useEffect(() => {
    if (game.view) offset.current = game.view.now - Date.now();
  }, [game.view?.now]);
  useEffect(() => {
    if (page !== "journey") return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setClock(Date.now() + offset.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [page]);
  useEffect(() => {
    localStorage.setItem("shov-reduced-motion", String(paused));
  }, [paused]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    const action = () => {
      setPage("journey");
      setItem(null);
      setSettings(false);
      setReportOpen(false);
      setTraining(null);
      game.closeReport();
    };
    if (
      page !== "journey" ||
      item ||
      settings ||
      reportOpen ||
      training ||
      game.returnReport
    )
      back.show();
    else back.hide();
    back.onClick(action);
    return () => back.offClick(action);
  }, [page, item, settings, reportOpen, training, game.returnReport]);
  const go = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  if (!game.view)
    return (
      <div className="loading-screen">
        <img src="/art/emblem.png" alt="" />
        <h1>ШОВЬ</h1>
        <p>{game.error || "Открываем путь к Белым террасам"}</p>
        {game.error ? (
          <button
            className="button primary"
            onClick={() => void game.connect()}
          >
            <RotateCcw size={16} /> Повторить
          </button>
        ) : (
          <LoaderCircle className="spin" size={22} />
        )}
      </div>
    );
  const view = game.view;
  const activeFamily =
    view.state.inventory.find((i) => i.id === view.state.build.equipment.weapon)
      ?.family || "blade";
  const train = async () => {
    const routeId = view.state.pendingRoute?.routeId || view.state.routeId;
    const result = await game.train(routeId);
    if (result)
      setTraining({
        ...result,
        routeName: view.catalog.routes.find((route) => route.id === routeId)!
          .name,
      });
  };
  return (
    <div className={`app-shell ${paused ? "reduced-motion" : ""}`}>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("journey")}
          aria-label="ШОВЬ, путешествие"
        >
          <img src="/art/emblem.png" alt="" />
          <span>
            ШОВЬ<small>Земли за разломом</small>
          </span>
        </button>
        <div className="sidebar-label">ТВОЙ ПУТЬ</div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => go(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {page === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-world">
          <img src="/art/terraces.png" alt="" />
          <span>01 · Белые террасы</span>
          <p>{view.state.unlockedRoutes.length} из {view.catalog.routes.length} участков открыто</p>
        </div>
        <div className="sidebar-bottom">
          <button className="profile" onClick={() => go("hero")}>
            <span className="profile-picture">
              <img src={`/art/hero-${activeFamily}.png`} alt="" />
            </span>
            <span>
              <b>{view.state.name}</b>
              <small>Проводник · Ур. {view.state.level}</small>
            </span>
            <ChevronRight size={14} />
          </button>
          <div className="connection">
            <span className={game.online ? "" : "offline"}>
              <i className="live-dot" />
              {game.online ? "Путь сохранён" : "Нет соединения"}
            </span>
            <IconButton
              icon={Settings2}
              label="Настройки"
              onClick={() => setSettings(true)}
            />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-world">
            <span className="mobile-brand">ШОВЬ</span>
            <span className="desktop-world">
              <Compass size={15} /> Белые террасы <ChevronDown size={12} />
            </span>
            <span className="early-badge">I</span>
          </div>
          <Money wallet={view.state.wallet} />
          <div className="topbar-actions">
            <IconButton
              icon={ScrollText}
              label="Отчёт о путешествии"
              onClick={() => setReportOpen(true)}
            />
            <IconButton
              icon={Settings2}
              label="Настройки"
              onClick={() => setSettings(true)}
            />
          </div>
        </header>
        {!game.online && (
          <div className="connection-banner">
            <Unplug size={16} /> Соединение потеряно. Путешествие продолжается
            на сервере.
          </div>
        )}
        <main>
          {page === "journey" && (
            <Journey
              view={view}
              now={clock}
              paused={paused}
              setPaused={setPaused}
              go={go}
              inspect={setItem}
              showReport={() => setReportOpen(true)}
            />
          )}
          {page === "hero" && (
            <Hero
              view={view}
              command={game.command}
              busy={game.busy || !game.online}
              inspect={setItem}
              onTrain={() => void train()}
            />
          )}
          {page === "workshop" && (
            <Workshop
              view={view}
              command={game.command}
              busy={game.busy || !game.online}
              notify={setToast}
            />
          )}
          {page === "map" && (
            <WorldMap
              view={view}
              command={game.command}
              busy={game.busy || !game.online}
              go={go}
            />
          )}
          {page === "clan" && <ClanPage view={view} />}
        </main>
        <footer className="world-footer">
          <img src="/art/emblem.png" alt="" />
          <span>Мир помнит каждый твой шаг.</span>
          <span>Белые террасы · Глава I</span>
        </footer>
      </div>
      <nav className="mobile-nav">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => go(id)}
            aria-current={page === id ? "page" : undefined}
          >
            <Icon size={20} />
            <span>
              {id === "journey" ? "Путь" : id === "map" ? "Карта" : label}
            </span>
          </button>
        ))}
      </nav>
      {item && (
        <ItemDialog
          item={item}
          view={view}
          close={() => setItem(null)}
          command={game.command}
          busy={game.busy}
          notify={setToast}
        />
      )}
      {(reportOpen || game.returnReport) && (
        <ReportDialog
          view={view}
          report={game.report}
          close={() => {
            setReportOpen(false);
            game.closeReport();
          }}
        />
      )}
      {training && (
        <Dialog title="Проверка сборки" close={() => setTraining(null)}>
          <div className="report-lead">
            <span className="report-icon">
              <FlaskConical size={30} />
            </span>
            <h3>{training.build}</h3>
            <p>
              {training.runs} боёв · {training.routeName}
            </p>
          </div>
          <div className="report-numbers">
            <div>
              <b>{Math.round((training.wins / training.runs) * 100)}%</b>
              <span>побед</span>
            </div>
            <div>
              <b>{training.averageSeconds.toFixed(1)} с</b>
              <span>средний бой</span>
            </div>
            <div>
              <b>{fmt(training.averageDamage)}</b>
              <span>средний урон</span>
            </div>
          </div>
          <div className="last-battle">
            <h3>
              {training.sample.outcome === "win"
                ? "Путь по силам"
                : "Нужен другой подход"}
            </h3>
            <p>{training.sample.reason}</p>
            <p>
              Средний остаток здоровья:{" "}
              {Math.round(
                (training.averageRemainingHp / training.sample.stats.hp) * 100,
              )}
              %
            </p>
          </div>
          <section className="training-forecast" aria-label="Прогноз добычи">
            <h3>Добыча с этой сборкой</h3>
            {training.blockedEnemyNames.length > 0 && <p className="negative">В испытании не пройдены: {training.blockedEnemyNames.join(', ')}. После трёх поражений герой отступит на предыдущий маршрут.</p>}
            <dl>
              <div><dt>Монеты / час</dt><dd>{decimal(training.expectedHourlyRewards.coins)}</dd></div>
              <div><dt>Нить / час</dt><dd>{decimal(training.expectedHourlyRewards.thread)}</dd></div>
              <div><dt>Опыт / час</dt><dd>{decimal(training.expectedHourlyRewards.xp)}</dd></div>
              <div><dt>Катализаторы / сутки</dt><dd>{decimal(training.expectedHourlyRewards.catalyst * 24)}</dd></div>
              <div><dt>Предметы / сутки</dt><dd>{decimal(training.expectedItemsPerDay)}</dd></div>
            </dl>
            <p>Оценка по {training.runs} боям при неизменной сборке. Поражения учтены.</p>
          </section>
          <button
            className="button primary full"
            onClick={() => setTraining(null)}
          >
            К сборке <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
      {settings && (
        <Dialog title="Настройки" close={() => setSettings(false)}>
          <label className="setting-row">
            <span>
              <b>Спокойная анимация</b>
              <small>Без перемещения камеры и вспышек</small>
            </span>
            <input
              type="checkbox"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
            />
          </label>
          <div className="setting-row">
            <span>
              <b>Автономное путешествие</b>
              <small>До 48 часов после последнего посещения</small>
            </span>
            <Clock3 size={20} />
          </div>
          <div className="setting-row">
            <span>
              <b>Сохранение</b>
              <small>
                {game.online
                  ? "Прогресс синхронизирован"
                  : "Ожидаем соединения"}
              </small>
            </span>
            {game.online ? <CheckCheck size={20} /> : <Unplug size={20} />}
          </div>
        </Dialog>
      )}
      {(game.error || toast) && (
        <div
          className={`toast ${game.error ? "error" : ""}`}
          role={game.error ? "alert" : "status"}
        >
          {game.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{game.error || toast}</span>
          <IconButton
            icon={X}
            label="Скрыть сообщение"
            onClick={() => {
              game.setError("");
              setToast("");
            }}
          />
        </div>
      )}
      {game.busy && (
        <div className="busy-indicator" role="status" aria-label="Сохраняем">
          <LoaderCircle size={17} className="spin" />
        </div>
      )}
    </div>
  );
}
