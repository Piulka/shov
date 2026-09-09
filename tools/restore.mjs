import { snapshotDatabase } from './sqlite-snapshot.mjs';

async function main() {
  if (process.argv.length !== 4) throw new Error('Usage: node tools/restore.mjs backup.sqlite new-database.sqlite');
  const restored = await snapshotDatabase(process.argv[2], process.argv[3]);
  console.log(JSON.stringify({ ok: true, restored, note: 'Stop the app before switching DATABASE_PATH to this file.' }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Restore failed.');
  process.exitCode = 1;
});
