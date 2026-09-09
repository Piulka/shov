import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppOptions } from '../server/app.ts';
import { sessionDigest } from '../server/auth.ts';
import { GameStore } from '../server/store.ts';
import { createGame } from '../shared/engine.ts';
import type { GameCommand, GameState, GameView } from '../shared/types.ts';

const epoch = Date.UTC(2026, 8, 8, 18, 0, 0);
const apps = new Set<FastifyInstance>();
const tempDirs: string[] = [];

function app(options: AppOptions = {}): FastifyInstance {
  const instance = createApp({ databasePath: ':memory:', now: () => epoch, appOrigin: 'https://game.example.com', betaAccess: 'open', logLevel: 'silent', ...options });
  apps.add(instance);
  return instance;
}

async function auth(instance: FastifyInstance, initData?: string): Promise<{ cookie: string; view: GameView }> {
  const response = await instance.inject({ method: 'POST', url: '/api/auth', payload: initData ? { initData } : {} });
  expect(response.statusCode, response.body).toBe(200);
  const setCookie = response.headers['set-cookie'];
  expect(typeof setCookie).toBe('string');
  return { cookie: (setCookie as string).split(';')[0], view: response.json<GameView>() };
}

function send(instance: FastifyInstance, cookie: string, view: GameView, command: GameCommand, id = randomUUID()) {
  return instance.inject({ method: 'POST', url: '/api/command', headers: { cookie }, payload: { id, revision: view.revision, command } });
}

async function firstWin(instance: FastifyInstance, login: { cookie: string; view: GameView }, setClock: (now: number) => void): Promise<GameView> {
  let current = login.view;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    setClock(current.state.battle.endsAt);
    const response = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(response.statusCode, response.body).toBe(200);
    current = response.json<GameView>();
    if (current.state.totals.wins > 0) return current;
  }
  throw new Error('A fresh account must win on its initial route.');
}

function legacySave(replayedCommand?: { id: string; command: GameCommand }) {
  const directory = mkdtempSync(join(tmpdir(), 'shov-migration-'));
  tempDirs.push(directory);
  const databasePath = join(directory, 'game.sqlite');
  const { chapter: _chapter, progression: _progression, ...base } = createGame(`local:${randomUUID()}`, epoch, 42);
  const state = {
    ...base, schemaVersion: 1, level: 10, xp: 137,
    wallet: { coins: 1600, thread: 32, catalyst: 3 },
    inventory: base.inventory.map(item => ({ ...item, rarity: 'fine', level: 8, affixes: ['hp'] })),
    upgrades: { ...base.upgrades, weapon: 2 },
    totals: { ...base.totals, wins: 40, coins: 930, items: 23 },
    routeWins: { sunny: 40 },
  };
  const token = randomBytes(32).toString('hex');
  const store = new GameStore(databasePath);
  try {
    store.transaction(() => {
      store.createGame(state as unknown as GameState, epoch);
      store.createSession(sessionDigest(token), state.id, epoch + 7 * 24 * 60 * 60 * 1000, epoch);
      if (replayedCommand) store.recordCommand(state.id, replayedCommand.id, createHash('sha256').update(JSON.stringify(replayedCommand.command)).digest('hex'), epoch);
    });
  } finally { store.close(); }
  return { databasePath, state, cookie: `shov_session=${token}` };
}

function persisted(databasePath: string, accountId: string) {
  const store = new GameStore(databasePath);
  try {
    const saved = store.getGame(accountId)!;
    return { revision: saved.revision, state: JSON.parse(saved.snapshot) as GameState };
  } finally { store.close(); }
}

function signedInitData(token: string, seconds = epoch / 1000, id = 4_000_000_001): string {
  const fields: Record<string, string> = {
    auth_date: String(seconds), query_id: 'independent-test-fixture',
    user: JSON.stringify({ id, first_name: 'Test', language_code: 'ru' }),
  };
  const check = Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(token).digest();
  fields.hash = createHmac('sha256', key).update(check).digest('hex');
  return new URLSearchParams(fields).toString();
}

afterEach(async () => {
  for (const instance of apps) await instance.close();
  apps.clear();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('persistent game API', () => {
  it('starts at level one and funds the first upgrade and craft through earned chapter rewards', async () => {
    let now = epoch;
    const instance = app({ now: () => now });
    const login = await auth(instance);
    expect(login.view.state.schemaVersion).toBe(2);
    expect(login.view.state.level).toBe(1);
    expect(login.view.state.wallet).toEqual({ coins: 0, thread: 0, catalyst: 0 });
    expect(login.view.state.chapter).toEqual({ completed: [], legacy: false });
    expect(login.view.state.inventory.every(item => item.rarity === 'common' && item.level === 1)).toBe(true);
    expect(new Set(login.view.state.inventory.filter(item => item.slot === 'weapon').map(item => item.family))).toEqual(new Set(['blade', 'glass', 'needle']));

    const rejected = await send(instance, login.cookie, login.view, { type: 'upgrade', slot: 'weapon' });
    expect(rejected.statusCode).toBe(400);
    const funded = await firstWin(instance, login, value => { now = value; });
    expect(funded.state.chapter.completed).toEqual(['first_win']);
    expect(funded.state.wallet.coins).toBeGreaterThanOrEqual(200);
    expect(funded.state.wallet.thread).toBeGreaterThanOrEqual(4);

    const upgrade = await send(instance, login.cookie, funded, { type: 'upgrade', slot: 'weapon' });
    expect(upgrade.statusCode, upgrade.body).toBe(200);
    const upgraded = upgrade.json<GameView>();
    expect(upgraded.state.chapter.completed).toEqual(['first_win', 'upgrade']);
    expect(upgraded.state.wallet.coins).toBe(funded.state.wallet.coins - 200 + 600);
    expect(upgraded.state.wallet.thread).toBe(funded.state.wallet.thread - 4 + 12);

    const craft = await send(instance, login.cookie, upgraded, { type: 'craft', slot: 'boots', affix: 'hp' });
    expect(craft.statusCode, craft.body).toBe(200);
    const crafted = craft.json<GameView>();
    expect(crafted.state.chapter.completed).toEqual(['first_win', 'upgrade', 'craft']);
    expect(crafted.state.wallet.coins).toBe(upgraded.state.wallet.coins - 600 + 150);
    expect(crafted.state.wallet.thread).toBe(upgraded.state.wallet.thread - 12 + 3);
    expect(crafted.state.inventory.at(-1)).toMatchObject({ slot: 'boots', rarity: 'fine' });
  });

  it('awards each action task once across repeated and distinct command IDs', async () => {
    const instance = app();
    const login = await auth(instance);
    const id = randomUUID();
    const command: GameCommand = { type: 'target', slot: 'head' };
    const first = await send(instance, login.cookie, login.view, command, id);
    expect(first.statusCode).toBe(200);
    let current = first.json<GameView>();
    expect(current.state.chapter.completed).toEqual(['target']);
    expect(current.state.wallet).toEqual({ coins: 50, thread: 2, catalyst: 0 });
    const repeated = await send(instance, login.cookie, login.view, command, id);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json<GameView>().state).toEqual(current.state);
    expect(repeated.json<GameView>().revision).toBe(current.revision);
    for (const slot of ['head', 'boots', null, 'ring'] as const) {
      const changed = await send(instance, login.cookie, current, { type: 'target', slot });
      expect(changed.statusCode).toBe(200);
      current = changed.json<GameView>();
      expect(current.state.chapter.completed).toEqual(['target']);
      expect(current.state.wallet).toEqual({ coins: 50, thread: 2, catalyst: 0 });
    }
  });

  it('rolls back settled rewards and chapter receipts when the command is rejected', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'shov-rollback-'));
    tempDirs.push(directory);
    const databasePath = join(directory, 'game.sqlite');
    let now = epoch;
    const instance = app({ databasePath, now: () => now });
    const login = await auth(instance);
    const original = persisted(databasePath, login.view.state.id);
    now = login.view.state.battle.endsAt;
    const id = randomUUID();
    const rejected = await send(instance, login.cookie, login.view, { type: 'equip', itemId: 'unowned_item' }, id);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().code).toBe('COMMAND_REJECTED');
    expect(persisted(databasePath, login.view.state.id)).toEqual(original);

    const accepted = await send(instance, login.cookie, login.view, { type: 'target', slot: 'head' }, id);
    expect(accepted.statusCode, accepted.body).toBe(200);
    const current = accepted.json<GameView>();
    expect(current.state.totals.wins).toBe(1);
    expect(current.state.chapter.completed).toEqual(['first_win', 'target']);
    expect(current.state.wallet.coins).toBeGreaterThanOrEqual(250);
    const replay = await send(instance, login.cookie, login.view, { type: 'target', slot: 'head' }, id);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<GameView>().state).toEqual(current.state);
  });

  it('requires a server session and keeps local browser accounts isolated', async () => {
    const instance = app();
    expect((await instance.inject('/api/state')).statusCode).toBe(401);
    const first = await auth(instance);
    const second = await auth(instance);
    expect(first.view.state.id).not.toBe(second.view.state.id);
    const changed = await send(instance, first.cookie, first.view, { type: 'target', slot: 'boots' });
    expect(changed.statusCode).toBe(200);
    const other = await instance.inject({ url: '/api/state', headers: { cookie: second.cookie } });
    expect(other.json<GameView>().state.targetSlot).toBe(second.view.state.targetSlot);
    expect(other.json<GameView>().state.wallet).toEqual(second.view.state.wallet);
    expect(first.view.state).not.toHaveProperty('rng');
    expect(first.view.state).not.toHaveProperty('nextItemId');
    expect(first.cookie).not.toContain(first.view.state.id);
  });

  it('persists account state and opaque sessions across server restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'shov-api-'));
    tempDirs.push(directory);
    const databasePath = join(directory, 'game.sqlite');
    const first = app({ databasePath });
    const login = await auth(first);
    const changed = await send(first, login.cookie, login.view, { type: 'target', slot: 'amulet' });
    expect(changed.statusCode).toBe(200);
    await first.close();
    apps.delete(first);
    const restarted = app({ databasePath });
    const response = await restarted.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json<GameView>().state.id).toBe(login.view.state.id);
    expect(response.json<GameView>().state.targetSlot).toBe('amulet');
    expect(response.json<GameView>().revision).toBe(changed.json<GameView>().revision);
  });

  it('replays a purchase idempotently and rejects reusing its ID for another command', async () => {
    let now = epoch;
    const instance = app({ now: () => now });
    const login = await auth(instance);
    const funded = await firstWin(instance, login, value => { now = value; });
    const id = randomUUID();
    const command: GameCommand = { type: 'upgrade', slot: 'weapon' };
    const bought = await send(instance, login.cookie, funded, command, id);
    expect(bought.statusCode, bought.body).toBe(200);
    const replay = await send(instance, login.cookie, login.view, command, id);
    expect(replay.statusCode).toBe(200);
    expect(replay.json<GameView>().state.wallet).toEqual(bought.json<GameView>().state.wallet);
    expect(replay.json<GameView>().state.upgrades.weapon).toBe(1);
    const collision = await send(instance, login.cookie, bought.json<GameView>(), { type: 'target', slot: 'head' }, id);
    expect(collision.statusCode).toBe(409);
    expect(collision.json().code).toBe('COMMAND_ID_CONFLICT');
  });

  it('rejects concurrent commands based on the same revision', async () => {
    const instance = app();
    const login = await auth(instance);
    const results = await Promise.all([
      send(instance, login.cookie, login.view, { type: 'target', slot: 'head' }),
      send(instance, login.cookie, login.view, { type: 'target', slot: 'boots' }),
    ]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
    const conflict = results.find(result => result.statusCode === 409)!;
    expect(conflict.json().code).toBe('REVISION_CONFLICT');
    expect(conflict.json().revision).toBeGreaterThan(login.view.revision);
  });

  it('rejects client currency, timestamps and excessive arrays without modifying progress', async () => {
    const instance = app();
    const login = await auth(instance);
    for (const command of [
      { type: 'upgrade', slot: 'weapon', coins: -500 },
      { type: 'grant', coins: 999_999 },
      { type: 'dismantle', itemIds: Array.from({ length: 101 }, () => 'item_1') },
      { type: 'route', routeId: login.view.state.routeId, mode: 'farm', now: epoch + 999_999_999 },
      { type: 'target', slot: 'head', chapter: { completed: ['first_win'] } },
      { type: 'target', slot: 'head', wallet: { coins: 999_999, thread: 999_999, catalyst: 999_999 } },
    ]) {
      const response = await instance.inject({ method: 'POST', url: '/api/command', headers: { cookie: login.cookie }, payload: { id: randomUUID(), revision: login.view.revision, command } });
      expect(response.statusCode).toBe(400);
    }
    for (const extra of [{ chapter: { completed: ['first_win'] } }, { progression: { lootElapsedMs: { sunny: 999_999_999 } } }, { wallet: { coins: 999_999 } }]) {
      const response = await instance.inject({ method: 'POST', url: '/api/command', headers: { cookie: login.cookie }, payload: { id: randomUUID(), revision: login.view.revision, command: { type: 'target', slot: 'head' }, ...extra } });
      expect(response.statusCode).toBe(400);
    }
    const response = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(response.json<GameView>().state).toEqual(login.view.state);
  });

  it('rolls back a rejected purchase and never spends below zero', async () => {
    let now = epoch;
    const instance = app({ now: () => now });
    const login = await auth(instance);
    let current = await firstWin(instance, login, value => { now = value; });
    let rejected = false;
    for (let count = 0; count < 20; count += 1) {
      const response = await send(instance, login.cookie, current, { type: 'upgrade', slot: 'weapon' });
      if (response.statusCode === 400) { rejected = true; break; }
      expect(response.statusCode).toBe(200);
      current = response.json<GameView>();
      expect(Object.values(current.state.wallet).every(value => value >= 0 && Number.isInteger(value))).toBe(true);
    }
    expect(rejected).toBe(true);
    const result = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(result.json<GameView>().state).toEqual(current.state);
    expect(result.json<GameView>().revision).toBe(current.revision);
  });

  it('caps offline rewards at 48 hours and resumes the current battle after rest', async () => {
    let now = epoch;
    const instance = app({ now: () => now });
    const login = await auth(instance);
    now += 6 * 24 * 60 * 60 * 1000;
    const response = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(response.statusCode, response.body).toBe(200);
    const returned = response.json<GameView>();
    expect(returned.report?.stopped).toBe(true);
    expect(returned.report?.to).toBe(epoch + 48 * 60 * 60 * 1000);
    expect(returned.state.lastSimulatedAt).toBe(now);
    expect(returned.state.autonomyUntil).toBe(now + 48 * 60 * 60 * 1000);
    expect(returned.state.battle.endsAt).toBeGreaterThan(now);
    expect(returned.revision).toBeGreaterThan(login.view.revision);
    const repeated = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(repeated.json<GameView>().state.wallet).toEqual(returned.state.wallet);
    expect(repeated.json<GameView>().revision).toBe(returned.revision);
    expect(repeated.json<GameView>().report?.wins).toBe(0);
  }, 30_000);

  it('runs training on a clone without currency, equipment or revision changes', async () => {
    const instance = app();
    const login = await auth(instance);
    const training = await instance.inject({ method: 'POST', url: '/api/train', headers: { cookie: login.cookie }, payload: { routeId: login.view.state.routeId } });
    expect(training.statusCode, training.body).toBe(200);
    expect(training.json().runs).toBe(12);
    const response = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie } });
    expect(response.json<GameView>().state).toEqual(login.view.state);
    expect(response.json<GameView>().revision).toBe(login.view.revision);
  });

  it('blocks foreign origins and remote access to local mode', async () => {
    const instance = app();
    const foreign = await instance.inject({ method: 'POST', url: '/api/auth', headers: { origin: 'https://example.com' }, payload: {} });
    expect(foreign.statusCode).toBe(403);
    const remote = await instance.inject({ method: 'POST', url: '/api/auth', remoteAddress: '203.0.113.42', payload: {} });
    expect(remote.statusCode).toBe(403);
    const local = await instance.inject({ method: 'POST', url: '/api/auth', headers: { origin: 'http://127.0.0.1:5173' }, payload: {} });
    expect(local.statusCode).toBe(200);
    expect((await instance.inject('/api/not-found')).statusCode).toBe(404);
  });
});

describe('save migration', () => {
  for (const endpoint of ['auth', 'state', 'command', 'replay', 'train'] as const) {
    it(`persists a legacy save migration through ${endpoint} without resetting owned progress`, async () => {
      const id = randomUUID();
      const command: GameCommand = { type: 'target', slot: 'head' };
      const fixture = legacySave(endpoint === 'replay' ? { id, command } : undefined);
      const instance = app({ databasePath: fixture.databasePath });
      const headers = { cookie: fixture.cookie };
      const response = await instance.inject(endpoint === 'state'
        ? { url: '/api/state', headers }
        : { method: 'POST', url: `/api/${endpoint === 'replay' ? 'command' : endpoint}`, headers,
          payload: endpoint === 'auth' ? {} : endpoint === 'train' ? { routeId: fixture.state.routeId } : { id, revision: 1, command } });
      expect(response.statusCode, response.body).toBe(200);
      const saved = persisted(fixture.databasePath, fixture.state.id);
      expect(saved.revision).toBe(2);
      expect(saved.state.schemaVersion).toBe(2);
      expect(saved.state.chapter.legacy).toBe(true);
      expect(saved.state.level).toBe(fixture.state.level);
      expect(saved.state.xp).toBe(fixture.state.xp);
      expect(saved.state.wallet).toEqual(fixture.state.wallet);
      expect(saved.state.inventory).toEqual(fixture.state.inventory);
      expect(saved.state.upgrades).toEqual(fixture.state.upgrades);
      expect(saved.state.totals).toEqual(fixture.state.totals);
      expect(saved.state.progression).toBeDefined();
      if (endpoint !== 'train') expect(response.json<GameView>().revision).toBe(saved.revision);

      await instance.close();
      apps.delete(instance);
      const restarted = app({ databasePath: fixture.databasePath });
      const restored = await restarted.inject({ url: '/api/state', headers });
      expect(restored.statusCode).toBe(200);
      expect(restored.json<GameView>().revision).toBe(saved.revision);
      expect(restored.json<GameView>().state.wallet).toEqual(fixture.state.wallet);
    });
  }

  it('rolls back migration with rejected commands and training', async () => {
    const fixture = legacySave();
    const instance = app({ databasePath: fixture.databasePath });
    const headers = { cookie: fixture.cookie };
    const original = persisted(fixture.databasePath, fixture.state.id);
    const rejected = await instance.inject({ method: 'POST', url: '/api/command', headers, payload: { id: randomUUID(), revision: 1, command: { type: 'equip', itemId: 'unowned_item' } } });
    expect(rejected.statusCode).toBe(400);
    expect(persisted(fixture.databasePath, fixture.state.id)).toEqual(original);
    const training = await instance.inject({ method: 'POST', url: '/api/train', headers, payload: { routeId: 'unknown_route' } });
    expect(training.statusCode).toBe(400);
    expect(persisted(fixture.databasePath, fixture.state.id)).toEqual(original);
  });

  it('serializes training migration with mutations and rejects a stale client revision', async () => {
    const fixture = legacySave();
    const instance = app({ databasePath: fixture.databasePath });
    const headers = { cookie: fixture.cookie };
    const training = await instance.inject({ method: 'POST', url: '/api/train', headers, payload: { routeId: fixture.state.routeId } });
    expect(training.statusCode).toBe(200);
    const command = { type: 'target', slot: 'head' };
    const stale = await instance.inject({ method: 'POST', url: '/api/command', headers, payload: { id: randomUUID(), revision: 1, command } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'REVISION_CONFLICT', revision: 2 });
    const current = persisted(fixture.databasePath, fixture.state.id);
    const accepted = await instance.inject({ method: 'POST', url: '/api/command', headers, payload: { id: randomUUID(), revision: current.revision, command } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<GameView>().state.wallet).toEqual(fixture.state.wallet);
    const repeated = await instance.inject({ method: 'POST', url: '/api/train', headers, payload: { routeId: fixture.state.routeId } });
    expect(repeated.statusCode).toBe(200);
    expect(persisted(fixture.databasePath, fixture.state.id).revision).toBe(accepted.json<GameView>().revision);
  });
});

describe('Telegram authorization', () => {
  const token = '123456:test-bot-token';

  it('requires a bot token and never falls back to a local account', async () => {
    expect(() => createApp({ databasePath: ':memory:', mode: 'telegram', botToken: '' })).toThrow('BOT_TOKEN');
    const instance = app({ mode: 'telegram', botToken: token });
    const response = await instance.inject({ method: 'POST', url: '/api/auth', payload: {} });
    expect(response.statusCode).toBe(401);
    expect((await instance.inject('/api/state')).statusCode).toBe(401);
  });

  it('validates HMAC and reuses the same Telegram account across sessions', async () => {
    const instance = app({ mode: 'telegram', botToken: token });
    const initData = signedInitData(token);
    const first = await auth(instance, initData);
    const changed = await send(instance, first.cookie, first.view, { type: 'target', slot: 'ring' });
    expect(changed.statusCode).toBe(200);
    const second = await auth(instance, initData);
    expect(second.view.state.id).toBe('telegram:4000000001');
    expect(second.view.state.targetSlot).toBe('ring');
    expect(second.cookie).not.toBe(first.cookie);
  });

  it('rejects tampered, expired, future and duplicate signed fields', async () => {
    const instance = app({ mode: 'telegram', botToken: token });
    const valid = signedInitData(token);
    const tampered = new URLSearchParams(valid);
    tampered.set('user', JSON.stringify({ id: 42, first_name: 'Other' }));
    for (const initData of [
      tampered.toString(), signedInitData(token, epoch / 1000 - 301),
      signedInitData(token, epoch / 1000 + 31), `${valid}&auth_date=${epoch / 1000}`,
      signedInitData('wrong-token'),
    ]) {
      const response = await instance.inject({ method: 'POST', url: '/api/auth', payload: { initData } });
      expect(response.statusCode).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('sets secure session cookies and enforces a configured application origin', async () => {
    const instance = app({ mode: 'telegram', botToken: token, appOrigin: 'https://game.example.com' });
    const response = await instance.inject({ method: 'POST', url: '/api/auth', headers: { origin: 'https://game.example.com' }, payload: { initData: signedInitData(token) } });
    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'] as string;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Partitioned');
    const foreign = await instance.inject({ method: 'POST', url: '/api/auth', headers: { origin: 'https://other.example.com' }, payload: { initData: signedInitData(token) } });
    expect(foreign.statusCode).toBe(403);
  });

  it('rejects foreign GET and HEAD state requests before awarding or extending progress', async () => {
    let now = epoch;
    const instance = app({ mode: 'telegram', botToken: token, appOrigin: 'https://game.example.com', now: () => now });
    const login = await auth(instance, signedInitData(token));
    now += 60 * 60 * 1000;
    for (const method of ['GET', 'HEAD'] as const) {
      const foreignOrigin = await instance.inject({ method, url: '/api/state?refresh=1', headers: { cookie: login.cookie, origin: 'https://other.example.com' } });
      expect(foreignOrigin.statusCode).toBe(403);
      const crossSite = await instance.inject({ method, url: '/api/state', headers: { cookie: login.cookie, 'sec-fetch-site': 'cross-site' } });
      expect(crossSite.statusCode).toBe(403);
    }
    // The original revision must still work: rejected reads cannot persist a settlement.
    const command = await send(instance, login.cookie, login.view, { type: 'target', slot: 'head' });
    expect(command.statusCode, command.body).toBe(200);
    expect(command.json<GameView>().report?.from).toBe(epoch);
    const sameOrigin = await instance.inject({ url: '/api/state', headers: { cookie: login.cookie, origin: 'https://game.example.com', 'sec-fetch-site': 'same-origin' } });
    expect(sameOrigin.statusCode).toBe(200);
    const head = await instance.inject({ method: 'HEAD', url: '/api/state', headers: { cookie: login.cookie, 'sec-fetch-site': 'same-origin' } });
    expect(head.statusCode).toBe(200);
  });
});

describe('trusted proxy configuration', () => {
  it('rejects invalid proxy values instead of trusting arbitrary forwarded addresses', () => {
    for (const trustedProxy of ['true', '*', 'example.com', '127.0.0.1/33', '::1/129', '127.0.0.1/-1', '127.0.0.1,,::1', '127.0.0.1/24/8']) {
      expect(() => createApp({ databasePath: ':memory:', trustedProxy })).toThrow('TRUSTED_PROXY');
    }
    expect(() => app({ trustedProxy: '127.0.0.1, ::1/128, 10.0.0.0/8' })).not.toThrow();
  });

  it('separates clients behind a configured proxy and ignores untrusted forwarding headers', async () => {
    const trusted = app({ mode: 'telegram', botToken: 'test-token', trustedProxy: '127.0.0.1/32' });
    for (let client = 1; client <= 21; client += 1) {
      const response = await trusted.inject({ method: 'POST', url: '/api/auth', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': `198.51.100.${client}` }, payload: {} });
      expect(response.statusCode).toBe(401);
    }
    const untrusted = app({ mode: 'telegram', botToken: 'test-token', trustedProxy: '' });
    for (let client = 1; client <= 21; client += 1) {
      const response = await untrusted.inject({ method: 'POST', url: '/api/auth', remoteAddress: '203.0.113.99', headers: { 'x-forwarded-for': `198.51.100.${client}` }, payload: {} });
      expect(response.statusCode).toBe(client <= 20 ? 401 : 429);
    }
    for (let client = 1; client <= 21; client += 1) {
      const response = await trusted.inject({ method: 'POST', url: '/api/auth', remoteAddress: '203.0.113.99', headers: { 'x-forwarded-for': `192.0.2.${client}` }, payload: {} });
      expect(response.statusCode).toBe(client <= 20 ? 401 : 429);
    }
  });
});
