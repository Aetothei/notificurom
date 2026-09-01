import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface GitHubUserSession {
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface AppConfig {
  githubClientId: string;
  githubClientSecret: string;
  githubAccessToken: string;
  githubUser: GitHubUserSession | null;
  githubQueries: string[];
  autoArchiveClosed: boolean; // Auto-move closed/merged PRs/issues to 'done'
  syncIntervalMinutes: number;
}

const DEFAULT_GITHUB_QUERIES = [
  'is:open is:issue assignee:@me',
  'is:open is:pr assignee:@me',
  'is:open is:pr review-requested:@me',
];

export async function getSetting(key: string, defaultValue = ''): Promise<string> {
  try {
    const result = db.select().from(settings).where(eq(settings.key, key)).get();
    if (result && result.value !== undefined) {
      return result.value;
    }
  } catch {
    // ignore db read errors during bootstrap
  }
  return defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export async function deleteSetting(key: string): Promise<void> {
  try {
    db.delete(settings).where(eq(settings.key, key)).run();
  } catch {
    // ignore db delete errors
  }
}

export async function setGitHubAuth(accessToken: string, user: GitHubUserSession): Promise<void> {
  await setSetting('github_access_token', accessToken);
  await setSetting('github_user', JSON.stringify(user));
}

export async function clearGitHubAuth(): Promise<void> {
  await deleteSetting('github_access_token');
  await deleteSetting('github_user');
}

export async function getAppConfig(): Promise<AppConfig> {
  const envClientId = process.env.GITHUB_CLIENT_ID || '';
  const dbClientId = await getSetting('github_client_id', '');
  const githubClientId = dbClientId || envClientId;

  const envClientSecret = process.env.GITHUB_CLIENT_SECRET || '';
  const dbClientSecret = await getSetting('github_client_secret', '');
  const githubClientSecret = dbClientSecret || envClientSecret;

  const githubAccessToken = await getSetting('github_access_token', '');

  let githubUser: GitHubUserSession | null = null;
  const userJson = await getSetting('github_user', '');
  if (userJson) {
    try {
      githubUser = JSON.parse(userJson);
    } catch {
      githubUser = null;
    }
  }

  const dbQueries = await getSetting('github_queries', '');
  let githubQueries = DEFAULT_GITHUB_QUERIES;
  if (dbQueries) {
    try {
      const parsed = JSON.parse(dbQueries);
      if (Array.isArray(parsed) && parsed.length > 0) {
        githubQueries = parsed;
      }
    } catch {
      githubQueries = dbQueries.split('\n').map((q) => q.trim()).filter(Boolean);
    }
  }

  const dbAutoArchive = await getSetting('auto_archive_closed', 'true');
  const autoArchiveClosed = dbAutoArchive === 'true';

  const dbInterval = await getSetting('sync_interval_mins', '15');
  const syncIntervalMinutes = parseInt(dbInterval, 10) || 15;

  return {
    githubClientId,
    githubClientSecret,
    githubAccessToken,
    githubUser,
    githubQueries,
    autoArchiveClosed,
    syncIntervalMinutes,
  };
}

export async function saveAppConfig(config: Partial<AppConfig>): Promise<void> {
  if (config.githubClientId !== undefined) {
    await setSetting('github_client_id', config.githubClientId);
  }
  if (config.githubClientSecret !== undefined) {
    await setSetting('github_client_secret', config.githubClientSecret);
  }
  if (config.githubAccessToken !== undefined) {
    await setSetting('github_access_token', config.githubAccessToken);
  }
  if (config.githubUser !== undefined) {
    if (config.githubUser) {
      await setSetting('github_user', JSON.stringify(config.githubUser));
    } else {
      await deleteSetting('github_user');
    }
  }
  if (config.githubQueries !== undefined) {
    await setSetting('github_queries', JSON.stringify(config.githubQueries));
  }
  if (config.autoArchiveClosed !== undefined) {
    await setSetting('auto_archive_closed', String(config.autoArchiveClosed));
  }
  if (config.syncIntervalMinutes !== undefined) {
    await setSetting('sync_interval_mins', String(config.syncIntervalMinutes));
  }
}

export function getBaseUrl(req?: { headers: Headers; url?: string; nextUrl?: { origin: string } }): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (req) {
    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
    const host = req.headers.get('host');
    if (host && !host.includes('0.0.0.0') && !host.includes('localhost') && !host.includes('.incus')) {
      const proto = req.url?.startsWith('https') ? 'https' : 'http';
      return `${proto}://${host}`;
    }
    if (req.nextUrl?.origin) {
      return req.nextUrl.origin;
    }
  }
  return 'http://localhost:3000';
}
