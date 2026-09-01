import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAppConfig, getBaseUrl } from '@/lib/config';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  try {
    const config = await getAppConfig();
    const clientId = config.githubClientId;

    if (!clientId) {
      const url = new URL('/?auth=error&error=client_id_missing', baseUrl);
      return NextResponse.redirect(url);
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${baseUrl}/api/auth/github/callback`;
    const scope = 'repo,read:user';

    const cookieStore = await cookies();
    cookieStore.set('github_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    });

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login initiation failed';
    const errorUrl = new URL(`/?auth=error&error=${encodeURIComponent(message)}`, baseUrl);
    return NextResponse.redirect(errorUrl);
  }
}
