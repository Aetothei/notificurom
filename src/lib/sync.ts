import { db } from '@/db';
import { taskStates, userPreferences, Task } from '@/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { GitHubIngestor } from './ingestors/github';
import { NormalizedItem, SyncResult } from './types';
import { AuthenticatedContext } from './auth';
import { computeItemHash } from './crypto';

const ingestor = new GitHubIngestor();

interface UserRamCacheEntry {
  items: NormalizedItem[];
  syncedAt: string;
  expiresAt: number;
}

const RAM_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes in-memory TTL
const PRUNE_STALE_DAYS = 14;

const globalForCache = globalThis as unknown as {
  notificuromRamCache?: Map<string, UserRamCacheEntry>;
};

const userRamCache: Map<string, UserRamCacheEntry> =
  globalForCache.notificuromRamCache ?? new Map<string, UserRamCacheEntry>();

if (!globalForCache.notificuromRamCache) {
  globalForCache.notificuromRamCache = userRamCache;
}

export function clearUserRamCache(userHash: string): void {
  userRamCache.delete(userHash);
}

export function wipeUserData(userHash: string): void {
  clearUserRamCache(userHash);
  db.delete(taskStates).where(eq(taskStates.userHash, userHash)).run();
  db.delete(userPreferences).where(eq(userPreferences.userHash, userHash)).run();
}

export function getLastSyncTime(userHash: string): string | null {
  return userRamCache.get(userHash)?.syncedAt || null;
}

function hydrateAndSyncPointers(
  authContext: AuthenticatedContext,
  liveItems: NormalizedItem[]
): {
  tasks: Task[];
  created: number;
  updated: number;
  autoResolved: number;
} {
  const { userHash, preferences } = authContext;
  const now = new Date().toISOString();

  const existingPointers = db
    .select()
    .from(taskStates)
    .where(eq(taskStates.userHash, userHash))
    .all();

  const pointerMap = new Map(existingPointers.map((p) => [p.itemHash, p]));

  let created = 0;
  let updated = 0;
  let autoResolved = 0;
  const hydratedTasks: Task[] = [];

  for (const item of liveItems) {
    const itemHash = computeItemHash(userHash, item.sourceId);
    const existing = pointerMap.get(itemHash);

    if (!existing) {
      const initialStatus =
        item.isClosed && preferences.autoArchiveClosed ? 'done' : 'inbox';

      db.insert(taskStates)
        .values({
          itemHash,
          userHash,
          status: initialStatus,
          sortOrder: 0,
          dismissed: false,
          statusUpdatedAt: now,
          lastSeenAt: now,
        })
        .onConflictDoNothing()
        .run();

      created++;
      if (initialStatus === 'done') {
        autoResolved++;
      }

      hydratedTasks.push({
        id: itemHash,
        source: item.source,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        title: item.title,
        url: item.url,
        repository: item.repository,
        author: item.author,
        authorAvatarUrl: item.authorAvatarUrl,
        status: initialStatus,
        sortOrder: 0,
        isClosed: item.isClosed,
        metadata: JSON.stringify(item.metadata || {}),
        sourceCreatedAt: item.sourceCreatedAt,
        sourceUpdatedAt: item.sourceUpdatedAt,
        statusUpdatedAt: now,
      });
    } else {
      let status = existing.status;
      let statusUpdatedAt = existing.statusUpdatedAt;

      if (preferences.autoArchiveClosed && item.isClosed && existing.status !== 'done') {
        status = 'done';
        statusUpdatedAt = now;
        autoResolved++;
      }

      db.update(taskStates)
        .set({
          status,
          statusUpdatedAt,
          lastSeenAt: now,
        })
        .where(and(eq(taskStates.itemHash, itemHash), eq(taskStates.userHash, userHash)))
        .run();

      updated++;

      if (!existing.dismissed) {
        hydratedTasks.push({
          id: itemHash,
          source: item.source,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: item.title,
          url: item.url,
          repository: item.repository,
          author: item.author,
          authorAvatarUrl: item.authorAvatarUrl,
          status,
          sortOrder: existing.sortOrder,
          isClosed: item.isClosed,
          metadata: JSON.stringify(item.metadata || {}),
          sourceCreatedAt: item.sourceCreatedAt,
          sourceUpdatedAt: item.sourceUpdatedAt,
          statusUpdatedAt,
        });
      }
    }
  }

  const pruneCutoff = new Date(
    Date.now() - PRUNE_STALE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  db.delete(taskStates)
    .where(and(eq(taskStates.userHash, userHash), lt(taskStates.lastSeenAt, pruneCutoff)))
    .run();

  hydratedTasks.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return new Date(b.sourceCreatedAt).getTime() - new Date(a.sourceCreatedAt).getTime();
  });

  return {
    tasks: hydratedTasks,
    created,
    updated,
    autoResolved,
  };
}

export async function getHydratedUserTasks(
  authContext: AuthenticatedContext,
  forceRefresh = false
): Promise<{ tasks: Task[]; lastSyncTime: string }> {
  const { userHash, accessToken, preferences } = authContext;
  const cached = userRamCache.get(userHash);

  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    const { tasks } = hydrateAndSyncPointers(authContext, cached.items);
    return { tasks, lastSyncTime: cached.syncedAt };
  }

  const liveItems = await ingestor.fetchItems(
    accessToken,
    preferences.autoArchiveClosed
  );

  const syncedAt = new Date().toISOString();
  userRamCache.set(userHash, {
    items: liveItems,
    syncedAt,
    expiresAt: Date.now() + RAM_CACHE_TTL_MS,
  });

  const { tasks } = hydrateAndSyncPointers(authContext, liveItems);
  return { tasks, lastSyncTime: syncedAt };
}

export async function syncAuthenticatedUser(
  authContext: AuthenticatedContext
): Promise<SyncResult[]> {
  const result: SyncResult = {
    source: 'github',
    fetched: 0,
    created: 0,
    updated: 0,
    autoResolved: 0,
    errors: [],
  };

  try {
    const liveItems = await ingestor.fetchItems(
      authContext.accessToken,
      authContext.preferences.autoArchiveClosed
    );

    result.fetched = liveItems.length;
    const syncedAt = new Date().toISOString();

    userRamCache.set(authContext.userHash, {
      items: liveItems,
      syncedAt,
      expiresAt: Date.now() + RAM_CACHE_TTL_MS,
    });

    const synced = hydrateAndSyncPointers(authContext, liveItems);
    result.created = synced.created;
    result.updated = synced.updated;
    result.autoResolved = synced.autoResolved;
    result.tasks = synced.tasks;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
  }

  return [result];
}
