import sharp from 'sharp';
import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Explicit source manifest only. This never invokes the old procedural art generator.
const root = resolve(import.meta.dirname, '..');
const delivery = resolve(root, 'assets/art-audio-v1');
const input = JSON.parse(await readFile(process.argv[2] || resolve(delivery, 'generation-inputs.json'), 'utf8'));
const backgrounds = new Set(['terraces', 'glassgarden', 'carmine']);
const hovering = new Set(['splinter', 'rose', 'chime', 'dewsplinter', 'redshard', 'scarletshard']);
const entries = [];
await mkdir(resolve(delivery, 'sources/graphics'), { recursive: true });
await mkdir(resolve(root, 'public/art/enemies'), { recursive: true });

for (const asset of input) {
  const source = resolve(root, asset.path);
  const bg = backgrounds.has(asset.id);
  const icon = asset.id.startsWith('item-') || asset.id === 'emblem';
  const hero = asset.id.startsWith('hero-');
  const width = bg ? 1200 : icon ? 128 : 256;
  const height = bg ? 600 : icon ? 128 : 320;
  const exportPath = `public/art/${bg || icon || hero ? '' : 'enemies/'}${asset.id}.png`;
  const masterPath = `assets/art-audio-v1/sources/graphics/${asset.id}.png`;
  if (source !== resolve(root, masterPath)) await copyFile(source, resolve(root, masterPath));
  let output;
  if (bg) {
    const quantized = await sharp(source).resize(width, height, { fit: 'fill' }).png({ palette: true, colours: 256, dither: 0.5 }).toBuffer();
    output = await sharp(quantized).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
  }
  else {
    const meta = await sharp(source).metadata();
    if (!meta.hasAlpha) throw new Error(`Rejecting opaque sprite: ${asset.id}`);
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = 0, bottom = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 16) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (left > right) throw new Error(`Empty sprite: ${asset.id}`);
    const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
    const maxWidth = icon ? 106 : 238, maxHeight = icon ? 106 : hovering.has(asset.id) ? 236 : 278;
    const ratio = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
    const w = Math.round(bounds.width * ratio), h = Math.round(bounds.height * ratio);
    const pixels = await sharp(source).extract(bounds).resize(w, h).png().toBuffer();
    const y = icon ? Math.floor((height - h) / 2) : hovering.has(asset.id) ? 269 - h : 299 - h;
    output = await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
      .composite([{ input: pixels, left: Math.floor((width - w) / 2), top: y }]).png({ compressionLevel: 9 }).toBuffer();
  }
  await writeFile(resolve(root, exportPath), output);
  const assetId = bg ? `background.${asset.id}` : hero ? asset.id.replace('-', '.') : icon ? asset.id.replaceAll('-', '.') : `enemy.${asset.id}`;
  entries.push({ assetId, revision: 1, status: 'integrated', exports: [{ path: exportPath, width, height, bytes: output.length, sha256: createHash('sha256').update(output).digest('hex') }], transparency: !bg, source: masterPath, prompt: asset.prompt, seed: 'unavailable', model: 'built-in imagegen; exact model/version unavailable', created: '2026-09-09', license: 'OpenAI output; see licenses.csv' });
}
const aliases = { 'enemy-sentinel': 'enemies/porcelain', 'enemy-shard': 'enemies/splinter', 'enemy-weaver': 'enemies/loom', 'enemy-boss': 'enemies/cantor', 'item-weapon': 'item-weapon-blade' };
for (const [alias, target] of Object.entries(aliases)) {
  try {
    await copyFile(resolve(root, `public/art/${target}.png`), resolve(root, `public/art/${alias}.png`));
    const data = await readFile(resolve(root, `public/art/${alias}.png`));
    entries.push({ assetId: alias.replaceAll('-', '.'), revision: 1, status: 'integrated', aliasOf: target, exports: [{ path: `public/art/${alias}.png`, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length }] });
  } catch (error) { if (process.env.ART_PARTIAL !== '1') throw error; }
}
await writeFile(resolve(delivery, 'manifest.json'), JSON.stringify({ schema: 'shov.delivery.v1', revision: 1, assets: entries }, null, 2) + '\n');
await writeFile(resolve(delivery, 'generation-inputs.json'), JSON.stringify(input.map(a => ({ ...a, path: `assets/art-audio-v1/sources/graphics/${a.id}.png` })), null, 2) + '\n');
console.log(`Prepared ${entries.length} PNG exports. Total ${(entries.reduce((sum, a) => sum + a.exports[0].bytes, 0) / 1024).toFixed(0)} KiB.`);
