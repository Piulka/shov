import { expect, test as base, type Page } from '@playwright/test';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { createAdminApp } from '../server/admin';
import { GameStore } from '../server/store';
import { createGame } from '../shared/engine';
import type { GameState } from '../shared/types';

const password = 'browser-admin-fixture-password';
const salt = Buffer.alloc(16, 0x52);
const hash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
const accountId = 'telegram:424242';
type Fixture = { origin: string; read: () => GameState; change: (work: (state: GameState) => void) => void };
const test = base.extend<{ admin: Fixture }>({
  admin: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'shov-admin-ui-'));
    const databasePath = join(dir, 'game.sqlite');
    const epoch = Date.now();
    const store = new GameStore(databasePath);
    const state = createGame(accountId, epoch, 42);
    state.name = 'Тестовый проводник'; state.level = 12;
    store.createGame(state, epoch);
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const app = createAdminApp({ databasePath, origin, passwordHash: hash, secureCookies: false, now: () => epoch });
    try {
      await app.listen({ host: '127.0.0.1', port });
      await mkdir('.local/screenshots', { recursive: true });
      await use({
        origin,
        read: () => JSON.parse(store.getGame(accountId)!.snapshot),
        change: work => store.transaction(() => {
          const saved = store.getGame(accountId)!;
          const state = JSON.parse(saved.snapshot) as GameState;
          work(state); store.saveGame(saved, state, epoch);
        }),
      });
    } finally { await app.close(); store.close(); await rm(dir, { recursive: true, force: true }); }
  },
});

async function login(page: Page, origin: string) {
  await page.goto(origin);
  await page.getByLabel('Пароль администратора', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор игры' })).toBeVisible();
}
async function openPlayer(page: Page) {
  await page.getByRole('navigation', { name: 'Разделы управления' }).getByRole('button', { name: 'Игроки', exact: true }).click();
  await page.getByRole('button', { name: 'Тестовый проводник', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тестовый проводник', exact: true })).toBeVisible();
}
async function confirm(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Причина изменения').fill('Исправление по результатам проверки');
  await dialog.getByRole('button', { name: 'Подтвердить изменения', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Изменения сохранены');
}

test('admin edits preserve untouched progress, handle conflicts and audit inventory/build changes', async ({ page, admin }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, admin.origin);
  await openPlayer(page);
  await page.getByLabel('Монеты', { exact: true }).fill('777');
  admin.change(state => { state.wallet.thread = 30; state.xp = 17; });
  await page.getByRole('button', { name: 'Изменить ресурсы', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('row', { name: /Нить/ })).toHaveCount(0);
  await confirm(page);
  expect(admin.read().wallet).toEqual({ coins: 777, thread: 30, catalyst: 0 });
  expect(admin.read().xp).toBe(17);

  await page.getByLabel('Имя героя', { exact: true }).fill('Исправленный проводник');
  admin.change(state => { state.xp = 29; });
  await page.getByRole('button', { name: 'Изменить профиль', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('row', { name: /Опыт/ })).toHaveCount(0);
  await confirm(page);
  expect(admin.read().xp).toBe(29);

  await page.getByLabel('Монеты', { exact: true }).fill('999');
  await page.getByRole('button', { name: 'Изменить ресурсы', exact: true }).click();
  admin.change(state => { state.wallet.coins = 888; });
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Причина изменения').fill('Проверка конфликта версий');
  await dialog.getByRole('button', { name: 'Подтвердить изменения', exact: true }).click();
  await expect(dialog).toContainText('Сохранение изменилось');
  expect(admin.read().wallet.coins).toBe(888);
  await dialog.getByRole('button', { name: 'Загрузить актуальные данные', exact: true }).click();
  await expect(dialog.getByLabel('Причина изменения')).toHaveValue('Проверка конфликта версий');
  await dialog.getByRole('checkbox', { name: 'Я проверил изменения после обновления' }).check();
  await dialog.getByRole('button', { name: 'Подтвердить изменения', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(admin.read().wallet.coins).toBe(999);

  await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
  await page.getByRole('button', { name: 'Выдать предмет', exact: true }).click();
  await page.getByLabel('Название предмета').fill('Проверочное кольцо');
  await page.getByRole('combobox', { name: 'Слот предмета', exact: true }).selectOption('ring');
  await page.getByLabel('Уровень предмета', { exact: true }).fill('5');
  await page.getByRole('dialog').getByRole('button', { name: 'К подтверждению', exact: true }).click();
  await confirm(page);
  const granted = admin.read().inventory.find(item => item.name === 'Проверочное кольцо')!;
  expect(granted).toBeDefined();
  await page.getByRole('button', { name: 'Надеть Проверочное кольцо', exact: true }).click();
  await confirm(page);
  expect(admin.read().build.equipment.ring).toBe(granted.id);
  await page.getByRole('tab', { name: 'Тактика', exact: true }).click();
  await page.getByRole('combobox', { name: 'Условие 1', exact: true }).selectOption('always');
  await page.getByRole('button', { name: 'Изменить сборку', exact: true }).click();
  await confirm(page);
  expect(admin.read().build.rules[0].condition).toBe('always');
  await page.getByRole('tab', { name: 'История', exact: true }).click();
  await expect(page.locator('.admin-audit > li')).toHaveCount(6);
  await page.screenshot({ path: '.local/screenshots/admin-audit-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход администратора' })).toBeVisible();
  expect((await page.request.get(`${admin.origin}/api/admin/overview`)).status()).toBe(401);
});

test('admin overview and editors fit mobile and desktop without runtime errors', async ({ page, admin }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, admin.origin);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: `.local/screenshots/admin-overview-${width}.png`, fullPage: true });
  }
  await openPlayer(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['Профиль', 'Снаряжение', 'Тактика']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}: ${tab}`).toBeLessThanOrEqual(width + 1);
    }
    await page.screenshot({ path: `.local/screenshots/admin-editor-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Снаряжение', exact: true }).click();
    await page.getByRole('button', { name: 'Выдать предмет', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Название предмета').fill('Кольцо проверки экрана');
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth), `${width}: item dialog`).toBeLessThanOrEqual(1);
    await dialog.getByRole('button', { name: 'К подтверждению', exact: true }).click();
    await expect(dialog.getByLabel('Причина изменения')).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth), `${width}: confirmation`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `.local/screenshots/admin-confirmation-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  }
  expect(errors).toEqual([]);
});
