import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions, accounts, userSettings, User, Session, Account, UserSetting } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';
import { getSystemConfig } from './config';

export const SESSION_COOKIE_NAME = 'notificurom_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthenticatedContext {
  user: User;
  session: Session;
  accounts: Account[];
  settings: UserSetting;
}

export const DEFAULT_GITHUB_QUERIES = [
  'is:open is:issue assignee:@me',
  'is:open is:pr assignee:@me',
  'is:open is:pr review-requested:@me',
];

/**
 * Creates a database-backed session and sets an HTTP-only cookie.
 */
export async function createSession(userId: string): Promise<Session> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const createdAt = now.toISOString();

  const newSession: Session = {
    id: sessionId,
    userId,
    expiresAt,
    createdAt,
  };

  db.insert(sessions).values(newSession).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return newSession;
}

/**
 * Destroys the current session from DB and clears the session cookie.
 */
export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionId) {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // ignore
  }
}

/**
 * Gets the currently authenticated user, session, accounts, and settings.
 * Returns null if not logged in or session expired.
 */
export async function getCurrentUser(): Promise<AuthenticatedContext | null> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionId) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, nowIso)))
      .get();

    if (!session) {
      return null;
    }

    const user = db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user) {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
      return null;
    }

    const userAccounts = db.select().from(accounts).where(eq(accounts.userId, user.id)).all();
    const settings = await getUserSettings(user.id);

    return {
      user,
      session,
      accounts: userAccounts,
      settings,
    };
  } catch {
    return null;
  }
}

/**
 * Get or create default user settings for a user.
 */
export async function getUserSettings(userId: string): Promise<UserSetting> {
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const defaultSettings: UserSetting = {
    userId,
    githubQueries: JSON.stringify(DEFAULT_GITHUB_QUERIES),
    autoArchiveClosed: true,
    syncIntervalMins: 15,
    updatedAt: now,
  };

  db.insert(userSettings).values(defaultSettings).onConflictDoNothing().run();
  return defaultSettings;
}

/**
 * Save user settings.
 */
export async function saveUserSettings(
  userId: string,
  updates: Partial<{
    githubQueries: string[];
    autoArchiveClosed: boolean;
    syncIntervalMins: number;
  }>
): Promise<UserSetting> {
  const now = new Date().toISOString();
  const existing = await getUserSettings(userId);

  const values: Partial<UserSetting> = {
    updatedAt: now,
  };

  if (updates.githubQueries !== undefined) {
    values.githubQueries = JSON.stringify(updates.githubQueries);
  }
  if (updates.autoArchiveClosed !== undefined) {
    values.autoArchiveClosed = updates.autoArchiveClosed;
  }
  if (updates.syncIntervalMins !== undefined) {
    values.syncIntervalMins = updates.syncIntervalMins;
  }

  db.update(userSettings).set(values).where(eq(userSettings.userId, userId)).run();
  return { ...existing, ...values };
}

export interface GitHubProfile {
  id: number | string;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export interface OAuthTokenData {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  refresh_token_expires_in?: number | null;
  scope?: string | null;
}

/**
 * Just-In-Time (JIT) provisioning for GitHub OAuth logins.
 * Creates or updates the user and accounts table (including storing refresh tokens).
 */
export async function upsertUserFromGitHub(
  profile: GitHubProfile,
  tokens: OAuthTokenData
): Promise<User> {
  const now = new Date().toISOString();
  const githubIdStr = String(profile.id);

  // Check if user already exists by githubId
  let user = db.select().from(users).where(eq(users.githubId, githubIdStr)).get();

  if (user) {
    // Update existing user profile
    db.update(users)
      .set({
        username: profile.login,
        name: profile.name || user.name,
        email: profile.email || user.email,
        avatarUrl: profile.avatar_url || user.avatarUrl,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .run();

    user = db.select().from(users).where(eq(users.id, user.id)).get()!;
  } else {
    // JIT create new user
    const newUserId = crypto.randomUUID();
    const newUser: User = {
      id: newUserId,
      githubId: githubIdStr,
      username: profile.login,
      name: profile.name || profile.login,
      email: profile.email || null,
      avatarUrl: profile.avatar_url || null,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(users).values(newUser).run();
    user = newUser;

    // Initialize default user settings
    await getUserSettings(user.id);
  }

  // Calculate token expiration timestamp if provided
  let tokenExpiresAt: string | null = null;
  if (tokens.expires_in && typeof tokens.expires_in === 'number') {
    tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  }

  // Upsert into accounts table (stores access token and refresh token in DB)
  const existingAccount = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.provider, 'github')))
    .get();

  const accountValues = {
    provider: 'github',
    providerAccountId: githubIdStr,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || existingAccount?.refreshToken || null,
    tokenExpiresAt,
    scope: tokens.scope || 'repo,read:user,user:email',
    profile: JSON.stringify(profile),
    updatedAt: now,
  };

  if (existingAccount) {
    db.update(accounts)
      .set(accountValues)
      .where(eq(accounts.id, existingAccount.id))
      .run();
  } else {
    db.insert(accounts)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        ...accountValues,
        config: JSON.stringify({}),
        createdAt: now,
      })
      .run();
  }

  return user;
}

/**
 * Checks if an account's token is expired/expiring and refreshes it if a refresh token is present.
 */
export async function refreshAccountTokenIfNeeded(account: Account): Promise<Account> {
  if (account.provider !== 'github' || !account.refreshToken) {
    return account;
  }

  // Check if expiration date is present and within 5 minutes of expiring
  if (account.tokenExpiresAt) {
    const expiresAtTime = new Date(account.tokenExpiresAt).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    if (Date.now() < expiresAtTime - fiveMinutes) {
      // Token is still valid
      return account;
    }
  }

  // Attempt refresh
  try {
    const sysConfig = await getSystemConfig();
    if (!sysConfig.githubClientId || !sysConfig.githubClientSecret) {
      return account;
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
        refresh_token: account.refreshToken,
      }),
    });

    if (!res.ok) {
      return account;
    }

    const data = await res.json();
    if (data.access_token) {
      const now = new Date().toISOString();
      const tokenExpiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;

      const updatedFields = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || account.refreshToken,
        tokenExpiresAt,
        scope: data.scope || account.scope,
        updatedAt: now,
      };

      db.update(accounts)
        .set(updatedFields)
        .where(eq(accounts.id, account.id))
        .run();

      return {
        ...account,
        ...updatedFields,
      };
    }
  } catch (err) {
    console.error('Failed to refresh account token:', err);
  }

  return account;
}
