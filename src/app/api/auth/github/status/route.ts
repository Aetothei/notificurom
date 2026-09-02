import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/config';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getSystemConfig();
    const isConfigured = Boolean(
      config.githubClientId &&
      config.githubClientId.trim().length > 0 &&
      config.githubClientSecret &&
      config.githubClientSecret.trim().length > 0
    );

    const authContext = await getCurrentUser();
    const isConnected = Boolean(authContext && authContext.user);

    return NextResponse.json({
      isConfigured,
      isConnected,
      user: authContext?.user
        ? {
            id: authContext.user.id,
            login: authContext.user.username,
            name: authContext.user.name,
            avatarUrl: authContext.user.avatarUrl,
            email: authContext.user.email,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get auth status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
