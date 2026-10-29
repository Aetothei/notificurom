import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export type TaskStatus = 'inbox' | 'next' | 'in_progress' | 'waiting' | 'done';

/**
 * Pointer-only Kanban state table.
 */
export const taskStates = sqliteTable(
  'task_states',
  {
    itemHash: text('item_hash').primaryKey(),
    userHash: text('user_hash').notNull(),
    status: text('status').$type<TaskStatus>().notNull().default('inbox'),
    sortOrder: integer('sort_order').notNull().default(0),
    dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
    statusUpdatedAt: text('status_updated_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [
    index('idx_task_states_user').on(table.userHash),
    index('idx_task_states_user_status').on(table.userHash, table.status),
  ]
);

/**
 * Per-user preferences keyed by userHash.
 */
export const userPreferences = sqliteTable('user_preferences', {
  userHash: text('user_hash').primaryKey(),
  autoArchiveClosed: integer('auto_archive_closed', { mode: 'boolean' }).notNull().default(true),
  syncIntervalMins: integer('sync_interval_mins').notNull().default(15),
  updatedAt: text('updated_at').notNull(),
});

export type TaskStateRow = typeof taskStates.$inferSelect;
export type NewTaskStateRow = typeof taskStates.$inferInsert;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;

export interface Task {
  id: string; // equals itemHash
  source: string;
  sourceType: 'issue' | 'pr' | 'review_request';
  sourceId: string;
  title: string;
  url: string;
  repository: string | null;
  author: string | null;
  authorAvatarUrl: string | null;
  status: TaskStatus;
  sortOrder: number;
  isClosed: boolean;
  metadata: string | null;
  sourceCreatedAt: string;
  sourceUpdatedAt: string | null;
  statusUpdatedAt: string;
}
