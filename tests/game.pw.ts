import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { GameView } from "../shared/types";
import { catalog } from '../shared/content';
import { chapterTasks } from '../shared/chapter';

async function enterJourney(page: Page) {
  const begin = page.getByRole('button', { name: 'В путь', exact: true });
  await expect(page.locator('canvas.battle-canvas').or(begin)).toBeVisible();
  if (await begin.isVisible()) await begin.click();
  await expect(page.locator('canvas.battle-canvas')).toBeVisible();
}

async function state(page: Page): Promise<GameView> {
  return page.evaluate(async () => (await fetch("/api/state")).json());
}
async function noOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    offenders: Array.from(document.querySelectorAll('main *')).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.right > innerWidth + 1;
    }).slice(0, 5).map(element => element.className),
  }));
  expect(result.width, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 1);
}
async function commandResponse(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/command") &&
      r.request().method() === "POST" &&
      r.status() !== 409,
  );
  await action();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  return result.json() as Promise<GameView>;
}
async function firstVictory(page: Page) {
  await expect(page.locator('.chapter-current h3')).toHaveText('Крепкая основа', { timeout: 25000 });
}

test("desktop: rendered moving scene, equipment, tactics, upgrade, crafting, persistence", async ({
  page,
}) => {
  await mkdir(".local/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await enterJourney(page);
  await expect(
    page.getByRole("heading", { name: "Путь продолжается" }),
  ).toBeVisible();
  await expect(page.locator("canvas.battle-canvas")).toBeVisible();
  await firstVictory(page);
  await expect
    .poll(() =>
      page
        .locator("canvas.battle-canvas")
        .evaluate((canvas: HTMLCanvasElement) => {
          const { width, height } = canvas;
          const pixels = canvas
            .getContext("2d")!
            .getImageData(0, 0, width, height).data;
          const colors = new Set<number>();
          for (let i = 0; i < pixels.length; i += 100)
            colors.add(
              (pixels[i] << 16) + (pixels[i + 1] << 8) + pixels[i + 2],
            );
          return colors.size;
        }),
    )
    .toBeGreaterThan(100);
  const before = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toBe(before);
  await page.screenshot({
    path: ".local/screenshots/desktop-journey.png",
    fullPage: true,
  });
  await noOverflow(page);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Герой", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Рюкзак" })).toBeVisible();
  const start = await state(page);
  expect(start.state.level).toBe(1);
  expect(start.state.chapter.completed).toEqual(['first_win']);
  const alternate = start.state.inventory.find(
    (item) => item.family === "needle",
  )!;
  await page
    .locator(".inventory-grid .item-tile")
    .filter({ hasText: alternate.name })
    .first()
    .click();
  const equipped = await commandResponse(page, () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Надеть", exact: true })
      .click(),
  );
  expect(
    (equipped.state.pendingBuild || equipped.state.build).equipment.weapon,
  ).toBe(alternate.id);
  await page.getByLabel("Условие 1", { exact: true }).selectOption("no_shield");
  const edited = await commandResponse(page, () =>
    page.getByRole("button", { name: "Применить", exact: true }).click(),
  );
  expect(
    (edited.state.pendingBuild || edited.state.build).rules[0].condition,
  ).toBe("no_shield");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/screenshots/desktop-hero.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Проверить сборку", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Проверка сборки" }),
  ).toBeVisible();
  await expect(page.getByText(/Средний остаток здоровья:/)).toContainText(
    /(?:100|\d{1,2})%/,
  );
  await expect(page.getByRole('region', { name: 'Прогноз добычи' })).toContainText('Опыт / час');
  await expect(page.getByRole('region', { name: 'Прогноз добычи' }).locator('dd')).toHaveText(['50', '1', '900', '0', '48']);
  await page.keyboard.press("Escape");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Мастерская", exact: true })
    .click();
  const upgraded = await commandResponse(page, () =>
    page.getByRole("button", { name: "Усилить", exact: true }).click(),
  );
  expect(upgraded.state.upgrades.weapon).toBe(start.state.upgrades.weapon + 1);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const crafted = await commandResponse(page, () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Создать предмет", exact: true })
      .click(),
  );
  expect(crafted.state.inventory.length).toBeGreaterThan(
    start.state.inventory.length,
  );
  const craftedItem = crafted.state.inventory.at(-1)!;
  await page.screenshot({
    path: ".local/screenshots/desktop-workshop.png",
    fullPage: true,
  });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Герой", exact: true })
    .click();
  await page.locator(".inventory-grid .item-tile").filter({ hasText: craftedItem.name }).first().click();
  await commandResponse(page, () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Защитить", exact: true })
      .click(),
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Разобрать", exact: true }),
  ).toBeDisabled();
  await commandResponse(page, () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Защищено", exact: true })
      .click(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Разобрать", exact: true })
    .click();
  const dismantled = await commandResponse(page, () =>
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Подтвердить разбор", exact: true })
      .click(),
  );
  expect(
    dismantled.state.inventory.some((item) => item.id === craftedItem.id),
  ).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Путь продолжается" }),
  ).toBeVisible();
  const restored = await state(page);
  expect(restored.state.id).toBe(start.state.id);
  expect(restored.state.upgrades.weapon).toBe(upgraded.state.upgrades.weapon);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Карта мира", exact: true })
    .click();
  const targeted = await commandResponse(page, () =>
    page.getByLabel("Целевой слот добычи").selectOption("ring"),
  );
  expect(targeted.state.chapter.completed).toEqual(expect.arrayContaining(['first_win', 'upgrade', 'craft', 'equip', 'tactics', 'target']));
  expect(targeted.state.chapter.completed).not.toContain('level10');
  await expect(page.locator('.route-row.locked').first()).toContainText('Уровень 1 / 10');
  await page.screenshot({
    path: ".local/screenshots/desktop-map.png",
    fullPage: true,
  });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("mobile: all views fit and loaded artwork remains visible", async ({
  page,
}) => {
  await mkdir(".local/screenshots", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await enterJourney(page);
  await expect(
    page.getByRole("heading", { name: "Путь продолжается" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Array.from(document.images).filter(
            (image) => !image.complete || image.naturalWidth === 0,
          ).length,
      ),
    )
    .toBe(0);
  await page.screenshot({
    path: ".local/screenshots/mobile-journey.png",
    fullPage: true,
  });
  for (const width of [390, 360, 320, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, screen] of [
      ["Путь", "journey"],
      ["Герой", "hero"],
      ["Мастерская", "workshop"],
      ["Карта", "map"],
      ["Клан", "clan-locked"],
    ]) {
      await page
        .locator(width > 900 ? ".sidebar" : ".mobile-nav")
        .getByRole("button", { name: width > 900 ? name === 'Путь' ? 'Путешествие' : name === 'Карта' ? 'Карта мира' : name : name, exact: true })
        .click();
      await noOverflow(page);
      if (width === 390)
        await page.screenshot({
          path: `.local/screenshots/mobile-${screen}.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Путь", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Настройки", exact: true })
    .filter({ visible: true })
    .click();
  const reduced = page.getByRole("checkbox", { name: /Спокойная анимация/ });
  await reduced.check();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => localStorage.getItem("shov-reduced-motion")),
  ).toBe("true");
});

test('a command waits for an in-flight state poll instead of disappearing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await enterJourney(page);
  await expect(page.getByRole('heading', { name: 'Путь продолжается' })).toBeVisible();
  await firstVictory(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Мастерская', exact: true }).click();
  let beginPoll: () => void;
  const polling = new Promise<void>(resolve => { beginPoll = resolve; });
  await page.route('**/api/state', async route => {
    beginPoll();
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await polling;
  const result = await commandResponse(page, () => page.getByRole('button', { name: 'Усилить', exact: true }).click());
  expect(result.state.upgrades.weapon).toBe(1);
});

test('mobile chapter objectives navigate to real actions and higher-level skills stay locked', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await enterJourney(page);
  await expect(page.getByRole('heading', { name: 'Первые шаги' })).toBeVisible();
  await page.locator('.chapter-list summary').click();
  await expect(page.locator('.chapter-list li')).toHaveCount(7);
  await noOverflow(page);
  await page.screenshot({ path: '.local/screenshots/mobile-chapter.png', fullPage: true });
  const tactics = chapterTasks.find(task => task.id === 'tactics')!;
  const counter = catalog.skills.find(skill => skill.id === 'counter')!;
  await page.getByRole('button', { name: `${tactics.action}: ${tactics.title}`, exact: true }).click();
  await expect(page.getByLabel('Умение 1', { exact: true }).getByRole('option', { name: `${counter.name} · ур. ${counter.unlockLevel}`, exact: true })).toHaveJSProperty('disabled', true);
  await expect(page.locator('.skill-unlock')).toContainText(`Уровень ${counter.unlockLevel}: ${counter.name}`);
  await noOverflow(page);
  await page.locator('.mobile-nav').getByRole('button', { name: 'Путь', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Опыт героя' })).toBeVisible();
});
