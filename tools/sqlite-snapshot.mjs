import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

function assertUnusedTarget(target) {
  for (const path of [target, `${target}-wal`, `${target}-shm`, `${target}-journal`]) {
    if (existsSync(path)) throw new Error(`Destination already exists: ${path}. Choose a new database path.`);
  }
}

export function verifyDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed.');
    if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) throw new Error('SQLite foreign key check failed.');
  } finally { db.close(); }
}

export async function snapshotDatabase(sourcePath, targetPath) {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (source === target) throw new Error('Source and destination must be different paths.');
  if (!existsSync(source)) throw new Error(`Source database does not exist: ${source}`);
  assertUnusedTarget(target);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const stagingDirectory = mkdtempSync(join(dirname(target), '.shov-snapshot-'));
  const stagingFile = join(stagingDirectory, 'snapshot.sqlite');
  let db;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 5000');
    await backup(db, stagingFile);
    db.close();
    db = undefined;
    // Publish only a checked, flushed snapshot; hard-link creation never replaces an existing file.
    verifyDatabase(stagingFile);
    chmodSync(stagingFile, 0o600);
    const descriptor = openSync(stagingFile, 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    assertUnusedTarget(target);
    linkSync(stagingFile, target);
    return target;
  } finally {
    db?.close();
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}
