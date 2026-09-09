import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  Moon,
  Monitor,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Save,
  ScrollText,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Sun,
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
import { computeStats, routeEnemy } from '../shared/engine';
import { chapterTasks } from "../shared/chapter";
import { canCraftResonant, craftingCost, gearLevelCap, reforgeCost, itemProtection, salvageValue } from "../shared/equipment";
import { formatItemAffix } from "../shared/item-affixes";
import Dialog from './components/GameDialog';
import ItemTile, { ItemImage } from './components/ItemCard';
import InventoryPanel from './components/InventoryPanel';
import SkillIcon from './components/SkillIcon';
import BattleSkills from './components/BattleSkills';
import Introduction from './components/Introduction';
import ProfileSettings from './components/ProfileSettings';
import { useTheme, type Theme } from './theme';
import BattleScene from "./components/BattleScene";
import ChapterProgress from "./components/ChapterProgress";
import CollapsibleSection from "./components/CollapsibleSection";
import { revealAnchor, type Navigate, type Page, type PageAnchor } from "./navigation";
import ClanPage from "./components/ClanPage";
import { useGame } from "./api";
import AudioSettings from './components/AudioSettings';
import { useGameAudio } from './audio/useGameAudio';

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
  three_marks: "Три дозы яда на враге",
  under_three_marks: "Меньше трёх доз яда",
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
      <span title="Материалы">
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
  go,
  inspect,
  showReport,
}: {
  view: GameView;
  now: number;
  paused: boolean;
  go: Navigate;
  inspect: (i: Item) => void;
  showReport: () => void;
}) {
  const { state, catalog } = view;
  const route = catalog.routes.find((r) => r.id === state.routeId)!;
  const region = catalog.regions.find((r) => r.id === route.regionId)!;
  const regionRoutes = catalog.routes.filter((r) => r.regionId === region.id);
  const frame = battleFrame(state.battle, now);
  const elapsed = Math.max(0, now - state.battle.startedAt);
  const recent = state.battle.events
    .filter((e) => e.at <= elapsed)
    .slice(-3)
    .reverse();
  const routeIndex = catalog.routes.findIndex((r) => r.id === route.id);
  const regionRouteIndex = regionRoutes.findIndex((r) => r.id === route.id);
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
            <span className="chapter-mark">{String(region.order).padStart(2, "0")}</span> {region.name.toLocaleUpperCase("ru")}
          </p>
          <h1>Путь продолжается</h1>
          <p className="subtitle">Новые земли, редкая добыча и сильные противники.</p>
        </div>
        <button className="button secondary" onClick={() => go("map", "routes")}>
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
              {String(regionRouteIndex + 1).padStart(2, "0")} / {String(regionRoutes.length).padStart(2, "0")}
            </span>
          </div>
          <div className="stage-tools">
            <span className="battle-time">
              <Clock3 size={13} />
              {duration(Math.min(elapsed, state.battle.combatMs) / 1000)}
            </span>
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
      <BattleSkills battle={state.battle} skills={state.build.skills.map(id => catalog.skills.find(skill => skill.id === id)!).filter(Boolean)} now={now} />
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
          {state.chapter && state.chapter.completed.length < chapterTasks.length ? <ChapterProgress view={view} go={go} /> : <>
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
              <h3>{nextRoute ? nextRoute.name : "За краем атласа"}</h3>
              <p>
                {nextRoute
                  ? `Открытие: уровень ${nextLevel} и ${nextNeeded} побед`
                  : "Все земли открыты. Совершенствуй сборку для клановой экспедиции."}
              </p>
            </div>
            {nextRoute && <b>
              {Math.min(wins, nextNeeded)}
              <small> / {nextNeeded}</small>
            </b>}
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
              <p className="muted">Герой выходит на тропу.</p>
            )}
          </div>
        </section>
      </div>
      <section className="finds">
        <SectionTitle
          action={
            <button className="text-button" onClick={() => go("hero", "inventory")}>
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
  const moveSkill = (index: number, delta: number) => {
    const next = [...skills];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setSkills(next);
    setDirty(true);
  };
  return (
    <CollapsibleSection id="build" title="Умения и тактика" className="build-editor" meta={dirty ? "Не сохранено" : "4 умения"}
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
      <p className="mechanic-note">Сначала герой проверяет правила ниже. Если подходящего правила нет, использует готовое умение без правил в порядке 1–4. Если ни одно не готово, наносит обычный удар.</p>
      <div className="skill-grid">
        {skills.map((id, index) => {
          const skill = view.catalog.skills.find((s) => s.id === id);
          return (
            <div className="skill-control" key={index}>
              <span className={`skill-symbol family-${skill?.family}`}>
                <SkillIcon id={id} />
                <b className="skill-order">{index + 1}</b>
              </span>
              <span>
                <span className="skill-queue-label">Ячейка {index + 1}</span>
                <select
                  aria-label={`Умение ${index + 1}`}
                  data-anchor-focus={index === 0 ? "true" : undefined}
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
                  Перезарядка: {skill?.cooldown} с · {skill?.description}
                </small>
                <span className="skill-queue-actions">
                  <IconButton icon={ArrowLeft} label={`Умение ${index + 1}: раньше в очереди`} disabled={index === 0 || busy} onClick={() => moveSkill(index, -1)} />
                  <IconButton icon={ArrowRight} label={`Умение ${index + 1}: позже в очереди`} disabled={index === skills.length - 1 || busy} onClick={() => moveSkill(index, 1)} />
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {Number.isFinite(nextUnlock) && <p className="skill-unlock"><LockKeyhole size={14} /> Уровень {nextUnlock}: {available.filter(skill => skill.unlockLevel === nextUnlock).map(skill => skill.name).join(', ')}</p>}
      <div className="rule-heading">
        <h3>Правила: сверху вниз</h3>
        <span>{rules.length} из 3 правил</span>
      </div>
      <p className="mechanic-note">Приоритет 1 выше остальных: сработает первое подходящее правило с готовым умением. Умение с правилом используется только по его условиям; стрелки меняют приоритет.</p>
      <div className="rules">
        {rules.map((rule, index) => (
          <div className="rule-row" key={index}>
            <span className="rule-index" title={`Приоритет ${index + 1}${index === 0 ? ": самый высокий" : ""}`} aria-label={`Приоритет ${index + 1}`}>{index + 1}</span>
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
                  <option key={v} value={v}>{v}%</option>
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
                label={`Повысить приоритет правила ${index + 1}`}
                disabled={index === 0 || busy}
                onClick={() => moveRule(index, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Понизить приоритет правила ${index + 1}`}
                disabled={index === rules.length - 1 || busy}
                onClick={() => moveRule(index, 1)}
              />
              <IconButton
                icon={X}
                label={`Удалить правило ${index + 1}`}
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
    </CollapsibleSection>
  );
}

function Hero({
  view,
  command,
  busy,
  inspect,
  onTrain,
  go,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  inspect: (i: Item) => void;
  onTrain: () => void;
  go: Navigate;
}) {
  const [buildDirty, setBuildDirty] = useState(false);
  const build = view.state.pendingBuild || view.state.build;
  const family =
    view.state.inventory.find((i) => i.id === build.equipment.weapon)?.family ||
    "blade";
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ГЕРОЙ</p>
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
      <nav className="section-links" aria-label="Разделы героя">
        <button onClick={() => go("hero", "equipment")}><Shield size={15} /> Снаряжение</button>
        <button onClick={() => go("hero", "inventory")}><Backpack size={15} /> Рюкзак</button>
        <button onClick={() => go("hero", "build")}><Swords size={15} /> Умения</button>
        <button onClick={() => go("hero", "presets")}><Save size={15} /> Сборки</button>
      </nav>
      <div className="hero-layout">
        <div className="hero-equipment">
          <CollapsibleSection id="equipment" title="Снаряжение" meta="8 слотов">
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
                src={`/art/fantasy/hero-${family}.png`}
                alt={`Герой, ${view.catalog.familyNames[family]}`}
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
          </CollapsibleSection>
          <CollapsibleSection id="presets" title="Сохранённые сборки" meta="3 ячейки">
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
          </CollapsibleSection>
        </div>
        <InventoryPanel view={view} command={command} busy={busy} inspect={inspect} />
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
  const [secondAffix, setSecondAffix] = useState<Affix>(allowedAffixes("weapon")[1]);
  const [rarity, setRarity] = useState<"fine" | "resonant">("fine");
  const [confirmCraft, setConfirmCraft] = useState(false);
  const [reforgeId, setReforgeId] = useState(view.state.build.equipment.weapon);
  const reforgeItem = view.state.inventory.find(item => item.id === reforgeId) ?? view.state.inventory[0];
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
  const craftLevel = gearLevelCap(view.state);
  const resonantUnlocked = canCraftResonant(view.state);
  const craftCost = craftingCost(craftLevel, rarity);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">КУЗНИЦА ГИЛЬДИИ</p>
          <h1>Мастерская</h1>
          <p className="subtitle">Вещи меняются. Мастерство остаётся.</p>
        </div>
        <Hammer className="heading-art" size={42} strokeWidth={1.2} />
      </div>
      <div className="workshop-layout">
        <CollapsibleSection id="upgrade" title="Усиление слота">
          <p className="mechanic-note">Каждый ранг даёт +1,5% к базовым характеристикам вещи в этом слоте. Бонус остаётся при любой замене снаряжения; уровень самой вещи не меняется.</p>
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
                <CheckCheck size={16} /> Достигнут предел усиления
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
        </CollapsibleSection>
        <CollapsibleSection id="craft" title="Создание вещи" className="crafting" meta="Точный рецепт">
          <div className="craft-visual">
            <ItemImage item={{ slot: craftSlot, family }} />
            <span className={`rarity-label rarity-${rarity}`}>{view.catalog.rarityNames[rarity]} · ур. {craftLevel}</span>
          </div>
          <div className="segmented craft-rarity" role="group" aria-label="Качество создаваемой вещи">
            <button className={rarity === "fine" ? "active" : ""} aria-pressed={rarity === "fine"} onClick={() => setRarity("fine")}><Sparkles size={15} /> Редкое</button>
            <button className={rarity === "resonant" ? "active" : ""} aria-pressed={rarity === "resonant"} disabled={!resonantUnlocked} onClick={() => setRarity("resonant")}><Gem size={15} /> Эпическое</button>
          </div>
          {!resonantUnlocked && <p className="craft-unlock"><LockKeyhole size={13} /> Эпические рецепты: уровень 25 и открытые Пепельные земли.</p>}
          <label className="field">
            Предмет
            <select
              value={craftSlot}
              onChange={(e) => {
                const value = e.target.value as Slot;
                setCraftSlot(value);
                setAffix(allowedAffixes(value)[0]);
                setSecondAffix(allowedAffixes(value)[1]);
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
              onChange={(e) => {
                const next = e.target.value as Affix;
                setAffix(next);
                if (next === secondAffix) setSecondAffix(allowedAffixes(craftSlot).find((value) => value !== next)!);
              }}
            >
              {allowedAffixes(craftSlot).map((a) => (
                <option key={a} value={a}>
                  {view.catalog.affixNames[a]}
                </option>
              ))}
            </select>
          </label>
          {rarity === "resonant" && <label className="field">
            Второе свойство
            <select value={secondAffix} onChange={(e) => setSecondAffix(e.target.value as Affix)}>
              {allowedAffixes(craftSlot).filter((value) => value !== affix).map((value) => <option key={value} value={value}>{view.catalog.affixNames[value]}</option>)}
            </select>
          </label>}
          <p className="recipe-result">
            <Check size={14} /> {rarity === "resonant" ? "Оба свойства гарантированы" : "Выбранное свойство гарантировано"}
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
        </CollapsibleSection>
      </div>
      <CollapsibleSection id="reforge" title="Перековка вещи" className="workshop-reforge" meta="Сохранить удачные свойства">
        <label className="field">Предмет для перековки<select aria-label="Предмет для перековки" value={reforgeItem?.id} onChange={event => setReforgeId(event.target.value)}>{view.state.inventory.map(item => <option key={item.id} value={item.id}>{item.name} · ур. {item.level}</option>)}</select></label>
        {reforgeItem && <ReforgeItem key={reforgeItem.id} item={reforgeItem} view={view} command={command} busy={busy} notify={notify} />}
      </CollapsibleSection>
      {confirmCraft && (
        <Dialog title="Создать предмет" close={() => setConfirmCraft(false)}>
          <div className="confirm-craft">
            <ItemImage item={{ slot: craftSlot, family }} />
            <h3>{view.catalog.slotNames[craftSlot]} · {view.catalog.rarityNames[rarity]} · ур. {craftLevel}</h3>
            <p>{[affix, ...(rarity === "resonant" ? [secondAffix] : [])].map((value) => view.catalog.affixNames[value]).join(" · ")}</p>
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
              disabled={busy || !canAfford(craftCost)}
              onClick={async () => {
                if (
                  await command({
                    type: "craft",
                    slot: craftSlot,
                    family: craftSlot === "weapon" ? family : undefined,
                    affix,
                    rarity,
                    secondAffix: rarity === "resonant" ? secondAffix : undefined,
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
  onTrain,
}: {
  view: GameView;
  command: Command;
  busy: boolean;
  go: Navigate;
  onTrain: (routeId: string) => void;
}) {
  const mode = view.state.pendingRoute?.mode ?? view.state.mode;
  const currentRoute = view.catalog.routes.find((route) => route.id === view.state.routeId)!;
  const plannedRoute = view.catalog.routes.find((route) => route.id === view.state.pendingRoute?.routeId) ?? currentRoute;
  const nextRoute = view.catalog.routes[view.catalog.routes.indexOf(plannedRoute) + 1];
  const nextUnlocked = nextRoute && view.state.unlockedRoutes.includes(nextRoute.id);
  const [regionId, setRegionId] = useState(currentRoute.regionId);
  const region = view.catalog.regions.find((entry) => entry.id === regionId)!;
  const routes = view.catalog.routes.filter((route) => route.regionId === regionId);
  const unlockedCount = routes.filter((route) => view.state.unlockedRoutes.includes(route.id)).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">АТЛАС ПРИКЛЮЧЕНИЙ</p>
          <h1>Карта королевства</h1>
          <p className="subtitle">{view.catalog.regions.length} региона · от лесных троп до логова дракона.</p>
        </div>
        <span className="map-discovery">
          <Compass size={16} /> {view.state.unlockedRoutes.length} / {view.catalog.routes.length} участка
        </span>
      </div>
      <div className="region-tabs" role="tablist" aria-label="Земли атласа">
        {view.catalog.regions.map((entry) => {
          const areaRoutes = view.catalog.routes.filter((route) => route.regionId === entry.id);
          const count = areaRoutes.filter((route) => view.state.unlockedRoutes.includes(route.id)).length;
          return <button key={entry.id} id={`region-tab-${entry.id}`} role="tab" aria-label={entry.name} aria-selected={entry.id === regionId} aria-controls="region-routes" tabIndex={entry.id === regionId ? 0 : -1} className={entry.id === regionId ? "selected" : ""} onClick={() => setRegionId(entry.id)} onKeyDown={(event) => {
            const index = view.catalog.regions.indexOf(entry);
            const nextIndex = event.key === "ArrowRight" ? (index + 1) % view.catalog.regions.length : event.key === "ArrowLeft" ? (index + view.catalog.regions.length - 1) % view.catalog.regions.length : event.key === "Home" ? 0 : event.key === "End" ? view.catalog.regions.length - 1 : null;
            if (nextIndex === null) return;
            event.preventDefault();
            const next = view.catalog.regions[nextIndex];
            setRegionId(next.id);
            document.getElementById(`region-tab-${next.id}`)?.focus();
          }}>
            <span className="region-tab-number">{String(entry.order).padStart(2, "0")}</span>
            <strong>{entry.name}</strong>
            <span>{count ? <Compass size={12} /> : <LockKeyhole size={12} />}{count} / {areaRoutes.length}</span>
          </button>;
        })}
      </div>
      <section id="region-routes" role="tabpanel" aria-labelledby={`region-tab-${region.id}`}>
      <div className="map-banner">
        <img
          src={region.image}
          alt={region.name}
          style={{ filter: region.sceneFilter }}
        />
        <div>
          <span>{region.subtitle}</span>
          <h2>{region.name}</h2>
        </div>
      </div>
      <div className="region-summary"><p>{region.description}</p><span>{unlockedCount} / {routes.length} участков открыто</span></div>
      <div className="route-options" id="routes" tabIndex={-1}>
        <h2>Маршруты</h2>
        <div className="segmented" role="group" aria-label="Режим путешествия">
          <button
            className={mode === "farm" ? "active" : ""}
            aria-pressed={mode === "farm"}
            title="Повторять текущий маршрут"
            disabled={busy}
            onClick={() => { if (mode !== "farm") void command({ type: "mode", mode: "farm" }); }}
          >
            <Backpack size={15} /> Добыча
          </button>
          <button
            className={mode === "push" ? "active" : ""}
            aria-pressed={mode === "push"}
            title="Переходить на следующий открытый маршрут после победы"
            disabled={busy}
            onClick={() => { if (mode !== "push") void command({ type: "mode", mode: "push" }); }}
          >
            <ArrowRight size={15} /> Продвижение
          </button>
        </div>
      </div>
      <div className="route-mode-status" role="status" aria-live="polite">
        {mode === "farm" ? <Backpack size={18} /> : <ArrowRight size={18} />}
        <div>
          <strong>{view.state.pendingRoute
            ? `Далее: ${plannedRoute.name}`
            : mode === "farm" ? `Добыча: ${currentRoute.name}`
              : nextRoute ? `Цель: ${nextRoute.name}` : `Последний маршрут: ${currentRoute.name}`}</strong>
          <span>{view.state.pendingRoute
            ? `После текущего боя · ${mode === "farm" ? "Добыча" : "Продвижение"}`
            : mode === "farm" ? "Маршрут закреплён"
              : nextRoute ? nextUnlocked ? "Переход после победы"
                : `Уровень ${Math.min(view.state.level, nextRoute.unlockLevel)} / ${nextRoute.unlockLevel} · Победы: ${Math.min(view.state.routeWins[currentRoute.id] || 0, nextRoute.unlockWins)} / ${nextRoute.unlockWins}`
                : "Добыча продолжается"}</span>
        </div>
      </div>
      <div className="route-list">
        {routes.map((route, index) => {
          const unlocked = view.state.unlockedRoutes.includes(route.id);
          const current = view.state.routeId === route.id;
          const pending = view.state.pendingRoute?.routeId === route.id;
          const previous = view.catalog.routes[view.catalog.routes.findIndex((entry) => entry.id === route.id) - 1];
          const wins = previous ? view.state.routeWins[previous.id] || 0 : 0;
          return (
            <article
              className={`route-row ${!unlocked ? "locked" : ""}`}
              key={route.id}
              aria-label={route.name}
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
                  {pending && <span className="status-tag"><Clock3 size={12} /> Следующий путь</span>}
                  {route.boss && <span className="boss-label">Хранитель</span>}
                  {route.resonant && <span className="resonant-route"><Gem size={12} /> Эпическая добыча</span>}
                </div>
                <p>{route.description}</p>
                <div className="route-reward">
                  <span>
                    <Mountain size={13} /> Сложность {route.difficulty}
                  </span>
                  <span>
                    <Backpack size={13} /> Вещи до ур. {route.itemLevel}
                  </span>
                  <span>
                    <Coins size={13} /> {decimal(route.reward.coins * 3_600_000 / route.rewardPeriodMs)} / ч
                  </span>
                  <span><Layers3 size={13} /> {decimal(route.reward.thread * 3_600_000 / route.rewardPeriodMs)} / ч</span>
                  <span><Zap size={13} /> {fmt(route.reward.xp * 3_600_000 / route.rewardPeriodMs)} опыта / ч</span>
                  {route.reward.catalyst > 0 && <span><Gem size={13} /> {decimal(route.reward.catalyst * 86_400_000 / route.rewardPeriodMs)} / сутки</span>}
                </div>
                <p className="route-income-note">При победах · находка за {duration(route.lootIntervalMs / 1000)} успешного пути</p>
                <details className="route-enemies">
                  <summary>Противники · {route.enemyIds.length}</summary>
                  <div>{route.enemyIds.map((id) => {
                    const enemy = routeEnemy(view.state, route, id);
                    return <div className="route-enemy" key={id}>
                      <img src={`/art/fantasy/enemies/${enemy.id}.png`} alt="" loading="lazy" />
                      <div><strong>{enemy.name} <small>Ур. {enemy.level}</small></strong><p>{enemy.description}</p><span><Heart size={11} /> {fmt(enemy.hp)} <Swords size={11} /> {fmt(enemy.power)} <Shield size={11} /> {fmt(enemy.armor)}</span></div>
                    </div>;
                  })}</div>
                </details>
                {!unlocked && (
                  <p className="unlock-requirement">
                    <LockKeyhole size={12} /> Уровень {Math.min(view.state.level, route.unlockLevel)} / {route.unlockLevel} · Победы: {previous?.name} · {Math.min(wins, route.unlockWins)} / {route.unlockWins}
                  </p>
                )}
              </div>
              <div className="route-actions">
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
              {unlocked && <button className="text-button" disabled={busy} aria-label={`Проверить сборку: ${route.name}`} onClick={() => onTrain(route.id)}><FlaskConical size={15} /> Проверить сборку</button>}
              </div>
            </article>
          );
        })}
      </div>
      </section>
      <section className="target-selection" id="target" tabIndex={-1}>
        <Target size={22} />
        <div>
          <h3>Цель добычи</h3>
          <p>{view.state.targetSlot ? `${view.catalog.slotNames[view.state.targetSlot]}: 50% находок. Остальные 50% делятся между другими слотами.` : "Любой предмет: каждый из 8 слотов имеет равный шанс 12,5%."}</p>
          <p>Выбор слота меняет только тип предмета. Частота находок, редкость и уровень остаются прежними.</p>
        </div>
        <select
          aria-label="Целевой слот добычи"
          data-anchor-focus="true"
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

function ReforgeItem({ item, view, command, busy, notify }: {
  item: Item;
  view: GameView;
  command: Command;
  busy: boolean;
  notify: (message: string) => void;
}) {
  const cap = gearLevelCap(view.state);
  const [target, setTarget] = useState(cap);
  const [quote, setQuote] = useState<{ from: number; to: number; cost: Wallet } | null>(null);
  const level = quote?.to ?? Math.max(item.level + 1, Math.min(cap, target));
  if (cap <= item.level && !quote) return <div className="reforge-cap"><Hammer size={14} /><span>Перековка откроется с ростом уровня и освоением новых маршрутов.</span></div>;
  const cost = quote?.cost ?? reforgeCost(item.level, level);
  const staleQuote = quote !== null && (item.level !== quote.from || cap < quote.to);
  const craftCost = craftingCost(level);
  const affordable = Object.entries(cost).every(([key, value]) => view.state.wallet[key as keyof Wallet] >= value);
  return <section className="reforge-item" aria-label="Перековка предмета">
    <div className="section-title"><h3>Перековка</h3><span className="micro-label">УРОВЕНЬ ВЕЩИ</span></div>
    <div className="reforge-levels">
      <span>Ур. <b>{quote?.from ?? item.level}</b></span><ArrowRight size={18} />
      {quote ? <span>Ур. <b>{quote.to}</b></span> : <label><span className="sr-only">Новый уровень предмета</span><select value={level} disabled={busy} onChange={(event) => setTarget(Number(event.target.value))}>{Array.from({ length: cap - item.level }, (_, index) => item.level + 1 + index).map((value) => <option value={value} key={value}>Уровень {value}</option>)}</select></label>}
    </div>
    <p>Повышает уровень только этой вещи. Бонусы, их величины и редкость сохраняются. Усиление слота оплачивается отдельно и действует на любую надетую в него вещь.</p>
    {(item.rarity === "common" || item.rarity === "fine") && cost.coins > craftCost.coins && cost.thread >= craftCost.thread && <p className="reforge-alternative">Новая редкая вещь этого уровня в мастерской: {fmt(craftCost.coins)} монет и {fmt(craftCost.thread)} материалов. Перековка выгодна, когда важно сохранить удачные свойства.</p>}
    <div className="craft-footer"><Money wallet={cost} small />{!quote && <button className="button secondary" disabled={busy || !affordable} onClick={() => setQuote({ from: item.level, to: level, cost })}><Hammer size={15} /> Перековать</button>}</div>
    {!affordable && <p className="resource-note">Недостаточно материалов для перековки.</p>}
    {quote && <div className="reforge-confirm">
      <p>Перековать «{item.name}» с {quote.from} до {quote.to} уровня?</p>
      {staleQuote && <p role="alert">Предмет или предел перековки изменился. Обнови расчёт перед подтверждением.</p>}
      <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setQuote(null)}>{staleQuote ? "Обновить расчёт" : "Отмена"}</button><button className="button primary" disabled={busy || !affordable || staleQuote} onClick={async () => {
        if (staleQuote) return;
        if (await command({ type: "reforge", itemId: item.id, level: quote.to })) {
          setQuote(null);
          notify(`Предмет перекован до ${quote.to} уровня`);
        }
      }}><Hammer size={15} /> Подтвердить перековку</button></div>
    </div>}
  </section>;
}

function ItemDialog({
  item: initialItem,
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
  const item = view.state.inventory.find((i) => i.id === initialItem.id) || initialItem;
  const liveItem = item;
  const current = view.state.inventory.find(
    (i) =>
      i.id ===
      (view.state.pendingBuild || view.state.build).equipment[item.slot],
  );
  const equipped = current?.id === item.id;
  const protection = itemProtection(view.state, item);
  const activeBuild = view.state.pendingBuild ?? view.state.build;
  const preview = computeStats({ ...view.state, rng: 0, nextItemId: 0 }, { ...activeBuild, equipment: { ...activeBuild.equipment, [item.slot]: item.id } });
  const footer = <>
    {protection && <p className="item-protection"><LockKeyhole size={14} />{protection}. Разбор недоступен.</p>}
    {confirmDelete ? <div className="delete-confirm">
      <p>Разобрать «{item.name}»? Материалы: +{salvageValue(item)}.</p>
      <div><button className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Отмена</button><button className="button danger" disabled={busy || !!protection} onClick={async () => {
        if (await command({ type: 'dismantle', itemIds: [item.id] })) { close(); notify(`Предмет разобран. Материалы: +${salvageValue(item)}.`); }
      }}><Trash2 size={15} />Подтвердить разбор</button></div>
    </div> : <div className="dialog-actions">
      <button className="button secondary" disabled={busy || !!protection} onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Разобрать</button>
      <button className="button primary" disabled={busy || equipped} onClick={async () => { if (await command({ type: 'equip', itemId: item.id })) { close(); notify('Предмет будет надет со следующего боя'); } }}><Check size={16} />{equipped ? 'Надето' : 'Надеть'}</button>
    </div>}
  </>;
  return (
    <Dialog title={view.catalog.slotNames[item.slot]} close={close} footer={footer} busy={busy}>
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
              {formatItemAffix(item, a)}
            </span>
          ))}
          {!item.affixes.length && <span>Базовое снаряжение</span>}
          {item.special && (
            <span>
              <Sparkles size={13} />
              {item.special === "long_thread"
                ? "Яд действует дольше"
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
      {!equipped && <div className="item-stat-comparison" aria-label="Изменение характеристик героя">{([
        ['power', 'Сила'], ['hp', 'Здоровье'], ['armor', 'Защита'], ['crit', 'Крит. шанс'], ['haste', 'Скорость'], ['direct', 'Прямой урон'], ['dot', 'Яд'], ['support', 'Лечение и щиты'],
      ] as const).map(([key, label], index) => { const difference = preview[key] - view.stats[key]; return Math.abs(difference) > 0.00001 ? <div key={key}><span>{label}</span><b className={difference > 0 ? 'positive' : 'negative'}>{difference > 0 ? '+' : ''}{decimal(difference * (index > 2 ? 100 : 1))}{index > 2 ? '%' : ''}</b></div> : null; })}</div>}
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
      <ReforgeItem item={item} view={view} command={command} busy={busy} notify={notify} />
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
            : "Дневник приключений"}
        </h3>
        <p>
          {report?.stopped
            ? "Герой отдохнул и снова отправился в путь."
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
  const { theme, setTheme } = useTheme();
  const introduction = useRef<{ account: string; required: boolean } | null>(null);
  const [introDismissed, setIntroDismissed] = useState(false);
  if (game.view && introduction.current?.account !== game.view.state.id) {
    let status: string | null = null;
    try { status = localStorage.getItem(`shov-introduction:${game.view.state.id}`); } catch { /* The session still remembers completion. */ }
    const required = status === 'pending' || (status !== 'done' && game.view.state.level === 1 && game.view.state.totals.wins === 0);
    introduction.current = { account: game.view.state.id, required };
    if (required) {
      try { localStorage.setItem(`shov-introduction:${game.view.state.id}`, 'pending'); } catch { /* Keep the introduction open in memory. */ }
    }
  }
  const introOpen = !!introduction.current?.required && !introDismissed;
  const [page, setPage] = useState<Page>("journey");
  const [navigationTarget, setNavigationTarget] = useState<{ anchor?: PageAnchor; visit: number } | null>(null);
  const go = useCallback<Navigate>((next, anchor) => {
    setPage(next);
    setNavigationTarget(current => ({ anchor, visit: (current?.visit ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!navigationTarget) return;
    let frame = requestAnimationFrame(() => {
      const target = navigationTarget.anchor ? revealAnchor(navigationTarget.anchor) : null;
      if (!target) {
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      frame = requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start", behavior: "instant" });
        (target.querySelector<HTMLElement>('[data-anchor-focus="true"]') ?? target).focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [page, navigationTarget]);
  const [clock, setClock] = useState(Date.now());
  useGameAudio(game.view?.state.battle, clock, page === 'journey' && !introOpen);
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
    if (!previous || previous.account !== state.id) return;
    const earned = chapterTasks.filter(task => state.chapter.completed.includes(task.id) && !previous.completed.includes(task.id));
    if (earned.length) {
      const coins = earned.reduce((sum, task) => sum + task.reward.coins, 0);
      const thread = earned.reduce((sum, task) => sum + task.reward.thread, 0);
      setToast(`${earned.map(task => task.title).join(', ')}: +${coins} монет, +${thread} материалов`);
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
      go("journey");
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
  if (!game.view)
    return (
      <div className="loading-screen">
        <img src="/art/fantasy/emblem.png" alt="" />
        <h1>ШОВЬ</h1>
        <p>{game.error || "Открываем дорогу приключений"}</p>
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
  if (introOpen) return <Introduction command={game.command} busy={game.busy || !game.online} error={game.error} onContinue={() => {
    try { localStorage.setItem(`shov-introduction:${view.state.id}`, 'done'); } catch { /* Completion is kept in memory for this visit. */ }
    setIntroDismissed(true); game.closeReport(); go('journey');
  }} />;
  const activeRoute = view.catalog.routes.find((route) => route.id === view.state.routeId)!;
  const activeRegion = view.catalog.regions.find((region) => region.id === activeRoute.regionId)!;
  const activeRegionRoutes = view.catalog.routes.filter((route) => route.regionId === activeRegion.id);
  const chapterNumber = ["I", "II", "III"][activeRegion.order - 1] || String(activeRegion.order);
  const activeFamily =
    view.state.inventory.find((i) => i.id === view.state.build.equipment.weapon)
      ?.family || "blade";
  const train = async (routeId = view.state.pendingRoute?.routeId || view.state.routeId) => {
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
          <img src="/art/fantasy/emblem.png" alt="" />
          <span>
            ШОВЬ<small>Дорога приключений</small>
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
        <button className="sidebar-world" onClick={() => go("map")} aria-label={`Открыть атлас: ${activeRegion.name}`}>
          <img src={activeRegion.image} alt="" style={{ filter: activeRegion.sceneFilter }} />
          <span>{String(activeRegion.order).padStart(2, "0")} · {activeRegion.name}</span>
          <p>{activeRegionRoutes.filter((route) => view.state.unlockedRoutes.includes(route.id)).length} из {activeRegionRoutes.length} участков открыто</p>
        </button>
        <div className="sidebar-bottom">
          <button className="profile" onClick={() => go("hero", "equipment")}>
            <span className="profile-picture">
              <img src={`/art/fantasy/hero-${activeFamily}.png`} alt="" />
            </span>
            <span>
              <b>{view.state.name}</b>
              <small>Герой · Ур. {view.state.level}</small>
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
            <button className="desktop-world" onClick={() => go("map")}>
              <Compass size={15} /> {activeRegion.name} <ChevronDown size={12} />
            </button>
            <span className="early-badge">{chapterNumber}</span>
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
              go={go}
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
              onTrain={(routeId) => void train(routeId)}
            />
          )}
          {page === "clan" && <ClanPage view={view} onProfile={() => setSettings(true)} />}
        </main>
        <footer className="world-footer">
          <img src="/art/fantasy/emblem.png" alt="" />
          <span>Мир помнит каждый твой шаг.</span>
          <span>{activeRegion.name} · Глава {chapterNumber}</span>
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
      {item && view.state.inventory.some(entry => entry.id === item.id) && (
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
              <div><dt>Материалы / час</dt><dd>{decimal(training.expectedHourlyRewards.thread)}</dd></div>
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
            Вернуться <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
      {settings && (
        <Dialog title="Настройки" close={() => setSettings(false)}>
          <ProfileSettings onSaved={() => void game.connect()} />
          <section className="theme-settings"><h3>Оформление</h3><div className="theme-switch" role="group" aria-label="Тема оформления">
            {([{ id: 'light', label: 'Светлая', Icon: Sun }, { id: 'dark', label: 'Тёмная', Icon: Moon }, { id: 'system', label: 'Системная', Icon: Monitor }] as const).map(({ id, label, Icon }) => <button key={id} aria-pressed={theme === id} onClick={() => setTheme(id as Theme)}><Icon size={17} />{label}</button>)}
          </div></section>
          <AudioSettings />
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
