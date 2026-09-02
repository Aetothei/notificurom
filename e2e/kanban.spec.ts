import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';

const TEST_USER_ID = 'test-user-e2e-123';
const TEST_SESSION_ID = 'test-session-token-e2e';

function setupTestDatabase() {
  const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'data', 'notificurom.db');
  const sqlite = new Database(dbPath);
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Ensure tables exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT UNIQUE,
      username TEXT NOT NULL,
      name TEXT,
      email TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at TEXT,
      scope TEXT,
      profile TEXT,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      github_queries TEXT,
      auto_archive_closed INTEGER NOT NULL DEFAULT 1,
      sync_interval_mins INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      repository TEXT,
      author TEXT,
      author_avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'inbox',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_closed INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT,
      status_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Upsert test user
  sqlite
    .prepare(
      `INSERT INTO users (id, github_id, username, name, email, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         github_id=excluded.github_id,
         username=excluded.username,
         name=excluded.name,
         avatar_url=excluded.avatar_url,
         updated_at=excluded.updated_at`
    )
    .run(
      TEST_USER_ID,
      '12345',
      'octocat',
      'Mona Lisa Octocat',
      'octocat@github.com',
      'https://github.com/octocat.png',
      now,
      now
    );

  // Upsert test session
  sqlite
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id=excluded.user_id,
         expires_at=excluded.expires_at`
    )
    .run(TEST_SESSION_ID, TEST_USER_ID, future, now);

  // Upsert test account with refresh token
  sqlite
    .prepare(
      `INSERT INTO accounts (id, user_id, provider, provider_account_id, access_token, refresh_token, token_expires_at, scope, profile, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=excluded.refresh_token,
         updated_at=excluded.updated_at`
    )
    .run(
      'account-test-1',
      TEST_USER_ID,
      'github',
      '12345',
      'gho_mock_access_token',
      'ghr_mock_refresh_token',
      future,
      'repo,read:user,user:email',
      JSON.stringify({ login: 'octocat', name: 'Mona Lisa Octocat' }),
      '{}',
      now,
      now
    );

  sqlite.close();
}

test.describe('Notificurom Kanban Board & Multi-User Flow', () => {
  test.beforeEach(async ({ context, request }) => {
    setupTestDatabase();

    // Set authenticated session cookie for page navigation
    await context.addCookies([
      {
        name: 'notificurom_session',
        value: TEST_SESSION_ID,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // Clean up existing tasks for this user
    const res = await request.get('/api/tasks', {
      headers: {
        Cookie: `notificurom_session=${TEST_SESSION_ID}`,
      },
    });

    if (res.ok()) {
      const data = await res.json();
      for (const t of data.tasks || []) {
        await request.delete(`/api/tasks/${t.id}`, {
          headers: {
            Cookie: `notificurom_session=${TEST_SESSION_ID}`,
          },
        });
      }
    }

    // Seed test tasks in Inbox for authenticated test user
    await request.post('/api/tasks', {
      headers: {
        Cookie: `notificurom_session=${TEST_SESSION_ID}`,
      },
      data: {
        title: 'Task Alpha',
        sourceType: 'task',
        status: 'inbox',
        sortOrder: 0,
      },
    });

    await request.post('/api/tasks', {
      headers: {
        Cookie: `notificurom_session=${TEST_SESSION_ID}`,
      },
      data: {
        title: 'Task Beta',
        sourceType: 'pr',
        repository: 'owner/repo',
        status: 'inbox',
        sortOrder: 1,
      },
    });
  });

  test('Story 2: loads cleanly with zero console or hydration errors for logged-in user', async ({ page }) => {
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

    // Verify age badge renders client text cleanly without errors
    await expect(page.getByText(/Age (just now|\d+[mhd])/).first()).toBeVisible();

    expect(consoleIssues).toEqual([]);
  });

  test('Story 1: move card using chevron action button persists across reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();

    // Locate Task Alpha card specifically
    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    await alphaCard.hover();

    // Click "Move forward" on Task Alpha
    const moveForwardBtn = alphaCard.getByTitle('Move forward to next');
    await moveForwardBtn.click();

    // Verify Task Alpha moved to Next Actions column
    const nextCol = page.locator('[data-testid="column-next"]');
    await expect(nextCol.getByText('Task Alpha')).toBeVisible();

    // Hard reload the page
    await page.reload();

    // Assert persistence in SQLite backend
    const nextColAfterReload = page.locator('[data-testid="column-next"]');
    await expect(nextColAfterReload.getByText('Task Alpha')).toBeVisible();

    const inboxColAfterReload = page.locator('[data-testid="column-inbox"]');
    await expect(inboxColAfterReload.getByText('Task Alpha')).not.toBeVisible();
  });

  test('Story 1: drag and drop card between columns persists across reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();

    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    const dragHandle = alphaCard.getByTitle('Drag to reorder or move column');
    const inProgressColumn = page.locator('[data-testid="column-in_progress"]');

    // Perform smooth drag and drop from handle to target column
    const handleBox = await dragHandle.boundingBox();
    const targetBox = await inProgressColumn.boundingBox();

    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (handleBox && targetBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 15 }
      );
      await page.mouse.up();
    }

    // Verify Task Alpha is now in In Progress column
    await expect(inProgressColumn.getByText('Task Alpha')).toBeVisible();

    // Reload the page to test database persistence
    await page.reload();

    const inProgressColAfterReload = page.locator('[data-testid="column-in_progress"]');
    await expect(inProgressColAfterReload.getByText('Task Alpha')).toBeVisible();

    const inboxColAfterReload = page.locator('[data-testid="column-inbox"]');
    await expect(inboxColAfterReload.getByText('Task Alpha')).not.toBeVisible();
  });

  test('Story 1: create new task via modal and verify persistence', async ({ page }) => {
    await page.goto('/');

    // Click "New Task"
    await page.getByRole('button', { name: 'New Task' }).click();

    // Fill modal form
    await page.getByPlaceholder('What needs to be done?').fill('Task Gamma Manual');
    await page.getByPlaceholder('e.g. backend/auth').fill('frontend/core');
    await page.getByRole('button', { name: 'Create Item' }).click();

    // Verify Task Gamma is in Inbox
    const inboxCol = page.locator('[data-testid="column-inbox"]');
    await expect(inboxCol.getByText('Task Gamma Manual')).toBeVisible();

    // Reload and assert persistence
    await page.reload();
    const inboxAfterReload = page.locator('[data-testid="column-inbox"]');
    await expect(inboxAfterReload.getByText('Task Gamma Manual')).toBeVisible();
  });

  test('Story 1: delete task and verify removal', async ({ page }) => {
    await page.goto('/');
    const alphaCard = page.locator('[data-testid="task-card"]', { hasText: 'Task Alpha' });
    await alphaCard.hover();

    const deleteBtn = alphaCard.getByTitle('Remove from board');
    await deleteBtn.click();

    await expect(page.getByText('Task Alpha')).not.toBeVisible();

    await page.reload();
    await expect(page.getByText('Task Alpha')).not.toBeVisible();
    await expect(page.getByText('Task Beta')).toBeVisible();
  });

  test('Story 1 & UI: search and filter tasks', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Task Alpha')).toBeVisible();
    await expect(page.getByText('Task Beta')).toBeVisible();

    // Search for Alpha
    const searchInput = page.getByPlaceholder(/Filter tasks/);
    await searchInput.fill('Alpha');

    await expect(page.getByText('Task Alpha')).toBeVisible();
    await expect(page.getByText('Task Beta')).not.toBeVisible();

    // Clear search
    await searchInput.fill('');
    await expect(page.getByText('Task Beta')).toBeVisible();

    // Filter by PRs only
    const sourceSelect = page.locator('select');
    await sourceSelect.selectOption('github_pr');
    await expect(page.getByText('Task Beta')).toBeVisible();
    await expect(page.getByText('Task Alpha')).not.toBeVisible();
  });

  test('Unauthenticated user lands on Sign in with GitHub screen', async ({ context, page, request }) => {
    // 1. Configure system credentials
    await request.post('/api/settings', {
      data: {
        githubClientId: 'client_id_test',
        githubClientSecret: 'client_secret_test',
      },
    });

    // 2. Clear cookies to simulate unauthenticated visitor
    await context.clearCookies();

    await page.goto('/');
    await expect(page.getByText('Achieve Zero-Inbox')).toBeVisible();
    await expect(page.getByText('Continue with GitHub')).toBeVisible();
  });

  test('GitHub App OAuth API endpoints & status workflow', async ({ request }) => {
    // 1. Reset OAuth settings
    await request.post('/api/auth/github/disconnect', {
      headers: { Cookie: `notificurom_session=${TEST_SESSION_ID}` },
    });
    await request.post('/api/settings', {
      data: {
        githubClientId: '',
        githubClientSecret: '',
      },
    });

    // 2. Status with unconfigured credentials
    const statusRes = await request.get('/api/auth/github/status');
    expect(statusRes.ok()).toBeTruthy();
    const statusData = await statusRes.json();
    expect(statusData.isConfigured).toBe(false);

    // 3. Configure Client ID & Secret
    const saveSettingsRes = await request.post('/api/settings', {
      data: {
        githubClientId: 'test_client_id_123',
        githubClientSecret: 'test_client_secret_456',
        githubQueries: ['is:open is:pr assignee:@me'],
        autoArchiveClosed: true,
        syncIntervalMinutes: 20,
      },
    });
    expect(saveSettingsRes.ok()).toBeTruthy();

    // 4. Status is now configured
    const statusAfterConfig = await (await request.get('/api/auth/github/status')).json();
    expect(statusAfterConfig.isConfigured).toBe(true);

    // 5. GET /api/auth/github/login returns redirect to GitHub OAuth
    const loginRes = await request.get('/api/auth/github/login', {
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(loginRes.status());
    const location = loginRes.headers()['location'];
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=test_client_id_123');
    expect(location).toContain('scope=repo%2Cread%3Auser%2Cuser%3Aemail');
    expect(location).toContain('state=');

    // Check state cookie is set
    const cookiesHeader = loginRes.headers()['set-cookie'];
    expect(cookiesHeader).toBeDefined();
    expect(cookiesHeader).toContain('github_oauth_state=');

    // 6. Callback with invalid state redirects to /?auth=error
    const callbackRes = await request.get('/api/auth/github/callback?code=abc&state=wrong_state', {
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(callbackRes.status());
    expect(callbackRes.headers()['location']).toContain('/?auth=error');

    // 7. Logout endpoint
    const logoutRes = await request.post('/api/auth/logout');
    expect(logoutRes.ok()).toBeTruthy();
    const logoutData = await logoutRes.json();
    expect(logoutData.success).toBe(true);
  });

  test('UI: Displays connected GitHub user state and allows logout', async ({ page, request }) => {
    // 1. Configure auth with system credentials
    await request.post('/api/settings', {
      data: {
        githubClientId: 'client_id_test',
        githubClientSecret: 'client_secret_test',
      },
    });

    // 2. Open page and verify connected user is displayed
    await page.goto('/');
    await expect(page.getByText('@octocat')).toBeVisible();

    // 3. Open user menu
    await page.getByText('@octocat').click();
    await expect(page.getByText('Settings & Queries')).toBeVisible();
    await expect(page.getByText('Log Out')).toBeVisible();

    // 4. Open Settings Modal and verify connected status
    await page.getByText('Settings & Queries').click();
    await expect(page.getByText('Configuration & Integrations')).toBeVisible();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Mona Lisa Octocat')).toBeVisible();
    await expect(page.getByText(/OAuth session active/)).toBeVisible();

    // 5. Click Disconnect inside Settings Modal
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Disconnected from GitHub.')).toBeVisible();
    await expect(page.getByText('Not Connected')).toBeVisible();
  });
});
