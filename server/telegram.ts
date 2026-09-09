import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const updateSchema = z.object({
  update_id: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  message: z.object({
    chat: z.object({
      id: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
      type: z.string(),
    }),
    text: z.string().max(4096).optional(),
  }).optional(),
});

export function registerTelegramWebhook(app: FastifyInstance, options: {
  mode: 'local' | 'telegram';
  origin?: string;
  secret?: string;
}): void {
  if (options.mode !== 'telegram' || !options.secret) return;
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(options.secret)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 32-256 base64url characters.');
  }
  if (!options.origin) throw new Error('APP_ORIGIN is required for the Telegram webhook.');
  const expected = createHash('sha256').update(options.secret).digest();
  const url = `${options.origin}/`;

  app.post('/api/telegram/webhook', {
    onRequest: async (request, reply) => {
      const supplied = request.headers['x-telegram-bot-api-secret-token'];
      if (typeof supplied !== 'string' || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) {
        return reply.code(403).send({ error: 'Источник Telegram не подтверждён.', code: 'INVALID_WEBHOOK_SECRET' });
      }
    },
  }, async (request, reply) => {
    const update = updateSchema.safeParse(request.body);
    if (!update.success) return reply.code(400).send({ error: 'Некорректное обновление Telegram.', code: 'INVALID_TELEGRAM_UPDATE' });
    const message = update.data.message;
    if (!message || message.chat.type !== 'private' || message.chat.id <= 0 || !message.text || !/^\/start(?:@[A-Za-z0-9_]{5,32})?(?:\s|$)/.test(message.text)) return { ok: true };

    // Telegram executes this response; no bot token or outbound request is needed.
    return {
      method: 'sendMessage',
      chat_id: message.chat.id,
      text: 'ШОВЬ · бета\n\nГерой сражается сам. Ты выбираешь сборку, снаряжение и маршрут.',
      reply_markup: { inline_keyboard: [[{ text: 'Играть', web_app: { url } }]] },
    };
  });
}
