import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server/app';
import type { SocialView } from '../shared/social';
import type { GameView } from '../shared/types';

interface World {
  origin: string;
  players: BrowserContext[];
  advance: (now: number) => void;
}

// Real HTTP sessions and campaign settlement, isolated from the developer's save.
const test = base.extend<{ world: World }>({
  world: async ({ browser }, use) => {
    let now = Date.UTC(2026, 8, 9, 12);
    const app = createApp({ databasePath: ':memory:', now: () => now });
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const players: BrowserContext[] = [];
    try {
      for (let index = 0; index < 2; index++) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        players.push(context);
        const response = await context.request.post(`${origin}/api/auth`, { data: {} });
        expect(response.status(), await response.text()).toBe(200);
      }
      now += 3_630_000;
      for (const player of players) {
        const response = await player.request.get(`${origin}/api/state`);
        expect(response.status()).toBe(200);
        expect(((await response.json()) as GameView).state.level).toBe(10);
      }
      await mkdir('.local/screenshots', { recursive: true });
      await use({ origin, players, advance: value => { now = value; } });
    } finally {
      for (const player of players) await player.close();
      await app.close();
    }
  },
});

async function social(world: World, index = 0): Promise<SocialView> {
  const response = await world.players[index].request.get(`${world.origin}/api/social`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function openClan(page: Page, origin: string) {
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  const report = page.getByRole('button', { name: 'Продолжить путь', exact: true });
  if (await report.isVisible()) await report.click();
  await page.locator(page.viewportSize()!.width > 900 ? '.sidebar' : '.mobile-nav').getByRole('button', { name: 'Клан', exact: true }).click();
  await expect(page.locator('.clan-page')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Разделы клана' })).toBeVisible();
}

async function command(page: Page, action: () => Promise<unknown>): Promise<SocialView> {
  const response = page.waitForResponse(r => r.url().endsWith('/api/social/command') && r.request().method() === 'POST');
  await action();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

async function namePlayer(page: Page, name: string) {
  await page.getByRole('button', { name: 'Открыть профиль в настройках', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки', exact: true });
  await dialog.getByLabel('Имя героя', { exact: true }).fill(name);
  const saved = await command(page, () => dialog.getByRole('button', { name: 'Сохранить имя', exact: true }).click());
  expect(saved.profile.name).toBe(name);
  await expect(dialog.getByRole('status')).toContainText('Имя сохранено');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
}

async function createClan(page: Page, name: string) {
  await page.getByRole('button', { name: 'Создать клан', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый клан' });
  await dialog.getByLabel('Название клана').fill(name);
  await dialog.getByLabel('Описание клана').fill('Исследуем Зеленолесье вместе');
  await command(page, () => dialog.getByRole('button', { name: 'Создать клан', exact: true }).click());
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
}

async function scoredRaid(page: Page) {
  await page.getByRole('button', { name: 'Зачётный поход', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Отправиться в зачётный поход?' });
  const result = await command(page, () => dialog.getByRole('button', { name: 'Начать поход', exact: true }).click());
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Результат зачётного похода' })).toBeVisible();
  return result;
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(sizes.width, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(sizes.viewport + 1);
  }
}

test('two players: membership, private feed, raid, moderation, succession and weekly history', async ({ world }) => {
  test.setTimeout(120_000);
  const a = await world.players[0].newPage();
  const b = await world.players[1].newPage();
  const errors: string[] = [];
  a.on('pageerror', error => errors.push(error.message));
  b.on('pageerror', error => errors.push(error.message));
  await openClan(a, world.origin);
  await namePlayer(a, 'Ива');
  await createClan(a, 'Медное эхо');
  await openClan(b, world.origin);
  await namePlayer(b, 'Лён');
  await b.getByLabel('Поиск клана').fill('медное');
  await command(b, () => b.getByRole('button', { name: 'Вступить в клан Медное эхо' }).click());
  await expect(b.getByRole('tab', { name: 'Участники', exact: true })).toBeVisible();
  await b.getByRole('tab', { name: 'Костёр', exact: true }).click();
  const message = '<b>Сборка на очищение</b>';
  await b.getByRole('textbox', { name: 'Сообщение клану' }).fill(message);
  await command(b, () => b.getByRole('button', { name: 'Отправить сообщение', exact: true }).click());
  await a.bringToFront();
  await a.getByRole('tab', { name: 'Костёр', exact: true }).click();
  await expect(a.locator('.clan-messages')).toContainText(message, { timeout: 12_000 });
  await expect(a.locator('.clan-message p b')).toHaveCount(0);

  await a.getByRole('tab', { name: 'Экспедиция', exact: true }).click();
  await a.getByRole('button', { name: 'Пробный поход', exact: true }).click();
  await expect(a.getByRole('region', { name: 'Результат пробного похода' })).toBeVisible();
  const practiced = await social(world);
  expect(practiced.personalRaid).toBeNull();
  expect(practiced.clan?.raidSeats).toBe(0);
  const scored = await scoredRaid(a);
  expect(scored.personalRaid?.attemptsUsed).toBe(1);
  expect(scored.personalRaid?.bestScore).toBeGreaterThan(6000);
  expect(scored.clan?.weekScore).toBe(scored.personalRaid?.bestScore);
  await expect(a.getByRole('group', { name: 'Роль экспедиции' }).getByRole('button', { name: 'Защита' })).toBeDisabled();
  await a.getByRole('tab', { name: 'Рейтинг', exact: true }).click();
  await expect(a.locator('.clan-leaderboard li')).toHaveCount(1);
  await expect(a.locator('.clan-leaderboard')).toContainText('Медное эхо');

  await a.getByRole('tab', { name: 'Участники', exact: true }).click();
  await a.getByRole('button', { name: 'Назначить офицером: Лён', exact: true }).click();
  await command(a, () => a.getByRole('dialog').getByRole('button', { name: 'Подтвердить', exact: true }).click());
  await openClan(b, world.origin);
  await expect(b.getByRole('button', { name: 'Настройки клана', exact: true })).toHaveCount(0);
  await b.getByRole('tab', { name: 'Участники', exact: true }).click();
  await expect(b.getByRole('button', { name: /Исключить из клана:/ })).toHaveCount(0);
  await expect(b.locator('.clan-member').filter({ hasText: 'Лён' })).toContainText('Офицер');
  await a.getByRole('button', { name: 'Передать главенство: Лён', exact: true }).click();
  await command(a, () => a.getByRole('dialog').getByRole('button', { name: 'Передать', exact: true }).click());
  await a.getByRole('button', { name: 'Покинуть клан', exact: true }).click();
  await command(a, () => a.getByRole('dialog').getByRole('button', { name: 'Покинуть клан', exact: true }).click());
  await expect(a.locator('.clan-notice')).toContainText('Медное эхо');
  const again = await scoredRaid(a);
  expect(again.clan).toBeNull();
  expect(again.personalRaid?.attemptsUsed).toBe(2);
  expect(again.personalRaid?.clanId).toBe(scored.clan!.id);
  expect(again.personalRaid?.bestScore).toBe(scored.personalRaid?.bestScore);

  await openClan(b, world.origin);
  await expect(b.getByRole('button', { name: 'Настройки клана', exact: true })).toBeVisible();
  await b.getByRole('group', { name: 'Роль экспедиции' }).getByRole('button', { name: 'Очищение', exact: true }).click();
  const second = await scoredRaid(b);
  expect(second.clan?.raidSeats).toBe(2);
  expect(second.clan?.weekScore).toBe(scored.personalRaid!.bestScore + second.personalRaid!.bestScore);
  world.advance(scored.week.end + 1000);
  await openClan(a, world.origin);
  await a.getByRole('tab', { name: 'Рейтинг', exact: true }).click();
  await expect(a.locator('.clan-history-list')).toContainText('Медное эхо');
  const next = await social(world);
  expect(next.personalRaid).toBeNull();
  expect(next.profile.reputation).toBe(scored.personalRaid?.pendingReputation);
  expect(next.history[0].bestScore).toBe(scored.personalRaid?.bestScore);
  await expect(a.locator('.clan-leaderboard li')).toHaveCount(0);
  await openClan(b, world.origin);
  await expect(b.locator('.raid-personal-line')).toContainText('3 / 3 похода осталось');
  expect(errors).toEqual([]);
});

test('clan views, builder and dialogs fit 320, 390, 768 and 1440 pixel screens', async ({ world }) => {
  test.setTimeout(90_000);
  const page = await world.players[0].newPage();
  await openClan(page, world.origin);
  await createClan(page, 'Сверхдлинноеназваниеклан');
  await scoredRaid(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    for (const [name, suffix] of [['Экспедиция', 'raid'], ['Участники', 'members'], ['Костёр', 'feed'], ['Рейтинг', 'ranking']]) {
      await page.getByRole('tab', { name, exact: true }).click();
      await noOverflow(page);
      await page.screenshot({ path: `.local/screenshots/clan-${suffix}-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Настройки клана', exact: true }).click();
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/clan-settings-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Экспедиция', exact: true }).click();
    await page.getByRole('button', { name: 'Зачётный поход', exact: true }).click();
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/clan-confirm-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src))).toEqual([]);
});

test('lost committed raid responses survive reload and retry with one attempt', async ({ world }) => {
  const page = await world.players[0].newPage();
  await openClan(page, world.origin);
  await createClan(page, 'Эхо ответа');
  const ids: string[] = [];
  await page.route('**/api/social/command', async route => {
    const body = route.request().postDataJSON();
    if (body.command.type !== 'raid') return route.continue();
    ids.push(body.id);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (ids.length <= 2) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Зачётный поход', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Начать поход', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Проверить действие', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Проверить действие', exact: true })).toBeEnabled();
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(1);
  expect((await social(world)).personalRaid?.attemptsUsed).toBe(1);
  await openClan(page, world.origin);
  await expect(page.getByRole('button', { name: 'Зачётный поход', exact: true })).toBeDisabled();
  await command(page, () => page.getByRole('button', { name: 'Проверить действие', exact: true }).click());
  await expect(page.locator('.clan-error')).toHaveCount(0);
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(1);
  expect((await social(world)).personalRaid?.attemptsUsed).toBe(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('shov-social-command:')))).toEqual([]);
});

test('raid confirmation opened before Monday cannot spend a new week attempt', async ({ world }) => {
  const page = await world.players[0].newPage();
  await openClan(page, world.origin);
  await createClan(page, 'Граница недели');
  const before = await social(world);
  await page.getByRole('button', { name: 'Зачётный поход', exact: true }).click();
  world.advance(before.week.end);
  const response = page.waitForResponse(r => r.url().endsWith('/api/social/command') && r.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name: 'Начать поход', exact: true }).click();
  const rejected = await response;
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe('SOCIAL_CONTEXT_CHANGED');
  expect(rejected.request().postDataJSON().command.weekStart).toBe(before.week.start);
  const after = await social(world);
  expect(after.week.start).toBe(before.week.end);
  expect(after.personalRaid).toBeNull();
  expect(after.clan?.raidSeats).toBe(0);
});
