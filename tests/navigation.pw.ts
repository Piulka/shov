import { expect, test as base, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server/app';
import { GameStore } from '../server/store';
import type { GameView } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

const test = base.extend<{ world: string }>({
  world: async ({ context }, use) => {
    const save = worldFixture({ routeId: 'sunny' });
    const store = new GameStore(save.databasePath);
    save.state.chapter.legacy = false;
    save.state.chapter.completed = [];
    store.saveGame(store.getGame(save.state.id)!, save.state, worldEpoch);
    store.close();
    const app = createApp({ databasePath: save.databasePath, now: () => worldEpoch });
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    try {
      await context.addCookies([{ name: 'shov_session', value: save.token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
      await mkdir('.local/screenshots', { recursive: true });
      await use(origin);
    } finally {
      await app.close();
      save.cleanup();
    }
  },
});

async function go(page: Page, desktop: string, mobile = desktop) {
  await page.locator(page.viewportSize()!.width > 900 ? '.sidebar' : '.mobile-nav').getByRole('button', { name: page.viewportSize()!.width > 900 ? desktop : mobile, exact: true }).click();
}

async function focused(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => document.activeElement?.closest(`#${id}`)?.id, id)).toBe(id);
  await expect(page.locator(`#${id}`)).toBeInViewport();
}

async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(size.width, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 1);
}

test('folded sections persist and same-page shortcuts reveal them without losing a tactics draft', async ({ page, world }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(world);
  await go(page, 'Герой');
  for (const id of ['equipment', 'inventory', 'build', 'presets']) {
    await expect(page.locator(`#${id}`)).toHaveJSProperty('open', true);
    await page.locator(`#${id} > summary`).click();
    await expect(page.locator(`#${id}`)).toHaveJSProperty('open', false);
    await expect.poll(() => page.evaluate(id => localStorage.getItem(`shov-section:${id}`), id)).toBe('closed');
  }
  await page.reload();
  await go(page, 'Герой');
  for (const id of ['equipment', 'inventory', 'build', 'presets']) await expect(page.locator(`#${id}`)).toHaveJSProperty('open', false);
  await noOverflow(page);
  await page.screenshot({ path: '.local/screenshots/navigation-folded-390.png', fullPage: true });
  const shortcuts = page.getByRole('navigation', { name: 'Разделы героя' });
  await shortcuts.getByRole('button', { name: 'Рюкзак', exact: true }).click();
  await expect(page.locator('#inventory')).toHaveJSProperty('open', true);
  await focused(page, 'inventory');
  await page.locator('#inventory > summary').click();
  await shortcuts.getByRole('button', { name: 'Рюкзак', exact: true }).click();
  await expect(page.locator('#inventory')).toHaveJSProperty('open', true);
  await focused(page, 'inventory');
  await shortcuts.getByRole('button', { name: 'Умения', exact: true }).click();
  await focused(page, 'build');
  await page.getByLabel('Условие 1', { exact: true }).selectOption('always');
  await page.locator('#build > summary').click();
  await expect(page.locator('#build')).toHaveJSProperty('open', false);
  await shortcuts.getByRole('button', { name: 'Умения', exact: true }).click();
  await expect(page.getByLabel('Условие 1', { exact: true })).toHaveValue('always');
  await expect(page.locator('#build')).toContainText('Есть несохранённые изменения');
  const secondRule = await page.getByLabel('Условие 2', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Понизить приоритет правила 1', exact: true }).click();
  await expect(page.getByLabel('Условие 1', { exact: true })).toHaveValue(secondRule);
  await expect(page.getByLabel('Условие 2', { exact: true })).toHaveValue('always');
  const firstSkill = await page.getByLabel('Умение 1', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Умение 1: позже в очереди', exact: true }).click();
  await expect(page.getByLabel('Умение 2', { exact: true })).toHaveValue(firstSkill);
  const response = page.waitForResponse(r => r.url().endsWith('/api/command') && r.status() === 200);
  await page.getByRole('button', { name: 'Применить', exact: true }).click();
  const saved = (await (await response).json()) as GameView;
  expect((saved.state.pendingBuild ?? saved.state.build).rules[1].condition).toBe('always');
  expect((saved.state.pendingBuild ?? saved.state.build).skills[1]).toBe(firstSkill);
});

test('chapter links and the full backpack open the requested section and move focus there', async ({ page, world }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    for (const id of ['inventory', 'build', 'upgrade', 'craft']) localStorage.setItem(`shov-section:${id}`, 'closed');
  });
  await page.goto(world);
  for (const [button, anchor] of [
    ['К сборке: Собственный ритм', 'build'],
    ['К маршрутам: Нужная находка', 'target'],
    ['В мастерскую: Крепкая основа', 'upgrade'],
    ['В мастерскую: Работа по мерке', 'craft'],
  ]) {
    await go(page, 'Путешествие', 'Путь');
    await page.locator('.chapter-list summary').click();
    await page.getByRole('button', { name: button, exact: true }).click();
    await focused(page, anchor);
    if (anchor !== 'target') await expect(page.locator(`#${anchor}`)).toHaveJSProperty('open', true);
    await noOverflow(page);
  }
  await go(page, 'Путешествие', 'Путь');
  await page.getByRole('button', { name: 'Весь рюкзак', exact: true }).click();
  await focused(page, 'inventory');
  await expect(page.getByLabel('Поиск предмета', { exact: true })).toBeVisible();
});

test('mechanic labels and public player identity remain readable on mobile and desktop', async ({ page, world }) => {
  await page.goto(world);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await go(page, 'Герой');
    await page.getByRole('navigation', { name: 'Разделы героя' }).getByRole('button', { name: 'Умения', exact: true }).click();
    await focused(page, 'build');
    await expect(page.locator('#build')).toContainText('Умение с правилом используется только по его условиям');
    await expect(page.locator('.threshold').first().getByRole('option', { name: '55%', exact: true })).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/navigation-build-${width}.png`, fullPage: true });
    await go(page, 'Карта мира', 'Карта');
    const response = page.waitForResponse(r => r.url().endsWith('/api/command') && r.status() === 200);
    await page.getByLabel('Целевой слот добычи', { exact: true }).selectOption(width === 390 ? 'all' : 'ring');
    await response;
    await expect(page.locator('#target')).toContainText(width === 390 ? 'равный шанс 12,5%' : '50% находок');
    await expect(page.locator('#target')).toContainText('Частота находок, редкость и уровень остаются прежними');
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/navigation-target-${width}.png`, fullPage: true });
    await go(page, 'Клан');
    await expect(page.locator('.clan-profile')).toContainText('Ваше публичное имя');
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/navigation-profile-${width}.png`, fullPage: true });
  }
});
