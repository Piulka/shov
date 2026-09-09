import { expect, test as base, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server/app';
import { catalog } from '../shared/content';
import type { GameView } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

const test = base.extend<{ world: { origin: string; advance: (value: number) => void } }>({
  world: async ({ context }, use) => {
    const save = worldFixture();
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

async function go(page: Page, desktop: string, mobile = desktop) {
  const wide = page.viewportSize()!.width > 900;
  await page.locator(wide ? '.sidebar' : '.mobile-nav').getByRole('button', { name: wide ? desktop : mobile, exact: true }).click();
}

async function command(page: Page, action: () => Promise<unknown>): Promise<GameView> {
  const response = page.waitForResponse(r => r.url().endsWith('/api/command') && r.request().method() === 'POST' && r.status() !== 409);
  await action();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return result.json();
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(sizes.page, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 1);
  for (const dialog of await page.getByRole('dialog').all()) {
    const box = await dialog.boundingBox();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(sizes.viewport + 1);
  }
}

async function canvasHasArtwork(page: Page) {
  const canvas = page.locator('canvas.battle-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<number>();
    for (let index = 0; index < pixels.length; index += 100) colors.add((pixels[index] << 16) + (pixels[index + 1] << 8) + pixels[index + 2]);
    return colors.size;
  })).toBeGreaterThan(100);
}

test('regional travel, preview, reforging and resonant crafting persist through the real API', async ({ page, world }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(world.origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  await canvasHasArtwork(page);
  await expect(page.locator('.topbar')).toContainText(catalog.regions.find(region => region.id === 'carmine')!.name);
  await page.screenshot({ path: '.local/screenshots/world-carmine-journey.png', fullPage: true });
  await go(page, 'Карта мира', 'Карта');
  await page.getByRole('tab', { name: /Стеклосад/ }).click();
  const route = catalog.routes.find(route => route.id === 'glasswood')!;
  const row = page.getByRole('article', { name: route.name, exact: true });
  await row.getByRole('button', { name: `Проверить сборку: ${route.name}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Проверка сборки', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Прогноз добычи' })).toContainText('Опыт / час');
  await page.keyboard.press('Escape');
  const queued = await command(page, () => row.getByRole('button', { name: 'Отправиться', exact: true }).click());
  expect(queued.state.pendingRoute?.routeId).toBe(route.id);
  world.advance(queued.state.battle.endsAt);
  await expect.poll(async () => ((await (await page.request.get(`${world.origin}/api/state`)).json()) as GameView).state.routeId).toBe(route.id);
  await expect(page.locator('.topbar')).toContainText('Стеклосад', { timeout: 8000 });
  await canvasHasArtwork(page);
  await page.screenshot({ path: '.local/screenshots/world-glassgarden-journey.png', fullPage: true });

  await go(page, 'Герой');
  await page.locator('.equipment-slot').filter({ hasText: 'Оружие' }).click();
  const itemDialog = page.getByRole('dialog');
  await itemDialog.getByRole('combobox', { name: 'Новый уровень предмета', exact: true }).selectOption('33');
  await itemDialog.getByRole('button', { name: 'Перековать', exact: true }).click();
  const upgraded = await command(page, () => itemDialog.getByRole('button', { name: 'Подтвердить перековку', exact: true }).click());
  expect(upgraded.state.inventory.find(item => item.id === upgraded.state.build.equipment.weapon)?.level).toBe(33);
  await expect(itemDialog.locator('.rarity-label')).toContainText('33');
  await page.screenshot({ path: '.local/screenshots/world-reforged-item.png', fullPage: true });
  await page.keyboard.press('Escape');
  await go(page, 'Мастерская');
  await page.getByRole('group', { name: 'Качество создаваемой вещи' }).getByRole('button', { name: 'Резонансное', exact: true }).click();
  await page.getByRole('combobox', { name: 'Предмет', exact: true }).selectOption('ring');
  await page.getByRole('combobox', { name: 'Свойство', exact: true }).selectOption('haste');
  await page.getByRole('combobox', { name: 'Второе свойство', exact: true }).selectOption('crit');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  const crafted = await command(page, () => page.getByRole('dialog').getByRole('button', { name: 'Создать предмет', exact: true }).click());
  expect(crafted.state.inventory.at(-1)).toMatchObject({ slot: 'ring', level: 33, rarity: 'resonant', affixes: ['haste', 'crit'] });
  expect(crafted.state.wallet.coins).toBe(upgraded.state.wallet.coins - 18_000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  const restored = ((await (await page.request.get(`${world.origin}/api/state`)).json()) as GameView);
  expect(restored.state.routeId).toBe(route.id);
  expect(restored.state.inventory).toEqual(crafted.state.inventory);
  expect(errors).toEqual([]);
});

test('three region maps, current scene and equipment controls fit mobile and desktop', async ({ page, world }) => {
  test.setTimeout(120_000);
  await page.goto(world.origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await go(page, 'Путешествие', 'Путь');
    await canvasHasArtwork(page);
    await noOverflow(page);
    if (width === 390) await page.screenshot({ path: '.local/screenshots/world-carmine-mobile.png', fullPage: true });
    await go(page, 'Карта мира', 'Карта');
    for (const region of catalog.regions) {
      await page.getByRole('tab', { name: new RegExp(region.name) }).click();
      await expect(page.locator('.route-list .route-row')).toHaveCount(3);
      await noOverflow(page);
      await page.screenshot({ path: `.local/screenshots/world-map-${region.id}-${width}.png`, fullPage: true });
    }
    const locked = page.getByRole('article', { name: catalog.routes.at(-1)!.name, exact: true });
    await expect(locked.locator('.unlock-requirement')).toContainText('30 / 35');
    await expect(locked.getByRole('button', { name: 'Не открыт', exact: true })).toBeDisabled();
    await go(page, 'Герой');
    await page.locator('.equipment-slot').filter({ hasText: 'Оружие' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Перековать', exact: true }).click();
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/world-reforge-${width}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await go(page, 'Мастерская');
    await page.getByRole('group', { name: 'Качество создаваемой вещи' }).getByRole('button', { name: 'Резонансное', exact: true }).click();
    await noOverflow(page);
    await page.screenshot({ path: `.local/screenshots/world-workshop-${width}.png`, fullPage: true });
  }
  expect(await page.evaluate(() => [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src))).toEqual([]);
});

test('another tab reforging an item invalidates its open confirmation', async ({ page, world }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(world.origin);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  await go(page, 'Герой');
  await page.locator('.equipment-slot').filter({ hasText: 'Оружие' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Новый уровень предмета', exact: true }).selectOption('26');
  await dialog.getByRole('button', { name: 'Перековать', exact: true }).click();
  const before = (await (await page.request.get(`${world.origin}/api/state`)).json()) as GameView;
  const response = await page.request.post(`${world.origin}/api/command`, { data: {
    id: crypto.randomUUID(), revision: before.revision,
    command: { type: 'reforge', itemId: before.state.build.equipment.weapon, level: 30 },
  } });
  expect(response.status(), await response.text()).toBe(200);
  const changed = (await response.json()) as GameView;
  await expect(dialog.locator('.rarity-label')).toContainText('30', { timeout: 8000 });
  const confirmation = dialog.getByRole('button', { name: 'Подтвердить перековку', exact: true });
  if (await confirmation.isVisible()) await expect(confirmation).toBeDisabled();
  const after = (await (await page.request.get(`${world.origin}/api/state`)).json()) as GameView;
  expect(after.state.inventory).toEqual(changed.state.inventory);
  expect(after.state.wallet).toEqual(changed.state.wallet);
});
