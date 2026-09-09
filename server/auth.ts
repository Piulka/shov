import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const telegramUser = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export function sessionDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function validateTelegramInitData(initData: string, botToken: string, now: number): string {
  const fields = new URLSearchParams(initData);
  const keys = [...fields.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Повторяющиеся поля Telegram.');

  const hash = fields.get('hash');
  const authDate = fields.get('auth_date');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDate || !/^\d+$/.test(authDate)) {
    throw new Error('Некорректные данные авторизации Telegram.');
  }
  const seconds = Number(authDate);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(seconds) || seconds > nowSeconds + 30 || nowSeconds - seconds > 300) {
    throw new Error('Запуск Telegram устарел. Откройте игру заново через бота.');
  }

  // Telegram's bot-token HMAC check includes every field except hash.
  fields.delete('hash');
  const dataCheckString = [...fields.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new Error('Подпись Telegram не подтверждена.');

  let user: unknown;
  try {
    user = JSON.parse(fields.get('user') ?? 'null');
  } catch {
    throw new Error('Не удалось прочитать пользователя Telegram.');
  }
  const parsed = telegramUser.safeParse(user);
  if (!parsed.success) throw new Error('Telegram не передал корректный ID пользователя.');
  return `telegram:${parsed.data.id}`;
}
