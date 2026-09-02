import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export type TaskStatus = 'inbox' | 'next' | 'in_progress' | 'waiting' | 'done';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: text('github_id').unique(),
  username: text('username').notNull(),
  name: text('name'),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'github', 'slack', etc.
    providerAccountId: text('provider_account_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: text('token_expires_at'),
    scope: text('scope'),
    profile: text('profile'), // JSON string
    config: text('config'), // JSON string for provider specific settings
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_accounts_user_provider').on(table.userId, table.provider),
    index('idx_accounts_provider_account').on(table.provider, table.providerAccountId),
  ]
);

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  githubQueries: text('github_queries'), // JSON string array
  autoArchiveClosed: integer('auto_archive_closed', { mode: 'boolean' }).notNull().default(true),
  syncIntervalMins: integer('sync_interval_mins').notNull().default(15),
  updatedAt: text('updated_at').notNull(),
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'github', 'slack', 'manual', etc.
    sourceType: text('source_type').notNull(), // 'issue', 'pr', 'review_request', etc.
    sourceId: text('source_id').notNull(), // e.g. 'github:repo#123'
    title: text('title').notNull(),
    url: text('url').notNull(),
    repository: text('repository'), // e.g. 'owner/repo'
    author: text('author'),
    authorAvatarUrl: text('author_avatar_url'),
    status: text('status').$type<TaskStatus>().notNull().default('inbox'),
    sortOrder: integer('sort_order').notNull().default(0),
    isClosed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
    metadata: text('metadata'), // JSON string
    sourceCreatedAt: text('source_created_at').notNull(),
    sourceUpdatedAt: text('source_updated_at'),
    statusUpdatedAt: text('status_updated_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_tasks_user_source').on(table.userId, table.sourceId),
    index('idx_tasks_user_status').on(table.userId, table.status),
  ]
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Setting = typeof settings.$inferSelect;

