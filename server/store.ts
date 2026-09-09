import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GameState } from '../shared/types.ts';

export interface SavedGame { id: string; snapshot: string; revision: number }
export interface Session { account_id: string; expires_at: number }

export class GameStore {
  private readonly db: DatabaseSync;

  get database(): DatabaseSync { return this.db; }

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
        revision INTEGER NOT NULL CHECK(revision > 0),
        updated_at INTEGER NOT NULL,
        CHECK(json_extract(snapshot, '$.wallet.coins') >= 0),
        CHECK(json_extract(snapshot, '$.wallet.thread') >= 0),
        CHECK(json_extract(snapshot, '$.wallet.catalyst') >= 0)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS commands (
        account_id TEXT NOT NULL REFERENCES accounts(id),
        command_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(account_id, command_id)
      );
    `);
  }

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getGame(id: string): SavedGame | undefined {
    return this.db.prepare('SELECT id, snapshot, revision FROM accounts WHERE id = ?').get(id) as SavedGame | undefined;
  }

  createGame(state: GameState, now: number): SavedGame {
    const snapshot = this.serialize(state);
    this.db.prepare('INSERT INTO accounts(id, snapshot, revision, updated_at) VALUES (?, ?, 1, ?)').run(state.id, snapshot, now);
    return { id: state.id, snapshot, revision: 1 };
  }

  saveGame(saved: SavedGame, state: GameState, now: number): number {
    if (state.id !== saved.id) throw new Error('Account identity invariant failed.');
    const snapshot = this.serialize(state);
    if (snapshot === saved.snapshot) return saved.revision;
    const revision = saved.revision + 1;
    this.db.prepare('UPDATE accounts SET snapshot = ?, revision = ?, updated_at = ? WHERE id = ?').run(snapshot, revision, now, saved.id);
    return revision;
  }

  private serialize(state: GameState): string {
    for (const value of Object.values(state.wallet)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Wallet invariant failed.');
    }
    return JSON.stringify(state);
  }

  getSession(hash: string, now: number): Session | undefined {
    return this.db.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash, now) as Session | undefined;
  }

  createSession(hash: string, accountId: string, expiresAt: number, now: number): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db.prepare('INSERT INTO sessions(token_hash, account_id, expires_at) VALUES (?, ?, ?)').run(hash, accountId, expiresAt);
  }

  getCommandHash(accountId: string, commandId: string): string | undefined {
    const row = this.db.prepare('SELECT payload_hash FROM commands WHERE account_id = ? AND command_id = ?').get(accountId, commandId) as { payload_hash: string } | undefined;
    return row?.payload_hash;
  }

  recordCommand(accountId: string, commandId: string, hash: string, now: number): void {
    this.db.prepare('INSERT INTO commands(account_id, command_id, payload_hash, created_at) VALUES (?, ?, ?, ?)').run(accountId, commandId, hash, now);
  }

  close(): void { this.db.close(); }
}
