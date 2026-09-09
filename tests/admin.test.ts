import { createHash, randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createAdminApp, type AdminAppOptions } from '../server/admin';
import { GameStore } from '../server/store';
import { SocialService } from '../server/social';
import { createGame, settle, validateBuild } from '../shared/engine';
import { catalog, upgradeCap } from '../shared/content';
import type { AdminMutation, AdminOperation, AdminPlayerDetail } from '../shared/admin';
import type { GameState } from '../shared/types';

const epoch = Date.UTC(2026, 8, 9);
const origin = 'https://admin.example.com';
const password = 'test-admin-password';
const salt = 'be'.repeat(16);
const passwordHash = `scrypt$${salt}$${scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex')}`;
const dirs: string[] = [];
const apps: FastifyInstance[] = [];
const stores: GameStore[] = [];
function instance(options: Partial<AdminAppOptions> = {}) {
  const app = createAdminApp({ databasePath: ':memory:', origin, passwordHash, now: () => epoch, ...options });
  apps.push(app);
  return app;
}
function directory() { const dir = mkdtempSync(join(tmpdir(), 'shov-admin-')); dirs.push(dir); return dir; }
async function login(app: FastifyInstance, headers = { origin }) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/login', headers, payload: { password } });
  expect(response.statusCode, response.body).toBe(200);
  return (response.headers['set-cookie'] as string).split(';')[0];
}
async function fixture(change?: (state: GameState) => void) {
  const databasePath = join(directory(), 'game.sqlite');
  const store = new GameStore(databasePath); stores.push(store);
  const state = createGame('telegram:42', epoch, 42);
  change?.(state);
  store.createGame(state, epoch);
  let time = epoch;
  const app = instance({ databasePath, now: () => time });
  const cookie = await login(app);
  const headers = { origin, cookie };
  const detail = () => app.inject({ url: '/api/admin/players/telegram:42', headers });
  const edit = (operations: AdminOperation[], revision = store.getGame(state.id)!.revision, requestId = randomUUID()) =>
    app.inject({ method: 'POST', url: '/api/admin/players/telegram:42', headers, payload: { operations, revision, requestId, reason: 'Тестовое изменение' } satisfies AdminMutation });
  return { app, store, state, databasePath, cookie, headers, detail, edit, clock: (value: number) => { time = value; }, relogin: async () => { headers.cookie = await login(app); } };
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('admin authentication boundary', () => {
  it('validates configuration before opening a database', () => {
    for (const value of ['http://admin.example.com', 'https://admin.example.com/path', 'https://admin.example.com?x=1', 'https://user:pass@admin.example.com']) {
      expect(() => instance({ origin: value })).toThrow('origin');
    }
    expect(() => instance({ origin, secureCookies: false })).toThrow('loopback');
    for (const value of ['plaintext', `scrypt$${salt}$ff`, `scrypt$${salt}a$${'ab'.repeat(64)}`]) expect(() => instance({ passwordHash: value })).toThrow('passwordHash');
    for (const value of ['true', '127.0.0.1/33', '::1/129', '127.0.0.1/no']) expect(() => instance({ trustedProxy: value })).toThrow('trustedProxy');
  });

  it('requires exact origin on login/logout and never accepts game sessions', async () => {
    const { app, store, headers } = await fixture();
    for (const requestHeaders of [{}, { origin: 'https://game.example.com' }, { origin, 'sec-fetch-site': 'cross-site' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/admin/login', headers: requestHeaders, payload: { password } });
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const token = 'fa'.repeat(32);
    store.createSession(createHash('sha256').update(token).digest('hex'), 'telegram:42', epoch + 86_400_000, epoch);
    for (const cookie of [`shov_session=${token}`, `__Host-shov_admin=${token}`]) {
      expect((await app.inject({ url: '/api/admin/session', headers: { cookie } })).json()).toEqual({ authenticated: false });
      expect((await app.inject({ url: '/api/admin/catalog', headers: { cookie } })).statusCode).toBe(401);
    }
    const forbidden = await app.inject({ method: 'POST', url: '/api/admin/logout', headers: { cookie: headers.cookie }, payload: {} });
    expect(forbidden.statusCode).toBe(403);
    expect((await app.inject({ url: '/api/admin/session', headers })).json().authenticated).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/admin/logout', headers, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/admin/overview', headers })).statusCode).toBe(401);
  });

  it('sets an isolated host cookie, expires after eight hours and invalidates on password rotation', async () => {
    const { app, databasePath, headers, clock, store } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/api/admin/login', headers, payload: { password } });
    const rawCookie = response.headers['set-cookie'] as string;
    expect(rawCookie).toMatch(/^__Host-shov_admin=[a-f0-9]{64};/);
    for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) expect(rawCookie).toContain(flag);
    expect(rawCookie).not.toContain('Domain=');
    expect(rawCookie).not.toContain(password);
    expect((await app.inject({ url: '/api/admin/overview', headers })).statusCode).toBe(401);
    const active = { cookie: rawCookie.split(';')[0] };
    const row = store.database.prepare('SELECT token_hash FROM admin_sessions').get() as { token_hash: string };
    expect(rawCookie).not.toContain(row.token_hash);
    const rotated = instance({ databasePath, passwordHash: `scrypt$${salt}$${scryptSync('new-password', Buffer.from(salt, 'hex'), 64).toString('hex')}` });
    expect((await rotated.inject({ url: '/api/admin/session', headers: active })).json()).toEqual({ authenticated: false });
    clock(epoch + 8 * 3_600_000);
    expect((await app.inject({ url: '/api/admin/session', headers: active })).json()).toEqual({ authenticated: false });
    const local = instance({ origin: 'http://127.0.0.1:3002', secureCookies: false });
    expect(await login(local, { origin: 'http://127.0.0.1:3002' })).toMatch(/^shov_admin_local=/);
  });

  it('rate limits login attempts before deriving more passwords', async () => {
    const app = instance();
    for (let index = 0; index < 8; index++) expect((await app.inject({ method: 'POST', url: '/api/admin/login', headers: { origin }, payload: { password: 'wrong' } })).statusCode).toBe(401);
    const limited = await app.inject({ method: 'POST', url: '/api/admin/login', headers: { origin }, payload: { password } });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

describe('admin read models', () => {
  it('previews elapsed production without persisting, renewing or exposing RNG', async () => {
    const { store, detail, clock, state, relogin } = await fixture();
    clock(epoch + 72 * 3_600_000);
    await relogin();
    const before = store.database.prepare('SELECT * FROM accounts').get();
    const response = await detail();
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json<AdminPlayerDetail>();
    expect(view.state.totals.wins).toBeGreaterThan(state.totals.wins);
    expect(view.state.autonomyUntil).toBe(state.autonomyUntil);
    expect(view.state).not.toHaveProperty('rng');
    expect(view.state).not.toHaveProperty('nextItemId');
    expect(store.database.prepare('SELECT * FROM accounts').get()).toEqual(before);
    expect(store.database.prepare('SELECT COUNT(*) n FROM social_profiles').get()).toEqual({ n: 0 });
    expect(view.publicName).toBeNull();
  });

  it('searches both Russian names and reports only stored activity/wealth', async () => {
    const { app, store, headers, state, clock } = await fixture();
    const other = createGame('local:other', epoch - 8 * 86_400_000, 12);
    other.name = 'Яркий Герой'; other.level = 25; other.wallet.coins = 20_000;
    store.createGame(other, other.createdAt);
    store.database.prepare('INSERT INTO social_profiles(account_id, public_id, name) VALUES (?, ?, ?)').run(state.id, randomUUID(), 'Хранитель Шва');
    clock(epoch + 3_600_000);
    for (const [query, account] of [['хРаНиТеЛь', state.id], ['яРкИй', other.id], ['LOCAL:', other.id]]) {
      const page = await app.inject({ url: `/api/admin/players?q=${encodeURIComponent(query)}`, headers });
      expect(page.statusCode, page.body).toBe(200);
      expect(page.json().items.map((value: { id: string }) => value.id)).toEqual([account]);
    }
    expect((await app.inject({ url: '/api/admin/players?pageSize=1&page=2', headers })).json()).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect((await app.inject({ url: '/api/admin/players?pageSize=101', headers })).statusCode).toBe(400);
    const overview = (await app.inject({ url: '/api/admin/overview', headers })).json();
    expect(overview).toMatchObject({ totalPlayers: 2, updated24h: 1, updated7d: 1, totalClans: null, wins: 0, losses: 0, wealth: { coins: state.wallet.coins + other.wallet.coins } });
    new SocialService(store);
    expect((await app.inject({ url: '/api/admin/overview', headers })).json().totalClans).toBe(0);
    expect((await app.inject({ url: '/api/admin/players/missing', headers })).statusCode).toBe(404);
  });

  it('serves only admin entry and permitted assets with framing/cache protection', async () => {
    const staticRoot = directory();
    mkdirSync(join(staticRoot, 'assets')); mkdirSync(join(staticRoot, 'art'));
    writeFileSync(join(staticRoot, 'admin.html'), '<!doctype html><title>Admin fixture</title>');
    writeFileSync(join(staticRoot, 'index.html'), 'GAME-ONLY');
    writeFileSync(join(staticRoot, 'assets', 'admin.js'), 'window.fixture = true;');
    writeFileSync(join(staticRoot, 'art', 'icon.png'), 'png fixture');
    const app = instance({ staticRoot });
    for (const url of ['/', '/assets/admin.js', '/art/icon.png']) {
      const response = await app.inject(url);
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
    for (const url of ['/index.html', '/some-game-route', '/api/state', '/assets/missing.js', '/assets/%2e%2e/index.html', '/art/%2e%2e/index.html']) {
      const response = await app.inject(url);
      expect(response.statusCode, `${url}: ${response.body}`).toBe(404);
      expect(response.body).not.toContain('GAME-ONLY');
    }
  });
});

describe('admin transactional edits', () => {
  it('preserves battles, planned builds/routes and autonomy for noncombat edits', async () => {
    const { edit, state, store, clock } = await fixture(state => {
      state.pendingBuild = structuredClone(state.presets[1]);
      state.pendingRoute = { routeId: 'sunny', mode: 'farm' };
    });
    clock(epoch + 1);
    const response = await edit([{ type: 'profile', name: 'Новое имя', publicName: '  ＡБ  ' }, { type: 'wallet', values: { coins: 500 } }, { type: 'target', slot: 'ring' }, { type: 'mode', mode: 'push' }, { type: 'block', blocked: true }]);
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json<AdminPlayerDetail>();
    expect(view.state.battle).toEqual(state.battle);
    expect(view.state.pendingBuild).toEqual(state.pendingBuild);
    expect(view.state.pendingRoute).toEqual({ routeId: 'sunny', mode: 'push' });
    expect(view.state.autonomyUntil).toBe(state.autonomyUntil);
    expect(view.publicName).toBe('AБ');
    expect(view.state.name).toBe('Новое имя');
    expect(view.blocked).toBe(true);
    expect(store.isBlocked(state.id)).toBe(true);
    expect(view.audit[0]).toMatchObject({ beforePublicName: null, afterPublicName: 'AБ', effects: { appliedAt: epoch + 1, battleRestarted: false, clearedPendingBuild: false, clearedPendingRoute: false } });
    const publicId = store.database.prepare('SELECT public_id FROM social_profiles').get();
    expect((await edit([{ type: 'profile', publicName: 'Другой ник' }, { type: 'block', blocked: false }])).statusCode).toBe(200);
    expect(store.database.prepare('SELECT public_id FROM social_profiles').get()).toEqual(publicId);
    expect(store.isBlocked(state.id)).toBe(false);
  });

  it('settles old combat before upgrading and audits stored, settled and edited snapshots', async () => {
    const { state, edit, store, clock } = await fixture();
    const time = state.battle.endsAt + 1000;
    const expected = structuredClone(state); settle(expected, time);
    clock(time);
    const response = await edit([{ type: 'profile', level: 30 }, { type: 'upgrades', values: { weapon: upgradeCap(30) } }]);
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json<AdminPlayerDetail>();
    expect(view.state.wallet).toEqual(expected.wallet);
    expect(view.state.totals).toEqual(expected.totals);
    expect(view.state.level).toBe(30);
    expect(view.state.battle.startedAt).toBe(time);
    expect(view.state.battle.stats.power).toBeGreaterThan(expected.battle.stats.power);
    expect(view.state.autonomyUntil).toBe(state.autonomyUntil);
    const audit = store.database.prepare('SELECT before_snapshot, settled_snapshot, after_snapshot, before_revision, after_revision FROM admin_audit').get() as Record<string, string | number>;
    expect(JSON.parse(String(audit.before_snapshot))).toEqual(state);
    expect(JSON.parse(String(audit.settled_snapshot))).toEqual(expected);
    expect(JSON.parse(String(audit.after_snapshot)).level).toBe(30);
    expect(audit.after_revision).toBe(2);
    expect(view.audit[0].effects.battleRestarted).toBe(true);
  });

  it('does not backdate upgraded combat or renew 48 hours for expired players', async () => {
    const { edit, state, clock, relogin } = await fixture();
    const time = epoch + 72 * 3_600_000;
    const expected = structuredClone(state); settle(expected, time);
    clock(time);
    await relogin();
    const response = await edit([{ type: 'profile', level: 50 }]);
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json<AdminPlayerDetail>();
    expect(view.state.totals).toEqual(expected.totals);
    expect(view.state.battle.startedAt).toBe(time);
    expect(view.state.autonomyUntil).toBe(time);
    expect(view.state.lastSimulatedAt).toBe(time);
  });

  it('requires current revision and handles exact retries without double audit or edits', async () => {
    const { app, edit, detail, headers, store } = await fixture();
    const operations: AdminOperation[] = [{ type: 'wallet', values: { coins: 900 } }];
    const requestId = randomUUID();
    const initial = await edit(operations, 1, requestId);
    expect(initial.statusCode, initial.body).toBe(200);
    const repeat = await edit(operations, 1, requestId);
    expect(repeat.json()).toEqual(initial.json());
    const conflict = await edit(operations, 1);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'REVISION_CONFLICT', revision: 2 });
    expect((await edit([{ type: 'wallet', values: { coins: 901 } }], 1, requestId)).json().code).toBe('IDEMPOTENCY_CONFLICT');
    expect(store.database.prepare('SELECT COUNT(*) n FROM admin_audit').get()).toEqual({ n: 1 });
    const audit = await app.inject({ url: '/api/admin/audit?accountId=telegram:42', headers });
    expect(audit.json().total).toBe(1);
    expect(audit.body).not.toContain('token_hash');
    expect((await detail()).json().revision).toBe(2);
  });

  it('rolls back all changes when any operation or final reference is invalid', async () => {
    const { edit, state, store } = await fixture();
    const before = store.getGame(state.id);
    const operations: AdminOperation[] = [{ type: 'wallet', values: { coins: 999 } }, { type: 'profile', publicName: 'Новый ник' }, { type: 'block', blocked: true }, { type: 'item_delete', itemId: state.build.equipment.armor }];
    const response = await edit(operations);
    expect(response.statusCode, response.body).toBe(400);
    expect(store.getGame(state.id)).toEqual(before);
    expect(store.isBlocked(state.id)).toBe(false);
    expect(store.database.prepare('SELECT COUNT(*) n FROM social_profiles').get()).toEqual({ n: 0 });
    expect(store.database.prepare('SELECT COUNT(*) n FROM admin_audit').get()).toEqual({ n: 0 });
  });

  it('generates item IDs and validates equipment, named affixes and level invariants', async () => {
    const { edit, state, store } = await fixture();
    const weapon = { name: 'Именная игла', slot: 'weapon', level: 20, family: 'needle', rarity: 'named', affixes: ['dot', 'haste'], special: 'long_thread' } as const;
    const response = await edit([{ type: 'item_add', item: { ...weapon, affixes: [...weapon.affixes] } }]);
    expect(response.statusCode, response.body).toBe(200);
    const added = response.json<AdminPlayerDetail>().state.inventory.at(-1)!;
    expect(added.id).toMatch(/^admin-/);
    expect(response.json<AdminPlayerDetail>().state.battle).toEqual(state.battle);
    const equipped = await edit([{ type: 'equip', itemId: added.id }]);
    expect(equipped.statusCode, equipped.body).toBe(200);
    const changed = JSON.parse(store.getGame(state.id)!.snapshot) as GameState;
    expect(changed.build.equipment.weapon).toBe(added.id);
    expect(() => validateBuild(changed, changed.build)).not.toThrow();
    for (const operations of [
      [{ type: 'item_add', item: { ...weapon, affixes: ['dot', 'dot'] } }],
      [{ type: 'item_add', item: { ...weapon, family: 'glass', affixes: ['dot', 'haste'] } }],
      [{ type: 'item_add', item: { ...weapon, slot: 'armor', affixes: ['hp', 'armor'] } }],
      [{ type: 'upgrades', values: { weapon: 12 } }],
      [{ type: 'profile', xp: 1_000_000 }],
      [{ type: 'route', routeId: catalog.routes.at(-1)!.id, mode: 'farm' }],
    ] as AdminOperation[][]) {
      const invalid = await edit(operations);
      expect(invalid.statusCode, invalid.body).toBe(400);
    }
    expect(JSON.parse(store.getGame(state.id)!.snapshot)).toEqual(changed);
  });

  it('clears only invalid queued references and enforces strict nested payloads', async () => {
    const { app, edit, headers, store, state } = await fixture(state => {
      const extra = { ...structuredClone(state.inventory.find(value => value.slot === 'armor')!), id: 'queued-armor' };
      state.inventory.push(extra);
      state.pendingBuild = structuredClone(state.build);
      state.pendingBuild.equipment.armor = extra.id;
    });
    const removed = await edit([{ type: 'item_delete', itemId: 'queued-armor' }]);
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json<AdminPlayerDetail>().state.pendingBuild).toBeNull();
    expect(removed.json<AdminPlayerDetail>().audit[0].effects).toMatchObject({ battleRestarted: false, clearedPendingBuild: true });
    const before = store.getGame(state.id);
    const invalidOperations = [
      [{ type: 'profile', rng: 1 }], [{ type: 'profile', publicName: 'X\u200BY' }],
      [{ type: 'wallet', values: { coins: -1 } }], [{ type: 'wallet', values: { coins: 1, gold: 4 } }],
      [{ type: 'item_add', item: { ...state.inventory[0], id: 'injected' } }],
      [{ type: 'build', build: { ...state.build, equipment: { ...state.build.equipment, boots: 'missing' } } }],
    ];
    for (const operations of invalidOperations) {
      const response = await app.inject({ method: 'POST', url: '/api/admin/players/telegram:42', headers, payload: { requestId: randomUUID(), revision: before!.revision, reason: 'Invalid fixture', operations } });
      expect(response.statusCode, response.body).toBe(400);
    }
    expect(store.getGame(state.id)).toEqual(before);
  });
});
