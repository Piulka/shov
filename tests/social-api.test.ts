import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/app';
import { raidDefaults } from '../shared/raid';
import type { GameView } from '../shared/types';
import type { SocialView } from '../shared/social';

const epoch = Date.UTC(2026, 8, 9, 0);
const apps: FastifyInstance[] = [];
function fixture() {
  let now = epoch;
  const app = createApp({ databasePath: ':memory:', now: () => now });
  apps.push(app);
  return { app, advance: () => { now += 3_630_000; }, setClock: (value: number) => { now = value; } };
}
async function login(app: FastifyInstance) {
  const response = await app.inject({ method: 'POST', url: '/api/auth', payload: {} });
  expect(response.statusCode).toBe(200);
  return { cookie: (response.headers['set-cookie'] as string).split(';')[0], game: response.json<GameView>() };
}
async function state(app: FastifyInstance, cookie: string) {
  const response = await app.inject({ url: '/api/state', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json<GameView>();
}
function command(app: FastifyInstance, cookie: string, value: unknown, id = randomUUID()) {
  return app.inject({ method: 'POST', url: '/api/social/command', headers: { cookie }, payload: { id, command: value } });
}
const create = (name: string) => ({ type: 'create', name, description: 'Собираем террасы', language: 'ru', tag: 'builds' });
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

describe('social HTTP boundary', () => {
  it('requires authorization and protects social GET/HEAD as well as writes from foreign origins', async () => {
    const { app } = fixture();
    expect((await app.inject('/api/social')).statusCode).toBe(401);
    const { cookie } = await login(app);
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: '/api/social', headers: { cookie, origin: 'https://foreign.example' } });
      expect(response.statusCode).toBe(403);
    }
    const response = await app.inject({ method: 'POST', url: '/api/social/command', headers: { cookie, 'sec-fetch-site': 'cross-site' }, payload: { id: randomUUID(), command: create('Чужой клан') } });
    expect(response.statusCode).toBe(403);
  });

  it('shows the level gate and allows actual campaign progress to unlock clan creation', async () => {
    const { app, advance } = fixture();
    const { cookie } = await login(app);
    const locked = await app.inject({ url: '/api/social', headers: { cookie } });
    expect(locked.json<SocialView>()).toMatchObject({ eligible: false, unlockLevel: 10 });
    expect((await command(app, cookie, create('Белая нить'))).statusCode).toBe(403);
    advance();
    expect((await state(app, cookie)).state.level).toBe(10);
    const made = await command(app, cookie, create('Белая нить'));
    expect(made.statusCode, made.body).toBe(200);
    expect(made.json<SocialView>().clan).toMatchObject({ name: 'Белая нить', members: 1, myRole: 'leader' });
  });

  it('keeps clan mutations independent of the campaign revision and economy', async () => {
    const { app, advance } = fixture();
    const { cookie, game } = await login(app);
    advance();
    const before = await state(app, cookie);
    expect((await command(app, cookie, create('Стеклянный круг'))).statusCode).toBe(200);
    const social = await app.inject({ url: '/api/social', headers: { cookie } });
    expect(social.body).not.toContain(game.state.id);
    expect((await state(app, cookie)).state).toEqual(before.state);
    const apply = await app.inject({ method: 'POST', url: '/api/command', headers: { cookie }, payload: { id: randomUUID(), revision: before.revision, command: { type: 'target', slot: 'ring' } } });
    expect(apply.statusCode, apply.body).toBe(200);
  });

  it('retries a raid with the same request ID once and rejects injected score or spending fields', async () => {
    const { app, advance } = fixture();
    const { cookie } = await login(app);
    advance();
    const before = await state(app, cookie);
    const created = (await command(app, cookie, create('Узел рассвета'))).json<SocialView>();
    const raid = { type: 'raid', clanId: created.clan!.id, weekStart: created.week.start, role: 'rupture', loadout: raidDefaults('rupture') };
    expect((await command(app, cookie, { ...raid, score: 10000 })).statusCode).toBe(400);
    const id = randomUUID();
    const first = await command(app, cookie, raid, id);
    expect(first.statusCode, first.body).toBe(200);
    const replay = await command(app, cookie, raid, id);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<SocialView>().personalRaid).toEqual(first.json<SocialView>().personalRaid);
    expect(replay.json<SocialView>().personalRaid?.attemptsUsed).toBe(1);
    const collision = await command(app, cookie, { type: 'message', clanId: created.clan!.id, text: 'Иной запрос' }, id);
    expect(collision.statusCode).toBe(409);
    const after = await state(app, cookie);
    expect(after.state).toEqual(before.state);
    expect(after.revision).toBe(before.revision);
  });

  it('practice does not bind a raid seat, grant rewards or consume a scored attempt', async () => {
    const { app, advance } = fixture();
    const { cookie } = await login(app);
    advance();
    await state(app, cookie);
    await command(app, cookie, create('Тихий сад'));
    const practice = await app.inject({ method: 'POST', url: '/api/social/practice', headers: { cookie }, payload: { role: 'cleanse', loadout: raidDefaults('cleanse') } });
    expect(practice.statusCode, practice.body).toBe(200);
    expect(practice.json().score).toBeGreaterThanOrEqual(0);
    const social = (await app.inject({ url: '/api/social', headers: { cookie } })).json<SocialView>();
    expect(social.personalRaid).toBeNull();
    expect(social.clan?.raidSeats).toBe(0);
    expect(social.profile.reputation).toBe(0);
  });

  it('does not expose a clan feed to nonmembers and validates bounded requests', async () => {
    const { app, advance } = fixture();
    const first = await login(app);
    const other = await login(app);
    advance();
    await state(app, first.cookie);
    await state(app, other.cookie);
    const created = (await command(app, first.cookie, create('Хранители сада'))).json<SocialView>();
    const written = await command(app, first.cookie, { type: 'message', clanId: created.clan!.id, text: 'Приватный план сборки' });
    expect(written.statusCode, written.body).toBe(200);
    const outsider = await app.inject({ url: '/api/social?q=Хранители', headers: { cookie: other.cookie } });
    expect(outsider.statusCode).toBe(200);
    expect(outsider.body).not.toContain('Приватный план сборки');
    expect(outsider.json<SocialView>().clan).toBeNull();
    expect((await command(app, first.cookie, { type: 'message', clanId: created.clan!.id, text: 'a'.repeat(501) })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/social?q=${'a'.repeat(61)}`, headers: { cookie: first.cookie } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/social/command', headers: { cookie: first.cookie }, payload: { id: randomUUID(), command: { type: 'leave', clanId: created.clan!.id }, admin: true } })).statusCode).toBe(400);
  });

  it('rejects stale commands from another tab after switching clans, including a first raid', async () => {
    const { app, advance } = fixture();
    const first = await login(app);
    const second = await login(app);
    advance();
    await state(app, first.cookie);
    await state(app, second.cookie);
    const oldView = (await command(app, first.cookie, create('Первый берег'))).json<SocialView>();
    const newView = (await command(app, second.cookie, create('Второй берег'))).json<SocialView>();
    const oldClan = oldView.clan!.id;
    const newClan = newView.clan!.id;
    const acceptedLeave = randomUUID();
    expect((await command(app, first.cookie, { type: 'leave', clanId: oldClan }, acceptedLeave)).statusCode).toBe(200);
    expect((await command(app, first.cookie, { type: 'join', clanId: newClan })).statusCode).toBe(200);
    for (const stale of [
      { type: 'leave', clanId: oldClan },
      { type: 'message', clanId: oldClan, text: 'Сообщение из старой вкладки' },
      { type: 'settings', clanId: oldClan, description: 'Устарело', recruitment: 'closed' },
      { type: 'raid', clanId: oldClan, weekStart: oldView.week.start, role: 'rupture', loadout: raidDefaults('rupture') },
    ]) {
      const response = await command(app, first.cookie, stale);
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().code).toBe('SOCIAL_CONTEXT_CHANGED');
    }
    const replay = await command(app, first.cookie, { type: 'leave', clanId: oldClan }, acceptedLeave);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<SocialView>().clan!.id).toBe(newClan);
    expect(replay.json<SocialView>().clan!.messages.some(message => message.text === 'Сообщение из старой вкладки')).toBe(false);
    expect(replay.json<SocialView>().personalRaid).toBeNull();
    expect((await command(app, first.cookie, { type: 'leave' })).statusCode).toBe(400);
  });

  it('does not spend a new-week attempt for delayed old-week requests and still replays accepted requests', async () => {
    const { app, advance, setClock } = fixture();
    const { cookie } = await login(app);
    advance();
    await state(app, cookie);
    const created = (await command(app, cookie, create('Недельный дозор'))).json<SocialView>();
    const oldRaid = { type: 'raid', clanId: created.clan!.id, weekStart: created.week.start, role: 'rupture', loadout: raidDefaults('rupture') };
    const requestId = randomUUID();
    setClock(created.week.end - 1);
    const accepted = await command(app, cookie, oldRaid, requestId);
    expect(accepted.statusCode, accepted.body).toBe(200);
    setClock(created.week.end);
    const delayed = await command(app, cookie, oldRaid);
    expect(delayed.statusCode, delayed.body).toBe(409);
    expect(delayed.json().code).toBe('SOCIAL_CONTEXT_CHANGED');
    const replay = await command(app, cookie, oldRaid, requestId);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json<SocialView>().personalRaid).toBeNull();
    expect(replay.json<SocialView>().history).toHaveLength(1);
    const fresh = await command(app, cookie, { ...oldRaid, weekStart: created.week.end });
    expect(fresh.statusCode, fresh.body).toBe(200);
    expect(fresh.json<SocialView>().personalRaid!.attemptsUsed).toBe(1);
  });
});
