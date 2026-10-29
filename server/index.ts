import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../src/db';
import { taskStates, TaskStatus } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  getSystemConfig,
  isUserAllowed,
  getBaseUrlFromNodeHeaders,
} from '../src/lib/config';
import {
  getCurrentUserFromCookieHeader,
  buildEncryptedSessionCookieHeader,
  buildClearSessionCookieHeader,
  parseCookies,
  serializeCookie,
  getUserPreferences,
  saveUserPreferences,
} from '../src/lib/auth';
import { computeUserHash } from '../src/lib/crypto';
import {
  getHydratedUserTasks,
  syncAuthenticatedUser,
  clearUserRamCache,
  wipeUserData,
} from '../src/lib/sync';

// Load .env.local or .env if present
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const VALID_STATUSES: TaskStatus[] = ['inbox', 'next', 'in_progress', 'waiting', 'done'];

function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown,
  extraHeaders: Record<string, string | string[]> = {}
) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function sendRedirect(
  res: http.ServerResponse,
  location: string,
  extraHeaders: Record<string, string | string[]> = {}
) {
  res.writeHead(302, {
    Location: location,
    ...extraHeaders,
  });
  res.end();
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const distDir = path.join(process.cwd(), 'dist');

function serveStaticFile(reqPath: string, res: http.ServerResponse) {
  const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(distDir, safePath === '/' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback to index.html
    filePath = path.join(distDir, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found (Run npm run build first)');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const baseUrl = getBaseUrlFromNodeHeaders(req.headers);
    const parsedUrl = new URL(req.url || '/', baseUrl);
    const pathname = parsedUrl.pathname;
    const cookieHeader = req.headers.cookie;

    // 1. GET /api/auth/github/status
    if (pathname === '/api/auth/github/status' && method === 'GET') {
      const config = getSystemConfig();
      const isConfigured = Boolean(
        config.githubClientId.length > 0 && config.githubClientSecret.length > 0
      );
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      const isConnected = Boolean(authContext && authContext.user);

      return sendJson(res, 200, {
        isConfigured,
        isConnected,
        user: authContext?.user
          ? {
              id: authContext.user.id,
              login: authContext.user.login,
              name: authContext.user.name,
              avatarUrl: authContext.user.avatarUrl,
            }
          : null,
      });
    }

    // 2. GET /api/auth/github/login
    if (pathname === '/api/auth/github/login' && method === 'GET') {
      const config = getSystemConfig();
      if (!config.githubClientId) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=client_id_missing', baseUrl).toString()
        );
      }

      const state = crypto.randomBytes(16).toString('hex');
      const redirectUri = `${baseUrl}/api/auth/github/callback`;
      const stateCookie = serializeCookie('github_oauth_state', state, 600);

      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', config.githubClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      if (config.githubOAuthScopes) {
        authUrl.searchParams.set('scope', config.githubOAuthScopes);
      }
      authUrl.searchParams.set('state', state);

      return sendRedirect(res, authUrl.toString(), { 'Set-Cookie': stateCookie });
    }

    // 3. GET /api/auth/github/callback
    if (pathname === '/api/auth/github/callback' && method === 'GET') {
      const error = parsedUrl.searchParams.get('error');
      const errorDescription = parsedUrl.searchParams.get('error_description');
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');

      const clearStateCookie = serializeCookie('github_oauth_state', '', 0);

      if (error) {
        const errorMsg = errorDescription || error;
        return sendRedirect(
          res,
          new URL(`/?auth=error&error=${encodeURIComponent(errorMsg)}`, baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const cookies = parseCookies(cookieHeader);
      const storedState = cookies['github_oauth_state'];

      if (!state || !storedState || state !== storedState) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=invalid_state', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      if (!code) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=missing_code', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const config = getSystemConfig();
      if (!config.githubClientId || !config.githubClientSecret) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=oauth_not_configured', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Notificurom-GTD-App',
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
        }),
      });

      if (!tokenRes.ok) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=token_exchange_failed', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const tokenData = await tokenRes.json();
      if (tokenData.error || !tokenData.access_token) {
        const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
        return sendRedirect(
          res,
          new URL(`/?auth=error&error=${encodeURIComponent(errMsg)}`, baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${tokenData.access_token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Notificurom-GTD-App',
        },
      });

      if (!userRes.ok) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=user_fetch_failed', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const userData = await userRes.json();
      const login = String(userData.login || '');

      if (!login || !isUserAllowed(login)) {
        return sendRedirect(
          res,
          new URL('/?auth=error&error=user_not_allowed', baseUrl).toString(),
          { 'Set-Cookie': clearStateCookie }
        );
      }

      const githubId = String(userData.id);
      const userHash = computeUserHash(githubId);
      getUserPreferences(userHash);

      const sessionCookie = buildEncryptedSessionCookieHeader({
        githubId,
        login,
        name: userData.name || null,
        avatarUrl: userData.avatar_url || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenExpiresAt:
          typeof tokenData.expires_in === 'number'
            ? Date.now() + tokenData.expires_in * 1000
            : null,
        issuedAt: Date.now(),
      });

      return sendRedirect(res, new URL('/?auth=success', baseUrl).toString(), {
        'Set-Cookie': [clearStateCookie, sessionCookie],
      });
    }

    // 4. POST /api/auth/logout & POST /api/auth/github/disconnect
    if (
      (pathname === '/api/auth/logout' || pathname === '/api/auth/github/disconnect') &&
      method === 'POST'
    ) {
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      if (authContext) {
        clearUserRamCache(authContext.userHash);
      }
      return sendJson(
        res,
        200,
        { success: true },
        { 'Set-Cookie': buildClearSessionCookieHeader() }
      );
    }

    // 5. GET / POST / DELETE /api/settings
    if (pathname === '/api/settings') {
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      if (!authContext) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      if (method === 'GET') {
        return sendJson(res, 200, {
          isConnected: true,
          user: {
            id: authContext.user.id,
            login: authContext.user.login,
            name: authContext.user.name,
            avatarUrl: authContext.user.avatarUrl,
          },
          autoArchiveClosed: authContext.preferences.autoArchiveClosed,
          syncIntervalMinutes: authContext.preferences.syncIntervalMins,
          notificationsEnabled: authContext.preferences.notificationsEnabled,
        });
      }

      if (method === 'POST') {
        const body = await readJsonBody(req);
        const updatedPrefs = saveUserPreferences(authContext.userHash, {
          autoArchiveClosed:
            typeof body.autoArchiveClosed === 'boolean' ? body.autoArchiveClosed : undefined,
          syncIntervalMins:
            typeof body.syncIntervalMinutes === 'number' ? body.syncIntervalMinutes : undefined,
          notificationsEnabled:
            typeof body.notificationsEnabled === 'boolean' ? body.notificationsEnabled : undefined,
        });

        clearUserRamCache(authContext.userHash);

        return sendJson(res, 200, {
          success: true,
          isConnected: true,
          user: {
            id: authContext.user.id,
            login: authContext.user.login,
            name: authContext.user.name,
            avatarUrl: authContext.user.avatarUrl,
          },
          autoArchiveClosed: updatedPrefs.autoArchiveClosed,
          syncIntervalMinutes: updatedPrefs.syncIntervalMins,
          notificationsEnabled: updatedPrefs.notificationsEnabled,
        });
      }

      if (method === 'DELETE') {
        wipeUserData(authContext.userHash);
        return sendJson(res, 200, { success: true, message: 'Board data wiped.' });
      }
    }

    // 6. GET /api/tasks
    if (pathname === '/api/tasks' && method === 'GET') {
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      if (!authContext) {
        return sendJson(res, 401, { tasks: [] });
      }

      const { tasks, lastSyncTime } = await getHydratedUserTasks(authContext);
      return sendJson(res, 200, { tasks, lastSyncTime });
    }

    // 7. PATCH & DELETE /api/tasks/:id
    if (pathname.startsWith('/api/tasks/')) {
      const itemHash = decodeURIComponent(pathname.slice('/api/tasks/'.length));
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      if (!authContext) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      const now = new Date().toISOString();
      const existing = db
        .select()
        .from(taskStates)
        .where(
          and(
            eq(taskStates.itemHash, itemHash),
            eq(taskStates.userHash, authContext.userHash)
          )
        )
        .get();

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const rawStatus = body.status as TaskStatus | undefined;

        if (!existing) {
          const initialStatus: TaskStatus =
            rawStatus && VALID_STATUSES.includes(rawStatus) ? rawStatus : 'inbox';
          const initialSortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

          db.insert(taskStates)
            .values({
              itemHash,
              userHash: authContext.userHash,
              status: initialStatus,
              sortOrder: initialSortOrder,
              dismissed: false,
              statusUpdatedAt: now,
              lastSeenAt: now,
            })
            .run();

          return sendJson(res, 200, {
            success: true,
            state: {
              itemHash,
              status: initialStatus,
              sortOrder: initialSortOrder,
              statusUpdatedAt: now,
            },
          });
        }

        const updates: Partial<typeof taskStates.$inferInsert> = {
          lastSeenAt: now,
        };

        if (rawStatus !== undefined && VALID_STATUSES.includes(rawStatus)) {
          updates.status = rawStatus;
          if (rawStatus !== existing.status) {
            updates.statusUpdatedAt = now;
          }
        }

        if (typeof body.sortOrder === 'number') {
          updates.sortOrder = body.sortOrder;
        }

        db.update(taskStates)
          .set(updates)
          .where(
            and(
              eq(taskStates.itemHash, itemHash),
              eq(taskStates.userHash, authContext.userHash)
            )
          )
          .run();

        return sendJson(res, 200, {
          success: true,
          state: {
            itemHash,
            status: updates.status ?? existing.status,
            sortOrder: updates.sortOrder ?? existing.sortOrder,
            statusUpdatedAt: updates.statusUpdatedAt ?? existing.statusUpdatedAt,
          },
        });
      }

      if (method === 'DELETE') {
        if (existing) {
          db.update(taskStates)
            .set({
              dismissed: true,
              lastSeenAt: now,
            })
            .where(
              and(
                eq(taskStates.itemHash, itemHash),
                eq(taskStates.userHash, authContext.userHash)
              )
            )
            .run();
        } else {
          db.insert(taskStates)
            .values({
              itemHash,
              userHash: authContext.userHash,
              status: 'inbox',
              sortOrder: 0,
              dismissed: true,
              statusUpdatedAt: now,
              lastSeenAt: now,
            })
            .run();
        }

        return sendJson(res, 200, { success: true });
      }
    }

    // 8. POST /api/sync
    if (pathname === '/api/sync' && method === 'POST') {
      const authContext = await getCurrentUserFromCookieHeader(cookieHeader);
      if (!authContext) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      const results = await syncAuthenticatedUser(authContext);
      return sendJson(res, 200, { success: true, mode: 'user', results });
    }

    // 9. Static SPA assets & fallback
    return serveStaticFile(pathname, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return sendJson(res, 500, { error: message });
  }
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Notificurom running on http://localhost:${PORT}`);
});
