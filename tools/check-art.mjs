import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { catalog, families, slots } from '../shared/content.ts';

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

// The active fantasy pack is independent of the preserved first-release art.
const fantasyQa = resolve(root, '.local/art-fantasy-qa');
await mkdir(fantasyQa, { recursive: true });
const fantasy = JSON.parse(await readFile(resolve(root, 'public/art/fantasy/manifest.json'), 'utf8'));
assert.equal(fantasy.schema, 'shov.fantasy.static.v1');
assert.ok(Number.isInteger(fantasy.revision) && fantasy.revision > 0);
const expected = new Map();
const expectAsset = (id, name, width, height, transparent = true) => expected.set(id, { path: `/art/fantasy/${name}.png`, width, height, transparent });
for (const region of catalog.regions) {
  expectAsset(`background.${region.id}`, region.id, 1200, 600, false);
  assert.equal(region.image, `/art/fantasy/${region.id}.png`, `Active background for ${region.id}`);
}
for (const family of families) expectAsset(`hero.${family}`, `hero-${family}`, 256, 320);
for (const enemy of catalog.enemies) expectAsset(`enemy.${enemy.id}`, `enemies/${enemy.id}`, 256, 320);
for (const kind of new Set(catalog.enemies.map(enemy => enemy.kind))) expectAsset(`enemy.fallback.${kind}`, `enemy-${kind}`, 256, 320);
for (const name of [...slots, ...families.map(family => `weapon-${family}`)]) expectAsset(`item.${name}`, `item-${name}`, 128, 128);
expectAsset('emblem', 'emblem', 128, 128);
assert.ok(Array.isArray(fantasy.assets));
assert.equal(fantasy.assets.length, expected.size, 'Every active catalog image has a manifest entry');
assert.equal(new Set(fantasy.assets.map(asset => asset.assetId)).size, expected.size, 'Unique active asset IDs');
assert.equal(new Set(fantasy.assets.map(asset => asset.path)).size, expected.size, 'Unique active file paths');
const fantasyRows = [];
for (const asset of fantasy.assets) {
  const contract = expected.get(asset.assetId);
  assert.ok(contract, `Known asset ID: ${asset.assetId}`);
  for (const field of ['path', 'width', 'height', 'transparent']) assert.equal(asset[field], contract[field], `${asset.assetId}: ${field}`);
  const png = await readFile(resolve(root, `public${asset.path}`));
  assert.equal(png.length, asset.bytes, `Manifest byte count: ${asset.path}`);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update(png).digest('hex'), asset.sha256, `Manifest hash: ${asset.path}`);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.space, 'srgb');
  assert.ok(meta.hasAlpha);
  assert.equal(meta.width, contract.width);
  assert.equal(meta.height, contract.height);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonempty = 0, edgeAlpha = 0, minAlpha = 255;
  const colors = new Set();
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * 4;
    const alpha = data[index + 3];
    minAlpha = Math.min(minAlpha, alpha);
    if (alpha > 16) nonempty++;
    if (alpha > 240) colors.add((data[index] << 16) | (data[index + 1] << 8) | data[index + 2]);
    if (x < 8 || y < 8 || x >= info.width - 8 || y >= info.height - 8) edgeAlpha = Math.max(edgeAlpha, alpha);
  }
  assert.ok(nonempty > 200 && colors.size > 8, `Nonblank illustrated image: ${asset.path}`);
  if (contract.transparent) {
    assert.equal(minAlpha, 0, `Real transparent background: ${asset.path}`);
    assert.ok(edgeAlpha <= 16, `Safe transparent 8px margin: ${asset.path}`);
  } else assert.equal(minAlpha, 255, `Opaque landscape: ${asset.path}`);
  const budgetBytes = (contract.width === 1200 ? 500 : contract.width === 128 ? 40 : 150) * 1024;
  if (png.length > budgetBytes) console.warn(`Fantasy planning budget exceeded: ${asset.path} (${Math.ceil(png.length / 1024)} KiB).`);
  fantasyRows.push({ path: asset.path, bytes: png.length, width: meta.width, height: meta.height, safeMarginAlpha: contract.transparent ? edgeAlpha : null, opaqueColors: colors.size, exceedsPlanningBudget: png.length > budgetBytes });
}
const activeIcons = fantasy.assets.filter(asset => asset.assetId.startsWith('item.') || asset.assetId === 'emblem');
const activeIconLayers = [];
for (const [i, asset] of activeIcons.entries()) for (const [j, size] of [32, 40, 50, 64].entries()) activeIconLayers.push({ input: await sharp(resolve(root, `public${asset.path}`)).resize(size, size).toBuffer(), left: i * 76 + Math.floor((76 - size) / 2), top: j * 80 + 8 });
await sharp({ create: { width: activeIcons.length * 76, height: 320, channels: 4, background: '#eaf0f3' } }).composite(activeIconLayers).png().toFile(resolve(fantasyQa, 'icons-sizes.png'));
const activeAlphaLayers = [];
for (const [i, background] of ['#f2f5f3', '#bc4d63', '#111817'].entries()) {
  activeAlphaLayers.push({ input: await sharp({ create: { width: 768, height: 320, channels: 4, background } }).png().toBuffer(), left: 0, top: i * 320 });
  for (const [j, family] of families.entries()) activeAlphaLayers.push({ input: resolve(root, `public/art/fantasy/hero-${family}.png`), left: j * 256, top: i * 320 });
}
await sharp({ create: { width: 768, height: 960, channels: 4, background: '#202b2a' } }).composite(activeAlphaLayers).png().toFile(resolve(fantasyQa, 'alpha-check.png'));
await writeFile(resolve(fantasyQa, 'release-validation.json'), `${JSON.stringify({ passed: true, pngCount: fantasyRows.length, totalBytes: fantasyRows.reduce((sum, row) => sum + row.bytes, 0), files: fantasyRows }, null, 2)}\n`);
console.log(`Validated ${fantasyRows.length} active fantasy PNGs: catalog coverage, exact paths, hashes, byte counts, dimensions, sRGB, opacity/alpha margins and nonblank pixels; generated icon and alpha sheets.`);
