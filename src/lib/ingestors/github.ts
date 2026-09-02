import { Ingestor, NormalizedItem, TaskSourceType } from '../types';
import { getAppConfig, clearGitHubAuth } from '../config';

interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

interface GitHubUser {
  login: string;
  avatar_url: string;
}

interface GitHubSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed';
  state_reason?: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees?: GitHubUser[];
  pull_request?: {
    url: string;
    html_url: string;
    merged_at?: string | null;
  };
  repository_url: string;
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

export interface GitHubItemStatus {
  isClosed: boolean;
  isNotFound?: boolean;
  isUnassigned?: boolean;
  title?: string;
}

export class GitHubIngestor implements Ingestor {
  readonly name = 'github';

  async isEnabled(): Promise<boolean> {
    const config = await getAppConfig();
    return Boolean(config.githubAccessToken && config.githubAccessToken.trim().length > 0);
  }

  async getCurrentUser(): Promise<string | null> {
    const config = await getAppConfig();
    if (!config.githubAccessToken) return null;
    if (config.githubUser?.login) return config.githubUser.login;
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubAccessToken.trim()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Notificurom-GTD-App',
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return data.login || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private extractRepoFromUrl(htmlUrl: string, repositoryUrl: string): string {
    try {
      const parsed = new URL(htmlUrl);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    } catch {
      // fallback to repository_url
    }

    const match = repositoryUrl.match(/repos\/([^/]+\/[^/]+)/);
    return match ? match[1] : 'unknown/repo';
  }

  private determineSourceType(item: GitHubSearchItem, query: string): TaskSourceType {
    if (item.pull_request) {
      if (query.includes('review-requested')) {
        return 'review_request';
      }
      return 'pr';
    }
    return 'issue';
  }

  async fetchItems(): Promise<NormalizedItem[]> {
    const config = await getAppConfig();
    if (!config.githubAccessToken) {
      return [];
    }

    const itemsMap = new Map<string, NormalizedItem>();

    for (const query of config.githubQueries) {
      if (!query.trim()) continue;

      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${config.githubAccessToken.trim()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Notificurom-GTD-App',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await clearGitHubAuth();
          throw new Error('GitHub access token has expired or was revoked. Please click "Connect GitHub" to reconnect.');
        }
        const errorText = await response.text();
        throw new Error(
          `GitHub API error (${response.status} ${response.statusText}): ${errorText}`
        );
      }

      const data = (await response.json()) as GitHubSearchResponse;

      for (const item of data.items || []) {
        const repo = this.extractRepoFromUrl(item.html_url, item.repository_url);
        const sourceId = `github:${repo}#${item.number}`;
        const sourceType = this.determineSourceType(item, query);

        // If item is already seen in a previous query (e.g. both assigned & review-requested), preserve or merge
        if (!itemsMap.has(sourceId)) {
          itemsMap.set(sourceId, {
            source: this.name,
            sourceType,
            sourceId,
            title: item.title,
            url: item.html_url,
            repository: repo,
            author: item.user?.login || 'unknown',
            authorAvatarUrl: item.user?.avatar_url || '',
            isClosed: item.state === 'closed',
            sourceCreatedAt: item.created_at,
            sourceUpdatedAt: item.updated_at,
            metadata: {
              number: item.number,
              state: item.state,
              stateReason: item.state_reason,
              isPullRequest: Boolean(item.pull_request),
              labels: (item.labels || []).map((l) => ({
                name: l.name,
                color: l.color,
                description: l.description,
              })),
              assignees: (item.assignees || []).map((a) => a.login),
            },
          });
        }
      }
    }

    return Array.from(itemsMap.values());
  }

  // Helper method to check status of tracked GitHub items to detect closed/merged state or unassignment
  async checkItemsStatus(sourceIds: string[]): Promise<Map<string, GitHubItemStatus>> {
    const config = await getAppConfig();
    const result = new Map<string, GitHubItemStatus>();
    if (!config.githubAccessToken || sourceIds.length === 0) return result;

    const currentUser = await this.getCurrentUser();
    const currentUsername = currentUser ? currentUser.toLowerCase() : null;

    // Filter github sourceIds: format `github:owner/repo#123`
    const githubItems = sourceIds
      .map((id) => {
        const match = id.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
        return match ? { sourceId: id, owner: match[1], repo: match[2], number: parseInt(match[3], 10) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubAccessToken.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Notificurom-GTD-App',
    };

    // Process items in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < Math.min(githubItems.length, 100); i += BATCH_SIZE) {
      const batch = githubItems.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (item) => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${item.owner}/${item.repo}/issues/${item.number}`,
              { headers, cache: 'no-store' }
            );

            if (res.status === 404 || res.status === 410) {
              result.set(item.sourceId, { isClosed: false, isNotFound: true });
              return;
            }

            if (!res.ok) return;

            const data = await res.json();
            const isClosed = data.state === 'closed';

            if (isClosed) {
              result.set(item.sourceId, {
                isClosed: true,
                isNotFound: false,
                isUnassigned: false,
                title: data.title,
              });
              return;
            }

            // If issue/PR is still open on GitHub, check if user is still assigned
            let isUnassigned = false;
            if (currentUsername) {
              const assignees = (data.assignees || []).map((a: { login: string }) =>
                a.login.toLowerCase()
              );
              const isAssigned = assignees.includes(currentUsername);

              if (data.pull_request) {
                // If it's a pull request and user is not in assignees, check requested_reviewers
                if (!isAssigned) {
                  try {
                    const prRes = await fetch(
                      `https://api.github.com/repos/${item.owner}/${item.repo}/pulls/${item.number}`,
                      { headers, cache: 'no-store' }
                    );
                    if (prRes.ok) {
                      const prData = await prRes.json();
                      const reviewers = (prData.requested_reviewers || []).map(
                        (r: { login: string }) => r.login.toLowerCase()
                      );
                      const isReviewer = reviewers.includes(currentUsername);
                      if (!isReviewer) {
                        isUnassigned = true;
                      }
                    } else {
                      isUnassigned = true;
                    }
                  } catch {
                    isUnassigned = true;
                  }
                }
              } else {
                // Regular issue: if not assigned to user anymore
                if (!isAssigned) {
                  isUnassigned = true;
                }
              }
            }

            result.set(item.sourceId, {
              isClosed: false,
              isNotFound: false,
              isUnassigned,
              title: data.title,
            });
          } catch {
            // ignore individual item check failure
          }
        })
      );
    }

    return result;
  }
}
