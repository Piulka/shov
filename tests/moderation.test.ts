import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { GameStore } from '../server/store';
import { SocialService } from '../server/social';
import { moderate } from '../server/moderation';
import { createGame } from '../shared/engine';
import type { SocialCommand } from '../shared/social';

const stores: GameStore[] = [];
const epoch = Date.UTC(2026, 8, 9);
function fixture() {
  const store = new GameStore(':memory:');
  stores.push(store);
  const social = new SocialService(store);
  for (const id of ['author', 'reader', 'outsider']) {
    const state = createGame(id, epoch, 42);
    state.level = 10;
    store.createGame(state, epoch);
    social.view(id, epoch);
  }
  const send = (id: string, command: SocialCommand, now = epoch) => social.command(id, command, randomUUID(), now);
  const clanId = send('author', { type: 'create', name: 'Тестовый клан', description: '', language: 'ru', tag: 'calm' }).clan!.id;
  send('reader', { type: 'join', clanId });
  const posted = send('author', { type: 'message', clanId, text: 'Тестовое сообщение' });
  const messageId = posted.clan!.messages.find(message => message.kind === 'message')!.id;
  return { store, social, send, clanId, messageId };
}
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

it('reports only another member message in the current clan and does not expose reporter identities', () => {
  const { store, social, send, clanId, messageId } = fixture();
  const command: SocialCommand = { type: 'report_message', clanId, messageId, reason: 'abuse' };
  expect(() => send('outsider', command)).toThrow();
  expect(() => send('author', command)).toThrow('Своё');
  expect(() => send('reader', { ...command, clanId: randomUUID() })).toThrow();
  const result = send('reader', command);
  expect(result.clan!.messages.find(message => message.id === messageId)?.reported).toBe(true);
  expect(social.view('author', epoch).clan!.messages.find(message => message.id === messageId)?.reported).toBe(false);
  expect(JSON.stringify(social.view('author', epoch))).not.toContain('reporter');
  const reports = moderate(store, 'reports', '', '', epoch) as Record<string, unknown>[];
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ reporter_id: 'reader', author_id: 'author', message_text: 'Тестовое сообщение', reason: 'abuse' });
});

it('deduplicates reports across retries and preserves evidence after message deletion', () => {
  const { store, social, send, clanId, messageId } = fixture();
  const command: SocialCommand = { type: 'report_message', clanId, messageId, reason: 'spam' };
  const id = randomUUID();
  social.command('reader', command, id, epoch);
  social.command('reader', command, id, epoch);
  send('reader', command);
  const reports = moderate(store, 'reports', '', '', epoch) as { id: string }[];
  expect(reports).toHaveLength(1);
  moderate(store, 'delete-message', reports[0].id, 'Confirmed spam', epoch + 1);
  expect(social.view('reader', epoch).clan!.messages.some(message => message.id === messageId)).toBe(false);
  expect(store.database.prepare('SELECT message_text, resolved_at FROM moderation_reports').get()).toEqual({ message_text: 'Тестовое сообщение', resolved_at: epoch + 1 });
  expect(moderate(store, 'reports', '', '', epoch)).toEqual([]);
});

it('limits new reports to five per hour while keeping duplicate reporting harmless', () => {
  const { store, send, clanId } = fixture();
  let firstId = '';
  for (let index = 0; index < 6; index++) {
    const now = epoch + (index + 1) * 3001;
    const posted = send('author', { type: 'message', clanId, text: `Сообщение ${index}` }, now);
    const messageId = posted.clan!.messages.at(-1)!.id;
    if (index === 0) firstId = messageId;
    const command: SocialCommand = { type: 'report_message', clanId, messageId, reason: 'other' };
    if (index < 5) send('reader', command, now);
    else expect(() => send('reader', command, now)).toThrow('пяти');
  }
  expect(() => send('reader', { type: 'report_message', clanId, messageId: firstId, reason: 'spam' }, epoch + 30_000)).not.toThrow();
  expect(moderate(store, 'reports', '', '', epoch)).toHaveLength(5);
});

it('requires a known moderation target and records operator actions transactionally', () => {
  const { store } = fixture();
  expect(() => moderate(store, 'block', 'missing', 'reason', epoch)).toThrow('Account');
  expect(() => moderate(store, 'block', 'author', '', epoch)).toThrow('reason');
  expect(() => moderate(store, 'resolve', randomUUID(), 'reason', epoch)).toThrow('Report');
  expect(store.database.prepare('SELECT COUNT(*) AS n FROM moderation_actions').get()).toEqual({ n: 0 });
  moderate(store, 'block', 'author', 'Confirmed abuse', epoch);
  expect(store.isBlocked('author')).toBe(true);
  moderate(store, 'unblock', 'author', 'Resolved', epoch + 1);
  expect(store.isBlocked('author')).toBe(false);
  expect(store.database.prepare('SELECT COUNT(*) AS n FROM moderation_actions').get()).toEqual({ n: 2 });
});
