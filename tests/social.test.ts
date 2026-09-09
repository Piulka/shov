import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocialError, SocialService, socialWeekStart } from '../server/social.ts';
import { GameStore } from '../server/store.ts';
import { createGame } from '../shared/engine.ts';
import { raidDefaults, type RaidRole } from '../shared/raid.ts';
import type { SocialCommand, SocialView } from '../shared/social.ts';

const epoch = Date.UTC(2026, 8, 9, 12);
const week = Date.UTC(2026, 8, 7);
const weekDuration = 7 * 86_400_000;
const stores = new Set<GameStore>();
const directories: string[] = [];

function setup(path = ':memory:') {
  const store = new GameStore(path);
  stores.add(store);
  const service = new SocialService(store);
  function account(level = 10) {
    const id = `telegram:${randomUUID()}`;
    const state = createGame(id, epoch);
    state.level = level;
    store.transaction(() => store.createGame(state, epoch));
    return id;
  }
  function command(id: string, input: SocialCommand, now = epoch, requestId = randomUUID()) {
    return service.command(id, input, requestId, now);
  }
  function clan(id = account(), name = 'Тихая нить') {
    const view = command(id, { type: 'create', name, description: 'Идём вместе.', language: 'ru', tag: 'calm' });
    return { id, clanId: view.clan!.id, view };
  }
  return { store, service, account, command, clan };
}

function expectError(action: () => unknown, code: string, status?: number) {
  try { action(); throw new Error('Expected SocialError'); }
  catch (error) {
    expect(error).toBeInstanceOf(SocialError);
    expect((error as SocialError).code).toBe(code);
    if (status) expect((error as SocialError).statusCode).toBe(status);
  }
}

function raid(clanId: string, role: RaidRole = 'rupture', weekStart = week): SocialCommand { return { type: 'raid', clanId, weekStart, role, loadout: raidDefaults(role) }; }

afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('social membership and identity', () => {
  it('publishes opaque profile IDs and preserves the entire campaign snapshot and revision', () => {
    const fixture = setup();
    const id = fixture.account();
    const before = fixture.store.getGame(id);
    const view = fixture.clan(id).view;
    expect(view.profile.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(view)).not.toContain(id);
    const joiner = fixture.account();
    const joined = fixture.command(joiner, { type: 'join', clanId: view.clan!.id });
    expect(JSON.stringify(joined)).not.toContain(id);
    expect(JSON.stringify(joined)).not.toContain(joiner);
    fixture.command(id, { type: 'message', clanId: view.clan!.id, text: 'Проверка.' });
    fixture.command(id, raid(view.clan!.id));
    fixture.service.practice(id, 'rupture', raidDefaults('rupture'), epoch + 86_400_000);
    fixture.service.view(id, epoch + weekDuration);
    expect(fixture.store.getGame(id)).toEqual(before);
  });

  it('allows profile setup before level ten and enforces unlock for mutations and practice', () => {
    const { service, account, command } = setup();
    const id = account(9);
    expect(service.view(id, epoch)).toMatchObject({ eligible: false, unlockLevel: 10, clan: null, listings: [], leaderboard: [] });
    expect(command(id, { type: 'profile', name: 'Путник' }).profile.name).toBe('Путник');
    expectError(() => command(id, { type: 'create', name: 'Шов', description: '', language: 'ru', tag: 'calm' }), 'SOCIAL_LOCKED', 403);
    expectError(() => service.practice(id, 'rupture', raidDefaults('rupture'), epoch), 'SOCIAL_LOCKED');
    expectError(() => service.view('missing-account', epoch), 'UNAUTHORIZED', 401);
  });

  it('rolls back public and hero names together when campaign persistence fails', () => {
    const { store, service, account, command } = setup();
    const id = account(1);
    const before = store.getGame(id);
    const profile = service.view(id, epoch).profile;
    const requestId = randomUUID();
    const save = vi.spyOn(store, 'saveGame').mockImplementationOnce(() => { throw new Error('Simulated write failure'); });
    try {
      expect(() => command(id, { type: 'profile', name: 'Новый герой' }, epoch, requestId)).toThrow('Simulated write failure');
      expect(store.getGame(id)).toEqual(before);
      expect(service.view(id, epoch).profile).toEqual(profile);
      expect(store.database.prepare('SELECT COUNT(*) count FROM social_commands WHERE account_id = ? AND command_id = ?').get(id, requestId)).toEqual({ count: 0 });
    } finally {
      save.mockRestore();
    }
    expect(command(id, { type: 'profile', name: 'Новый герой' }, epoch, requestId).profile.name).toBe('Новый герой');
    expect(store.getGame(id)?.revision).toBe(before!.revision + 1);
    expect(JSON.parse(store.getGame(id)!.snapshot).name).toBe('Новый герой');
  });

  it('normalizes Cyrillic and compatibility name uniqueness and validates safe text', () => {
    const { service, account, command, clan } = setup();
    const first = clan(undefined, 'Ёлки');
    const id = account();
    const base = { type: 'create', description: '', language: 'ru', tag: 'calm' } as const;
    expectError(() => command(id, { ...base, name: '  ЁЛКИ  ' }), 'NAME_TAKEN');
    clan(undefined, 'ABC');
    expectError(() => command(id, { ...base, name: 'ＡＢＣ' }), 'NAME_TAKEN');
    for (const name of ['А', 'a'.repeat(25), 'Имя\u200B', '<script>', 'Имя\nещё', 'Имя\u202E']) {
      expectError(() => command(id, { ...base, name }), 'INVALID_REQUEST');
    }
    expectError(() => command(id, { ...base, name: 'Длина', description: 'x'.repeat(241) }), 'INVALID_REQUEST');
    expectError(() => command(id, { type: 'profile', name: 'Я' }), 'INVALID_REQUEST');
    expect(service.view(id, epoch, 'ЁЛК').listings.map(item => item.id)).toEqual([first.clanId]);
    expect(service.view(id, epoch, '%_').listings).toEqual([]);
  });

  it('enforces one clan per member, closed recruitment, and the twenty-member cap', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const second = clan(undefined, 'Вторая нить');
    expectError(() => command(first.id, { type: 'join', clanId: second.clanId }), 'ALREADY_MEMBER');
    expectError(() => clan(first.id, 'Третья нить'), 'ALREADY_MEMBER');
    command(first.id, { type: 'settings', clanId: first.clanId, description: '', recruitment: 'closed' });
    expect(service.view(second.id, epoch).listings.some(item => item.id === first.clanId)).toBe(false);
    expect(service.view(second.id, epoch).leaderboard).toEqual([]);
    expectError(() => command(account(), { type: 'join', clanId: first.clanId }), 'RECRUITMENT_CLOSED');
    command(first.id, { type: 'settings', clanId: first.clanId, description: '', recruitment: 'open' });
    for (let index = 0; index < 19; index++) command(account(), { type: 'join', clanId: first.clanId });
    expectError(() => command(account(), { type: 'join', clanId: first.clanId }), 'CLAN_FULL');
    expect(service.view(first.id, epoch).clan!.roster).toHaveLength(20);
  });

  it('limits officers to two, protects the leader, and transfers leadership atomically', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const ids = [account(), account(), account()];
    const publicIds = ids.map(id => command(id, { type: 'join', clanId: first.clanId }).profile.id);
    command(first.id, { type: 'role', clanId: first.clanId, memberId: publicIds[0], role: 'officer' });
    command(first.id, { type: 'role', clanId: first.clanId, memberId: publicIds[1], role: 'officer' });
    expectError(() => command(first.id, { type: 'role', clanId: first.clanId, memberId: publicIds[2], role: 'officer' }), 'OFFICERS_FULL');
    expectError(() => command(ids[0], { type: 'kick', clanId: first.clanId, memberId: publicIds[2] }), 'FORBIDDEN', 403);
    expectError(() => command(ids[0], { type: 'settings', clanId: first.clanId, description: 'Изменено', recruitment: 'closed' }), 'FORBIDDEN');
    expectError(() => command(first.id, { type: 'kick', clanId: first.clanId, memberId: first.view.profile.id }), 'TRANSFER_REQUIRED');
    expectError(() => command(first.id, { type: 'leave', clanId: first.clanId }), 'TRANSFER_REQUIRED');
    const outsider = clan(undefined, 'Другая артель');
    expectError(() => command(first.id, { type: 'role', clanId: first.clanId, memberId: outsider.view.profile.id, role: 'officer' }), 'NOT_FOUND');
    command(first.id, { type: 'transfer', clanId: first.clanId, memberId: publicIds[0] });
    const view = service.view(ids[0], epoch);
    expect(view.clan!.myRole).toBe('leader');
    expect(view.clan!.roster.filter(member => member.role === 'leader')).toHaveLength(1);
    expect(view.clan!.roster.find(member => member.id === first.view.profile.id)!.role).toBe('member');
    command(first.id, { type: 'leave', clanId: first.clanId });
    expect(service.view(first.id, epoch).clan).toBeNull();
  });

  it('archives empty clans with retained history and enforces a rolling creation cooldown', () => {
    const { service, command, clan } = setup();
    const first = clan();
    const played = command(first.id, raid(first.clanId));
    command(first.id, { type: 'leave', clanId: first.clanId });
    expect(service.view(first.id, epoch).listings).toEqual([]);
    expect(service.view(first.id, epoch).leaderboard[0].clan).toMatchObject({ id: first.clanId, members: 0 });
    expectError(() => clan(first.id, 'Новая артель'), 'CREATE_COOLDOWN');
    expect(command(first.id, raid(first.clanId)).personalRaid!.attemptsUsed).toBe(2);
    const next = command(first.id, { type: 'create', name: 'Новая артель', description: '', language: 'ru', tag: 'calm' }, epoch + weekDuration);
    expect(next.clan!.name).toBe('Новая артель');
    expect(next.history[0]).toMatchObject({ clanName: first.view.clan!.name, bestScore: played.personalRaid!.bestScore });
    expectError(() => command(first.id, { type: 'join', clanId: first.clanId }), 'ALREADY_MEMBER');
  });
});

describe('clan feed and command replay', () => {
  it('rejects commands from an old clan tab and replays accepted requests without touching the new clan', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const second = clan(undefined, 'Второе пристанище');
    const id = account();
    command(id, { type: 'join', clanId: first.clanId });
    const messageId = randomUUID();
    const message: SocialCommand = { type: 'message', clanId: first.clanId, text: 'План первой артели' };
    const oldMessage = command(id, message, epoch, messageId).clan!.messages.at(-1)!;
    const leaveId = randomUUID();
    const leave: SocialCommand = { type: 'leave', clanId: first.clanId };
    command(id, leave, epoch, leaveId);
    const joined = command(id, { type: 'join', clanId: second.clanId });
    command(second.id, { type: 'transfer', clanId: second.clanId, memberId: joined.profile.id });
    const staleCommands: SocialCommand[] = [
      leave,
      { type: 'settings', clanId: first.clanId, description: 'Устаревшее описание', recruitment: 'closed' },
      { type: 'role', clanId: first.clanId, memberId: second.view.profile.id, role: 'officer' },
      { type: 'kick', clanId: first.clanId, memberId: second.view.profile.id },
      { type: 'transfer', clanId: first.clanId, memberId: second.view.profile.id },
      message,
      { type: 'delete_message', clanId: first.clanId, messageId: oldMessage.id },
      raid(first.clanId),
    ];
    const before = service.view(id, epoch);
    for (const stale of staleCommands) expectError(() => command(id, stale), 'SOCIAL_CONTEXT_CHANGED', 409);
    expect(service.view(id, epoch)).toEqual(before);
    expect(command(id, leave, epoch, leaveId).clan!.id).toBe(second.clanId);
    expect(command(id, message, epoch, messageId).clan!.id).toBe(second.clanId);
    expect(service.view(id, epoch).clan!.messages.some(entry => entry.text === message.text)).toBe(false);
    expect(service.view(first.id, epoch).clan!.messages.filter(entry => entry.id === oldMessage.id)).toHaveLength(1);
  });

  it('allows own-message deletion and officer moderation, protects events and other clans', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const member = account();
    const officer = account();
    command(member, { type: 'join', clanId: first.clanId });
    const officerId = command(officer, { type: 'join', clanId: first.clanId }).profile.id;
    command(first.id, { type: 'role', clanId: first.clanId, memberId: officerId, role: 'officer' });
    const message = command(member, { type: 'message', clanId: first.clanId, text: '<b>Привет</b>\nВторая строка' }).clan!.messages.at(-1)!;
    expect(message).toMatchObject({ text: '<b>Привет</b>\nВторая строка', canDelete: true });
    const spectator = account();
    const spectatorView = command(spectator, { type: 'join', clanId: first.clanId });
    expect(spectatorView.clan!.messages.find(item => item.id === message.id)!.canDelete).toBe(false);
    expectError(() => command(spectator, { type: 'delete_message', clanId: first.clanId, messageId: message.id }), 'FORBIDDEN');
    command(officer, { type: 'delete_message', clanId: first.clanId, messageId: message.id });
    const systemMessage = service.view(officer, epoch).clan!.messages.find(item => item.kind === 'event')!;
    expectError(() => command(first.id, { type: 'delete_message', clanId: first.clanId, messageId: systemMessage.id }), 'FORBIDDEN');
    const other = clan(undefined, 'Чужая артель');
    const otherMessage = command(other.id, { type: 'message', clanId: other.clanId, text: 'Чужое' }).clan!.messages.at(-1)!;
    expectError(() => command(first.id, { type: 'delete_message', clanId: first.clanId, messageId: otherMessage.id }), 'NOT_FOUND');
    const own = command(first.id, { type: 'message', clanId: first.clanId, text: 'Своё' }).clan!.messages.at(-1)!;
    expect(command(first.id, { type: 'delete_message', clanId: first.clanId, messageId: own.id }).clan!.messages.some(item => item.id === own.id)).toBe(false);
  });

  it('uses a persistent three-second message cooldown and returns only the last fifty entries', () => {
    const { service, command, clan } = setup();
    const first = clan();
    command(first.id, { type: 'message', clanId: first.clanId, text: 'Первое' });
    expectError(() => command(first.id, { type: 'message', clanId: first.clanId, text: 'Рано' }, epoch + 2_999), 'MESSAGE_COOLDOWN', 429);
    for (let index = 1; index <= 55; index++) command(first.id, { type: 'message', clanId: first.clanId, text: `Сообщение ${index}` }, epoch + index * 3_000);
    const feed = service.view(first.id, epoch + 165_000).clan!.messages;
    expect(feed).toHaveLength(50);
    expect(feed[0].text).toBe('Сообщение 6');
    expect(feed.at(-1)!.text).toBe('Сообщение 55');
    expect(feed.every((entry, index) => !index || entry.createdAt >= feed[index - 1].createdAt)).toBe(true);
    expectError(() => command(first.id, { type: 'message', clanId: first.clanId, text: 'x'.repeat(501) }), 'INVALID_REQUEST');
    expectError(() => command(first.id, { type: 'message', clanId: first.clanId, text: 'Невидимо\u2066' }), 'INVALID_REQUEST');
  });

  it('replays current views without repeating mutations and rejects changed payloads', () => {
    const { store, account, command, clan } = setup();
    const first = clan();
    const requestId = randomUUID();
    const input = { type: 'message', clanId: first.clanId, text: 'Один раз' } as const;
    const posted = command(first.id, input, epoch, requestId);
    command(account(), { type: 'join', clanId: first.clanId });
    const replayed = command(first.id, input, epoch + 1_000, requestId);
    expect(replayed.clan!.members).toBe(2);
    expect(replayed.clan!.messages.filter(item => item.text === 'Один раз')).toHaveLength(1);
    expect(replayed.clan!.messages.find(item => item.text === 'Один раз')!.id).toBe(posted.clan!.messages.at(-1)!.id);
    expectError(() => command(first.id, { type: 'message', clanId: first.clanId, text: 'Другая команда' }, epoch, requestId), 'IDEMPOTENCY_CONFLICT', 409);
    const saved = store.getGame(first.id)!;
    const state = JSON.parse(saved.snapshot);
    state.wallet.coins += 1;
    store.transaction(() => store.saveGame(saved, state, epoch));
    expect(command(first.id, { type: 'profile', name: 'Новое имя' }).profile.name).toBe('Новое имя');
    const raidId = randomUUID();
    command(first.id, raid(first.clanId), epoch, raidId);
    expect(command(first.id, raid(first.clanId), epoch, raidId).personalRaid!.attemptsUsed).toBe(1);
    const attempts = store.database.prepare('SELECT * FROM social_raid_attempts WHERE account_id = ?').all(first.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attempt_number: 1, rules_version: 1, clan_id: first.clanId, week_start: week });
    expect(JSON.parse(attempts[0].loadout as string)).toEqual(raidDefaults('rupture'));
  });

  it('retains membership, idempotency and raid locks after reopening the database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'shov-social-'));
    directories.push(directory);
    const path = join(directory, 'social.sqlite');
    const first = setup(path);
    const clan = first.clan();
    const requestId = randomUUID();
    first.command(clan.id, raid(clan.clanId), epoch, requestId);
    first.command(clan.id, { type: 'message', clanId: clan.clanId, text: 'До перезапуска' });
    first.store.close(); stores.delete(first.store);
    const second = setup(path);
    const view = second.command(clan.id, raid(clan.clanId), epoch, requestId);
    expect(view.clan!.id).toBe(clan.clanId);
    expect(view.personalRaid!.attemptsUsed).toBe(1);
    expect(view.profile.id).toBe(clan.view.profile.id);
    expectError(() => second.command(clan.id, { type: 'message', clanId: clan.clanId, text: 'Слишком рано' }, epoch + 1_000), 'MESSAGE_COOLDOWN');
  });
});

describe('weekly normalized clan raid', () => {
  it('keeps practice reward-free and rejects injected scores and invalid builds', () => {
    const { service, store, account, command, clan } = setup();
    const id = account();
    const before = store.getGame(id);
    const result = service.practice(id, 'rupture', raidDefaults('rupture'), epoch);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10_000);
    expect(service.view(id, epoch)).toMatchObject({ personalRaid: null, history: [], profile: { reputation: 0 } });
    expect(store.getGame(id)).toEqual(before);
    const current = clan(id);
    expectError(() => service.command(id, { ...raid(current.clanId), score: 10_000 }, randomUUID(), epoch), 'INVALID_REQUEST');
    expectError(() => service.command(id, { ...raid(current.clanId), loadout: { ...raidDefaults('rupture'), stats: { power: 999_999 } } }, randomUUID(), epoch), 'INVALID_REQUEST');
    expectError(() => service.practice(id, 'unknown', raidDefaults('rupture'), epoch), 'INVALID_REQUEST');
    expectError(() => command(id, { type: 'raid', clanId: current.clanId, weekStart: week, role: 'rupture', loadout: { ...raidDefaults('rupture'), skills: ['flash', 'flash', 'flash', 'flash'] } }), 'INVALID_LOADOUT');
    expect(service.view(id, epoch).personalRaid).toBeNull();
    expect(store.database.prepare('SELECT * FROM social_raid_attempts WHERE account_id = ?').all(id)).toEqual([]);
  });

  it('locks role and clan on first attempt, retaining remaining attempts after departure', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const second = clan(undefined, 'Другой берег');
    const id = account();
    command(id, { type: 'join', clanId: first.clanId });
    const score = command(id, raid(first.clanId)).personalRaid!.bestScore;
    expectError(() => command(id, raid(first.clanId, 'cleanse')), 'RAID_ROLE_LOCKED');
    command(id, { type: 'leave', clanId: first.clanId });
    command(id, { type: 'join', clanId: second.clanId });
    expectError(() => command(id, raid(second.clanId)), 'SOCIAL_CONTEXT_CHANGED');
    const secondAttempt = command(id, raid(first.clanId));
    expect(secondAttempt.personalRaid).toMatchObject({ clanId: first.clanId, attemptsUsed: 2, bestScore: score });
    expect(secondAttempt.clan!.weekScore).toBe(0);
    expect(service.view(first.id, epoch).clan!.weekScore).toBe(score);
    command(id, raid(first.clanId));
    expectError(() => command(id, raid(first.clanId)), 'RAID_ATTEMPTS_USED');
    const nextWeek = command(id, raid(second.clanId, 'cleanse', week + weekDuration), week + weekDuration);
    expect(nextWeek.personalRaid).toMatchObject({ clanId: second.clanId, role: 'cleanse', attemptsUsed: 1 });
  });

  it('does not release any of the twenty weekly seats when participants are kicked', () => {
    const { service, account, command, clan } = setup();
    const first = clan();
    const members = [first.id];
    for (let index = 0; index < 19; index++) {
      const id = account();
      command(id, { type: 'join', clanId: first.clanId });
      members.push(id);
    }
    for (const id of members) command(id, raid(first.clanId));
    const publicId = service.view(members[1], epoch).profile.id;
    command(first.id, { type: 'kick', clanId: first.clanId, memberId: publicId });
    const newcomer = account();
    command(newcomer, { type: 'join', clanId: first.clanId });
    expectError(() => command(newcomer, raid(first.clanId)), 'RAID_SEATS_FULL');
    expect(command(members[1], raid(first.clanId)).personalRaid!.attemptsUsed).toBe(2);
    expect(service.view(first.id, epoch).clan!.raidSeats).toBe(20);
    expect(command(newcomer, raid(first.clanId, 'rupture', week + weekDuration), week + weekDuration).personalRaid!.attemptsUsed).toBe(1);
  });

  it('rolls over exactly Monday UTC, finalizes reputation once and retains four history entries', () => {
    const { service, command, clan } = setup();
    const first = clan();
    expect(socialWeekStart(week - 1)).toBe(week - weekDuration);
    expect(socialWeekStart(week)).toBe(week);
    const played = command(first.id, raid(first.clanId));
    const pending = played.personalRaid!.pendingReputation;
    expect(played.profile.reputation).toBe(0);
    expect(service.view(first.id, week + weekDuration - 1).personalRaid).not.toBeNull();
    const next = service.view(first.id, week + weekDuration);
    expect(next).toMatchObject({ personalRaid: null, profile: { reputation: pending } });
    expect(next.history).toHaveLength(1);
    expect(next.clan!.weekScore).toBe(0);
    expect(service.view(first.id, week + weekDuration).profile.reputation).toBe(pending);
    let total = pending;
    for (let index = 1; index <= 5; index++) total += command(first.id, raid(first.clanId, 'rupture', week + index * weekDuration), week + index * weekDuration).personalRaid!.pendingReputation;
    const history = service.view(first.id, week + 6 * weekDuration);
    expect(history.history).toHaveLength(4);
    expect(history.history[0].weekStart).toBe(week + 5 * weekDuration);
    expect(history.profile.reputation).toBe(total);
  });

  it('rejects a delayed Sunday raid on Monday while replaying accepted Sunday requests without a new attempt', () => {
    const { service, store, account, command, clan } = setup();
    const first = clan();
    const id = account();
    command(id, { type: 'join', clanId: first.clanId });
    const sunday = week + weekDuration - 1;
    const monday = week + weekDuration;
    const acceptedId = randomUUID();
    const oldRaid = raid(first.clanId);
    command(first.id, oldRaid, sunday, acceptedId);
    const delayedId = randomUUID();
    expectError(() => command(id, oldRaid, monday, delayedId), 'SOCIAL_CONTEXT_CHANGED', 409);
    expectError(() => command(first.id, oldRaid, monday), 'SOCIAL_CONTEXT_CHANGED', 409);
    expect(service.view(id, monday).personalRaid).toBeNull();
    const replay = command(first.id, oldRaid, monday, acceptedId);
    expect(replay.personalRaid).toBeNull();
    expect(replay.history).toHaveLength(1);
    expect(store.database.prepare('SELECT * FROM social_raid_attempts WHERE week_start = ?').all(monday)).toEqual([]);
    expect(command(id, raid(first.clanId, 'cleanse', monday), monday, delayedId).personalRaid).toMatchObject({ attemptsUsed: 1, role: 'cleanse' });
  });

  it('counts only top four per role, caps a clan at 120000 and gives equal scores shared competition ranks', () => {
    const { service, store, account, clan } = setup();
    const first = clan(undefined, 'Первая артель');
    const second = clan(undefined, 'Вторая артель');
    const third = clan(undefined, 'Третья артель');
    // Trusted fixture rows isolate ranking math from combat balance; client score injection is rejected above.
    function seed(clanId: string, role: RaidRole, score: number, count: number) {
      for (let index = 0; index < count; index++) {
        const id = account();
        service.view(id, epoch);
        store.database.prepare('INSERT INTO social_participation(account_id, week_start, clan_id, role, attempts, best_score, last_result) VALUES (?, ?, ?, ?, 1, ?, ?)')
          .run(id, week, clanId, role, score, JSON.stringify({ role, score, completed: 0, durationSeconds: 0, components: [], battles: [] }));
      }
    }
    for (const role of ['rupture', 'bulwark', 'cleanse'] as RaidRole[]) {
      seed(first.clanId, role, 10_000, 5);
      seed(second.clanId, role, 10_000, 4);
    }
    seed(third.clanId, 'rupture', 9_000, 1);
    const current: SocialView = service.view(first.id, epoch);
    expect(current.clan!.weekScore).toBe(120_000);
    expect(current.clan!.roles.map(role => [role.score, role.contributors])).toEqual([[40_000, 4], [40_000, 4], [40_000, 4]]);
    expect(current.leaderboard.map(entry => entry.rank)).toEqual([1, 1, 3]);
    expect(current.leaderboard.map(entry => entry.score)).toEqual([120_000, 120_000, 9_000]);
    expect(current.clan!.achievements).toEqual([]);
    const ended = service.view(first.id, week + weekDuration);
    expect(ended.clan!.achievements.map(entry => entry.threshold)).toEqual([30_000, 60_000, 90_000, 120_000]);
    expect(service.view(first.id, week + 6 * weekDuration).clan!.achievements).toEqual(ended.clan!.achievements);
  });
});
