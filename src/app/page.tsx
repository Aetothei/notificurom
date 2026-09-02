import { db } from '@/db';
import { tasks } from '@/db/schema';
import { getSystemConfig, getSetting } from '@/lib/config';
import { getCurrentUser } from '@/lib/auth';
import { Dashboard } from '@/components/Dashboard';
import { LandingPage } from '@/components/LandingPage';
import { asc, desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const sysConfig = await getSystemConfig();
  const authContext = await getCurrentUser();

  const isConfigured = Boolean(
    sysConfig.githubClientId &&
    sysConfig.githubClientId.trim().length > 0 &&
    sysConfig.githubClientSecret &&
    sysConfig.githubClientSecret.trim().length > 0
  );

  let initialBanner: { type: 'success' | 'error'; message: string } | null = null;
  if (params.auth === 'success') {
    initialBanner = {
      type: 'success',
      message: 'Successfully signed in with GitHub!',
    };
  } else if (params.auth === 'error') {
    const errorMsg =
      (typeof params.error === 'string' ? params.error : '') ||
      (typeof params.message === 'string' ? params.message : '') ||
      'Authentication failed';
    initialBanner = {
      type: 'error',
      message: `GitHub sign-in failed: ${errorMsg}`,
    };
  }

  // If user is not authenticated, show modern landing & login view
  if (!authContext) {
    return (
      <LandingPage
        isConfigured={isConfigured}
        initialBanner={initialBanner}
      />
    );
  }

  // If user is authenticated, fetch their tasks and render their personal Kanban board
  const userTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, authContext.user.id))
    .orderBy(asc(tasks.sortOrder), desc(tasks.sourceCreatedAt))
    .all();

  const lastSyncTime = await getSetting(`last_sync_time_${authContext.user.id}`, '');

  return (
    <Dashboard
      initialTasks={userTasks}
      initialIsConnected={true}
      initialIsConfigured={isConfigured}
      initialUser={{
        id: authContext.user.id,
        login: authContext.user.username,
        name: authContext.user.name,
        avatarUrl: authContext.user.avatarUrl,
        email: authContext.user.email,
      }}
      initialLastSync={lastSyncTime || null}
      initialBanner={initialBanner}
    />
  );
}
