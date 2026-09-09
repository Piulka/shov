import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import { catalog, allowedAffixes, families, slots, upgradeCap } from '../shared/content.ts';
import { computeStats, createGame, migrateGame, settle, startBattle, validateBuild, xpToNext } from '../shared/engine.ts';
import type { AdminAuditEntry, AdminMutation, AdminOperation, AdminOverview, AdminPlayerDetail, AdminPlayerSummary } from '../shared/admin.ts';
import type { GameState, Item, Slot } from '../shared/types.ts';
import { GameStore, type SavedGame } from './store.ts';

export interface AdminAppOptions {
  databasePath: string;
  origin: string;
  passwordHash: string;
  trustedProxy?: string;
  secureCookies?: boolean;
  now?: () => number;
  staticRoot?: string;
}
const lifetime = 8 * 3_600_000;
const derive = promisify(scrypt);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const identifier = z.string().min(1).max(100).regex(/^[A-Za-z0-9_:-]+$/);
const name = z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const publicName = z.string().max(96).transform(value => value.normalize('NFKC').trim()).pipe(z.string().min(2).max(24))
  .refine(value => !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) && /^[\p{L}\p{M}\p{N} ._'!-]+$/u.test(value));
const slot = z.enum(['weapon', 'focus', 'head', 'armor', 'gloves', 'boots', 'amulet', 'ring']);
const family = z.enum(['blade', 'glass', 'needle']);
const affix = z.enum(['hp', 'armor', 'haste', 'crit', 'direct', 'dot', 'support']);
const amount = z.number().int().min(0).max(1_000_000_000_000);
const mode = z.enum(['farm', 'push']);
const rule = z.strictObject({
  condition: z.enum(['always', 'hp_below', 'no_shield', 'enemy_windup', 'has_debuff', 'vulnerable', 'no_vulnerable', 'three_marks', 'under_three_marks']),
  threshold: z.union([z.literal(25), z.literal(40), z.literal(55), z.literal(70)]).optional(), skillId: identifier,
});
const equipment = z.strictObject({ weapon: identifier, focus: identifier, head: identifier, armor: identifier, gloves: identifier, boots: identifier, amulet: identifier, ring: identifier });
const build = z.strictObject({ name: name.max(30), equipment, skills: z.array(identifier).length(4), rules: z.array(rule).max(3) });
const item = z.strictObject({ name, slot, level: z.number().int().min(1).max(100), rarity: z.enum(['common', 'fine', 'resonant', 'named']), family: family.optional(), affixes: z.array(affix).max(2), special: z.enum(['long_thread', 'mirror']).optional(), locked: z.boolean().optional() });
const upgrades = z.strictObject(Object.fromEntries(slots.map(value => [value, z.number().int().min(0).max(12).optional()])) as Record<Slot, z.ZodOptional<z.ZodNumber>>).refine(value => Object.keys(value).length > 0);
const wallet = z.strictObject({ coins: amount.optional(), thread: amount.optional(), catalyst: amount.optional() }).refine(value => Object.keys(value).length > 0);
const operation = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('profile'), name: name.optional(), publicName: publicName.optional(), level: z.number().int().min(1).max(100).optional(), xp: amount.optional() }).refine(value => Object.keys(value).length > 1),
  z.strictObject({ type: z.literal('wallet'), values: wallet }),
  z.strictObject({ type: z.literal('upgrades'), values: upgrades }),
  z.strictObject({ type: z.literal('route'), routeId: identifier, mode }),
  z.strictObject({ type: z.literal('mode'), mode }),
  z.strictObject({ type: z.literal('target'), slot: slot.nullable() }),
  z.strictObject({ type: z.literal('item_add'), item }),
  z.strictObject({ type: z.literal('item_update'), itemId: identifier, item }),
  z.strictObject({ type: z.literal('item_delete'), itemId: identifier }),
  z.strictObject({ type: z.literal('equip'), itemId: identifier }),
  z.strictObject({ type: z.literal('build'), build }),
  z.strictObject({ type: z.literal('preset'), index: z.number().int().min(0).max(2), build }),
  z.strictObject({ type: z.literal('block'), blocked: z.boolean() }),
]);
const mutation = z.strictObject({
  requestId: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reason: z.string().trim().min(3).max(500),
  operations: z.array(operation).min(1).max(20),
});
const pagination = { page: z.coerce.number().int().min(1).max(100_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) };
class AdminError extends Error {
  constructor(readonly statusCode: number, message: string, readonly code: string, readonly revision?: number) { super(message); }
}
const reject = (message: string) => { throw new AdminError(400, message, 'INVALID_EDIT'); };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AdminError(400, 'Некорректные поля запроса.', 'INVALID_REQUEST');
  return result.data;
}
function proxyList(value?: string): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(',').map(entry => entry.trim());
  for (const entry of entries) {
    const [address, bits, extra] = entry.split('/');
    const version = isIP(address);
    if (!version || extra !== undefined || (bits !== undefined && (!/^\d+$/.test(bits) || Number(bits) > (version === 4 ? 32 : 128)))) throw new Error('Invalid admin trustedProxy.');
  }
  return entries;
}
function validateItem(value: Item): void {
  if (value.slot === 'weapon' ? !value.family || !families.includes(value.family) : value.family !== undefined) reject('Семейство обязательно только для оружия.');
  const expected = value.rarity === 'common' ? 0 : value.rarity === 'fine' ? 1 : 2;
  if (value.affixes.length !== expected || new Set(value.affixes).size !== expected || value.affixes.some(entry => !allowedAffixes(value.slot).includes(entry))) reject('Число или сочетание свойств не соответствует редкости и слоту.');
  if (value.rarity === 'named') {
    if (value.special === 'long_thread' && value.slot === 'weapon' && value.family === 'needle') return;
    if (value.special === 'mirror' && ['amulet', 'ring'].includes(value.slot)) return;
    reject('Именная особенность несовместима с выбранной вещью.');
  } else if (value.special !== undefined) reject('Особенность допускается только у именной вещи.');
}

function combatSignature(state: GameState): string {
  return JSON.stringify({
    level: state.level, upgrades: state.upgrades, routeId: state.routeId,
    skills: state.build.skills, rules: state.build.rules,
    equipment: slots.map(slot => {
      const { id: _id, name: _name, locked: _locked, ...attributes } = state.inventory.find(value => value.id === state.build.equipment[slot])!;
      return attributes;
    }),
  });
}

function editState(state: GameState, operations: AdminOperation[], now: number): void {
  for (const command of operations) {
    switch (command.type) {
      case 'profile':
        if (command.name !== undefined) state.name = command.name;
        if (command.level !== undefined) { state.level = command.level; state.xp = command.xp ?? 0; }
        else if (command.xp !== undefined) state.xp = command.xp;
        break;
      case 'wallet': Object.assign(state.wallet, command.values); break;
      case 'upgrades': Object.assign(state.upgrades, command.values); break;
      case 'route': {
        const index = catalog.routes.findIndex(route => route.id === command.routeId);
        if (index < 0) reject('Неизвестный маршрут.');
        if (catalog.routes[index].unlockLevel > state.level) reject('Сначала повысьте уровень героя для этого маршрута.');
        state.unlockedRoutes = [...new Set([...state.unlockedRoutes, ...catalog.routes.slice(0, index + 1).map(route => route.id)])];
        state.routeId = command.routeId; state.mode = command.mode; state.pendingRoute = null;
        break;
      }
      case 'mode': state.mode = command.mode; if (state.pendingRoute) state.pendingRoute.mode = command.mode; break;
      case 'target': state.targetSlot = command.slot; break;
      case 'item_add': {
        const value = { ...structuredClone(command.item), id: `admin-${randomUUID()}` };
        validateItem(value); state.inventory.push(value); break;
      }
      case 'item_update': {
        const index = state.inventory.findIndex(value => value.id === command.itemId);
        if (index < 0) reject('Предмет не найден.');
        const value = { ...structuredClone(command.item), id: command.itemId };
        validateItem(value); state.inventory[index] = value; break;
      }
      case 'item_delete': {
        const value = state.inventory.find(entry => entry.id === command.itemId);
        if (!value) reject('Предмет не найден.');
        if (value!.locked) reject('Сначала снимите закрепление предмета.');
        state.inventory = state.inventory.filter(entry => entry.id !== command.itemId); break;
      }
      case 'equip': {
        const value = state.inventory.find(entry => entry.id === command.itemId);
        if (!value) reject('Предмет не найден.');
        const old = state.inventory.find(entry => entry.id === state.build.equipment.weapon);
        state.build.equipment[value!.slot] = value!.id;
        if (value!.slot === 'weapon' && old?.family !== value!.family) {
          const basic = createGame('admin-template', now).presets[families.indexOf(value!.family!)];
          state.build.skills = basic.skills; state.build.rules = basic.rules;
        }
        state.pendingBuild = null; break;
      }
      case 'build': state.build = structuredClone(command.build); state.pendingBuild = null; break;
      case 'preset': state.presets[command.index] = structuredClone(command.build); break;
      case 'block': break;
    }
  }
  if ((state.level === 100 && state.xp !== 0) || (state.level < 100 && state.xp >= xpToNext(state.level))) reject('Опыт должен быть меньше порога следующего уровня; на уровне 100 допустим только ноль.');
  if (slots.some(value => !Number.isInteger(state.upgrades[value]) || state.upgrades[value] < 0 || state.upgrades[value] > upgradeCap(state.level))) reject(`Усиление слотов превышает предел +${upgradeCap(state.level)} для уровня героя.`);
  if (Object.values(state.wallet).some(value => !Number.isSafeInteger(value) || value < 0)) reject('Некорректные значения кошелька.');
  if (new Set(state.inventory.map(value => value.id)).size !== state.inventory.length) reject('Повторяющиеся ID предметов.');
  try { validateBuild(state, state.build); for (const preset of state.presets) validateBuild(state, preset); }
  catch (error) { reject(`Сборка или сохранённый набор: ${error instanceof Error ? error.message : 'недопустимая экипировка'}`); }
  if (state.pendingBuild) {
    try { validateBuild(state, state.pendingBuild); } catch { state.pendingBuild = null; }
  }
  const route = catalog.routes.find(value => value.id === state.routeId);
  if (!route || route.unlockLevel > state.level || !state.unlockedRoutes.includes(route.id)) reject('Текущий маршрут не соответствует уровню героя.');
  if (state.pendingRoute && (!state.unlockedRoutes.includes(state.pendingRoute.routeId) || !catalog.routes.some(value => value.id === state.pendingRoute!.routeId && value.unlockLevel <= state.level))) state.pendingRoute = null;
}

export function createAdminApp(options: AdminAppOptions) {
  const secure = options.secureCookies !== false;
  let origin: string;
  try {
    const url = new URL(options.origin);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (secure ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error();
    origin = url.origin;
  } catch { throw new Error('Admin origin must be an HTTPS origin; insecure cookies are allowed only on loopback.'); }
  const parts = /^scrypt\$([a-f0-9]{32,128})\$([a-f0-9]{128})$/i.exec(options.passwordHash);
  if (!parts || parts[1].length % 2) throw new Error('Admin passwordHash must use scrypt$saltHex$hashHex with a 64-byte key.');
  const salt = Buffer.from(parts[1], 'hex'), expected = Buffer.from(parts[2], 'hex');
  const credential = digest(options.passwordHash);
  const trustProxy = proxyList(options.trustedProxy);
  const now = options.now ?? Date.now;
  const store = new GameStore(options.databasePath);
  const db = store.database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_profiles (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id), public_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, last_create_at INTEGER, last_message_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY, public_id TEXT NOT NULL, credential TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL REFERENCES accounts(id),
      request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL, actor_id TEXT NOT NULL,
      reason TEXT NOT NULL, operations TEXT NOT NULL CHECK(json_valid(operations)),
      before_snapshot TEXT NOT NULL CHECK(json_valid(before_snapshot)),
      after_snapshot TEXT NOT NULL CHECK(json_valid(after_snapshot)),
      settled_snapshot TEXT NOT NULL CHECK(json_valid(settled_snapshot)),
      before_block TEXT NOT NULL CHECK(json_valid(before_block)),
      after_block TEXT NOT NULL CHECK(json_valid(after_block)),
      before_public_name TEXT, after_public_name TEXT,
      effects TEXT NOT NULL CHECK(json_valid(effects)),
      before_revision INTEGER NOT NULL, after_revision INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_audit_account ON admin_audit(account_id, id DESC);
  `);
  db.function('admin_fold', { deterministic: true }, value => typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('ru') : '');
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, requestTimeout: 10_000, trustProxy, requestIdHeader: false });
  const cookieName = secure ? '__Host-shov_admin' : 'shov_admin_local';
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'strict' as const };
  const limits = new Map<string, { count: number; end: number }>();
  function limit(key: string, count: number, duration: number) {
    const time = now();
    if (limits.size > 5000) for (const [name, value] of limits) if (value.end <= time) limits.delete(name);
    if (limits.size > 5000 && !limits.has(key)) throw new AdminError(429, 'Слишком много запросов.', 'RATE_LIMIT');
    let entry = limits.get(key);
    if (!entry || entry.end <= time) { entry = { count: 0, end: time + duration }; limits.set(key, entry); }
    if (++entry.count > count) throw new AdminError(429, 'Слишком много запросов. Повторите позже.', 'RATE_LIMIT');
  }
  function session(request: FastifyRequest) {
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    return db.prepare('SELECT token_hash, public_id, expires_at FROM admin_sessions WHERE token_hash = ? AND credential = ? AND expires_at > ?').get(digest(token), credential, now()) as { token_hash: string; public_id: string; expires_at: number } | undefined;
  }
  function requireSession(request: FastifyRequest) {
    const value = session(request);
    if (!value) throw new AdminError(401, 'Войдите в панель управления.', 'ADMIN_AUTH_REQUIRED');
    return value;
  }
  function savedPlayer(id: string) {
    const value = db.prepare('SELECT id, snapshot, revision, updated_at FROM accounts WHERE id = ?').get(id) as (SavedGame & { updated_at: number }) | undefined;
    if (!value) throw new AdminError(404, 'Игрок не найден.', 'NOT_FOUND');
    return value;
  }
  function block(id: string) { return db.prepare('SELECT reason, created_at FROM account_blocks WHERE account_id = ?').get(id) as { reason: string; created_at: number } | undefined; }
  function profileName(id: string): string | null { return (db.prepare('SELECT name FROM social_profiles WHERE account_id = ?').get(id) as { name: string } | undefined)?.name ?? null; }
  function auditRow(row: Record<string, unknown>): AdminAuditEntry {
    return { id: Number(row.id), accountId: String(row.account_id), requestId: String(row.request_id), reason: String(row.reason), operations: JSON.parse(String(row.operations)), beforeRevision: Number(row.before_revision), afterRevision: Number(row.after_revision), createdAt: Number(row.created_at), effects: JSON.parse(String(row.effects)), beforePublicName: row.before_public_name === null ? null : String(row.before_public_name), afterPublicName: row.after_public_name === null ? null : String(row.after_public_name) };
  }
  function detail(id: string, time: number): AdminPlayerDetail {
    const stored = savedPlayer(id);
    const state = JSON.parse(stored.snapshot) as GameState;
    migrateGame(state); settle(state, time);
    const { rng: _rng, nextItemId: _nextItemId, ...preview } = state;
    const blocked = block(id);
    return { revision: stored.revision, storedUpdatedAt: stored.updated_at, previewAt: time, publicName: profileName(id), state: preview, stats: computeStats(state), xpToNext: xpToNext(state.level), blocked: !!blocked, blockReason: blocked?.reason ?? null, audit: (db.prepare('SELECT * FROM admin_audit WHERE account_id = ? ORDER BY id DESC LIMIT 20').all(id) as Record<string, unknown>[]).map(auditRow) };
  }
  app.register(cookie);
  app.addHook('onClose', async () => { store.close(); });
  app.addHook('onRequest', async request => {
    if (!request.url.startsWith('/api/')) return;
    if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin !== undefined && request.headers.origin !== origin) || (!['GET', 'HEAD'].includes(request.method) && request.headers.origin !== origin)) throw new AdminError(403, 'Источник запроса не разрешён.', 'BAD_ORIGIN');
    limit(`requests:${request.ip}`, 300, 60_000);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY'); reply.header('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    reply.header('Referrer-Policy', 'no-referrer');
    if (secure) reply.header('Strict-Transport-Security', 'max-age=31536000');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AdminError) {
      if (error.statusCode === 429) reply.header('Retry-After', '900');
      return reply.code(error.statusCode).send({ error: error.message, code: error.code, ...(error.revision !== undefined ? { revision: error.revision } : {}) });
    }
    const code = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
    if (!(code >= 400 && code < 500)) console.error(JSON.stringify({ event: 'admin_request_error', requestId: request.id, errorType: error instanceof Error ? error.constructor.name : typeof error }));
    return reply.code(code >= 400 && code < 500 ? code : 500).send({ error: 'Не удалось выполнить запрос.', code: code < 500 ? 'INVALID_REQUEST' : 'ADMIN_ERROR' });
  });
  app.get('/api/admin/session', async request => { const value = session(request); return value ? { authenticated: true, expiresAt: value.expires_at } : { authenticated: false }; });
  app.post('/api/admin/login', async (request, reply) => {
    limit(`login:${request.ip}`, 8, 900_000); limit('login:global', 60, 900_000);
    const body = parse(z.strictObject({ password: z.string().min(1).max(512) }), request.body);
    const actual = await derive(body.password, salt, expected.length) as Buffer;
    if (!timingSafeEqual(actual, expected)) throw new AdminError(401, 'Неверный пароль.', 'INVALID_CREDENTIALS');
    const token = randomBytes(32).toString('hex'), time = now(), expiresAt = time + lifetime;
    store.transaction(() => {
      const previous = session(request);
      if (previous) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(previous.token_hash);
      db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR credential != ?').run(time, credential);
      db.prepare('INSERT INTO admin_sessions VALUES (?, ?, ?, ?, ?)').run(digest(token), randomUUID(), credential, time, expiresAt);
    });
    reply.setCookie(cookieName, token, { ...cookieOptions, maxAge: lifetime / 1000 });
    return { authenticated: true, expiresAt };
  });
  app.post('/api/admin/logout', async (request, reply) => {
    parse(z.strictObject({}), request.body ?? {});
    const value = requireSession(request);
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(value.token_hash);
    reply.clearCookie(cookieName, cookieOptions);
    return { authenticated: false };
  });
  app.get('/api/admin/catalog', async request => { requireSession(request); return catalog; });
  app.get('/api/admin/overview', async request => {
    requireSession(request);
    const time = now();
    const total = db.prepare(`SELECT COUNT(*) total, SUM(updated_at >= ?) day, SUM(updated_at >= ?) week,
      COALESCE(SUM(json_extract(snapshot, '$.totals.wins')), 0) wins, COALESCE(SUM(json_extract(snapshot, '$.totals.losses')), 0) losses,
      COALESCE(SUM(json_extract(snapshot, '$.wallet.coins')), 0) coins, COALESCE(SUM(json_extract(snapshot, '$.wallet.thread')), 0) thread,
      COALESCE(SUM(json_extract(snapshot, '$.wallet.catalyst')), 0) catalyst FROM accounts`).get(time - 86_400_000, time - 7 * 86_400_000) as Record<string, number>;
    const levelDistribution = [[1, 9], [10, 24], [25, 39], [40, 59], [60, 79], [80, 100]].map(([min, max]) => ({ label: `${min}-${max}`, count: (db.prepare("SELECT COUNT(*) n FROM accounts WHERE json_extract(snapshot, '$.level') BETWEEN ? AND ?").get(min, max) as { n: number }).n }));
    const routeDistribution = (db.prepare("SELECT json_extract(snapshot, '$.routeId') routeId, COUNT(*) count FROM accounts GROUP BY routeId ORDER BY routeId").all() as { routeId: string; count: number }[]);
    const wealthDistribution = [[0, 999], [1000, 9999], [10000, 99999], [100000, 999999], [1000000, Number.MAX_SAFE_INTEGER]].map(([min, max]) => ({ label: max === Number.MAX_SAFE_INTEGER ? '1000000+' : `${min}-${max}`, count: (db.prepare("SELECT COUNT(*) n FROM accounts WHERE json_extract(snapshot, '$.wallet.coins') BETWEEN ? AND ?").get(min, max) as { n: number }).n }));
    const hasClans = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'social_clans'").get();
    return { now: time, totalPlayers: total.total, updated24h: total.day || 0, updated7d: total.week || 0, blockedPlayers: (db.prepare('SELECT COUNT(*) n FROM account_blocks').get() as { n: number }).n, totalClans: hasClans ? (db.prepare('SELECT COUNT(*) n FROM social_clans WHERE archived = 0').get() as { n: number }).n : null, wins: total.wins, losses: total.losses, wealth: { coins: total.coins, thread: total.thread, catalyst: total.catalyst }, levelDistribution, routeDistribution, wealthDistribution } satisfies AdminOverview;
  });
  app.get('/api/admin/players', async request => {
    requireSession(request);
    const query = parse(z.strictObject({ ...pagination, q: z.string().trim().max(100).default('') }), request.query);
    const condition = "instr(admin_fold(a.id), admin_fold(?)) > 0 OR instr(admin_fold(json_extract(a.snapshot, '$.name')), admin_fold(?)) > 0 OR instr(admin_fold(p.name), admin_fold(?)) > 0";
    const from = 'accounts a LEFT JOIN social_profiles p ON p.account_id = a.id';
    const total = (db.prepare(`SELECT COUNT(*) n FROM ${from} WHERE ${condition}`).get(query.q, query.q, query.q) as { n: number }).n;
    const rows = db.prepare(`SELECT a.id, a.snapshot, a.revision, a.updated_at, p.name public_name, EXISTS(SELECT 1 FROM account_blocks b WHERE b.account_id = a.id) blocked FROM ${from} WHERE ${condition} ORDER BY a.updated_at DESC, a.id LIMIT ? OFFSET ?`).all(query.q, query.q, query.q, query.pageSize, (query.page - 1) * query.pageSize) as { id: string; snapshot: string; revision: number; updated_at: number; blocked: number; public_name: string | null }[];
    const items: AdminPlayerSummary[] = rows.map(row => { const state = JSON.parse(row.snapshot) as GameState; return { id: row.id, name: state.name, publicName: row.public_name, level: state.level, routeId: state.routeId, wallet: state.wallet, revision: row.revision, updatedAt: row.updated_at, createdAt: state.createdAt, blocked: !!row.blocked }; });
    return { items, page: query.page, pageSize: query.pageSize, total };
  });
  app.get('/api/admin/audit', async request => {
    requireSession(request);
    const query = parse(z.strictObject({ ...pagination, accountId: identifier.optional() }), request.query);
    const filter = query.accountId ? ' WHERE account_id = ?' : '';
    const values = query.accountId ? [query.accountId] : [];
    const total = (db.prepare(`SELECT COUNT(*) n FROM admin_audit${filter}`).get(...values) as { n: number }).n;
    const rows = db.prepare(`SELECT * FROM admin_audit${filter} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values, query.pageSize, (query.page - 1) * query.pageSize) as Record<string, unknown>[];
    return { items: rows.map(auditRow), page: query.page, pageSize: query.pageSize, total };
  });
  app.get('/api/admin/players/:id', async request => {
    requireSession(request);
    const { id } = parse(z.strictObject({ id: identifier }), request.params);
    return detail(id, now());
  });
  app.post('/api/admin/players/:id', async request => {
    const operator = requireSession(request);
    limit(`edit:${operator.public_id}`, 60, 60_000);
    const { id } = parse(z.strictObject({ id: identifier }), request.params);
    const body = parse(mutation, request.body) as AdminMutation;
    const hash = digest(JSON.stringify({ accountId: id, revision: body.revision, reason: body.reason, operations: body.operations }));
    const time = now();
    return store.transaction(() => {
      const previous = db.prepare('SELECT payload_hash FROM admin_audit WHERE request_id = ?').get(body.requestId) as { payload_hash: string } | undefined;
      if (previous) {
        if (previous.payload_hash !== hash) throw new AdminError(409, 'Этот ID использован для другого изменения.', 'IDEMPOTENCY_CONFLICT');
        return detail(id, time);
      }
      const saved = savedPlayer(id);
      if (saved.revision !== body.revision) throw new AdminError(409, 'Игрок обновился. Сверьте изменения с актуальными данными.', 'REVISION_CONFLICT', saved.revision);
      const state = JSON.parse(saved.snapshot) as GameState;
      migrateGame(state);
      // Settle with the old equipment before making changes that affect combat.
      settle(state, time);
      const settledSnapshot = JSON.stringify(state), beforeCombat = combatSignature(state);
      const pendingBuild = !!state.pendingBuild, pendingRoute = !!state.pendingRoute;
      editState(state, body.operations, time);
      const beforeBlock = block(id) ?? null;
      const beforePublicName = profileName(id);
      for (const command of body.operations) {
        if (command.type === 'block') {
          if (command.blocked) db.prepare('INSERT INTO account_blocks(account_id, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET reason=excluded.reason, created_at=excluded.created_at').run(id, body.reason, time);
          else db.prepare('DELETE FROM account_blocks WHERE account_id = ?').run(id);
        }
        if (command.type === 'profile' && command.publicName !== undefined) db.prepare('INSERT INTO social_profiles(account_id, public_id, name) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET name=excluded.name').run(id, randomUUID(), command.publicName);
      }
      const battleRestarted = beforeCombat !== combatSignature(state);
      if (battleRestarted) {
        state.lastSimulatedAt = time; state.autonomyUntil = Math.max(state.autonomyUntil, time);
        state.consecutiveLosses = 0; state.battle = startBattle(state, time);
      }
      const effects = { appliedAt: time, battleRestarted, clearedPendingBuild: pendingBuild && !state.pendingBuild, clearedPendingRoute: pendingRoute && !state.pendingRoute };
      let revision = store.saveGame(saved, state, time);
      if (revision === saved.revision) {
        revision++;
        db.prepare('UPDATE accounts SET revision = ?, updated_at = ? WHERE id = ?').run(revision, time, id);
      }
      db.prepare(`INSERT INTO admin_audit(account_id, request_id, payload_hash, actor_id, reason, operations, before_snapshot, settled_snapshot, after_snapshot, before_block, after_block, before_public_name, after_public_name, effects, before_revision, after_revision, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, body.requestId, hash, operator.public_id, body.reason, JSON.stringify(body.operations), saved.snapshot, settledSnapshot, JSON.stringify(state), JSON.stringify(beforeBlock), JSON.stringify(block(id) ?? null), beforePublicName, profileName(id), JSON.stringify(effects), saved.revision, revision, time);
      return detail(id, time);
    });
  });
  const staticRoot = options.staticRoot ?? fileURLToPath(new URL('../dist', import.meta.url));
  if (existsSync(resolve(staticRoot, 'admin.html'))) {
    app.register(staticFiles, { root: staticRoot, serve: false });
    app.get('/', async (_request, reply) => reply.sendFile('admin.html'));
    app.get<{ Params: { '*': string } }>('/assets/*', async (request, reply) => reply.sendFile(request.params['*'], resolve(staticRoot, 'assets')));
    app.get<{ Params: { '*': string } }>('/art/*', async (request, reply) => reply.sendFile(request.params['*'], resolve(staticRoot, 'art')));
  }
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Маршрут не найден.', code: 'NOT_FOUND' }));
  return app;
}
