import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { createAdminApp } from './admin.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const mode = process.env.APP_MODE ?? 'local';
if (mode !== 'local' && mode !== 'telegram') throw new Error('APP_MODE must be local or telegram.');
const host = process.env.SERVER_HOST ?? process.env.HOST ?? '127.0.0.1';
if (mode === 'local' && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Local mode must bind to a loopback address. Use APP_MODE=telegram for a public deployment.');
}
const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SERVER_PORT must be a valid port.');

const adminOrigin = process.env.ADMIN_ORIGIN;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
if (Boolean(adminOrigin) !== Boolean(adminPasswordHash)) throw new Error('Set both ADMIN_ORIGIN and ADMIN_PASSWORD_HASH to enable administration.');
const adminPort = Number(process.env.ADMIN_PORT ?? 3002);
if (adminOrigin && (!Number.isInteger(adminPort) || adminPort < 1 || adminPort > 65535 || adminPort === port)) throw new Error('ADMIN_PORT must be valid and different from SERVER_PORT.');
if (adminOrigin && process.env.APP_ORIGIN && new URL(adminOrigin).origin === new URL(process.env.APP_ORIGIN).origin) throw new Error('Administration must use a separate origin.');

const app = createApp({ mode, databasePath: process.env.DATABASE_PATH });
const admin = adminOrigin && adminPasswordHash ? createAdminApp({
  databasePath: process.env.DATABASE_PATH ?? 'data/shov.sqlite',
  origin: adminOrigin,
  passwordHash: adminPasswordHash,
  trustedProxy: process.env.TRUSTED_PROXY,
  secureCookies: mode !== 'local',
}) : undefined;

try {
  const address = await app.listen({ host, port });
  console.log(`SHOV server: ${address} (${mode})`);
  if (admin) {
    const adminAddress = await admin.listen({ host, port: adminPort });
    console.log(`SHOV administration: ${adminAddress}`);
  }
} catch (error) {
  await Promise.allSettled([app.close(), admin?.close()]);
  throw error;
}

async function shutdown() { await Promise.all([app.close(), admin?.close()]); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
