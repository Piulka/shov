import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { z } from 'zod';
import { catalog } from '../shared/content.ts';
import { applyCommand, computeStats, createGame, migrateGame, settle, train, xpToNext } from '../shared/engine.ts';
import type { GameCommand, GameState, GameView, JourneyReport } from '../shared/types.ts';
import { sessionDigest, validateTelegramInitData } from './auth.ts';
import { GameStore, type SavedGame } from './store.ts';
import { SocialError, SocialService } from './social.ts';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sessionCookie = 'shov_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const autonomyDuration = 48 * 60 * 60 * 1000;
const slot = z.enum(['weapon', 'focus', 'head', 'armor', 'gloves', 'boots', 'amulet', 'ring']);
const family = z.enum(['blade', 'glass', 'needle']);
const affix = z.enum(['hp', 'armor', 'haste', 'crit', 'direct', 'dot', 'support']);
const identifier = z.string().min(1).max(100).regex(/^[A-Za-z0-9_:-]+$/);
const rule = z.strictObject({
  condition: z.enum(['always', 'hp_below', 'no_shield', 'enemy_windup', 'has_debuff', 'vulnerable', 'no_vulnerable', 'three_marks', 'under_three_marks']),
  threshold: z.union([z.literal(25), z.literal(40), z.literal(55), z.literal(70)]).optional(),
  skillId: identifier,
});
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('equip'), itemId: identifier }),
  z.strictObject({ type: z.literal('build'), skills: z.array(identifier).length(4), rules: z.array(rule).max(3) }),
  z.strictObject({ type: z.literal('route'), routeId: identifier, mode: z.enum(['farm', 'push']) }),
  z.strictObject({ type: z.literal('upgrade'), slot }),
  z.strictObject({ type: z.literal('craft'), slot, family: family.optional(), affix }),
  z.strictObject({ type: z.literal('dismantle'), itemIds: z.array(identifier).min(1).max(100) }),
  z.strictObject({ type: z.literal('lock'), itemId: identifier, locked: z.boolean() }),
  z.strictObject({ type: z.literal('target'), slot: slot.nullable() }),
  z.strictObject({ type: z.literal('preset_save'), index: z.number().int().min(0).max(2), name: z.string().trim().min(1).max(30) }),
  z.strictObject({ type: z.literal('preset_load'), index: z.number().int().min(0).max(2) }),
]);
const commandRequest = z.strictObject({
  id: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  command: commandSchema,
});

export interface AppOptions {
  databasePath?: string;
  mode?: 'local' | 'telegram';
  botToken?: string;
  appOrigin?: string;
  trustedProxy?: string;
  now?: () => number;
}

class ApiError extends Error {
  constructor(readonly statusCode: number, message: string, readonly code: string, readonly revision?: number) { super(message); }
}

function isLoopback(host: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(host.toLowerCase());
}

function trustedProxies(value: string | undefined): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(',').map(entry => entry.trim());
  for (const entry of entries) {
    const parts = entry.split('/');
    const version = isIP(parts[0]);
    const prefix = parts[1];
    if (!version || parts.length > 2 || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY must contain comma-separated IPv4/IPv6 addresses or valid CIDR ranges.');
    }
  }
  return entries;
}

export function createApp(options: AppOptions = {}): FastifyInstance {
  const mode = options.mode ?? 'local';
  const botToken = options.botToken ?? process.env.BOT_TOKEN;
  if (mode === 'telegram' && !botToken) throw new Error('BOT_TOKEN is required in telegram mode.');
  const appOrigin = options.appOrigin ?? process.env.APP_ORIGIN;
  const allowedOrigin = appOrigin ? new URL(appOrigin).origin : undefined;
  const clock = options.now ?? Date.now;
  const trustProxy = trustedProxies(options.trustedProxy ?? process.env.TRUSTED_PROXY);
  const store = new GameStore(options.databasePath ?? resolve(projectRoot, 'data/shov.sqlite'));
  const social = new SocialService(store);
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, requestTimeout: 10_000, trustProxy });
  const limits = new Map<string, { until: number; count: number }>();

  function rateLimit(key: string, limit: number, now: number): void {
    if (limits.size > 10_000) {
      for (const [storedKey, entry] of limits) if (entry.until <= now) limits.delete(storedKey);
      if (limits.size > 10_000 && !limits.has(key)) throw new ApiError(429, 'Сервер занят. Попробуйте позже.', 'RATE_LIMIT');
    }
    let entry = limits.get(key);
    if (!entry || entry.until <= now) { entry = { until: now + 60_000, count: 0 }; limits.set(key, entry); }
    entry.count += 1;
    if (entry.count > limit) throw new ApiError(429, 'Слишком много запросов. Подождите минуту.', 'RATE_LIMIT');
  }

  function parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new ApiError(400, 'Некорректная команда.', 'INVALID_REQUEST');
    return result.data;
  }

  function getAccount(request: FastifyRequest, now: number): string {
    const token = request.cookies[sessionCookie];
    const session = token && /^[a-f0-9]{64}$/.test(token) ? store.getSession(sessionDigest(token), now) : undefined;
    if (!session) throw new ApiError(401, 'Откройте игру заново для входа.', 'UNAUTHORIZED');
    rateLimit(`account:${session.account_id}`, 240, now);
    return session.account_id;
  }

  function getSaved(accountId: string): SavedGame {
    const saved = store.getGame(accountId);
    if (!saved) throw new ApiError(401, 'Сохранение аккаунта не найдено.', 'UNAUTHORIZED');
    return saved;
  }

  function advance(state: GameState, now: number): JourneyReport {
    const oldHorizon = state.autonomyUntil;
    const report = settle(state, now);
    if (now > oldHorizon) {
      const rest = now - oldHorizon;
      state.battle.startedAt += rest;
      state.battle.endsAt += rest;
      state.lastSimulatedAt = now;
    }
    state.autonomyUntil = Math.max(state.autonomyUntil, now + autonomyDuration);
    return report;
  }

  function view(state: GameState, revision: number, now: number, report: JourneyReport | null): GameView {
    const { rng: _rng, nextItemId: _nextItemId, ...publicState } = state;
    return { state: publicState, now, stats: computeStats(state), xpToNext: xpToNext(state.level), revision, catalog, report };
  }

  function settleSaved(saved: SavedGame, now: number): GameView {
    const state = JSON.parse(saved.snapshot) as GameState;
    migrateGame(state);
    const report = advance(state, now);
    return view(state, store.saveGame(saved, state, now), now, report);
  }

  app.register(cookie);
  app.addHook('onClose', async () => { store.close(); });
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    if (mode === 'local') {
      let host = '';
      try { host = new URL(`http://${request.headers.host ?? ''}`).hostname; } catch { /* Rejected below. */ }
      if (!isLoopback(request.ip) || !isLoopback(host)) throw new ApiError(403, 'Локальный режим доступен только на этом компьютере.', 'LOCAL_ONLY');
    }
    const settlesProgress = ['/api/state', '/api/social'].includes(request.url.split('?')[0]);
    if (settlesProgress || (request.method !== 'GET' && request.method !== 'HEAD')) {
      const origin = request.headers.origin;
      let accepted = true;
      if (origin) {
        try {
          const source = new URL(origin);
          accepted = mode === 'local'
            ? ['http:', 'https:'].includes(source.protocol) && isLoopback(source.hostname)
            : allowedOrigin ? source.origin === allowedOrigin : source.protocol === 'https:' && source.host === request.headers.host;
        } catch { accepted = false; }
      }
      if (!accepted || request.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'Источник запроса не разрешён.', 'BAD_ORIGIN');
    }
    rateLimit(`ip:${request.ip}`, 600, clock());
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SocialError) {
      if (error.statusCode === 429) reply.header('Retry-After', '60');
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    if (error instanceof ApiError) {
      if (error.statusCode === 429) reply.header('Retry-After', '60');
      return reply.code(error.statusCode).send({ error: error.message, code: error.code, ...(error.revision ? { revision: error.revision } : {}) });
    }
    const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: 'Некорректный запрос.', code: 'INVALID_REQUEST' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Не удалось сохранить действие. Повторите запрос.', code: 'SERVER_ERROR' });
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  app.get('/api/health', async () => ({ ok: true, mode, version: '0.3.0' }));

  app.post('/api/auth', async (request, reply) => {
    const now = clock();
    rateLimit(`auth:${request.ip}`, 20, now);
    const body = parse(z.strictObject({ initData: z.string().min(1).max(12_000).optional() }), request.body ?? {});
    let accountId: string;
    if (mode === 'telegram') {
      if (!body.initData) throw new ApiError(401, 'Запустите игру через Telegram.', 'TELEGRAM_REQUIRED');
      try { accountId = validateTelegramInitData(body.initData, botToken!, now); }
      catch (error) { throw new ApiError(401, error instanceof Error ? error.message : 'Авторизация не подтверждена.', 'INVALID_TELEGRAM_AUTH'); }
    } else {
      const existingToken = request.cookies[sessionCookie];
      const session = existingToken && /^[a-f0-9]{64}$/.test(existingToken) ? store.getSession(sessionDigest(existingToken), now) : undefined;
      accountId = session?.account_id ?? `local:${randomUUID()}`;
    }
    const token = randomBytes(32).toString('hex');
    const result = store.transaction(() => {
      const saved = store.getGame(accountId) ?? store.createGame(createGame(accountId, now, randomInt(1, 0x1_0000_0000)), now);
      const current = settleSaved(saved, now);
      store.createSession(sessionDigest(token), accountId, now + sessionLifetime, now);
      return current;
    });
    reply.setCookie(sessionCookie, token, {
      path: '/', httpOnly: true, sameSite: mode === 'telegram' ? 'none' : 'lax',
      secure: mode === 'telegram', partitioned: mode === 'telegram', maxAge: sessionLifetime / 1000,
    });
    return result;
  });

  app.get('/api/state', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    return store.transaction(() => settleSaved(getSaved(accountId), now));
  });

  app.post('/api/command', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    const body = parse(commandRequest, request.body);
    const hash = createHash('sha256').update(JSON.stringify(body.command)).digest('hex');
    return store.transaction(() => {
      const saved = getSaved(accountId);
      const previous = store.getCommandHash(accountId, body.id);
      if (previous) {
        if (previous !== hash) throw new ApiError(409, 'Этот ID уже использован для другого действия.', 'COMMAND_ID_CONFLICT', saved.revision);
        return settleSaved(saved, now);
      }
      if (body.revision !== saved.revision) throw new ApiError(409, 'Состояние обновилось. Повторите действие после синхронизации.', 'REVISION_CONFLICT', saved.revision);
      const state = JSON.parse(saved.snapshot) as GameState;
      migrateGame(state);
      const report = advance(state, now);
      try { applyCommand(state, body.command as GameCommand, now); }
      catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Действие недоступно.', 'COMMAND_REJECTED'); }
      const revision = store.saveGame(saved, state, now);
      store.recordCommand(accountId, body.id, hash, now);
      return view(state, revision, now, report);
    });
  });

  app.post('/api/train', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    rateLimit(`train:${accountId}`, 6, now);
    const body = parse(z.strictObject({ routeId: identifier }), request.body);
    return store.transaction(() => {
      const saved = getSaved(accountId);
      const state = JSON.parse(saved.snapshot) as GameState;
      const migrated = migrateGame(state);
      let result;
      try { result = train(state, body.routeId); }
      catch (error) { throw new ApiError(400, error instanceof Error ? error.message : 'Испытание недоступно.', 'TRAINING_REJECTED'); }
      if (migrated) store.saveGame(saved, state, now);
      return result;
    });
  });

  app.get('/api/social', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    const query = parse(z.strictObject({ q: z.string().trim().max(60).optional() }), request.query);
    rateLimit(`social-read:${accountId}`, 60, now);
    return social.view(accountId, now, query.q ?? '');
  });

  app.post('/api/social/command', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    rateLimit(`social-command:${accountId}`, 40, now);
    const body = parse(z.strictObject({
      id: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
      command: z.unknown(),
    }), request.body);
    return social.command(accountId, body.command, body.id, now);
  });

  app.post('/api/social/practice', async (request) => {
    const now = clock();
    const accountId = getAccount(request, now);
    rateLimit(`social-practice:${accountId}`, 6, now);
    const body = parse(z.strictObject({ role: z.unknown(), loadout: z.unknown() }), request.body);
    return social.practice(accountId, body.role, body.loadout, now);
  });

  const dist = resolve(projectRoot, 'dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.register(staticFiles, { root: dist, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET') return reply.code(404).send({ error: 'Маршрут не найден.', code: 'NOT_FOUND' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Маршрут не найден.', code: 'NOT_FOUND' }));
  }
  return app;
}
