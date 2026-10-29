import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import { encryptData } from '../src/lib/crypto';
import type { SessionCookiePayload } from '../src/lib/auth';

const TEST_COOKIE_PAYLOAD: SessionCookiePayload = {
  githubId: '12345',
  login: 'octocat',
  name: 'Mona Lisa Octocat',
  avatarUrl: 'https://github.com/octocat.png',
  accessToken: 'gho_e2e_mock_token',
  refreshToken: 'ghr_e2e_mock_refresh_token',
  tokenExpiresAt: Date.now() + 8 * 60 * 60 * 1000,
  issuedAt: Date.now(),
};

function getEncryptedTestSessionCookie(): string {
  return encryptData(TEST_COOKIE_PAYLOAD);
}

function resetTestDatabase() {
  const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'test-e2e.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_states (
      item_hash TEXT PRIMARY KEY,
      user_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox',
      sort_order INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      status_updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_hash TEXT PRIMARY KEY,
      auto_archive_closed INTEGER NOT NULL DEFAULT 1,
      sync_interval_mins INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT NOT NULL
    );
    DELETE FROM task_states;
    DELETE FROM user_preferences;
  `);
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore
  }
  sqlite.close();
}

test.describe('Notificurom Kanban Board', () => {
  let sessionCookieValue: string;

  test.beforeEach(async ({ context }) => {
    resetTestDatabase();
    sessionCookieValue = getEncryptedTestSessionCookie();

    await context.addCookies([
      {
        name: 'notificurom_session',
        value: sessionCookieValue,
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('loads cleanly with zero console or hydration errors and creates pointer rows', async ({
    page,
  }) => {
    const consoleIssues: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' ||
        text.includes('Hydration failed') ||
        text.includes('did not match')
      ) {
        consoleIssues.push(text);
      }
    });

    await page.goto('/');
    await expect(page.getByText('Notificurom')).toBeVisible();
    await expect(page.getByText('Task Alpha')).toBeVisible();
    await expect(page.getByText('Task Beta')).toBeVisible();

    await expect(page.getByText(/Age (just now|\d+[mhd])/).first()).toBeVisible();
    expect(consoleIssues).toEqual([]);

    const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'test-e2e.db');
    const sqlite = new Database(dbPath, { readonly: true });
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).not.toContain('users');
    expect(tableNames).not.toContain('accounts');
    expect(tableNames).not.toContain('tasks');
    expect(tableNames).toContain('task_states');
    expect(tableNames).toContain('user_preferences');

    const states = sqlite.prepare('SELECT * FROM task_states').all() as Array<{
      item_hash: string;
      user_hash: string;
    }>;
    expect(states.length).toBe(2);
    for (const row of states) {
      expect(row.item_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.user_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(row)).not.toContain('Task Alpha');
      expect(JSON.stringify(row)).not.toContain('owner/repo');
      expect(JSON.stringify(row)).not.toContain('octocat');
    }
    sqlite.close();
  });

  test('dragging card from repo text or title persists across reload via HMAC pointer', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();

    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    const repoText = alphaCard.locator('[title*="owner/repo"]');
    const nextColumn = page.locator('[data-testid="column-next"]');

    const repoBox = await repoText.boundingBox();
    const targetBox = await nextColumn.boundingBox();

    expect(repoBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    const patchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/tasks/') && res.request().method() === 'PATCH'
    );

    if (repoBox && targetBox) {
      await page.mouse.move(
        repoBox.x + repoBox.width / 2,
        repoBox.y + repoBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 15 }
      );
      await page.mouse.up();
    }

    await patchPromise;
    await expect(nextColumn.getByText('Task Alpha')).toBeVisible();

    await page.reload();

    const nextColAfterReload = page.locator('[data-testid="column-next"]');
    await expect(nextColAfterReload.getByText('Task Alpha')).toBeVisible();

    const inboxColAfterReload = page.locator('[data-testid="column-inbox"]');
    await expect(inboxColAfterReload.getByText('Task Alpha')).not.toBeVisible();
  });

  test('drag and drop card from anywhere between columns persists across reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();

    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    const inProgressColumn = page.locator('[data-testid="column-in_progress"]');

    const cardBox = await alphaCard.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();

    expect(cardBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    const patchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/tasks/') && res.request().method() === 'PATCH'
    );

    if (cardBox && targetBox) {
      await page.mouse.move(
        cardBox.x + cardBox.width / 2,
        cardBox.y + cardBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 15 }
      );
      await page.mouse.up();
    }

    await patchPromise;
    await expect(inProgressColumn.getByText('Task Alpha')).toBeVisible();

    await page.reload();

    const inProgressColAfterReload = page.locator('[data-testid="column-in_progress"]');
    await expect(inProgressColAfterReload.getByText('Task Alpha')).toBeVisible();

    const inboxColAfterReload = page.locator('[data-testid="column-inbox"]');
    await expect(inboxColAfterReload.getByText('Task Alpha')).not.toBeVisible();
  });

  test('dismiss task and verify removal persists across reload', async ({ page }) => {
    await page.goto('/');
    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    await alphaCard.hover();

    const deletePromise = page.waitForResponse(
      (res) => res.url().includes('/api/tasks/') && res.request().method() === 'DELETE'
    );
    const deleteBtn = alphaCard.getByTitle('Remove from board');
    await deleteBtn.click();
    await deletePromise;

    await expect(page.getByText('Task Alpha')).not.toBeVisible();

    await page.reload();
    await expect(page.getByText('Task Alpha')).not.toBeVisible();
    await expect(page.getByText('Task Beta')).toBeVisible();
  });

  test('search and filter tasks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();
    await expect(page.getByText('Task Beta')).toBeVisible();

    const searchInput = page.getByPlaceholder(/Filter tasks/);
    await searchInput.fill('Alpha');

    await expect(page.getByText('Task Alpha')).toBeVisible();
    await expect(page.getByText('Task Beta')).not.toBeVisible();

    await searchInput.fill('');
    await expect(page.getByText('Task Beta')).toBeVisible();

    const prsFilterBtn = page.locator('[data-filter-id="github_pr"]');
    await prsFilterBtn.click();
    await expect(page.getByText('Task Beta')).toBeVisible();
    await expect(page.getByText('Task Alpha')).not.toBeVisible();
  });

  test('unauthenticated user lands on simple internal login card and cannot access /api/settings', async ({
    context,
    page,
    request,
  }) => {
    await context.clearCookies();

    const unauthSettingsGet = await request.get('/api/settings');
    expect(unauthSettingsGet.status()).toBe(401);

    const unauthSettingsPost = await request.post('/api/settings', {
      data: { syncIntervalMinutes: 20 },
    });
    expect(unauthSettingsPost.status()).toBe(401);

    await page.goto('/');
    await expect(page.getByText('Notificurom')).toBeVisible();
    await expect(page.getByText('Internal PR & Issue Board')).toBeVisible();
    await expect(page.getByText('Sign in with GitHub')).toBeVisible();
  });

  test('GitHub OAuth endpoints, preferences workflow, and data wipe', async ({ request }) => {
    const authHeader = { Cookie: `notificurom_session=${sessionCookieValue}` };

    // 1. Status endpoint
    const statusRes = await request.get('/api/auth/github/status', { headers: authHeader });
    expect(statusRes.ok()).toBeTruthy();
    const statusData = await statusRes.json();
    expect(statusData.isConfigured).toBe(true);
    expect(statusData.isConnected).toBe(true);
    expect(statusData.user.login).toBe('octocat');

    // 2. Save preferences via authenticated POST /api/settings
    const saveSettingsRes = await request.post('/api/settings', {
      headers: authHeader,
      data: {
        autoArchiveClosed: true,
        syncIntervalMinutes: 20,
      },
    });
    expect(saveSettingsRes.ok()).toBeTruthy();
    const savedData = await saveSettingsRes.json();
    expect(savedData.syncIntervalMinutes).toBe(20);

    // 3. GET /api/auth/github/login redirects to GitHub with repo scope
    const loginRes = await request.get('/api/auth/github/login', { maxRedirects: 0 });
    expect([302, 307]).toContain(loginRes.status());
    const location = loginRes.headers()['location'];
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=');
    expect(location).toContain('scope=repo%2Cread%3Auser');

    // 4. Wipe user data via DELETE /api/settings
    const wipeRes = await request.delete('/api/settings', { headers: authHeader });
    expect(wipeRes.ok()).toBeTruthy();
    const wipeData = await wipeRes.json();
    expect(wipeData.success).toBe(true);
  });

  test('UI: Displays connected user state, opens clean settings, and allows wipe data', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('@octocat')).toBeVisible();

    // Open user menu on the far right and click Settings
    await page.getByText('@octocat').click();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Mona Lisa Octocat')).toBeVisible();
    await expect(page.getByText('Polling Interval')).toBeVisible();
    await expect(page.getByText('Wipe Board Data')).toBeVisible();

    // Verify confirmation flow on Wipe Board Data
    await page.getByRole('button', { name: 'Wipe Data' }).click();
    await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Board data wiped successfully.')).toBeVisible();
  });
});
