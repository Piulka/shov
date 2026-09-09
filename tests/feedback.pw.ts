import { expect, test, type Page } from '@playwright/test';
import { createApp } from '../server/app';
import { GameStore } from '../server/store';
import { createGame } from '../shared/engine';
import { itemProtection, salvageValue } from '../shared/equipment';
import type { GameState } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

async function setup(page: Page, edit: (state: GameState) => void = () => {}, fresh = false) {
  const save = worldFixture({ routeId: 'sunny' });
  const state = fresh ? createGame(save.state.id, worldEpoch, 4216) : save.state;
  edit(state);
  const store = new GameStore(save.databasePath);
  store.saveGame(store.getGame(state.id)!, state, worldEpoch);
  store.close();
  const app = createApp({ databasePath: save.databasePath, now: () => worldEpoch });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  await page.context().addCookies([{ name: 'shov_session', value: save.token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  return { ...save, origin, close: async () => { await app.close(); save.cleanup(); } };
}

async function go(page: Page, desktop: string, mobile = desktop) {
  const wide = page.viewportSize()!.width > 900;
  await page.locator(wide ? '.sidebar' : '.mobile-nav').getByRole('button', { name: wide ? desktop : mobile, exact: true }).click();
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
  return page.getByRole('dialog', { name: 'Настройки', exact: true });
}

test('first entry offers a weapon before combat and keeps the choice across reloads', async ({ page }, info) => {
  const fixture = await setup(page, () => {}, true);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.origin);
    await expect(page.getByRole('heading', { name: 'Дорога приключений' })).toBeVisible();
    await expect(page.locator('canvas.battle-canvas')).toHaveCount(0);
    await page.getByRole('radio', { name: /Лучник/ }).click();
    await expect(page.locator('.intro-hero')).toHaveAttribute('src', '/art/fantasy/hero-needle.png');
    await fit(page);
    await page.screenshot({ path: info.outputPath('intro-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'В путь', exact: true }).click();
    await expect(page.locator('canvas.battle-canvas')).toBeVisible();
    expect(fixture.saved().pendingBuild?.equipment.weapon).toBe('item-10');
    await page.reload();
    await expect(page.locator('canvas.battle-canvas')).toBeVisible();
    await expect(page.locator('.introduction')).toHaveCount(0);
    const dialog = await settings(page);
    await dialog.getByRole('textbox', { name: 'Имя героя', exact: true }).fill('Тестовый лучник');
    await dialog.getByRole('button', { name: 'Сохранить имя' }).click();
    await expect(dialog.getByText('Имя сохранено', { exact: true })).toBeVisible();
    expect(fixture.saved().name).toBe('Тестовый лучник');
    expect(fixture.saved().level).toBe(1);
  } finally { await fixture.close(); }
});

test('mobile salvage has a stationary footer and saved builds explain protection', async ({ page }, info) => {
  const fixture = await setup(page, state => {
    state.inventory.push({ id: 'feedback-salvage', name: 'Кольцо удачи', slot: 'ring', rarity: 'resonant', level: 12, affixes: ['hp', 'crit'], affixRolls: { hp: 120, crit: 80 } });
  });
  try {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(fixture.origin);
    await go(page, 'Герой');
    await page.getByRole('navigation', { name: 'Разделы героя' }).getByRole('button', { name: 'Рюкзак', exact: true }).click();
    await expect(page.locator('.item-protection').filter({ hasText: 'В сборке:' }).first()).toBeVisible();
    await page.locator('.item-tile').filter({ hasText: 'Кольцо удачи' }).click();
    const dialog = page.getByRole('dialog');
    const salvage = dialog.getByRole('button', { name: 'Разобрать', exact: true });
    await expect(salvage).toBeInViewport({ ratio: 1 });
    await salvage.click();
    const confirm = dialog.getByRole('button', { name: 'Подтвердить разбор', exact: true });
    await expect(confirm).toBeInViewport({ ratio: 1 });
    await fit(page);
    await page.screenshot({ path: info.outputPath('salvage-mobile.png') });
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.saved().inventory.some(item => item.id === 'feedback-salvage')).toBe(false);
    await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await expect(page.getByRole('checkbox').first()).toBeDisabled();
  } finally { await fixture.close(); }
});

test('salvage all batches over 100, stops on failure, and retries only remaining items', async ({ page }) => {
  const fixture = await setup(page, state => {
    for (let index = 0; index < 105; index++) state.inventory.push({ id: `salvage-${index}`, name: `Трофей ${index}`, slot: 'ring', level: 10, rarity: 'fine', affixes: ['hp'] });
    state.inventory.push({ id: 'protected', name: 'Памятное кольцо', slot: 'ring', level: 1, rarity: 'fine', affixes: ['hp'], locked: true });
  });
  try {
    const before = fixture.saved();
    const eligible = before.inventory.filter(item => !itemProtection(before, item));
    const calls: string[][] = [];
    await page.route('**/api/command', async route => {
      const body = route.request().postDataJSON();
      const command = body.command ?? body;
      if (command.type === 'dismantle') {
        calls.push(command.itemIds);
        if (calls.length === 2) return route.fulfill({ status: 400, json: { error: 'Проверочная ошибка второй партии' } });
      }
      await route.continue();
    });
    await page.goto(fixture.origin);
    await go(page, 'Герой');
    await page.getByRole('button', { name: /Разобрать все/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: `Разобрать ${eligible.length}`, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Разбор остановлен. Разобрано: 100' })).toBeVisible();
    expect(calls.map(ids => ids.length)).toEqual([100, 5]);
    expect(fixture.saved().inventory).toHaveLength(before.inventory.length - 100);
    await page.getByRole('dialog').getByRole('button', { name: 'Разобрать 5', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(calls.map(ids => ids.length)).toEqual([100, 5, 5]);
    const after = fixture.saved();
    expect(after.inventory.map(item => item.id)).toEqual(before.inventory.filter(item => itemProtection(before, item)).map(item => item.id));
    expect(after.wallet.thread - before.wallet.thread).toBe(eligible.reduce((sum, item) => sum + salvageValue(item), 0));
  } finally { await fixture.close(); }
});

test('dark and light themes cover all pages, persist, and retain adventure quest anchors', async ({ page }, info) => {
  const fixture = await setup(page);
  try {
    await page.goto(fixture.origin);
    for (const [width, theme, label] of [[390, 'dark', 'Тёмная'], [1440, 'light', 'Светлая']] as const) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = await settings(page);
      await dialog.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: info.outputPath(`settings-${theme}.png`) });
      await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
      for (const [desktop, mobile] of [['Путешествие', 'Путь'], ['Герой', 'Герой'], ['Карта мира', 'Карта'], ['Мастерская', 'Мастерская'], ['Клан', 'Клан']]) {
        await go(page, desktop, mobile);
        await fit(page);
        await page.screenshot({ path: info.outputPath(`${theme}-${desktop}.png`), fullPage: true });
      }
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }
    await go(page, 'Путешествие', 'Путь');
    await page.locator('.chapter-list summary').click();
    await expect(page.locator('.chapter-list')).toContainText('Достичь 100-го уровня');
    await page.getByRole('button', { name: 'К перековке: Любимое снаряжение', exact: true }).click();
    await expect(page.locator('#reforge')).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#reforge')?.id)).toBe('reforge');
  } finally { await fixture.close(); }
});
