import { NextResponse } from 'next/server';
import { getSystemConfig, saveSystemConfig } from '@/lib/config';
import { getCurrentUser, getUserSettings, saveUserSettings, DEFAULT_GITHUB_QUERIES } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sysConfig = await getSystemConfig();
    const isConfigured = Boolean(
      sysConfig.githubClientId &&
      sysConfig.githubClientId.trim().length > 0 &&
      sysConfig.githubClientSecret &&
      sysConfig.githubClientSecret.trim().length > 0
    );

    const authContext = await getCurrentUser();
    const isConnected = Boolean(authContext && authContext.user);

    let githubQueries = DEFAULT_GITHUB_QUERIES;
    let autoArchiveClosed = true;
    let syncIntervalMinutes = 15;

    if (authContext) {
      const uSettings = await getUserSettings(authContext.user.id);
      if (uSettings.githubQueries) {
        try {
          githubQueries = JSON.parse(uSettings.githubQueries);
        } catch {
          githubQueries = DEFAULT_GITHUB_QUERIES;
        }
      }
      autoArchiveClosed = uSettings.autoArchiveClosed;
      syncIntervalMinutes = uSettings.syncIntervalMins;
    }

    return NextResponse.json({
      isConnected,
      isConfigured,
      user: authContext?.user
        ? {
            id: authContext.user.id,
            login: authContext.user.username,
            name: authContext.user.name,
            avatarUrl: authContext.user.avatarUrl,
            email: authContext.user.email,
          }
        : null,
      accounts: authContext?.accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
        hasRefreshToken: Boolean(a.refreshToken),
        tokenExpiresAt: a.tokenExpiresAt,
      })) || [],
      githubQueries,
      autoArchiveClosed,
      syncIntervalMinutes,
      githubClientId: sysConfig.githubClientId,
      hasClientSecret: Boolean(sysConfig.githubClientSecret),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Update system config (Client ID / Secret) if provided
    if (body.githubClientId !== undefined || body.githubClientSecret !== undefined) {
      await saveSystemConfig({
        githubClientId: body.githubClientId,
        githubClientSecret: body.githubClientSecret,
      });
    }

    // 2. Update user settings if user is authenticated
    const authContext = await getCurrentUser();
    if (authContext) {
      await saveUserSettings(authContext.user.id, {
        githubQueries: body.githubQueries,
        autoArchiveClosed: body.autoArchiveClosed,
        syncIntervalMins: body.syncIntervalMinutes,
      });
    }

    const updatedSys = await getSystemConfig();
    const isConfigured = Boolean(
      updatedSys.githubClientId &&
      updatedSys.githubClientId.trim().length > 0 &&
      updatedSys.githubClientSecret &&
      updatedSys.githubClientSecret.trim().length > 0
    );

    const refreshedAuth = await getCurrentUser();
    const isConnected = Boolean(refreshedAuth && refreshedAuth.user);

    let githubQueries = DEFAULT_GITHUB_QUERIES;
    let autoArchiveClosed = true;
    let syncIntervalMinutes = 15;

    if (refreshedAuth) {
      const uSettings = await getUserSettings(refreshedAuth.user.id);
      if (uSettings.githubQueries) {
        try {
          githubQueries = JSON.parse(uSettings.githubQueries);
        } catch {
          githubQueries = DEFAULT_GITHUB_QUERIES;
        }
      }
      autoArchiveClosed = uSettings.autoArchiveClosed;
      syncIntervalMinutes = uSettings.syncIntervalMins;
    }

    return NextResponse.json({
      success: true,
      isConnected,
      isConfigured,
      user: refreshedAuth?.user
        ? {
            id: refreshedAuth.user.id,
            login: refreshedAuth.user.username,
            name: refreshedAuth.user.name,
            avatarUrl: refreshedAuth.user.avatarUrl,
            email: refreshedAuth.user.email,
          }
        : null,
      accounts: refreshedAuth?.accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        providerAccountId: a.providerAccountId,
        hasRefreshToken: Boolean(a.refreshToken),
        tokenExpiresAt: a.tokenExpiresAt,
      })) || [],
      githubQueries,
      autoArchiveClosed,
      syncIntervalMinutes,
      githubClientId: updatedSys.githubClientId,
      hasClientSecret: Boolean(updatedSys.githubClientSecret),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
