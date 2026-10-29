import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'notificurom.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initializeDb() {
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_states (
      item_hash TEXT PRIMARY KEY,
      user_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox',
      sort_order INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      status_updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_states_user ON task_states(user_hash);
    CREATE INDEX IF NOT EXISTS idx_task_states_user_status ON task_states(user_hash, status);

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_hash TEXT PRIMARY KEY,
      auto_archive_closed INTEGER NOT NULL DEFAULT 1,
      sync_interval_mins INTEGER NOT NULL DEFAULT 2,
      notifications_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  // Safe migration for existing databases missing notifications_enabled
  try {
    sqlite.exec('ALTER TABLE user_preferences ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 0;');
  } catch {
    // Column already exists
  }
}

initializeDb();
