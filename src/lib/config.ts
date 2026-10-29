export interface SystemConfig {
  githubClientId: string;
  githubClientSecret: string;
  githubOAuthScopes: string;
  allowedGithubUsers: string[];
}

export function getSystemConfig(): SystemConfig {
  const githubClientId = (process.env.GITHUB_CLIENT_ID || process.env.GH_CLIENT_ID || '').trim();
  const githubClientSecret = (
    process.env.GITHUB_CLIENT_SECRET ||
    process.env.GH_CLIENT_SECRET ||
    ''
  ).trim();

  // Default to 'repo,read:user' for classic OAuth apps to allow reading private PRs/issues across orgs.
  // Can be set to empty string via GITHUB_OAUTH_SCOPES="" if using a fine-grained GitHub App.
  const githubOAuthScopes = (process.env.GITHUB_OAUTH_SCOPES ?? 'repo,read:user').trim();

  const rawAllowed = process.env.ALLOWED_GITHUB_USERS || '';
  const allowedGithubUsers = rawAllowed
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);

  return {
    githubClientId,
    githubClientSecret,
    githubOAuthScopes,
    allowedGithubUsers,
  };
}

export function isUserAllowed(login: string): boolean {
  const { allowedGithubUsers } = getSystemConfig();
  if (allowedGithubUsers.length === 0) {
    return true;
  }
  return allowedGithubUsers.includes(login.trim().toLowerCase());
}

export function getBaseUrlFromNodeHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const forwardedHost = Array.isArray(headers['x-forwarded-host'])
    ? headers['x-forwarded-host'][0]
    : headers['x-forwarded-host'];
  const forwardedProto =
    (Array.isArray(headers['x-forwarded-proto'])
      ? headers['x-forwarded-proto'][0]
      : headers['x-forwarded-proto']) || 'https';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = Array.isArray(headers['host']) ? headers['host'][0] : headers['host'];
  if (host) {
    const isLocal =
      host.includes('localhost') || host.includes('127.0.0.1') || host.includes('0.0.0.0');
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }

  return 'http://localhost:3000';
}
