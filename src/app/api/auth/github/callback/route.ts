import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSystemConfig, getBaseUrl } from '@/lib/config';
import { upsertUserFromGitHub, createSession } from '@/lib/auth';
import { syncUser } from '@/lib/sync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (error) {
    const errorMsg = errorDescription || error;
    return NextResponse.redirect(
      new URL(`/?auth=error&error=${encodeURIComponent(errorMsg)}`, baseUrl)
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get('github_oauth_state')?.value;
  cookieStore.delete('github_oauth_state');

  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL('/?auth=error&error=invalid_state', baseUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?auth=error&error=missing_code', baseUrl)
    );
  }

  try {
    const config = await getSystemConfig();
    const clientId = config.githubClientId;
    const clientSecret = config.githubClientSecret;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/?auth=error&error=oauth_not_configured', baseUrl)
      );
    }

    // Exchange authorization code for access token & refresh token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Notificurom-GTD-App',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        new URL('/?auth=error&error=token_exchange_failed', baseUrl)
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed';
      return NextResponse.redirect(
        new URL(`/?auth=error&error=${encodeURIComponent(errMsg)}`, baseUrl)
      );
    }

    // Fetch user profile from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenData.access_token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Notificurom-GTD-App',
      },
      cache: 'no-store',
    });

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL('/?auth=error&error=user_fetch_failed', baseUrl)
      );
    }

    const userData = await userRes.json();

    // JIT Provisioning / Account update with token & refresh token
    const user = await upsertUserFromGitHub(
      {
        id: userData.id,
        login: userData.login,
        name: userData.name || null,
        avatar_url: userData.avatar_url || null,
        email: userData.email || null,
      },
      {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_in: tokenData.expires_in || null,
        refresh_token_expires_in: tokenData.refresh_token_expires_in || null,
        scope: tokenData.scope || null,
      }
    );

    // Create session cookie
    await createSession(user.id);

    // Trigger initial background sync
    syncUser(user.id).catch((err) => {
      console.error('Initial user sync error:', err);
    });

    return NextResponse.redirect(new URL('/?auth=success', baseUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Callback handling failed';
    return NextResponse.redirect(
      new URL(`/?auth=error&error=${encodeURIComponent(message)}`, baseUrl)
    );
  }
}
