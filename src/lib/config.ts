import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface SystemConfig {
  githubClientId: string;
  githubClientSecret: string;
  cronSecret: string;
}

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

export async function getSystemConfig(): Promise<SystemConfig> {
  const envClientId = process.env.GITHUB_CLIENT_ID || process.env.GH_CLIENT_ID || '';
  const dbClientId = await getSetting('github_client_id', '');
  const githubClientId = dbClientId || envClientId;

  const envClientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.GH_CLIENT_SECRET || '';
  const dbClientSecret = await getSetting('github_client_secret', '');
  const githubClientSecret = dbClientSecret || envClientSecret;

  const cronSecret = process.env.CRON_SECRET || '';

  return {
    githubClientId,
    githubClientSecret,
    cronSecret,
  };
}

export async function saveSystemConfig(config: Partial<SystemConfig>): Promise<void> {
  if (config.githubClientId !== undefined) {
    await setSetting('github_client_id', config.githubClientId);
  }
  if (config.githubClientSecret !== undefined) {
    await setSetting('github_client_secret', config.githubClientSecret);
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
