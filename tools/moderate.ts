import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GameStore } from '../server/store.ts';
import { moderate } from '../server/moderation.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const [action = 'reports', target = '', ...words] = process.argv.slice(2);
if (!['reports', 'block', 'unblock', 'delete-message', 'resolve'].includes(action)) {
  console.error('Usage: npm run moderate -- reports | block ACCOUNT_ID REASON | unblock ACCOUNT_ID REASON | delete-message REPORT_ID REASON | resolve REPORT_ID REASON');
  process.exit(1);
}
const path = resolve(process.env.DATABASE_PATH || 'data/shov.sqlite');
if (!existsSync(path)) throw new Error('Database does not exist. Refusing to create an empty database.');
const store = new GameStore(path);
try {
  console.log(JSON.stringify(moderate(store, action as Parameters<typeof moderate>[1], target, words.join(' '), Date.now()), null, 2));
} finally { store.close(); }
