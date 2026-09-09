import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
const databases: DatabaseSync[] = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'shov-deploy-'));
  directories.push(directory);
  const source = join(directory, 'live.sqlite');
  const db = new DatabaseSync(source);
  databases.push(db);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE accounts (id TEXT PRIMARY KEY, coins INTEGER NOT NULL);
    CREATE TABLE ledger (account_id TEXT REFERENCES accounts(id), amount INTEGER NOT NULL);
    INSERT INTO accounts VALUES ('telegram:42', 1700);
    INSERT INTO ledger VALUES ('telegram:42', 1700);
  `);
  return { directory, source, db, target: join(directory, 'backup.sqlite') };
}

function run(script: 'backup' | 'restore', ...args: string[]) {
  return spawnSync(process.execPath, [`tools/${script}.mjs`, ...args], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
}

function inspect(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    return db.prepare('SELECT coins FROM accounts WHERE id = ?').get('telegram:42')?.coins;
  } finally { db.close(); }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('deployment database recovery tools', () => {
  it('backs up committed WAL records while the original database remains open and restores an independent snapshot', () => {
    const { source, target, directory, db } = fixture();
    expect(existsSync(`${source}-wal`)).toBe(true);
    const copied = run('backup', source, target);
    expect(copied.status, copied.stderr).toBe(0);
    expect(JSON.parse(copied.stdout).ok).toBe(true);
    expect(inspect(target)).toBe(1700);
    db.exec("UPDATE accounts SET coins = 900 WHERE id = 'telegram:42'");
    const restored = join(directory, 'restored', 'game.sqlite');
    const result = run('restore', target, restored);
    expect(result.status, result.stderr).toBe(0);
    expect(inspect(restored)).toBe(1700);
    expect(inspect(source)).toBe(900);
  });

  it.each(['backup', 'restore'] as const)('%s refuses to overwrite an existing destination', script => {
    const { source, target } = fixture();
    const original = Buffer.from('existing destination must survive');
    writeFileSync(target, original);
    const result = run(script, source, target);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Destination already exists');
    expect(readFileSync(target)).toEqual(original);
    expect(inspect(source)).toBe(1700);
  });

  it('does not copy a transaction that is still in progress in the application', () => {
    const { source, target, db } = fixture();
    db.exec("BEGIN IMMEDIATE; UPDATE accounts SET coins = 50 WHERE id = 'telegram:42'");
    try {
      const result = run('backup', source, target);
      expect(result.status, result.stderr).toBe(0);
      expect(inspect(target)).toBe(1700);
    } finally { db.exec('ROLLBACK'); }
    expect(inspect(source)).toBe(1700);
  });

  it('refuses a destination with orphaned SQLite sidecars', () => {
    const { source, target } = fixture();
    writeFileSync(`${target}-wal`, 'orphaned transaction data');
    const result = run('restore', source, target);
    expect(result.status).toBe(1);
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(`${target}-wal`, 'utf8')).toBe('orphaned transaction data');
  });

  it('does not create a source file when given a nonexistent database', () => {
    const { directory, target } = fixture();
    const source = join(directory, 'absent.sqlite');
    const result = run('backup', source, target);
    expect(result.status).toBe(1);
    expect(existsSync(source)).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  it('rejects corrupt input and removes the incomplete snapshot', () => {
    const { directory, target } = fixture();
    const corrupt = join(directory, 'corrupt.sqlite');
    writeFileSync(corrupt, 'not a SQLite database');
    expect(run('restore', corrupt, target).status).toBe(1);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(directory).some(name => name.startsWith('.shov-snapshot-'))).toBe(false);
  });

  it('rejects a structurally valid database with broken foreign keys', () => {
    const { source, target, db } = fixture();
    db.exec("PRAGMA foreign_keys = OFF; INSERT INTO ledger VALUES ('missing-account', 12)");
    const result = run('backup', source, target);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('foreign key check failed');
    expect(existsSync(target)).toBe(false);
  });

  it('refuses to restore onto its source and requires an explicit restore destination', () => {
    const { source } = fixture();
    expect(run('restore', source, source).status).toBe(1);
    expect(run('restore', source).status).toBe(1);
    expect(inspect(source)).toBe(1700);
  });
});
