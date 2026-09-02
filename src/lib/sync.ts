import { db } from '@/db';
import { tasks, users, accounts } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { GitHubIngestor } from './ingestors/github';
import { Ingestor, IngestorContext, SyncResult } from './types';
import { getUserSettings, refreshAccountTokenIfNeeded } from './auth';
import { setSetting } from './config';
import crypto from 'crypto';

const ingestorRegistry: Ingestor[] = [new GitHubIngestor()];

/**
 * Synchronizes tasks from all connected accounts for a specific user.
 */
export async function syncUser(userId: string): Promise<SyncResult[]> {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    return [
      {
        source: 'all',
        fetched: 0,
        created: 0,
        updated: 0,
        autoResolved: 0,
        errors: ['User not found'],
      },
    ];
  }

  const settings = await getUserSettings(userId);
  const userAccounts = db.select().from(accounts).where(eq(accounts.userId, userId)).all();

  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  for (const account of userAccounts) {
    const ingestor = ingestorRegistry.find((i) => i.provider === account.provider);
    if (!ingestor) continue;

    const result: SyncResult = {
      source: ingestor.provider,
      fetched: 0,
      created: 0,
      updated: 0,
      autoResolved: 0,
      errors: [],
    };

    try {
      // 1. Refresh token if expired
      const validAccount = await refreshAccountTokenIfNeeded(account);
      const context: IngestorContext = {
        user,
        account: validAccount,
        settings,
      };

      const isEnabled = await ingestor.isEnabled(context);
      if (!isEnabled) {
        result.errors.push(`${ingestor.provider} is not configured with a valid token.`);
        results.push(result);
        continue;
      }

      // 2. Fetch items from provider
      const items = await ingestor.fetchItems(context);
      result.fetched = items.length;

      const seenSourceIds = new Set<string>();

      for (const item of items) {
        seenSourceIds.add(item.sourceId);

        // Find existing task scoped to this user
        const existing = db
          .select()
          .from(tasks)
          .where(and(eq(tasks.userId, userId), eq(tasks.sourceId, item.sourceId)))
          .get();

        const metadataStr = JSON.stringify(item.metadata || {});

        if (!existing) {
          // New task - insert into Inbox
          db.insert(tasks)
            .values({
              id: crypto.randomUUID(),
              userId,
              source: item.source,
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              title: item.title,
              url: item.url,
              repository: item.repository,
              author: item.author,
              authorAvatarUrl: item.authorAvatarUrl,
              status: 'inbox',
              sortOrder: 0,
              isClosed: item.isClosed,
              metadata: metadataStr,
              sourceCreatedAt: item.sourceCreatedAt,
              sourceUpdatedAt: item.sourceUpdatedAt || item.sourceCreatedAt,
              statusUpdatedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          result.created++;
        } else {
          // Existing task - preserve Kanban status unless auto-archiving closed
          let newStatus = existing.status;
          let newStatusUpdatedAt = existing.statusUpdatedAt;

          if (settings.autoArchiveClosed && item.isClosed && existing.status !== 'done') {
            newStatus = 'done';
            newStatusUpdatedAt = now;
            result.autoResolved++;
          }

          db.update(tasks)
            .set({
              title: item.title,
              repository: item.repository || existing.repository,
              author: item.author || existing.author,
              authorAvatarUrl: item.authorAvatarUrl || existing.authorAvatarUrl,
              isClosed: item.isClosed,
              status: newStatus,
              statusUpdatedAt: newStatusUpdatedAt,
              metadata: metadataStr,
              sourceUpdatedAt: item.sourceUpdatedAt || existing.sourceUpdatedAt,
              updatedAt: now,
            })
            .where(eq(tasks.id, existing.id))
            .run();
          result.updated++;
        }
      }

      // 3. Verify status of unreturned tasks (e.g. issues closed, merged, or unassigned)
      if (ingestor.checkItemsStatus) {
        const activeUserTasks = db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.source, ingestor.provider),
              eq(tasks.isClosed, false),
              ne(tasks.status, 'done')
            )
          )
          .all();

        const unreturnedTasks = activeUserTasks.filter((t) => !seenSourceIds.has(t.sourceId));

        if (unreturnedTasks.length > 0) {
          const checkedStatusMap = await ingestor.checkItemsStatus(
            unreturnedTasks.map((t) => t.sourceId),
            context
          );

          for (const [sourceId, statusInfo] of checkedStatusMap.entries()) {
            if (statusInfo.isNotFound || statusInfo.isUnassigned) {
              db.delete(tasks)
                .where(and(eq(tasks.userId, userId), eq(tasks.sourceId, sourceId)))
                .run();
              result.removed = (result.removed || 0) + 1;
            } else if (statusInfo.isClosed) {
              if (settings.autoArchiveClosed) {
                db.update(tasks)
                  .set({
                    isClosed: true,
                    status: 'done',
                    statusUpdatedAt: now,
                    updatedAt: now,
                    ...(statusInfo.title ? { title: statusInfo.title } : {}),
                  })
                  .where(and(eq(tasks.userId, userId), eq(tasks.sourceId, sourceId)))
                  .run();
                result.autoResolved++;
              } else {
                db.update(tasks)
                  .set({
                    isClosed: true,
                    updatedAt: now,
                    ...(statusInfo.title ? { title: statusInfo.title } : {}),
                  })
                  .where(and(eq(tasks.userId, userId), eq(tasks.sourceId, sourceId)))
                  .run();
              }
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
    }

    results.push(result);
  }

  await setSetting(`last_sync_time_${userId}`, now);
  return results;
}

/**
 * Synchronizes tasks across all active registered users (for background cron jobs).
 */
export async function syncAllUsers(): Promise<Record<string, SyncResult[]>> {
  const allUsers = db.select().from(users).all();
  const allResults: Record<string, SyncResult[]> = {};

  for (const user of allUsers) {
    allResults[user.id] = await syncUser(user.id);
  }

  return allResults;
}
