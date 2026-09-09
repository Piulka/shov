import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const qa = '.local/screenshots/fantasy-art';

test('art: responsive scene, map and equipment remain visible', async ({ page }) => {
  const errors: string[] = [];
  const missing: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/art/') && !response.ok()) missing.push(response.url()); });
  await mkdir(qa, { recursive: true });
  await page.goto('/');
  const begin = page.getByRole('button', { name: 'В путь', exact: true });
  await expect(page.locator('canvas.battle-canvas').or(begin)).toBeVisible();
  if (await begin.isVisible()) await begin.click();
  await expect(page.locator('canvas.battle-canvas')).toBeVisible();
  await expect.poll(() => page.locator('canvas.battle-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const values = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let filled = 0;
    for (let i = 3; i < values.length; i += 400) if (values[i]) filled++;
    return filled;
  })).toBeGreaterThan(100);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.battle-stage').screenshot({ path: `${qa}/scene-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  }
  await page.locator('.sidebar').getByRole('button', { name: 'Карта мира', exact: true }).click();
  await page.screenshot({ path: `${qa}/map-desktop.png`, fullPage: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Герой', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Рюкзак' })).toBeVisible();
  await page.screenshot({ path: `${qa}/equipment-desktop.png`, fullPage: true });
  expect(missing).toEqual([]); expect(errors).toEqual([]);
});

test('audio: explicit enable, actual buffer playback, mute persistence and lifecycle', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { starts: 0, stops: 0, resumes: 0, suspends: 0 };
    Object.assign(window, { audioProbe: probe });
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    const resume = AudioContext.prototype.resume, suspend = AudioContext.prototype.suspend;
    AudioBufferSourceNode.prototype.start = function (...args) { probe.starts++; return start.apply(this, args); };
    AudioBufferSourceNode.prototype.stop = function (...args) { probe.stops++; return stop.apply(this, args); };
    AudioContext.prototype.resume = function () { probe.resumes++; return resume.call(this); };
    AudioContext.prototype.suspend = function () { probe.suspends++; return suspend.call(this); };
  });
  const probe = () => page.evaluate(() => (window as unknown as { audioProbe: { starts: number; stops: number; resumes: number; suspends: number } }).audioProbe);
  await page.goto('/');
  const begin = page.getByRole('button', { name: 'В путь', exact: true });
  await expect(page.locator('canvas.battle-canvas').or(begin)).toBeVisible();
  if (await begin.isVisible()) await begin.click();
  await expect(page.locator('canvas.battle-canvas')).toBeVisible();
  expect((await probe()).starts).toBe(0);
  expect((await probe()).resumes).toBe(0);
  await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
  const toggle = page.getByRole('checkbox', { name: /Звуки игры/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(async () => (await probe()).starts).toBeGreaterThan(0);
  await page.getByRole('slider', { name: /Эффекты/ }).fill('27');
  await page.getByRole('slider', { name: /Музыка/ }).fill('18');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await probe()).suspends).toBeGreaterThan(0);
  const hiddenStarts = (await probe()).starts;
  // This advances through real browser scheduling while the game is hidden.
  await page.waitForTimeout(700);
  expect((await probe()).starts).toBe(hiddenStarts);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await probe()).resumes).toBeGreaterThan(1);
  await toggle.uncheck();
  const mutedStarts = (await probe()).starts;
  await page.waitForTimeout(700);
  expect((await probe()).starts).toBe(mutedStarts);
  expect((await probe()).stops).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('checkbox', { name: /Звуки игры/ })).not.toBeChecked();
  await expect(page.getByRole('slider', { name: /Эффекты/ })).toHaveValue('27');
  await expect(page.getByRole('slider', { name: /Музыка/ })).toHaveValue('18');
  await mkdir('.local/screenshots/fantasy-audio', { recursive: true });
  await page.screenshot({ path: '.local/screenshots/fantasy-audio/audio-settings.png' });
});

test('audio: fantasy sources decode and exactly three regional music loops have valid bounds', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const manifest = await (await fetch('/audio/audio.json')).json();
    const context = new AudioContext();
    const results: { id: string; source: string; duration?: number; error?: string }[] = [];
    for (const asset of manifest.assets) for (const source of asset.sources) {
      try {
        const response = await fetch(`/audio/${source.src}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (asset.loop && Math.abs(buffer.duration - asset.loop.endSample / asset.sampleRate) > 0.1) throw new Error('Invalid loop duration');
        results.push({ id: asset.assetId, source: source.src, duration: buffer.duration });
      } catch (error) { results.push({ id: asset.assetId, source: source.src, error: String(error) }); }
    }
    await context.close();
    return { results, assetCount: manifest.assets.length, music: manifest.assets.filter((asset: { bus: string }) => asset.bus === 'music').map((asset: { assetId: string }) => asset.assetId), ambience: manifest.assets.filter((asset: { bus: string }) => asset.bus === 'ambience').length };
  });
  expect(results.assetCount).toBe(52);
  expect(results.results.length).toBeGreaterThanOrEqual(52);
  expect(results.music).toEqual(['music.terraces', 'music.glassgarden', 'music.carmine']);
  expect(results.ambience).toBe(0);
  expect(results.results.every(result => result.source.startsWith('fantasy/'))).toBe(true);
  expect(results.results.filter(result => result.error), JSON.stringify(results.results.filter(result => result.error))).toEqual([]);
});
