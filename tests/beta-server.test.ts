import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp, type AppOptions } from '../server/app';
import { GameStore } from '../server/store';
import { moderate } from '../server/moderation';
import { applyCommand, createGame } from '../shared/engine';
import type { GameView } from '../shared/types';

const epoch = Date.UTC(2026, 8, 9);
const token = 'fixture-bot-token';
const apps: FastifyInstance[] = [];
const dirs: string[] = [];
function instance(options: AppOptions = {}) {
  const app = createApp({ databasePath: ':memory:', now: () => epoch, logLevel: 'silent', ...options });
  apps.push(app);
  return app;
}
function signed(id: number) {
  const fields = new URLSearchParams({ auth_date: String(epoch / 1000), user: JSON.stringify({ id }) });
  const check = [...fields].sort(([a], [b]) => a.localeCompare(b)).map(([a, b]) => `${a}=${b}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  fields.set('hash', createHmac('sha256', key).update(check).digest('hex'));
  return fields.toString();
}
const telegram = { mode: 'telegram', botToken: token, appOrigin: 'https://game.example.com' } as const;
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Telegram beta deployment', () => {
  it('requires an explicit HTTPS origin and validates access configuration before opening the database', () => {
    for (const appOrigin of ['', 'http://game.example.com', 'https://user:secret@game.example.com', 'https://game.example.com/path', 'https://game.example.com?token=x', 'https://game.example.com/#x']) {
      expect(() => createApp({ ...telegram, databasePath: ':memory:', appOrigin })).toThrow('APP_ORIGIN');
    }
    for (const betaTelegramIds of ['0', '-1', '1,,2', 'abc', '9007199254740992', '001']) {
      expect(() => createApp({ ...telegram, databasePath: ':memory:', betaTelegramIds })).toThrow('BETA_TELEGRAM_IDS');
    }
    expect(() => createApp({ ...telegram, databasePath: ':memory:', blockedTelegramIds: '1,wrong' })).toThrow('BLOCKED_TELEGRAM_IDS');
    expect(() => createApp({ ...telegram, databasePath: ':memory:', betaAccess: 'unknown' as 'open' })).toThrow('BETA_ACCESS');
  });

  it('allows every verified Telegram account in open beta but never anonymous browser accounts', async () => {
    const app = instance({ ...telegram, betaAccess: 'open' });
    const denied = await app.inject({ method: 'POST', url: '/api/auth', payload: {} });
    expect(denied.statusCode).toBe(401);
    for (const id of [4_000_000_001, 4_000_000_002]) {
      const login = await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(id) } });
      expect(login.statusCode, login.body).toBe(200);
      expect(login.json<GameView>().state.id).toBe(`telegram:${id}`);
      expect(login.headers['strict-transport-security']).toContain('max-age');
      expect(login.headers['cache-control']).toBe('no-store');
    }
  });

  it('defaults to no invitations and permits only configured IDs in allowlist mode', async () => {
    const empty = instance({ ...telegram, betaTelegramIds: '' });
    const rejected = await empty.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(42) } });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().code).toBe('BETA_ACCESS_REQUIRED');
    expect(rejected.headers['set-cookie']).toBeUndefined();
    const app = instance({ ...telegram, betaAccess: 'allowlist', betaTelegramIds: '42, 4000000001' });
    expect((await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(42) } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(43) } })).statusCode).toBe(403);
  });

  it('operator blocks apply to existing sessions and all game/social endpoints without restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'shov-beta-'));
    dirs.push(dir);
    const databasePath = join(dir, 'game.sqlite');
    const app = instance({ ...telegram, betaAccess: 'open', databasePath });
    const login = await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(42) } });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0];
    const db = new GameStore(databasePath);
    try {
      moderate(db, 'block', 'telegram:42', 'test moderation', epoch);
      for (const url of ['/api/state', '/api/social', '/api/command', '/api/social/command', '/api/train', '/api/social/practice']) {
        const method = ['/api/state', '/api/social'].includes(url) ? 'GET' : 'POST';
        const response = await app.inject({ method, url, headers: { cookie }, ...(method === 'POST' ? { payload: {} } : {}) });
        expect(response.statusCode, url).toBe(403);
        expect(response.json().code).toBe('ACCOUNT_BLOCKED');
      }
      expect((await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(42) } })).statusCode).toBe(403);
      moderate(db, 'unblock', 'telegram:42', 'appeal accepted', epoch + 1);
      expect((await app.inject({ url: '/api/state', headers: { cookie } })).statusCode).toBe(200);
      expect(db.database.prepare('SELECT COUNT(*) AS n FROM moderation_actions').get()).toEqual({ n: 2 });
    } finally { db.close(); }
  });

  it('environment deny list overrides open access', async () => {
    const app = instance({ ...telegram, betaAccess: 'open', blockedTelegramIds: '42' });
    const response = await app.inject({ method: 'POST', url: '/api/auth', payload: { initData: signed(42) } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('ACCOUNT_BLOCKED');
  });

  it('health/readiness disclose no secrets and missing assets return 404', async () => {
    const app = instance({ ...telegram, betaAccess: 'open' });
    const health = await app.inject('/api/health');
    expect(health.json()).toEqual({ ok: true, mode: 'telegram', version: '0.5.0' });
    expect(health.body).not.toContain(token);
    expect((await app.inject('/api/ready')).json()).toEqual({ ok: true });
    for (const path of ['/art/missing-beta-fixture.png', '/audio/missing-beta-fixture.ogg', '/audio/missing-beta-fixture.m4a']) {
      const missing = await app.inject(path);
      expect(missing.statusCode).toBe(404);
      expect(missing.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('immediate route mode', () => {
  it('preserves battle, queued destination and resources while changing the next travel decision', () => {
    const state = createGame('local:mode', epoch, 42);
    const battle = structuredClone(state.battle);
    const wallet = structuredClone(state.wallet);
    state.pendingRoute = { routeId: 'grove', mode: 'farm' };
    applyCommand(state, { type: 'mode', mode: 'push' }, epoch);
    expect(state.mode).toBe('push');
    expect(state.pendingRoute).toEqual({ routeId: 'grove', mode: 'push' });
    expect(state.routeId).toBe('sunny');
    expect(state.battle).toEqual(battle);
    expect(state.wallet).toEqual(wallet);
  });

  it('persists mode through the API and rejects malformed modes without altering it', async () => {
    const app = instance();
    const login = await app.inject({ method: 'POST', url: '/api/auth', payload: {} });
    const cookie = (login.headers['set-cookie'] as string).split(';')[0];
    const initial = login.json<GameView>();
    const payload = { id: randomUUID(), revision: initial.revision, command: { type: 'mode', mode: 'push' } };
    const changed = await app.inject({ method: 'POST', url: '/api/command', headers: { cookie }, payload });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<GameView>().state.mode).toBe('push');
    const repeated = await app.inject({ method: 'POST', url: '/api/command', headers: { cookie }, payload });
    expect(repeated.json<GameView>().state).toEqual(changed.json<GameView>().state);
    const invalid = await app.inject({ method: 'POST', url: '/api/command', headers: { cookie }, payload: { ...payload, id: randomUUID(), revision: changed.json<GameView>().revision, command: { type: 'mode', mode: 'skip' } } });
    expect(invalid.statusCode).toBe(400);
    const loaded = await app.inject({ url: '/api/state', headers: { cookie } });
    expect(loaded.json<GameView>().state.mode).toBe('push');
    expect(loaded.json<GameView>().state.battle).toEqual(initial.state.battle);
  });
});
