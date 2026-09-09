import { expect, test as base, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server/app';
import type { SocialView } from '../shared/social';
import type { GameView } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

const test = base.extend<{ world: { origin: string; advance: (value: number) => void } }>({
  world: async ({ context }, use) => {
    const save = worldFixture({ routeId: 'sunny' });
    let now = worldEpoch;
    const app = createApp({ databasePath: save.databasePath, now: () => now });
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    try {
      await context.addCookies([{ name: 'shov_session', value: save.token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
      await mkdir('.local/screenshots', { recursive: true });
      await use({ origin, advance: value => { now = value; } });
    } finally {
      await app.close();
      save.cleanup();
    }
  },
});

async function command(page: Page, action: () => Promise<unknown>): Promise<GameView> {
  const response = page.waitForResponse(response => response.url().endsWith('/api/command') && response.request().method() === 'POST' && response.status() !== 409);
  await action();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

async function state(page: Page, origin: string): Promise<GameView> {
  return (await page.request.get(`${origin}/api/state`)).json();
}

test('route mode survives a state poll and reload, keeps queued travel and controls automatic advancement', async ({ page, world }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(world.origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Приостановить анимацию|Продолжить анимацию/ })).toHaveCount(0);
  const initial = await state(page, world.origin);
  await page.locator('.sidebar').getByRole('button', { name: 'Карта мира', exact: true }).click();
  const modes = page.getByRole('group', { name: 'Режим путешествия', exact: true });
  const farm = modes.getByRole('button', { name: 'Добыча', exact: true });
  const push = modes.getByRole('button', { name: 'Продвижение', exact: true });
  await expect(farm).toHaveAttribute('aria-pressed', 'true');

  let pollStarted!: () => void;
  const polling = new Promise<void>(resolve => { pollStarted = resolve; });
  await page.route('**/api/state', async route => {
    const response = await route.fetch();
    pollStarted();
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ response });
  }, { times: 1 });
  await polling;
  const changed = await command(page, () => push.click());
  expect(changed.state.mode).toBe('push');
  expect(changed.state.pendingRoute).toBeNull();
  expect(changed.state.battle).toEqual(initial.state.battle);
  await expect(push).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.route-mode-status')).toContainText('Переход после победы');
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Карта мира', exact: true }).click();
  await expect(push).toHaveAttribute('aria-pressed', 'true');

  const beforeQueue = await state(page, world.origin);
  const queuedResponse = await page.request.post(`${world.origin}/api/command`, { data: {
    id: crypto.randomUUID(), revision: beforeQueue.revision,
    command: { type: 'route', routeId: 'glasswood', mode: 'farm' },
  } });
  expect(queuedResponse.status(), await queuedResponse.text()).toBe(200);
  await expect(farm).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect(page.locator('.route-mode-status')).toContainText('Далее: Лес звенящих стволов');
  const reconfigured = await command(page, () => push.click());
  expect(reconfigured.state.pendingRoute).toEqual({ routeId: 'glasswood', mode: 'push' });
  expect(reconfigured.state.routeId).toBe('sunny');
  expect(reconfigured.state.battle).toEqual(initial.state.battle);
  world.advance(reconfigured.state.battle.endsAt);
  const arrived = await state(page, world.origin);
  expect(arrived.state.routeId).toBe('glasswood');
  await expect(page.locator('.route-mode-status')).toContainText('Цель: Росные чаши', { timeout: 8000 });
  await expect(push).toHaveAttribute('aria-pressed', 'true');
  world.advance(arrived.state.battle.endsAt);
  const advanced = await state(page, world.origin);
  expect(advanced.state.routeId).toBe('dew');
  await expect(page.locator('.route-mode-status')).toContainText('Цель: Сердцевина стекла', { timeout: 8000 });
  const stopped = await command(page, () => farm.click());
  world.advance(stopped.state.battle.endsAt);
  expect((await state(page, world.origin)).state.routeId).toBe('dew');
  await expect(page.locator('.route-mode-status')).toContainText('Добыча: Росные чаши');
});

test('mobile keeps one persistent animation setting and readable route status', async ({ page, world }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(world.origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  await expect(page.locator('.stage-tools button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
  await page.getByRole('checkbox', { name: /Спокойная анимация/ }).check();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('checkbox', { name: /Спокойная анимация/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '.local/screenshots/beta-journey-320.png', fullPage: true });
  await page.locator('.mobile-nav').getByRole('button', { name: 'Карта', exact: true }).click();
  await command(page, () => page.getByRole('group', { name: 'Режим путешествия', exact: true }).getByRole('button', { name: 'Продвижение', exact: true }).click());
  await expect(page.locator('.route-mode-status')).toContainText('Переход после победы');
  const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.page).toBeLessThanOrEqual(size.viewport + 1);
  await page.screenshot({ path: '.local/screenshots/beta-map-320.png', fullPage: true });
});

test('a message report recovers a lost response and stays acknowledged after reload', async ({ page, browser, world }) => {
  const other = await browser.newContext();
  try {
    const createdResponse = await page.request.post(`${world.origin}/api/social/command`, { data: {
      id: crypto.randomUUID(), command: { type: 'create', name: 'Проверка костра', description: '', language: 'ru', tag: 'calm' },
    } });
    expect(createdResponse.status(), await createdResponse.text()).toBe(200);
    const created = (await createdResponse.json()) as SocialView;
    const clanId = created.clan!.id;
    const auth = await other.request.post(`${world.origin}/api/auth`, { data: {} });
    expect(auth.status(), await auth.text()).toBe(200);
    world.advance(worldEpoch + 3_630_000);
    expect(((await (await other.request.get(`${world.origin}/api/state`)).json()) as GameView).state.level).toBe(10);
    for (const [client, command] of [
      [other.request, { type: 'join', clanId }],
      [other.request, { type: 'message', clanId, text: 'Сообщение для проверки жалобы' }],
      [page.request, { type: 'message', clanId, text: 'Моё сообщение' }],
    ] as const) {
      const response = await client.post(`${world.origin}/api/social/command`, { data: { id: crypto.randomUUID(), command } });
      expect(response.status(), await response.text()).toBe(200);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(world.origin);
    await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
    const returnReport = page.getByRole('button', { name: 'Продолжить путь', exact: true });
    if (await returnReport.isVisible()) await returnReport.click();
    await page.locator('.mobile-nav').getByRole('button', { name: 'Клан', exact: true }).click();
    await page.getByRole('tab', { name: 'Костёр', exact: true }).click();
    const report = page.getByRole('button', { name: 'Пожаловаться на сообщение', exact: true });
    await expect(report).toHaveCount(1);
    await expect(page.locator('.clan-message').filter({ hasText: 'Моё сообщение' }).getByRole('button', { name: 'Пожаловаться на сообщение', exact: true })).toHaveCount(0);
    await report.click();
    const dialog = page.getByRole('dialog', { name: 'Пожаловаться на сообщение', exact: true });
    await dialog.getByRole('combobox', { name: 'Причина жалобы', exact: true }).selectOption('abuse');
    await expect(dialog).toContainText('Сообщение для проверки жалобы');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(741);
    await page.screenshot({ path: '.local/screenshots/beta-report-320.png' });
    const ids: string[] = [];
    await page.route('**/api/social/command', async route => {
      const body = route.request().postDataJSON();
      if (body.command.type !== 'report_message') return route.continue();
      ids.push(body.id);
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(200);
      if (ids.length <= 2) await route.abort('failed');
      else await route.fulfill({ response });
    });
    await dialog.getByRole('button', { name: 'Отправить жалобу', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Проверить действие', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Проверить действие', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    await expect(page.getByRole('button', { name: 'Жалоба отправлена', exact: true })).toBeDisabled();
    await page.reload();
    await page.locator('.mobile-nav').getByRole('button', { name: 'Клан', exact: true }).click();
    await page.getByRole('tab', { name: 'Костёр', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Жалоба отправлена', exact: true })).toBeDisabled();
  } finally {
    await other.close();
  }
});
