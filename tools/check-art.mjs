import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const qa = resolve(root, 'assets/art-audio-v1/qa');
await mkdir(qa, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'assets/art-audio-v1/manifest.json'), 'utf8'));
const files = manifest.assets.flatMap(a => a.exports.map(e => ({ ...e, assetId: a.assetId })));
assert.equal(files.length, 43, '20 compatible PNGs plus two backgrounds and 21 enemy IDs');
assert.equal(new Set(files.map(f => f.path)).size, 43);
const rows = [];
for (const file of files) {
  const png = await readFile(resolve(root, file.path));
  assert.equal(createHash('sha256').update(png).digest('hex'), file.sha256);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png'); assert.equal(meta.space, 'srgb'); assert.ok(meta.hasAlpha);
  const bg = /\/(terraces|glassgarden|carmine)\.png$/.test(file.path);
  const icon = /\/(item-|emblem)/.test(file.path);
  assert.equal(meta.width, bg ? 1200 : icon ? 128 : 256);
  assert.equal(meta.height, bg ? 600 : icon ? 128 : 320);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonempty = 0, edgeAlpha = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (alpha > 16) nonempty++;
    if (x < 8 || y < 8 || x >= info.width - 8 || y >= info.height - 8) edgeAlpha = Math.max(edgeAlpha, alpha);
  }
  assert.ok(nonempty > 100);
  if (!bg) assert.ok(edgeAlpha < 20, `Safe transparent margins: ${file.path}`);
  const budgetBytes = (bg ? 500 : icon ? 40 : 150) * 1024;
  if (png.length > budgetBytes) console.warn(`Planning budget exceeded: ${file.path} (${Math.ceil(png.length / 1024)} KiB); loaded on demand.`);
  rows.push({ path: file.path, bytes: png.length, budgetBytes, exceedsPlanningBudget: png.length > budgetBytes, dimensions: `${meta.width}x${meta.height}`, safeAlpha: !bg ? edgeAlpha : null });
}
// Technical contact sheets use real game exports; they are not substitute assets.
const actors = files.filter(f => /\/hero-|\/enemies\//.test(f.path));
const icons = files.filter(f => /\/item-|\/emblem/.test(f.path));
const label = (text, width) => Buffer.from(`<svg width="${width}" height="24"><text x="8" y="16" font-size="12" font-family="sans-serif" fill="#ddd">${text}</text></svg>`);
const layers = [];
for (let i = 0; i < actors.length; i++) {
  const x = (i % 6) * 180, y = Math.floor(i / 6) * 250;
  layers.push({ input: await sharp(resolve(root, actors[i].path)).resize(176, 220).toBuffer(), left: x + 2, top: y + 24 });
  layers.push({ input: label(actors[i].assetId, 180), left: x, top: y });
}
await sharp({ create: { width: 1080, height: Math.ceil(actors.length / 6) * 250, channels: 4, background: '#202b2a' } }).composite(layers).png().toFile(resolve(qa, 'actors-contact.png'));
const iconLayers = [];
for (let i = 0; i < icons.length; i++) for (const [j, size] of [32, 40, 50, 64].entries()) iconLayers.push({ input: await sharp(resolve(root, icons[i].path)).resize(size, size).toBuffer(), left: i * 76 + Math.floor((76 - size) / 2), top: j * 80 + 8 });
await sharp({ create: { width: icons.length * 76, height: 320, channels: 4, background: '#f2f5f3' } }).composite(iconLayers).png().toFile(resolve(qa, 'icons-sizes.png'));
const alphaLayers = [];
for (let i = 0; i < 3; i++) {
  alphaLayers.push({ input: await sharp({ create: { width: 768, height: 320, channels: 4, background: ['#f2f5f3', '#bc4d63', '#111817'][i] } }).png().toBuffer(), left: 0, top: i * 320 });
  for (const [j, name] of ['hero-blade', 'hero-glass', 'hero-needle'].entries()) alphaLayers.push({ input: resolve(root, `public/art/${name}.png`), left: j * 256, top: i * 320 });
}
await sharp({ create: { width: 768, height: 960, channels: 4, background: '#202b2a' } }).composite(alphaLayers).png().toFile(resolve(qa, 'alpha-check.png'));
await writeFile(resolve(qa, 'art-validation.json'), JSON.stringify({ passed: true, pngCount: files.length, totalBytes: rows.reduce((sum, r) => sum + r.bytes, 0), files: rows }, null, 2) + '\n');
console.log(`Validated ${files.length} PNGs: hashes, dimensions, sRGB, alpha margins; reported planning budgets; generated QA sheets.`);
