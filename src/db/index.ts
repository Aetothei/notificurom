import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'notificurom.db');

// Ensure data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
// Enable WAL mode for better concurrency in local/hosted environments
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Helper to auto-create tables and migrate if needed
export function initializeDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE,
      username TEXT NOT NULL,
      name TEXT,
      email TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at TEXT,
      scope TEXT,
      profile TEXT,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_provider ON accounts(user_id, provider);
    CREATE INDEX IF NOT EXISTS idx_accounts_provider_account ON accounts(provider, provider_account_id);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      github_queries TEXT,
      auto_archive_closed INTEGER NOT NULL DEFAULT 1,
      sync_interval_mins INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Check if tasks table exists and if it has user_id
  const tasksTableInfo = sqlite.pragma('table_info(tasks)') as Array<{ name: string }>;
  if (tasksTableInfo.length === 0) {
    // Tasks table doesn't exist yet, create with user_id
    sqlite.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        repository TEXT,
        author TEXT,
        author_avatar_url TEXT,
        status TEXT NOT NULL DEFAULT 'inbox',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_closed INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        source_created_at TEXT NOT NULL,
        source_updated_at TEXT,
        status_updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_source ON tasks(user_id, source_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
    `);
  } else {
    const hasUserId = tasksTableInfo.some((col) => col.name === 'user_id');
    if (!hasUserId) {
      // Migrate existing tasks table: drop old unique index, recreate or add column
      sqlite.exec(`
        DROP TABLE IF EXISTS tasks_old;
        ALTER TABLE tasks RENAME TO tasks_old;

        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT '' REFERENCES users(id) ON DELETE CASCADE,
          source TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          repository TEXT,
          author TEXT,
          author_avatar_url TEXT,
          status TEXT NOT NULL DEFAULT 'inbox',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_closed INTEGER NOT NULL DEFAULT 0,
          metadata TEXT,
          source_created_at TEXT NOT NULL,
          source_updated_at TEXT,
          status_updated_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_source ON tasks(user_id, source_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);

        DROP TABLE tasks_old;
      `);
    } else {
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_user_source ON tasks(user_id, source_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
      `);
    }
  }
}

// Ensure DB is initialized
initializeDb();

