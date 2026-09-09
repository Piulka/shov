import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { snapshotDatabase } from './sqlite-snapshot.mjs';

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (process.argv.length > 4) throw new Error('Usage: node tools/backup.mjs [source.sqlite] [new-backup.sqlite]');
  const source = process.argv[2] ?? process.env.DATABASE_PATH ?? 'data/shov.sqlite';
  const name = `shov-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.sqlite`;
  const target = process.argv[3] ?? resolve(process.env.BACKUP_DIR ?? '.local/backups', name);
  console.log(JSON.stringify({ ok: true, backup: await snapshotDatabase(source, target) }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Backup failed.');
  process.exitCode = 1;
});
