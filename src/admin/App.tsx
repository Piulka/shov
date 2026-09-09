import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UsersRound,
} from "lucide-react";
import type {
  AdminAuditEntry,
  AdminMutation,
  AdminOperation,
  AdminOverview,
  AdminPage,
  AdminPlayerDetail,
  AdminPlayerSummary,
  AdminSession,
} from "../../shared/admin";
import type { Catalog } from "../../shared/types";
import { AdminApiError, request } from "./api";
import {
  BuildsEditor,
  InventoryEditor,
  ProfileEditor,
  type PrepareChange,
} from "./PlayerEditor";
import { auditSummary, describeChanges, operationNames } from "./changes";
import { date, Empty, Field, Modal, number, Section, Stat } from "./ui";

type View = "overview" | "players" | "audit";
interface Confirmation {
  title: string;
  operations: AdminOperation[];
  base: AdminPlayerDetail;
  requestId: string;
  generation: number;
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [players, setPlayers] = useState<AdminPage<AdminPlayerSummary> | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [player, setPlayer] = useState<AdminPlayerDetail | null>(null);
  const [tab, setTab] = useState<"profile" | "inventory" | "build" | "audit">(
    "profile",
  );
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const generation = useRef(0);
  const currentAccount = useRef<string | null>(null);

  const selectPlayer = (id: string | null) => {
    generation.current += 1;
    currentAccount.current = id;
    setConfirmation(null);
    setPreparing(false);
    setPlayer(null);
    setSelected(id);
  };

  const fail = (cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    if (cause instanceof AdminApiError && cause.status === 401) {
      selectPlayer(null);
      setSession({ authenticated: false });
      setPlayer(null);
      setCatalog(null);
      setConfirmation(null);
      setSessionError("Сессия завершилась. Войдите снова.");
    } else
      setError(
        cause instanceof Error ? cause.message : "Не удалось получить данные.",
      );
  };

  useEffect(() => {
    request<AdminSession>("/session")
      .then(setSession)
      .catch((cause) => {
        setSession({ authenticated: false });
        setSessionError(
          cause instanceof Error
            ? cause.message
            : "Не удалось проверить сессию.",
        );
      });
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    const controller = new AbortController();
    request<Catalog>("/catalog", undefined, controller.signal)
      .then(setCatalog)
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause);
      });
    return () => controller.abort();
  }, [session?.authenticated]);

  useEffect(() => {
    if (
      !session?.authenticated ||
      view === "audit" ||
      (view === "players" && selected)
    )
      return;
    const controller = new AbortController();
    setError("");
    setLoading(true);
    const work =
      view === "overview"
        ? request<AdminOverview>(
            "/overview",
            undefined,
            controller.signal,
          ).then(setOverview)
        : request<AdminPage<AdminPlayerSummary>>(
            `/players?${new URLSearchParams({ q: query, page: String(page), pageSize: "25" })}`,
            undefined,
            controller.signal,
          ).then(setPlayers);
    work
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session?.authenticated, view, query, page, selected, refresh]);

  useEffect(() => {
    if (!selected || !session?.authenticated) return;
    const controller = new AbortController();
    setPlayer(null);
    setTab("profile");
    setError("");
    setNotice("");
    setLoading(true);
    request<AdminPlayerDetail>(
      `/players/${encodeURIComponent(selected)}`,
      undefined,
      controller.signal,
    )
      .then(setPlayer)
      .catch((cause) => {
        if (!controller.signal.aborted) fail(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, session?.authenticated]);

  const loadPlayer = async (
    id = selected!,
    expectedGeneration = generation.current,
  ) => {
    const latest = await request<AdminPlayerDetail>(
      `/players/${encodeURIComponent(id)}`,
    );
    if (
      generation.current !== expectedGeneration ||
      currentAccount.current !== id
    )
      throw new DOMException("Выбран другой игрок.", "AbortError");
    setPlayer(latest);
    return latest;
  };
  const prepare: PrepareChange = (title, operations) => {
    if (!player || !catalog || preparing) return;
    const expectedGeneration = generation.current;
    const playerId = player.state.id;
    const draft = structuredClone(operations);
    setPreparing(true);
    setError("");
    setNotice("");
    loadPlayer(playerId, expectedGeneration)
      .then((latest) => {
        if (!describeChanges(latest, draft, catalog).length) {
          setNotice("Значения уже совпадают. Изменения не требуются.");
          return;
        }
        setConfirmation({
          title,
          operations: draft,
          base: latest,
          requestId: crypto.randomUUID(),
          generation: expectedGeneration,
        });
      })
      .catch((cause) => {
        if (generation.current === expectedGeneration) fail(cause);
      })
      .finally(() => {
        if (generation.current === expectedGeneration) setPreparing(false);
      });
  };
  const navigate = (next: View) => {
    setView(next);
    selectPlayer(null);
    setError("");
    setNotice("");
  };
  const logout = async () => {
    selectPlayer(null);
    try {
      await request("/logout", {});
      setSession({ authenticated: false });
      setCatalog(null);
      setSessionError("");
    } catch (cause) {
      fail(cause);
    }
  };

  if (!session)
    return <div className="admin-session-loading">Проверка доступа...</div>;
  if (!session.authenticated)
    return (
      <Login
        initialError={sessionError}
        onLogin={(value) => {
          setSession(value);
          setView("overview");
          setSessionError("");
        }}
      />
    );

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Brand />
        <nav aria-label="Разделы управления">
          <button
            aria-current={view === "overview" ? "page" : undefined}
            onClick={() => navigate("overview")}
          >
            <BarChart3 size={18} />
            Обзор
          </button>
          <button
            aria-current={view === "players" ? "page" : undefined}
            onClick={() => navigate("players")}
          >
            <UsersRound size={18} />
            Игроки
          </button>
          <button
            aria-current={view === "audit" ? "page" : undefined}
            onClick={() => navigate("audit")}
          >
            <History size={18} />
            Журнал изменений
          </button>
        </nav>
        <div className="admin-sidebar-footer">
          <small>Сессия до {date(session.expiresAt)}</small>
          <button onClick={() => void logout()}>
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>
      <main className="admin-main">
        {error && (
          <div className="admin-notice error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="admin-notice success" role="status">
            <Check size={18} />
            <span>{notice}</span>
          </div>
        )}
        {preparing && (
          <div className="admin-notice" role="status">
            <LoaderCircle size={18} />
            Получение актуального сохранения...
          </div>
        )}
        {!selected && (
          <div className="admin-topline">
            <div>
              <h1>
                {view === "overview"
                  ? "Обзор игры"
                  : view === "players"
                    ? "Игроки"
                    : "Журнал изменений"}
              </h1>
              {view === "overview" && overview && (
                <p>Состояние на {date(overview.now)}</p>
              )}
              {view === "players" && players && (
                <p>Найдено: {number(players.total)}</p>
              )}
            </div>
            <button
              className="admin-icon"
              title="Обновить данные"
              aria-label="Обновить данные"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        )}
        {view === "overview" && catalog && overview && (
          <Overview data={overview} catalog={catalog} />
        )}
        {view === "overview" && (!overview || !catalog) && !error && (
          <Empty>Загрузка сводки...</Empty>
        )}
        {view === "players" && !selected && (
          <>
            <form
              className="admin-toolbar"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(search.trim());
                setPage(1);
                setRefresh((value) => value + 1);
              }}
            >
              <div className="admin-search">
                <input
                  aria-label="Поиск игроков"
                  placeholder="Имя или ID игрока"
                  value={search}
                  maxLength={100}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button
                  type="submit"
                  className="admin-icon"
                  aria-label="Найти игроков"
                  title="Найти"
                >
                  <Search size={18} />
                </button>
              </div>
            </form>
            {loading ? (
              <Empty>Загрузка игроков...</Empty>
            ) : (
              players &&
              catalog && (
                <>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Игрок</th>
                          <th>Уровень</th>
                          <th className="admin-optional">Маршрут</th>
                          <th className="admin-optional">Монеты</th>
                          <th className="admin-optional">Обновлён</th>
                          <th>Доступ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.items.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <button
                                className="admin-link"
                                onClick={() => selectPlayer(entry.id)}
                              >
                                {entry.publicName ?? entry.name}
                              </button>
                              <small>{entry.id}</small>
                            </td>
                            <td>{entry.level}</td>
                            <td className="admin-optional">
                              {catalog.routes.find(
                                (route) => route.id === entry.routeId,
                              )?.name ?? entry.routeId}
                            </td>
                            <td className="admin-optional">
                              {number(entry.wallet.coins)}
                            </td>
                            <td className="admin-optional">
                              {date(entry.updatedAt)}
                            </td>
                            <td>
                              <span
                                className={`admin-badge${entry.blocked ? " blocked" : ""}`}
                              >
                                {entry.blocked ? "Блокировка" : "Открыт"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!players.items.length && <Empty>Игроки не найдены.</Empty>}
                  <Pagination data={players} onPage={setPage} />
                </>
              )
            )}
          </>
        )}
        {view === "players" && selected && (
          <>
            <button onClick={() => selectPlayer(null)}>
              <ArrowLeft size={17} />К игрокам
            </button>
            {loading && !player && <Empty>Загрузка сохранения...</Empty>}
            {player && catalog && (
              <>
                <div className="admin-player-heading">
                  <div>
                    <h1>{player.publicName ?? player.state.name}</h1>
                    <span
                      className={`admin-badge${player.blocked ? " blocked" : ""}`}
                    >
                      {player.blocked ? "Заблокирован" : "Доступ открыт"}
                    </span>
                    <p>{player.state.id}</p>
                    <div className="admin-player-meta">
                      <span>Уровень {player.state.level}</span>
                      <span>Версия {player.revision}</span>
                      <span>Сохранение: {date(player.storedUpdatedAt)}</span>
                    </div>
                  </div>
                  <div className="admin-actions">
                    <button
                      className="admin-icon"
                      aria-label="Обновить игрока"
                      title="Обновить игрока"
                      disabled={preparing}
                      onClick={() =>
                        void loadPlayer()
                          .then(() => setEditorEpoch((value) => value + 1))
                          .catch(fail)
                      }
                    >
                      <RefreshCw size={17} />
                    </button>
                    <button
                      className={player.blocked ? "" : "admin-danger"}
                      disabled={preparing}
                      onClick={() =>
                        prepare(
                          player.blocked
                            ? "Разблокировать игрока"
                            : "Заблокировать игрока",
                          [{ type: "block", blocked: !player.blocked }],
                        )
                      }
                    >
                      {player.blocked ? (
                        <ShieldCheck size={17} />
                      ) : (
                        <ShieldOff size={17} />
                      )}
                      {player.blocked ? "Разблокировать" : "Заблокировать"}
                    </button>
                  </div>
                </div>
                {player.blocked && player.blockReason && (
                  <div className="admin-notice error">{player.blockReason}</div>
                )}
                <div className="admin-derived">
                  {(
                    [
                      ["Сила", player.stats.power],
                      ["Здоровье", player.stats.hp],
                      ["Защита", player.stats.armor],
                      ["Скорость", `${number(player.stats.haste * 100)}%`],
                      [
                        "Критический шанс",
                        `${number(player.stats.crit * 100)}%`,
                      ],
                      ["Прямой урон", `${number(player.stats.direct * 100)}%`],
                      ["Урон следов", `${number(player.stats.dot * 100)}%`],
                      [
                        "Лечение и щиты",
                        `${number(player.stats.support * 100)}%`,
                      ],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>
                        {typeof value === "number" ? number(value) : value}
                      </strong>
                    </div>
                  ))}
                </div>
                <div
                  className="admin-tabs"
                  role="tablist"
                  aria-label="Данные игрока"
                >
                  {(
                    [
                      ["profile", "Профиль"],
                      ["inventory", "Снаряжение"],
                      ["build", "Тактика"],
                      ["audit", "История"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={tab === id}
                      aria-controls={`admin-player-${id}`}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  id={`admin-player-${tab}`}
                  role="tabpanel"
                  aria-label={
                    tab === "profile"
                      ? "Профиль"
                      : tab === "inventory"
                        ? "Снаряжение"
                        : tab === "build"
                          ? "Тактика"
                          : "История"
                  }
                  key={`${player.state.id}:${editorEpoch}:${tab}`}
                >
                  {tab === "profile" && (
                    <ProfileEditor
                      player={player}
                      catalog={catalog}
                      prepare={prepare}
                    />
                  )}
                  {tab === "inventory" && (
                    <InventoryEditor
                      player={player}
                      catalog={catalog}
                      prepare={prepare}
                    />
                  )}
                  {tab === "build" && (
                    <BuildsEditor
                      player={player}
                      catalog={catalog}
                      prepare={prepare}
                    />
                  )}
                  {tab === "audit" && (
                    <Audit
                      key={refresh}
                      accountId={player.state.id}
                      catalog={catalog}
                      onError={fail}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
        {view === "audit" && (
          <Audit
            key={refresh}
            catalog={catalog}
            onError={fail}
            onPlayer={(id) => {
              setView("players");
              selectPlayer(id);
            }}
          />
        )}
      </main>
      {confirmation && catalog && (
        <ConfirmChange
          value={confirmation}
          catalog={catalog}
          onClose={() => setConfirmation(current => current?.requestId === confirmation.requestId ? null : current)}
          onRefresh={() => loadPlayer(confirmation.base.state.id, confirmation.generation)}
          onFailure={cause => { if (generation.current === confirmation.generation) fail(cause); }}
          onApplied={(result) => {
            if (generation.current !== confirmation.generation || currentAccount.current !== result.state.id) return;
            setPlayer(result);
            setEditorEpoch((value) => value + 1);
            setConfirmation(null);
            setNotice("Изменения сохранены и записаны в журнал.");
            setRefresh((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="admin-brand">
      <img src="/art/emblem.png" alt="" />
      <div>
        <strong>ШОВЬ</strong>
        <small>Управление игрой</small>
      </div>
    </div>
  );
}

function Login({
  initialError,
  onLogin,
}: {
  initialError: string;
  onLogin: (session: AdminSession) => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await request<AdminSession>("/login", { password });
      setPassword("");
      onLogin(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="admin-login">
      <div className="admin-login-inner">
        <Brand />
        <h1>Вход администратора</h1>
        <form onSubmit={(event) => void submit(event)}>
          <Field label="Пароль администратора">
            <div className="admin-password">
              <input
                autoFocus
                type={visible ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="admin-icon"
                aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                title={visible ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          {error && (
            <div className="admin-notice error" role="alert">
              {error}
            </div>
          )}
          <button className="admin-primary" disabled={busy}>
            {busy ? <LoaderCircle size={17} /> : <ShieldCheck size={17} />}
            {busy ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Overview({
  data,
  catalog,
}: {
  data: AdminOverview;
  catalog: Catalog;
}) {
  return (
    <>
      <div className="admin-metrics">
        <Stat label="Всего игроков" value={number(data.totalPlayers)} />
        <Stat
          label="Обновления за 24 часа"
          value={number(data.updated24h)}
          detail="По времени сохранения"
        />
        <Stat
          label="Обновления за 7 дней"
          value={number(data.updated7d)}
          detail="По времени сохранения"
        />
        <Stat
          label="Игроки с блокировкой"
          value={number(data.blockedPlayers)}
        />
      </div>
      <div className="admin-columns">
        <Section title="Уровни игроков">
          <Distribution items={data.levelDistribution} />
        </Section>
        <Section title="Маршруты">
          <Distribution
            items={data.routeDistribution.map((entry) => ({
              label:
                catalog.routes.find((route) => route.id === entry.routeId)
                  ?.name ?? entry.routeId,
              count: entry.count,
            }))}
          />
        </Section>
      </div>
      <Section title="Экономика">
        <div className="admin-metrics">
          <Stat label="Монеты на счетах" value={number(data.wealth.coins)} />
          <Stat label="Нить на счетах" value={number(data.wealth.thread)} />
          <Stat
            label="Катализаторы на счетах"
            value={number(data.wealth.catalyst)}
          />
          <Stat
            label="Кланы"
            value={
              data.totalClans === null ? "Нет данных" : number(data.totalClans)
            }
          />
        </div>
        <Distribution items={data.wealthDistribution} />
      </Section>
      <Section title="Результаты боёв">
        <div className="admin-metrics">
          <Stat label="Победы" value={number(data.wins)} />
          <Stat label="Поражения" value={number(data.losses)} />
        </div>
      </Section>
    </>
  );
}

function Distribution({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return items.length ? (
    <div className="admin-distribution">
      {items.map((item) => (
        <div className="admin-bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className="admin-bar-track" aria-hidden="true">
            <span style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <strong>{number(item.count)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <Empty>Пока нет данных.</Empty>
  );
}

function Pagination({
  data,
  onPage,
}: {
  data: { page: number; pageSize: number; total: number };
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="admin-pagination">
      <span>
        Страница {data.page} из {pages}
      </span>
      <div>
        <button
          className="admin-icon"
          aria-label="Предыдущая страница"
          title="Предыдущая страница"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="admin-icon"
          aria-label="Следующая страница"
          title="Следующая страница"
          disabled={data.page >= pages}
          onClick={() => onPage(data.page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function Audit({
  accountId,
  catalog,
  onError,
  onPlayer,
}: {
  accountId?: string;
  catalog: Catalog | null;
  onError: (cause: unknown) => void;
  onPlayer?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPage<AdminAuditEntry> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      ...(accountId ? { accountId } : {}),
    });
    setData(null);
    request<AdminPage<AdminAuditEntry>>(
      `/audit?${query}`,
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) onError(cause);
      });
    return () => controller.abort();
  }, [accountId, page]);
  return (
    <Section title="История действий">
      {!data ? (
        <Empty>Загрузка журнала...</Empty>
      ) : (
        <>
          <ol className="admin-audit">
            {data.items.map((entry) => (
              <li key={entry.id}>
                <div className="admin-audit-header">
                  <strong>
                    {entry.operations
                      .map((operation) => operationNames[operation.type])
                      .join(", ")}
                  </strong>
                  <time dateTime={new Date(entry.createdAt).toISOString()}>
                    {date(entry.createdAt)}
                  </time>
                </div>
                {!accountId && (
                  <button
                    className="admin-link"
                    onClick={() => onPlayer?.(entry.accountId)}
                  >
                    {entry.accountId}
                  </button>
                )}
                <p>{entry.reason}</p>
                {entry.operations.map((operation, index) => <p className="admin-audit-values" key={index}>{auditSummary(operation, catalog)}</p>)}
                {entry.effects.battleRestarted && <p className="admin-inline-note">Бой начат заново.</p>}
                {entry.effects.clearedPendingBuild && <p className="admin-inline-note">Отменена ожидающая смена сборки.</p>}
                {entry.effects.clearedPendingRoute && <p className="admin-inline-note">Отменён ожидающий переход.</p>}
                <small>
                  Версия {entry.beforeRevision} → {entry.afterRevision} · Запись
                  №{entry.id}
                </small>
              </li>
            ))}
          </ol>
          {!data.items.length && (
            <Empty>Изменений администратора пока нет.</Empty>
          )}
          <Pagination data={data} onPage={setPage} />
        </>
      )}
    </Section>
  );
}

function ConfirmChange({
  value,
  catalog,
  onClose,
  onRefresh,
  onApplied,
  onFailure,
}: {
  value: Confirmation;
  catalog: Catalog;
  onClose: () => void;
  onRefresh: () => Promise<AdminPlayerDetail>;
  onApplied: (player: AdminPlayerDetail) => void;
  onFailure: (cause: unknown) => void;
}) {
  const [base, setBase] = useState(value.base);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [attempt, setAttempt] = useState<AdminMutation | null>(null);
  const rows = describeChanges(base, value.operations, catalog);
  const reload = async () => {
    setBusy(true);
    setError("");
    try {
      const latest = await onRefresh();
      setBase(latest);
      setReloaded(true);
      setReviewed(false);
      setAttempt(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось обновить сохранение.",
      );
      if (cause instanceof AdminApiError && cause.status === 401)
        onFailure(cause);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      reason.trim().length < 3 ||
      !rows.length ||
      (conflict && (!reloaded || !reviewed))
    )
      return;
    const mutation = attempt ?? {
      requestId: value.requestId,
      revision: base.revision,
      reason: reason.trim(),
      operations: value.operations,
    };
    setAttempt(mutation);
    setBusy(true);
    setError("");
    try {
      onApplied(
        await request<AdminPlayerDetail>(
          `/players/${encodeURIComponent(base.state.id)}`,
          mutation,
        ),
      );
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 409) {
        setConflict(true);
        setReloaded(false);
        setReviewed(false);
      } else if (cause instanceof AdminApiError && cause.status === 401)
        onFailure(cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось подтвердить изменение.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={value.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <p>
          <strong>{base.publicName ?? base.state.name}</strong> · версия{" "}
          {base.revision}
        </p>
        {conflict && (
          <div className="admin-notice error" role="alert">
            <AlertCircle size={18} />
            <div>
              Сохранение изменилось. Черновик сохранён.
              {!reloaded && (
                <button
                  type="button"
                  onClick={() => void reload()}
                  disabled={busy}
                >
                  <RefreshCw size={16} />
                  Загрузить актуальные данные
                </button>
              )}
            </div>
          </div>
        )}
        <table className="admin-changes">
          <thead>
            <tr>
              <th>Параметр</th>
              <th>Сейчас</th>
              <th>После изменения</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td>{row.label}</td>
                <td>{row.before}</td>
                <td>{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="admin-notice">
            Значения уже совпадают. Повторное изменение не требуется.
          </p>
        )}
        <Field label="Причина изменения">
          <textarea
            value={reason}
            minLength={3}
            maxLength={500}
            required
            disabled={busy || !!attempt}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {conflict && reloaded && (
          <label className="admin-checkbox" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            Я проверил изменения после обновления
          </label>
        )}
        {error && (
          <div className="admin-notice error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || (!!attempt && !conflict)}
            onClick={() => void reload()}
            title="Обновить данные перед подтверждением"
          >
            <RefreshCw size={16} />
            Обновить расчёт
          </button>
          <button
            className="admin-primary"
            disabled={
              busy ||
              reason.trim().length < 3 ||
              !rows.length ||
              (conflict && (!reloaded || !reviewed))
            }
          >
            <Check size={17} />
            {busy ? "Сохранение..." : "Подтвердить изменения"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
