import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

async function main() {
  if (process.argv.length !== 4) throw new Error('Usage: node tools/admin-credentials.mjs https://admin.example.com .local/admin-access.json');
  const origin = new URL(process.argv[2]);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Provide the public HTTPS admin origin.');
  const path = resolve(process.argv[3]);
  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  const credentials = { url: origin.origin, password, passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`, createdAt: new Date().toISOString() };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Created private admin credentials: ${path}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Credential generation failed.'); process.exitCode = 1; });
