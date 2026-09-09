import { existsSync } from 'node:fs';
import { createApp } from './app.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const mode = process.env.APP_MODE ?? 'local';
if (mode !== 'local' && mode !== 'telegram') throw new Error('APP_MODE must be local or telegram.');
const host = process.env.SERVER_HOST ?? process.env.HOST ?? '127.0.0.1';
if (mode === 'local' && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Local mode must bind to a loopback address. Use APP_MODE=telegram for a public deployment.');
}
const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SERVER_PORT must be a valid port.');

const app = createApp({ mode, databasePath: process.env.DATABASE_PATH });
const address = await app.listen({ host, port });
console.log(`SHOV server: ${address} (${mode})`);

async function shutdown() { await app.close(); }
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
