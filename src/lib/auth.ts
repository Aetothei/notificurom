import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { computeUserHash, decryptData, encryptData } from './crypto';
import { getSystemConfig, isUserAllowed } from './config';

export const SESSION_COOKIE_NAME = 'notificurom_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const DEFAULT_GITHUB_QUERIES = [
  'is:open is:issue assignee:@me',
  'is:open is:pr assignee:@me',
  'is:open is:pr review-requested:@me',
];

export interface SessionCookiePayload {
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: number | null; // epoch ms
  issuedAt: number; // epoch ms
}

export interface DecryptedUserPreferences {
  autoArchiveClosed: boolean;
  syncIntervalMins: number;
}

export interface AuthenticatedContext {
  userHash: string;
  user: {
    id: string;
    githubId: string;
    login: string;
    name: string | null;
    avatarUrl: string | null;
  };
  accessToken: string;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  preferences: DecryptedUserPreferences;
  refreshedCookieValue?: string;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildEncryptedSessionCookieHeader(payload: SessionCookiePayload): string {
  const encrypted = encryptData(payload);
  return serializeCookie(SESSION_COOKIE_NAME, encrypted, SESSION_MAX_AGE_SECONDS);
}

export function buildClearSessionCookieHeader(): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', 0);
}

async function refreshPayloadIfNeeded(
  payload: SessionCookiePayload
): Promise<{ payload: SessionCookiePayload; refreshed: boolean }> {
  if (!payload.refreshToken || !payload.tokenExpiresAt) {
    return { payload, refreshed: false };
  }

  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() < payload.tokenExpiresAt - fiveMinutes) {
    return { payload, refreshed: false };
  }

  try {
    const sysConfig = getSystemConfig();
    if (!sysConfig.githubClientId || !sysConfig.githubClientSecret) {
      return { payload, refreshed: false };
    }

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Notificurom-GTD-App',
      },
      body: JSON.stringify({
        client_id: sysConfig.githubClientId,
        client_secret: sysConfig.githubClientSecret,
        grant_type: 'refresh_token',
        refresh_token: payload.refreshToken,
      }),
    });

    if (!res.ok) return { payload, refreshed: false };
    const data = await res.json();
    if (!data.access_token) return { payload, refreshed: false };

    const updated: SessionCookiePayload = {
      ...payload,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || payload.refreshToken,
      tokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    };

    return { payload: updated, refreshed: true };
  } catch {
    return { payload, refreshed: false };
  }
}

export async function getCurrentUserFromCookieHeader(
  cookieHeader?: string
): Promise<AuthenticatedContext | null> {
  try {
    const cookies = parseCookies(cookieHeader);
    const rawCookie = cookies[SESSION_COOKIE_NAME];
    if (!rawCookie) return null;

    const decrypted = decryptData<SessionCookiePayload>(rawCookie);
    if (!decrypted || !decrypted.githubId || !decrypted.login || !decrypted.accessToken) {
      return null;
    }

    if (!isUserAllowed(decrypted.login)) {
      return null;
    }

    const { payload: activePayload, refreshed } = await refreshPayloadIfNeeded(decrypted);
    const userHash = computeUserHash(activePayload.githubId);
    const preferences = getUserPreferences(userHash);

    return {
      userHash,
      user: {
        id: userHash,
        githubId: activePayload.githubId,
        login: activePayload.login,
        name: activePayload.name,
        avatarUrl: activePayload.avatarUrl,
      },
      accessToken: activePayload.accessToken,
      hasRefreshToken: Boolean(activePayload.refreshToken),
      tokenExpiresAt: activePayload.tokenExpiresAt
        ? new Date(activePayload.tokenExpiresAt).toISOString()
        : null,
      preferences,
      refreshedCookieValue: refreshed
        ? buildEncryptedSessionCookieHeader(activePayload)
        : undefined,
    };
  } catch {
    return null;
  }
}

export function getUserPreferences(userHash: string): DecryptedUserPreferences {
  const existing = db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userHash, userHash))
    .get();

  if (existing) {
    return {
      autoArchiveClosed: existing.autoArchiveClosed,
      syncIntervalMins: existing.syncIntervalMins,
    };
  }

  const now = new Date().toISOString();
  db.insert(userPreferences)
    .values({
      userHash,
      autoArchiveClosed: true,
      syncIntervalMins: 15,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  return {
    autoArchiveClosed: true,
    syncIntervalMins: 15,
  };
}

export function saveUserPreferences(
  userHash: string,
  updates: Partial<DecryptedUserPreferences>
): DecryptedUserPreferences {
  const current = getUserPreferences(userHash);
  const now = new Date().toISOString();

  const nextAutoArchive =
    updates.autoArchiveClosed !== undefined ? updates.autoArchiveClosed : current.autoArchiveClosed;
  const nextSyncInterval =
    updates.syncIntervalMins !== undefined ? updates.syncIntervalMins : current.syncIntervalMins;

  db.update(userPreferences)
    .set({
      autoArchiveClosed: nextAutoArchive,
      syncIntervalMins: nextSyncInterval,
      updatedAt: now,
    })
    .where(eq(userPreferences.userHash, userHash))
    .run();

  return {
    autoArchiveClosed: nextAutoArchive,
    syncIntervalMins: nextSyncInterval,
  };
}
