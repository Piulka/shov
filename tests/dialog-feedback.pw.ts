import { expect, test, type Page } from '@playwright/test';
import { createApp } from '../server/app';
import { GameStore } from '../server/store';
import { createGame } from '../shared/engine';
import type { GameState } from '../shared/types';
import { worldEpoch, worldFixture } from './fixtures/world';

async function setup(page: Page, edit: (state: GameState) => void = () => {}, fresh = false) {
  const save = worldFixture({ routeId: 'sunny' });
  let clock = worldEpoch;
  const initial = fresh ? createGame(save.state.id, worldEpoch, 4216) : save.state;
  edit(initial);
  const store = new GameStore(save.databasePath);
  store.transaction(() => store.saveGame(store.getGame(initial.id)!, initial, clock));
  const app = createApp({ databasePath: save.databasePath, now: () => clock });
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  await page.context().addCookies([{ name: 'shov_session', value: save.token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  return {
    ...save, origin,
    setClock: (value: number) => { clock = value; },
    change: (work: (state: GameState) => void) => store.transaction(() => {
      const saved = store.getGame(initial.id)!;
      const state = JSON.parse(saved.snapshot) as GameState;
      work(state);
      store.saveGame(saved, state, clock);
    }),
    close: async () => { await app.close(); store.close(); save.cleanup(); },
  };
}

async function backpack(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: 'Герой', exact: true }).click();
  await page.getByRole('navigation', { name: 'Разделы героя' }).getByRole('button', { name: 'Рюкзак', exact: true }).click();
}

test('a disappeared inspected item closes safely after the next state poll', async ({ page }) => {
  const fixture = await setup(page, state => {
    state.inventory.push({ id: 'disappearing-ring', name: 'Исчезающее кольцо', slot: 'ring', rarity: 'fine', level: 12, affixes: ['hp'] });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(fixture.origin);
    await backpack(page);
    await page.locator('.item-tile').filter({ hasText: 'Исчезающее кольцо' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    fixture.change(state => { state.inventory = state.inventory.filter(item => item.id !== 'disappearing-ring'); });
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('#inventory')).toBeVisible();
    await expect(page.getByRole('heading', { name: fixture.saved().name, exact: true })).toBeVisible();
    await expect(page.locator('.item-tile').filter({ hasText: 'Исчезающее кольцо' })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
});

test('unfinished introduction survives a reload after the first automatic victory', async ({ page }) => {
  const fixture = await setup(page, () => {}, true);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.origin);
    await expect(page.getByRole('heading', { name: 'Дорога приключений' })).toBeVisible();
    fixture.setClock(worldEpoch + 30_000);
    await expect.poll(() => fixture.saved().totals.wins, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.locator('.introduction')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Дорога приключений' })).toBeVisible();
    await expect(page.locator('canvas.battle-canvas')).toHaveCount(0);
    await page.getByRole('radio', { name: /Маг/ }).click();
    await page.getByRole('button', { name: 'В путь', exact: true }).click();
    await expect(page.locator('canvas.battle-canvas')).toBeVisible();
    expect(fixture.saved().pendingBuild?.equipment.weapon).toBe('item-9');
    await page.reload();
    await expect(page.locator('canvas.battle-canvas')).toBeVisible();
    await expect(page.locator('.introduction')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('keyboard focus stays in a busy salvage dialog when every button is disabled', async ({ page }) => {
  const fixture = await setup(page, state => {
    for (let index = 0; index < 3; index++) state.inventory.push({ id: `busy-ring-${index}`, name: `Кольцо ${index}`, slot: 'ring', rarity: 'fine', level: 12, affixes: ['hp'] });
  });
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  try {
    await page.route('**/api/command', async route => {
      if (route.request().postDataJSON()?.command?.type === 'dismantle') {
        intercepted = true;
        await pending;
      }
      await route.continue();
    });
    await page.goto(fixture.origin);
    await backpack(page);
    await page.getByRole('button', { name: /Разобрать все/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Разобрать предметы', exact: true });
    await dialog.getByRole('button', { name: 'Разобрать 3', exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Разобрать 3', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
    for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog).toHaveCount(0);
    expect(fixture.saved().inventory.some(item => item.id.startsWith('busy-ring-'))).toBe(false);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await fixture.close();
  }
});

test('stacked settings and return report trap focus only in the top dialog and restore scrolling after both close', async ({ page }) => {
  const fixture = await setup(page);
  try {
    await page.goto(fixture.origin);
    const originalOverflow = await page.evaluate(() => document.body.style.overflow);
    await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('dialog', { name: 'Настройки', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Имя героя', exact: true })).toBeEnabled();
    fixture.setClock(worldEpoch + 70_000);
    const dialogs = page.locator('.game-dialog');
    await expect(dialogs).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: 'Отчёт о путешествии', exact: true })).toBeAttached();
    const top = dialogs.last();
    const focusedControls: string[] = [];
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab');
      await expect.poll(() => top.evaluate(element => element.contains(document.activeElement))).toBe(true);
      focusedControls.push(await page.evaluate(() => document.activeElement?.outerHTML ?? ''));
    }
    expect(new Set(focusedControls).size).toBeGreaterThan(2);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'Отчёт о путешествии', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Tab');
    await expect.poll(() => dialogs.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
  } finally { await fixture.close(); }
});
