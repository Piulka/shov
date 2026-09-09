import type { GameStore } from './store.ts';

export function moderate(store: GameStore, action: 'reports' | 'block' | 'unblock' | 'delete-message' | 'resolve', target: string, note: string, now: number) {
  const db = store.database;
  if (action === 'reports') return db.prepare('SELECT * FROM moderation_reports WHERE resolved_at IS NULL ORDER BY created_at LIMIT 100').all();
  if (!target || !note.trim() || note.length > 500) throw new Error('Target and a reason (1-500 characters) are required.');
  return store.transaction(() => {
    if (action === 'block' || action === 'unblock') {
      if (!store.getGame(target)) throw new Error('Account not found. Use author_id from a report.');
      if (action === 'block') {
        db.prepare('INSERT INTO account_blocks(account_id, reason, created_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at').run(target, note, now);
      } else db.prepare('DELETE FROM account_blocks WHERE account_id = ?').run(target);
    } else {
      const report = db.prepare('SELECT message_id FROM moderation_reports WHERE id = ?').get(target) as { message_id: string } | undefined;
      if (!report) throw new Error('Report not found.');
      if (action === 'delete-message') db.prepare('DELETE FROM social_messages WHERE id = ?').run(report.message_id);
      db.prepare('UPDATE moderation_reports SET resolved_at = ? WHERE id = ?').run(now, target);
    }
    db.prepare('INSERT INTO moderation_actions(action, target, note, created_at) VALUES (?, ?, ?, ?)').run(action, target, note, now);
    return { ok: true, action, target };
  });
}
