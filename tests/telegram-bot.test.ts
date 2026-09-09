import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppOptions } from '../server/app';
import { registerTelegramWebhook } from '../server/telegram';

const secret = 'fixture_Webhook_Secret_0123456789-ABCDE';
const botToken = 'fixture-bot-token-not-for-transmission';
const origin = 'https://game.example.com';
const url = '/api/telegram/webhook';
const headers = { 'x-telegram-bot-api-secret-token': secret };
const apps: FastifyInstance[] = [];

function instance(options: AppOptions = {}) {
  const app = createApp({ databasePath: ':memory:', mode: 'telegram', botToken, appOrigin: origin, telegramWebhookSecret: secret, logLevel: 'silent', ...options });
  apps.push(app);
  return app;
}

function update(text = '/start', type = 'private', id = 4_000_000_123) {
  return { update_id: 91, message: { message_id: 17, date: 1_800_000_000, chat: { id, type }, text } };
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Telegram bot welcome webhook', () => {
  it('returns the Mini App button for a private /start without making outgoing calls', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const app = instance();
    for (const text of ['/start', '/start beta_invitation', '/start@shov_fixture_bot']) {
      const response = await app.inject({ method: 'POST', url, headers, payload: update(text) });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({
        method: 'sendMessage', chat_id: 4_000_000_123,
        text: 'ШОВЬ · бета\n\nГерой сражается сам. Ты выбираешь сборку, снаряжение и маршрут.',
        reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url: `${origin}/` } }]] },
      });
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain(botToken);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await app.inject('/api/state')).statusCode).toBe(401);
  });

  it('rejects missing, wrong and duplicated credentials without revealing secrets', async () => {
    const app = instance();
    for (const supplied of [undefined, '', 'wrong', secret.slice(0, -1), `${secret},${secret}`, secret.slice(0, -1) + 'X']) {
      const response = await app.inject({ method: 'POST', url, headers: supplied === undefined ? {} : { 'x-telegram-bot-api-secret-token': supplied }, payload: update() });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('INVALID_WEBHOOK_SECRET');
      expect(response.json().method).toBeUndefined();
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain(botToken);
    }
  });

  it('ignores groups, ordinary messages, edited messages and unrelated update kinds', async () => {
    const app = instance();
    const payloads = [
      update('/start', 'group', -123), update('/start', 'supergroup', -100123),
      update('/start', 'channel', -456), update('/start', 'private', -12),
      update('Привет'), update('/starter'), update(' /start'),
      { update_id: 92 }, { update_id: 93, message: { chat: { id: 12, type: 'private' }, sticker: { file_id: 'fixture' } } },
      { update_id: 94, edited_message: update().message },
      { update_id: 95, callback_query: { id: 'fixture', data: 'start' } },
    ];
    for (const payload of payloads) {
      const response = await app.inject({ method: 'POST', url, headers, payload });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    }
  });

  it('validates update IDs, chat IDs and message types before returning a bot command', async () => {
    const app = instance();
    for (const payload of [
      {}, { ...update(), update_id: -1 }, { ...update(), update_id: '91' },
      { ...update(), message: { chat: { id: '12', type: 'private' }, text: '/start' } },
      update('/start', 'private', Number.MAX_SAFE_INTEGER + 1),
      { ...update(), message: { chat: { id: 12, type: 'private' }, text: { command: '/start' } } },
    ]) {
      const response = await app.inject({ method: 'POST', url, headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Некорректное обновление Telegram.', code: 'INVALID_TELEGRAM_UPDATE' });
    }
  });

  it('does not register the route in local mode or without a configured secret', async () => {
    const local = instance({ mode: 'local' });
    const disabled = instance({ telegramWebhookSecret: '' });
    for (const app of [local, disabled]) {
      const response = await app.inject({ method: 'POST', url, headers, payload: update() });
      expect(response.statusCode).toBe(404);
      expect(response.json().method).toBeUndefined();
    }
    expect((await instance().inject(url)).statusCode).toBe(404);
  });

  it('loads the optional secret from the environment and enforces its character and length contract', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', secret);
    const app = instance({ telegramWebhookSecret: undefined });
    expect((await app.inject({ method: 'POST', url, headers, payload: update() })).statusCode).toBe(200);
    for (const invalid of ['x'.repeat(31), 'x'.repeat(257), 'invalid secret with spaces'.padEnd(40, 'x'), 'x'.repeat(40) + '=']) {
      const isolated = Fastify();
      apps.push(isolated);
      expect(() => registerTelegramWebhook(isolated, { mode: 'telegram', origin, secret: invalid })).toThrow('TELEGRAM_WEBHOOK_SECRET');
    }
  });

  it('keeps redelivery stateless and grants no game session or rewards', async () => {
    const app = instance();
    const first = await app.inject({ method: 'POST', url, headers, payload: update() });
    const repeated = await app.inject({ method: 'POST', url, headers, payload: update() });
    expect(repeated.json()).toEqual(first.json());
    expect(repeated.headers['set-cookie']).toBeUndefined();
    expect((await app.inject('/api/state')).statusCode).toBe(401);
  });
});
