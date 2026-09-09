import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Crown,
  FlaskConical,
  Flag,
  LockKeyhole,
  LogOut,
  Medal,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Swords,
  Trash2,
  Trophy,
  UserMinus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type {
  ClanDetail,
  ClanMessage,
  ClanSummary,
  ClanTag,
  SocialCommand,
  SocialView,
} from "../../shared/social";
import {
  raidDefaults,
  raidRoles,
  type RaidLoadout,
  type RaidResult,
  type RaidRole,
} from "../../shared/raid";
import { families } from "../../shared/content";
import type { Condition, Family, GameView, Rule } from "../../shared/types";
import { useSocial } from "../social-api";

type Command = (command: SocialCommand) => Promise<boolean>;
type Confirmation = {
  title: string;
  details: ReactNode;
  action: () => Promise<boolean>;
  label: string;
  danger?: boolean;
};
type Confirm = (confirmation: Confirmation) => void;
const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
const date = (n: number) =>
  new Date(n).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const roleName = (role: RaidRole) =>
  raidRoles.find((entry) => entry.id === role)!.name;
const clanRoles = { leader: "Глава", officer: "Офицер", member: "Участник" };
const raidGoals: Record<RaidRole, string> = {
  rupture: "Три волны. Усильте урон с 4-й по 8-ю секунду каждой схватки.",
  bulwark: "Три волны. Сдержите тяжёлые удары на 9-й и 18-й секунде.",
  cleanse: "Три волны. Снимайте кровотечение на 6-й, 12-й и 18-й секунде.",
};
const tags: Record<ClanTag, string> = {
  calm: "Спокойный ритм",
  builds: "Сборки и тактики",
  competitive: "Соревнования",
};
const conditions: Record<Condition, string> = {
  always: "По готовности",
  hp_below: "Здоровье ниже",
  no_shield: "Нет щита",
  enemy_windup: "Враг готовит удар",
  has_debuff: "Есть вредный эффект",
  vulnerable: "Враг уязвим",
  no_vulnerable: "Нет уязвимости",
  three_marks: "Три заряда яда",
  under_three_marks: "Меньше трёх зарядов яда",
};

function Modal({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const node = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    node.current?.showModal();
    return () => {
      node.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={node}
      className="dialog clan-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          disabled={busy}
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function ClanIdentity({ clan }: { clan: ClanSummary }) {
  return (
    <div className="clan-identity">
      <img src="/art/fantasy/emblem.png" alt="" />
      <div>
        <h2>{clan.name}</h2>
        <p>
          {tags[clan.tag]} · {clan.language.toUpperCase()} · {clan.members} /{" "}
          {clan.capacity}
        </p>
      </div>
    </div>
  );
}

function Directory({
  social,
  query,
  setQuery,
  command,
  busy,
  create,
}: {
  social: SocialView;
  query: string;
  setQuery: (value: string) => void;
  command: Command;
  busy: boolean;
  create: () => void;
}) {
  return (
    <section className="clan-directory">
      <div className="section-title">
        <h2>Найти своих</h2>
        <button
          className="button secondary"
          disabled={!social.eligible || busy}
          onClick={create}
        >
          <Plus size={16} /> Создать клан
        </button>
      </div>
      <label className="clan-search">
        <Search size={17} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={40}
          placeholder="Название клана"
          aria-label="Поиск клана"
        />
        {query && (
          <button
            className="icon-button"
            onClick={() => setQuery("")}
            title="Очистить поиск"
            aria-label="Очистить поиск"
          >
            <X size={15} />
          </button>
        )}
      </label>
      {social.listings.length ? (
        <div className="clan-list">
          {social.listings.map((clan) => (
            <article className="clan-list-row" key={clan.id}>
              <div>
                <ClanIdentity clan={clan} />
                {clan.description && (
                  <p className="clan-description">{clan.description}</p>
                )}
              </div>
              <div className="clan-list-action">
                <span>
                  <Trophy size={14} /> {fmt(clan.weekScore)}
                </span>
                <button
                  className="button secondary"
                  disabled={
                    !social.eligible || busy || clan.members >= clan.capacity
                  }
                  onClick={() =>
                    void command({ type: "join", clanId: clan.id })
                  }
                  aria-label={`Вступить в клан ${clan.name}`}
                >
                  Вступить <ChevronRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="clan-empty">
          <UsersRound size={28} />
          <h3>
            {query
              ? "Кланов с таким названием нет"
              : "Открытых кланов пока нет"}
          </h3>
        </div>
      )}
    </section>
  );
}

function Leaderboard({ social }: { social: SocialView }) {
  return (
    <section className="clan-ranking">
      <div className="section-title">
        <h2>Рейтинг экспедиции</h2>
        <span className="muted">
          {date(social.week.start)} — {date(social.week.end)}
        </span>
      </div>
      {social.leaderboard.length ? (
        <ol className="clan-leaderboard">
          {social.leaderboard.map((entry) => (
            <li
              className={entry.clan.id === social.clan?.id ? "is-own" : ""}
              key={entry.clan.id}
            >
              <b className="clan-rank">{entry.rank}</b>
              <div>
                <strong>{entry.clan.name}</strong>
                <span>
                  {entry.clan.members} участников · {tags[entry.clan.tag]}
                </span>
              </div>
              <b>{fmt(entry.score)}</b>
            </li>
          ))}
        </ol>
      ) : (
        <div className="clan-empty">
          <Trophy size={28} />
          <h3>Первые результаты ещё впереди</h3>
        </div>
      )}
      <History social={social} />
    </section>
  );
}

function History({ social }: { social: SocialView }) {
  return (
    <section className="clan-history">
      <div className="section-title">
        <h3>Достижения героя</h3>
        <span className="clan-reputation">
          <Medal size={16} /> {fmt(social.profile.reputation)} репутации
        </span>
      </div>
      {social.history.length ? (
        <div className="clan-history-list">
          {social.history.map((entry) => (
            <div key={`${entry.weekStart}:${entry.clanName}`}>
              <span>{date(entry.weekStart)}</span>
              <strong>{entry.clanName}</strong>
              <span>{fmt(entry.bestScore)} очков</span>
              <b>+{entry.reputation}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Завершённых экспедиций пока нет.</p>
      )}
    </section>
  );
}

function Members({
  clan,
  social,
  busy,
  command,
  confirm,
}: {
  clan: ClanDetail;
  social: SocialView;
  busy: boolean;
  command: Command;
  confirm: Confirm;
}) {
  const officers = clan.roster.filter(
    (member) => member.role === "officer",
  ).length;
  return (
    <section>
      <div className="section-title">
        <h2>
          Участники <span className="count">{clan.members}</span>
        </h2>
        <span className="muted">Офицеры: {officers} / 2</span>
      </div>
      <div className="clan-roster">
        {clan.roster.map((member) => {
          const mine = member.id === social.profile.id;
          const canKick = !mine && clan.myRole === "leader";
          return (
            <article className="clan-member" key={member.id}>
              <span className={`clan-avatar ${member.role}`}>
                {member.role === "leader" ? (
                  <Crown size={19} />
                ) : member.role === "officer" ? (
                  <ShieldCheck size={19} />
                ) : (
                  <UserRound size={19} />
                )}
              </span>
              <div className="clan-member-name">
                <strong>
                  {member.name}
                  {mine && <small>Вы</small>}
                </strong>
                <span>
                  {clanRoles[member.role]} ·{" "}
                  {member.raidRole
                    ? roleName(member.raidRole)
                    : "Роль не выбрана"}
                </span>
              </div>
              <div className="clan-member-score">
                <b>{fmt(member.bestScore)}</b>
                <span>{member.attemptsUsed} / 3 похода</span>
              </div>
              {canKick && (
                <div className="clan-member-actions">
                  {clan.myRole === "leader" && (
                    <>
                      <button
                        className="icon-button"
                        disabled={
                          busy || (member.role === "member" && officers >= 2)
                        }
                        title={
                          member.role === "officer"
                            ? "Снять офицера"
                            : "Назначить офицером"
                        }
                        aria-label={`${member.role === "officer" ? "Снять офицера" : "Назначить офицером"}: ${member.name}`}
                        onClick={() =>
                          confirm({
                            title:
                              member.role === "officer"
                                ? "Снять офицера?"
                                : "Назначить офицера?",
                            details: (
                              <p>
                                {member.name}{" "}
                                {member.role === "officer"
                                  ? "станет участником клана."
                                  : "сможет удалять сообщения в клановой ленте."}
                              </p>
                            ),
                            label: "Подтвердить",
                            action: () =>
                              command({
                                type: "role",
                                clanId: clan.id,
                                memberId: member.id,
                                role:
                                  member.role === "officer"
                                    ? "member"
                                    : "officer",
                              }),
                          })
                        }
                      >
                        {member.role === "officer" ? (
                          <UserRound size={17} />
                        ) : (
                          <ShieldCheck size={17} />
                        )}
                      </button>
                      <button
                        className="icon-button"
                        disabled={busy}
                        title="Передать главенство"
                        aria-label={`Передать главенство: ${member.name}`}
                        onClick={() =>
                          confirm({
                            title: "Передать главенство?",
                            details: (
                              <p>
                                {member.name} станет главой «{clan.name}». Вы
                                останетесь участником.
                              </p>
                            ),
                            label: "Передать",
                            action: () =>
                              command({
                                type: "transfer",
                                clanId: clan.id,
                                memberId: member.id,
                              }),
                          })
                        }
                      >
                        <Crown size={17} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-button"
                    disabled={busy}
                    title="Исключить из клана"
                    aria-label={`Исключить из клана: ${member.name}`}
                    onClick={() =>
                      confirm({
                        title: "Исключить участника?",
                        details: (
                          <p>
                            {member.name} покинет клан. Его вклад в текущую
                            экспедицию сохранится.
                          </p>
                        ),
                        label: "Исключить",
                        danger: true,
                        action: () =>
                          command({
                            type: "kick",
                            clanId: clan.id,
                            memberId: member.id,
                          }),
                      })
                    }
                  >
                    <UserMinus size={17} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Feed({
  clan,
  busy,
  command,
  confirm,
  lastCommand,
  profileId,
  reportMessage,
}: {
  clan: ClanDetail;
  busy: boolean;
  command: Command;
  confirm: Confirm;
  lastCommand: SocialCommand | null;
  profileId: string;
  reportMessage: (message: ClanMessage) => void;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (lastCommand?.type === "message" && lastCommand.clanId === clan.id) {
      setMessage((current) =>
        current.trim() === lastCommand.text ? "" : current,
      );
    }
  }, [lastCommand, clan.id]);
  return (
    <section className="clan-feed">
      <div className="section-title">
        <h2>У костра</h2>
        <MessageSquare size={18} />
      </div>
      {lastCommand?.type === "report_message" && lastCommand.clanId === clan.id && <p className="clan-report-receipt" role="status"><Check size={15} /> Жалоба отправлена</p>}
      <form
        className="clan-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await command({
              type: "message",
              clanId: clan.id,
              text: message.trim(),
            })
          )
            setMessage("");
        }}
      >
        <label>
          <span className="sr-only">Сообщение клану</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="Сообщение клану"
            rows={3}
          />
        </label>
        <div>
          <span className="muted">{message.length} / 500</span>
          <button
            className="button primary"
            type="submit"
            title="Отправить сообщение"
            aria-label="Отправить сообщение"
            disabled={busy || !message.trim()}
          >
            <Send size={18} />
          </button>
        </div>
      </form>
      <div className="clan-messages">
        {clan.messages.length ? (
          clan.messages.map((message) => (
            <article
              key={message.id}
              className={`clan-message ${message.kind}`}
            >
              <div>
                <strong>
                  {message.kind === "event"
                    ? "Хроника клана"
                    : message.authorName}
                </strong>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {new Date(message.createdAt).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {message.kind === "message" && message.authorId !== profileId && (
                  <button
                    className="icon-button"
                    title={message.reported ? "Жалоба отправлена" : "Пожаловаться на сообщение"}
                    aria-label={message.reported ? "Жалоба отправлена" : "Пожаловаться на сообщение"}
                    disabled={busy || message.reported}
                    onClick={() => reportMessage(message)}
                  >
                    {message.reported ? <Check size={15} /> : <Flag size={15} />}
                  </button>
                )}
                {message.canDelete && message.kind === "message" && (
                  <button
                    className="icon-button"
                    title="Удалить сообщение"
                    aria-label={`Удалить сообщение ${message.authorName}`}
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: "Удалить сообщение?",
                        details: <blockquote>{message.text}</blockquote>,
                        danger: true,
                        label: "Удалить",
                        action: () =>
                          command({
                            type: "delete_message",
                            clanId: clan.id,
                            messageId: message.id,
                          }),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <p>{message.text}</p>
            </article>
          ))
        ) : (
          <p className="muted">Здесь ещё тихо.</p>
        )}
      </div>
    </section>
  );
}

function RaidBuilder({
  game,
  loadout,
  setLoadout,
  busy,
}: {
  game: GameView;
  loadout: RaidLoadout;
  setLoadout: (next: RaidLoadout) => void;
  busy: boolean;
}) {
  const available = game.catalog.skills.filter(
    (skill) => skill.family === "common" || skill.family === loadout.family,
  );
  const skillName = (id: string) =>
    game.catalog.skills.find((skill) => skill.id === id)?.name || id;
  const updateRule = (index: number, next: Rule) =>
    setLoadout({
      ...loadout,
      rules: loadout.rules.map((rule, i) => (i === index ? next : rule)),
    });
  return (
    <div className="raid-builder">
      <p className="mechanic-note">Сначала выполняется первое подходящее правило с готовым умением. Затем герой проверяет готовые умения без правил в порядке ячеек 1–4; иначе наносит обычный удар.</p>
      <div className="clan-field">
        <label htmlFor="raid-family">Оружие экспедиции</label>
        <select
          id="raid-family"
          disabled={busy}
          value={loadout.family}
          onChange={(e) => {
            const family = e.target.value as Family;
            const baseRole =
              family === "blade"
                ? "bulwark"
                : family === "glass"
                  ? "rupture"
                  : "cleanse";
            setLoadout(raidDefaults(baseRole));
          }}
        >
          {families.map((family) => (
            <option value={family} key={family}>
              {game.catalog.familyNames[family]}
            </option>
          ))}
        </select>
      </div>
      <div className="raid-skill-grid">
        {loadout.skills.map((id, index) => (
          <label key={index}>
            <span>Ячейка {index + 1}</span>
            <select
              aria-label={`Навык рейда ${index + 1}`}
              disabled={busy}
              value={id}
              onChange={(e) => {
                const replacement = e.target.value;
                setLoadout({
                  ...loadout,
                  skills: loadout.skills.map((skill, i) =>
                    i === index ? replacement : skill,
                  ),
                  rules: loadout.rules.map((rule) =>
                    rule.skillId === id
                      ? { ...rule, skillId: replacement }
                      : rule,
                  ),
                });
              }}
            >
              {available.map((skill) => (
                <option
                  value={skill.id}
                  key={skill.id}
                  disabled={
                    skill.id !== id && loadout.skills.includes(skill.id)
                  }
                >
                  {skill.name}
                </option>
              ))}
            </select>
            <small>
              {
                game.catalog.skills.find((skill) => skill.id === id)
                  ?.description
              }
            </small>
          </label>
        ))}
      </div>
      <div className="section-title">
        <h3>Правила: сверху вниз</h3>
        <span className="muted">{loadout.rules.length} из 3 правил</span>
      </div>
      <p className="mechanic-note">Правило 1 имеет наивысший приоритет. Умение с правилом используется только по его условиям. Стрелки меняют порядок проверки.</p>
      <div className="raid-rules">
        {loadout.rules.map((rule, index) => (
          <div className="raid-rule" key={index}>
            <span className="rule-index" aria-label={`Приоритет ${index + 1}`}>{index + 1}</span>
            <div className="raid-rule-fields">
              <div>
                <select
                  aria-label={`Условие рейда ${index + 1}`}
                  value={rule.condition}
                  disabled={busy}
                  onChange={(e) => {
                    const condition = e.target.value as Condition;
                    updateRule(index, {
                      condition,
                      skillId: rule.skillId,
                      ...(condition === "hp_below" ? { threshold: 55 } : {}),
                    });
                  }}
                >
                  {Object.entries(conditions).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {rule.condition === "hp_below" && (
                  <select
                    aria-label={`Порог здоровья рейда ${index + 1}`}
                    disabled={busy}
                    value={rule.threshold}
                    onChange={(e) =>
                      updateRule(index, {
                        ...rule,
                        threshold: Number(e.target.value),
                      })
                    }
                  >
                    {[25, 40, 55, 70].map((value) => (
                      <option key={value} value={value}>
                        {value}%
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <select
                aria-label={`Действие рейда ${index + 1}`}
                value={rule.skillId}
                disabled={busy}
                onChange={(e) =>
                  updateRule(index, { ...rule, skillId: e.target.value })
                }
              >
                {loadout.skills.map((id) => (
                  <option key={id} value={id}>
                    {skillName(id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="raid-rule-actions">
              <button
                className="icon-button"
                aria-label={`Правило рейда ${index + 1} выше`}
                title="Выше"
                disabled={busy || index === 0}
                onClick={() => {
                  const rules = [...loadout.rules];
                  [rules[index], rules[index - 1]] = [
                    rules[index - 1],
                    rules[index],
                  ];
                  setLoadout({ ...loadout, rules });
                }}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Правило рейда ${index + 1} ниже`}
                title="Ниже"
                disabled={busy || index === loadout.rules.length - 1}
                onClick={() => {
                  const rules = [...loadout.rules];
                  [rules[index], rules[index + 1]] = [
                    rules[index + 1],
                    rules[index],
                  ];
                  setLoadout({ ...loadout, rules });
                }}
              >
                <ArrowDown size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Удалить правило рейда ${index + 1}`}
                title="Удалить правило"
                disabled={busy}
                onClick={() =>
                  setLoadout({
                    ...loadout,
                    rules: loadout.rules.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {loadout.rules.length < 3 && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            setLoadout({
              ...loadout,
              rules: [
                ...loadout.rules,
                { condition: "always", skillId: loadout.skills[0] },
              ],
            })
          }
        >
          <Plus size={16} /> Добавить правило
        </button>
      )}
    </div>
  );
}

function RaidResults({
  result,
  practice,
}: {
  result: RaidResult;
  practice?: boolean;
}) {
  return (
    <section
      className="raid-results"
      aria-label={
        practice ? "Результат пробного похода" : "Результат зачётного похода"
      }
    >
      <div className="section-title">
        <h3>{practice ? "Пробный поход" : "Последний зачётный поход"}</h3>
        <span className="raid-score">
          <Trophy size={18} /> {fmt(result.score)} <small>/ 10 000</small>
        </span>
      </div>
      <p className="muted">
        {roleName(result.role)} · {result.completed} / 3 волны ·{" "}
        {result.durationSeconds.toLocaleString("ru-RU", {
          maximumFractionDigits: 1,
        })}{" "}
        с
      </p>
      <dl>
        {result.components.map((component, i) => (
          <div key={i}>
            <dt>{component.label}</dt>
            <dd>{fmt(component.points)}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Ход сражений</summary>
        <div className="raid-battles">
          {result.battles.map((battle, i) => (
            <div key={i}>
              <strong>
                {i + 1}. {battle.enemy.name}
              </strong>
              <span
                className={battle.outcome === "win" ? "positive" : "negative"}
              >
                {battle.outcome === "win" ? "Победа" : "Поражение"} ·{" "}
                {Math.round(battle.combatMs / 1000)} с
              </span>
              <small>
                {battle.reason} · Урон: {fmt(battle.damageDealt)} · Получено:{" "}
                {fmt(battle.damageTaken)}
              </small>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function RaidPanel({
  social,
  game,
  command,
  busy,
  practice,
  confirm,
}: {
  social: SocialView;
  game: GameView;
  command: Command;
  busy: boolean;
  practice: (
    role: RaidRole,
    loadout: RaidLoadout,
  ) => Promise<RaidResult | null>;
  confirm: Confirm;
}) {
  const [role, setRole] = useState<RaidRole>(
    social.personalRaid?.role || "rupture",
  );
  const [loadout, setLoadout] = useState<RaidLoadout>(() =>
    raidDefaults(social.personalRaid?.role || "rupture"),
  );
  const [trial, setTrial] = useState<RaidResult | null>(null);
  const personal = social.personalRaid;
  const attempts = Math.max(0, 3 - (personal?.attemptsUsed || 0));
  const clanName = personal?.clanName || social.clan?.name;
  const canRaid =
    social.eligible &&
    (!!personal || (!!social.clan && social.clan.raidSeats < 20));
  const score = social.clan?.weekScore || 0;
  useEffect(() => {
    if (personal && role !== personal.role) {
      setRole(personal.role);
      setLoadout(raidDefaults(personal.role));
      setTrial(null);
    }
  }, [personal?.role, role]);
  const selectRole = (next: RaidRole) => {
    setRole(next);
    setLoadout(raidDefaults(next));
    setTrial(null);
  };
  const updateLoadout = (next: RaidLoadout) => {
    setLoadout(next);
    setTrial(null);
  };
  return (
    <section className="raid-panel">
      <div className="section-title">
        <div>
          <h2>{social.week.title}</h2>
          <p className="muted">
            До{" "}
            {new Date(social.week.end).toLocaleString("ru-RU", {
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <Flag size={23} />
      </div>
      {social.clan && (
        <div className="raid-clan-progress">
          <div className="raid-score-line">
            <span>Вклад клана</span>
            <b>
              {fmt(score)} <small>/ 120 000</small>
            </b>
          </div>
          <div className="thin-progress">
            <span style={{ width: `${Math.min(100, score / 1200)}%` }} />
          </div>
          <div className="raid-milestones">
            {[30000, 60000, 90000, 120000].map((threshold) => (
              <span
                className={score >= threshold ? "achieved" : ""}
                key={threshold}
              >
                {score >= threshold ? <Check size={13} /> : <Flag size={13} />}
                {fmt(threshold)}
              </span>
            ))}
          </div>
          <div className="raid-role-totals">
            {raidRoles.map((entry) => {
              const contribution = social.clan!.roles.find(
                (row) => row.role === entry.id,
              );
              return (
                <div key={entry.id}>
                  <span>{entry.name}</span>
                  <b>{fmt(contribution?.score || 0)}</b>
                  <small>{contribution?.contributors || 0} участников</small>
                </div>
              );
            })}
          </div>
          <p className="muted">
            Четыре лучших результата каждой роли · {social.clan.raidSeats} / 20
            мест этой недели
          </p>
          {!!social.clan.achievements.length && (
            <details className="clan-achievements">
              <summary>Вехи прошлых экспедиций</summary>
              <div>
                {social.clan.achievements.map((entry) => (
                  <span key={`${entry.weekStart}:${entry.threshold}`}>
                    <Medal size={15} />
                    {date(entry.weekStart)} · {fmt(entry.threshold)}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      {personal && personal.clanId !== social.clan?.id && (
        <div className="clan-notice">
          <Flag size={20} />
          <p>
            На этой неделе ваш вклад закреплён за «{personal.clanName}».
            Оставшиеся походы идут в его зачёт.
          </p>
        </div>
      )}
      <div className="raid-personal-line">
        <span>
          <b>{attempts}</b> / 3 похода осталось
        </span>
        <span>
          <Medal size={16} /> {personal?.pendingReputation || 0} репутации к
          завершению недели
        </span>
      </div>
      <div className="raid-editor-heading">
        <h3>Сборка экспедиции</h3>
        <span>Уровень 10 · вещи ур. 8 · +0</span>
      </div>
      <div
        className="clan-segments raid-roles"
        role="group"
        aria-label="Роль экспедиции"
      >
        {raidRoles.map((entry) => (
          <button
            key={entry.id}
            className={role === entry.id ? "selected" : ""}
            aria-pressed={role === entry.id}
            disabled={busy || (!!personal && personal.role !== entry.id)}
            onClick={() => selectRole(entry.id)}
          >
            {entry.name}
            {personal?.role === entry.id && <LockKeyhole size={13} />}
          </button>
        ))}
      </div>
      <p className="raid-objective">{raidGoals[role]}</p>
      <details className="raid-scoring">
        <summary>Правила подсчёта: {roleName(role)}</summary>
        <p>{raidRoles.find((entry) => entry.id === role)!.description}</p>
        <p>
          Три зачётных похода в неделю. Вклад и репутация зависят от лучшего
          результата; роль и клан закрепляются после первого похода. Пробный
          поход не расходует попытки.
        </p>
      </details>
      <div className="raid-builder-tools">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            const build = game.state.pendingBuild || game.state.build;
            const weapon = game.state.inventory.find(
              (item) => item.id === build.equipment.weapon,
            );
            updateLoadout({
              family: weapon?.family || "blade",
              skills: [...build.skills],
              rules: structuredClone(build.rules),
            });
          }}
        >
          <UserRound size={15} /> Взять тактику героя
        </button>
        <button
          className="icon-button"
          disabled={busy}
          title="Исходная сборка роли"
          aria-label="Исходная сборка роли"
          onClick={() => updateLoadout(raidDefaults(role))}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <RaidBuilder
        game={game}
        loadout={loadout}
        setLoadout={updateLoadout}
        busy={busy}
      />
      <div className="raid-actions">
        <button
          className="button secondary"
          disabled={busy || !social.eligible}
          onClick={async () => setTrial(await practice(role, loadout))}
        >
          <FlaskConical size={16} /> Пробный поход
        </button>
        <button
          className="button primary"
          disabled={busy || !canRaid || !attempts}
          onClick={() => {
            const snapshot = structuredClone(loadout);
            confirm({
              title: "Отправиться в зачётный поход?",
              label: "Начать поход",
              details: (
                <div className="raid-confirm">
                  <p>
                    <strong>{clanName}</strong> · {roleName(role)}
                  </p>
                  <p>Будет потрачен 1 поход. Останется {attempts - 1} из 3.</p>
                  <p>
                    {game.catalog.familyNames[snapshot.family]} · уровень 10 ·
                    вещи ур. 8 · +0
                  </p>
                  <ul>
                    {snapshot.skills.map((id) => (
                      <li key={id}>
                        {
                          game.catalog.skills.find((skill) => skill.id === id)
                            ?.name
                        }
                      </li>
                    ))}
                  </ul>
                  <ol>
                    {snapshot.rules.map((rule, i) => (
                      <li key={i}>
                        {conditions[rule.condition]}
                        {rule.threshold ? ` ${rule.threshold}%` : ""} →{" "}
                        {
                          game.catalog.skills.find(
                            (skill) => skill.id === rule.skillId,
                          )?.name
                        }
                      </li>
                    ))}
                  </ol>
                  {!personal && (
                    <p>
                      Роль «{roleName(role)}» и клан закрепятся до конца этой
                      недели.
                    </p>
                  )}
                </div>
              ),
              action: () =>
                command({
                  type: "raid",
                  clanId: personal?.clanId || social.clan!.id,
                  weekStart: social.week.start,
                  role,
                  loadout: snapshot,
                }),
            });
          }}
        >
          <Swords size={16} /> Зачётный поход
        </button>
      </div>
      {!personal && social.clan && social.clan.raidSeats >= 20 && (
        <p className="muted">
          Все 20 мест экспедиции этой недели уже заняты. Доступен пробный поход.
        </p>
      )}
      {trial && <RaidResults result={trial} practice />}
      {personal?.lastResult && <RaidResults result={personal.lastResult} />}
    </section>
  );
}

export default function ClanPage({ view: game, onProfile }: { view: GameView; onProfile: () => void }) {
  const [query, setQuery] = useState("");
  const social = useSocial(query);
  const [tab, setTab] = useState<"raid" | "members" | "feed" | "ranking">(
    "raid",
  );
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [modal, setModal] = useState<"create" | "settings" | "profile" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<"ru" | "en">("ru");
  const [tag, setTag] = useState<ClanTag>("calm");
  const [recruitment, setRecruitment] = useState<"open" | "closed">("open");
  const [editingClan, setEditingClan] = useState("");
  const [reporting, setReporting] = useState<{ clanId: string; message: ClanMessage } | null>(null);
  const [reportReason, setReportReason] = useState<"spam" | "abuse" | "other">("spam");
  useEffect(() => {
    const command = social.lastCommand;
    if (command?.type === "report_message") {
      setReporting(current => current?.clanId === command.clanId && current.message.id === command.messageId ? null : current);
    }
  }, [social.lastCommand]);
  const data = social.view;
  const busy = social.busy || social.unresolved;
  const clan = data?.clan;
  const errorBanner =
    social.error || (social.unresolved && !social.busy) ? (
      <div className="clan-error" role="alert">
        <p>
          {social.error ||
            "Есть неподтверждённое действие. Проверьте его результат."}
        </p>
        <button
          className="button secondary"
          disabled={social.busy}
          onClick={async () => {
            const recovered = await social.retry();
            if (recovered && social.unresolved) {
              setConfirmation(null);
              setModal(null);
            }
          }}
        >
          <RefreshCw size={16} />
          {social.unresolved ? "Проверить действие" : "Повторить"}
        </button>
      </div>
    ) : null;
  if (!data)
    return (
      <div className="clan-page">
        <div className="page-heading">
          <h1>Кланы</h1>
        </div>
        {errorBanner || (
          <div className="clan-empty" role="status">
            <UsersRound size={28} />
            <p>Ищем огни лагерей…</p>
          </div>
        )}
      </div>
    );
  const openCreate = () => {
    setName("");
    setDescription("");
    setTag("calm");
    setLanguage("ru");
    setModal("create");
  };
  return (
    <div className="clan-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ГИЛЬДИЯ ИСКАТЕЛЕЙ</p>
          <h1>{clan ? clan.name : "Кланы"}</h1>
        </div>
        <button
          className="clan-profile"
          onClick={onProfile}
          title="Открыть профиль в настройках"
          aria-label="Открыть профиль в настройках"
        >
          <UserRound size={17} />
          <span>
            <small className="clan-profile-label">Ваше публичное имя</small>
            <strong>{data.profile.name}</strong>
            <small>{fmt(data.profile.reputation)} репутации</small>
          </span>
          <Settings2 size={14} />
        </button>
      </div>
      {errorBanner}
      {!data.eligible && (
        <div className="clan-notice">
          <LockKeyhole size={22} />
          <div>
            <h3>Кланы откроются на {data.unlockLevel}-м уровне</h3>
            <p>
              Ваш уровень: {game.state.level} / {data.unlockLevel}
            </p>
            <div className="thin-progress">
              <span
                style={{
                  width: `${Math.min(100, (game.state.level / data.unlockLevel) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
      {clan && (
        <section className="clan-overview">
          <div className="clan-overview-main">
            <ClanIdentity clan={clan} />
            <div className="clan-overview-actions">
              {clan.myRole === "leader" && (
                <button
                  className="icon-button"
                  disabled={busy}
                  title="Настройки клана"
                  aria-label="Настройки клана"
                  onClick={() => {
                    setEditingClan(clan.id);
                    setDescription(clan.description);
                    setRecruitment(clan.recruitment);
                    setModal("settings");
                  }}
                >
                  <Settings2 size={18} />
                </button>
              )}
              <button
                className="icon-button"
                title={
                  clan.myRole === "leader" && clan.members > 1
                    ? "Передайте главенство перед выходом"
                    : "Покинуть клан"
                }
                aria-label="Покинуть клан"
                disabled={
                  busy || (clan.myRole === "leader" && clan.members > 1)
                }
                onClick={() =>
                  setConfirmation({
                    title:
                      clan.members === 1 ? "Закрыть лагерь?" : "Покинуть клан?",
                    details: (
                      <p>
                        {clan.members === 1
                          ? `Вы последний участник «${clan.name}». Клан уйдёт в летопись.`
                          : `Вы покинете «${clan.name}».`}
                        {data.personalRaid
                          ? " Вклад и оставшиеся походы текущей недели останутся за прежним кланом."
                          : ""}
                      </p>
                    ),
                    action: () =>
                      social.command({ type: "leave", clanId: clan.id }),
                    label: "Покинуть клан",
                    danger: true,
                  })
                }
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
          {clan.description && (
            <p className="clan-description">{clan.description}</p>
          )}
          <p className="muted">
            {clan.recruitment === "open" ? "Набор открыт" : "Набор закрыт"} ·{" "}
            {clanRoles[clan.myRole]}
          </p>
        </section>
      )}
      <div className="clan-tabs" role="tablist" aria-label="Разделы клана">
        <button
          role="tab"
          aria-selected={tab === "raid"}
          className={tab === "raid" ? "active" : ""}
          onClick={() => setTab("raid")}
        >
          <Flag size={16} />
          {clan || data.personalRaid ? "Экспедиция" : "Кланы"}
        </button>
        {clan && (
          <>
            <button
              role="tab"
              aria-selected={tab === "members"}
              className={tab === "members" ? "active" : ""}
              onClick={() => setTab("members")}
            >
              <UsersRound size={16} />
              Участники
            </button>
            <button
              role="tab"
              aria-selected={tab === "feed"}
              className={tab === "feed" ? "active" : ""}
              onClick={() => setTab("feed")}
            >
              <MessageSquare size={16} />
              Костёр
            </button>
          </>
        )}
        <button
          role="tab"
          aria-selected={tab === "ranking"}
          className={tab === "ranking" ? "active" : ""}
          onClick={() => setTab("ranking")}
        >
          <Trophy size={16} />
          Рейтинг
        </button>
      </div>
      <div className="clan-tab-content" role="tabpanel">
        {tab === "ranking" ? (
          <Leaderboard social={data} />
        ) : clan && tab === "members" ? (
          <Members
            clan={clan}
            social={data}
            command={social.command}
            busy={busy}
            confirm={setConfirmation}
          />
        ) : clan && tab === "feed" ? (
          <Feed
            key={clan.id}
            lastCommand={social.lastCommand}
            profileId={data.profile.id}
            reportMessage={(message) => {
              setReportReason("spam");
              setReporting({ clanId: clan.id, message });
            }}
            clan={clan}
            command={social.command}
            busy={busy}
            confirm={setConfirmation}
          />
        ) : (
          <>
            {(clan || data.personalRaid) && (
              <RaidPanel
                key={`${data.profile.id}:${data.week.id}`}
                social={data}
                game={game}
                command={social.command}
                busy={busy}
                practice={social.practice}
                confirm={setConfirmation}
              />
            )}
            {!clan && (
              <Directory
                social={data}
                query={query}
                setQuery={setQuery}
                command={social.command}
                busy={busy}
                create={openCreate}
              />
            )}
            {!clan && !data.personalRaid && data.eligible && (
              <details className="clan-practice-open">
                <summary>Пробная экспедиция</summary>
                <RaidPanel
                  key={data.week.id}
                  social={data}
                  game={game}
                  command={social.command}
                  busy={busy}
                  practice={social.practice}
                  confirm={setConfirmation}
                />
              </details>
            )}
          </>
        )}
      </div>
      {reporting && (
        <Modal title="Пожаловаться на сообщение" close={() => setReporting(null)} busy={social.busy}>
          <div className="clan-confirm-copy"><strong>{reporting.message.authorName}</strong><blockquote>{reporting.message.text}</blockquote></div>
          <form className="clan-form" onSubmit={async (event) => {
            event.preventDefault();
            if (await social.command({ type: "report_message", clanId: reporting.clanId, messageId: reporting.message.id, reason: reportReason })) setReporting(null);
          }}>
            <label>
              Причина жалобы
              <select aria-label="Причина жалобы" value={reportReason} disabled={busy} onChange={event => setReportReason(event.target.value as typeof reportReason)}>
                <option value="spam">Спам</option>
                <option value="abuse">Оскорбления или угрозы</option>
                <option value="other">Другое нарушение</option>
              </select>
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" disabled={social.busy} onClick={() => setReporting(null)}>Отмена</button>
              <button type="submit" className="button primary" disabled={busy}><Flag size={16} /> Отправить жалобу</button>
            </div>
          </form>
          {errorBanner}
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          close={() => setConfirmation(null)}
          busy={social.busy}
        >
          <div className="clan-confirm-copy">{confirmation.details}</div>
          <div className="dialog-actions">
            <button
              className="button secondary"
              disabled={social.busy}
              onClick={() => setConfirmation(null)}
            >
              Отмена
            </button>
            <button
              className={`button ${confirmation.danger ? "danger" : "primary"}`}
              disabled={busy}
              onClick={async () => {
                if (await confirmation.action()) setConfirmation(null);
              }}
            >
              <Check size={16} />
              {confirmation.label}
            </button>
          </div>
          {errorBanner}
        </Modal>
      )}
      {modal && (
        <Modal
          title={
            modal === "create"
              ? "Новый клан"
              : modal === "profile"
                ? "Имя в сообществе"
                : "Настройки клана"
          }
          close={() => setModal(null)}
          busy={social.busy}
        >
          <form
            className="clan-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const command: SocialCommand =
                modal === "profile"
                  ? { type: "profile", name: name.trim() }
                  : modal === "create"
                    ? {
                        type: "create",
                        name: name.trim(),
                        description: description.trim(),
                        language,
                        tag,
                      }
                    : {
                        type: "settings",
                        clanId: editingClan,
                        description: description.trim(),
                        recruitment,
                      };
              if (await social.command(command)) {
                setModal(null);
                if (modal === "create") setTab("raid");
              }
            }}
          >
            {modal !== "settings" && (
              <label>
                {modal === "create" ? "Название" : "Имя"}
                <input
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={modal === "profile" ? 2 : 3}
                  maxLength={24}
                  required
                  aria-label={
                    modal === "create" ? "Название клана" : "Имя в сообществе"
                  }
                />
              </label>
            )}
            {modal !== "profile" && (
              <label>
                Описание
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={240}
                  aria-label="Описание клана"
                />
              </label>
            )}
            {modal === "create" && (
              <>
                <div className="clan-form-pair">
                  <label>
                    Язык
                    <select
                      value={language}
                      onChange={(e) =>
                        setLanguage(e.target.value as "ru" | "en")
                      }
                    >
                      <option value="ru">Русский</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label>
                    Ритм
                    <select
                      value={tag}
                      onChange={(e) => setTag(e.target.value as ClanTag)}
                    >
                      {Object.entries(tags).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="muted">
                  До 20 участников. Создание бесплатно, не чаще одного раза за 7
                  дней.
                </p>
              </>
            )}
            {modal === "settings" && (
              <label className="clan-checkbox">
                <input
                  type="checkbox"
                  checked={recruitment === "open"}
                  onChange={(e) =>
                    setRecruitment(e.target.checked ? "open" : "closed")
                  }
                />
                Набор открыт
              </label>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={social.busy}
                onClick={() => setModal(null)}
              >
                Отмена
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  busy || (modal !== "settings" && name.trim().length < (modal === "profile" ? 2 : 3))
                }
              >
                {modal === "create" ? <Plus size={16} /> : <Save size={16} />}
                {modal === "create" ? "Создать клан" : "Сохранить"}
              </button>
            </div>
          </form>
          {errorBanner}
        </Modal>
      )}
    </div>
  );
}
