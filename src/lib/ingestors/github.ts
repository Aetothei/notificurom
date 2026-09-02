import { Ingestor, IngestorContext, IngestorItemStatus, NormalizedItem, TaskSourceType } from '../types';
import { DEFAULT_GITHUB_QUERIES } from '../auth';

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

export class GitHubIngestor implements Ingestor {
  readonly provider = 'github';

  async isEnabled(context: IngestorContext): Promise<boolean> {
    return Boolean(context.account.accessToken && context.account.accessToken.trim().length > 0);
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

  private getQueries(context: IngestorContext): string[] {
    if (context.settings.githubQueries) {
      try {
        const parsed = JSON.parse(context.settings.githubQueries);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        const lines = context.settings.githubQueries
          .split('\n')
          .map((q) => q.trim())
          .filter(Boolean);
        if (lines.length > 0) return lines;
      }
    }
    return DEFAULT_GITHUB_QUERIES;
  }

  async fetchItems(context: IngestorContext): Promise<NormalizedItem[]> {
    const accessToken = context.account.accessToken.trim();
    if (!accessToken) {
      return [];
    }

    const queries = this.getQueries(context);
    const itemsMap = new Map<string, NormalizedItem>();

    for (const query of queries) {
      if (!query.trim()) continue;

      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Notificurom-GTD-App',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
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

        if (!itemsMap.has(sourceId)) {
          itemsMap.set(sourceId, {
            source: this.provider,
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

  async checkItemsStatus(
    sourceIds: string[],
    context: IngestorContext
  ): Promise<Map<string, IngestorItemStatus>> {
    const result = new Map<string, IngestorItemStatus>();
    const accessToken = context.account.accessToken.trim();
    if (!accessToken || sourceIds.length === 0) return result;

    const currentUsername = context.user.username ? context.user.username.toLowerCase() : null;

    // Filter github sourceIds: format `github:owner/repo#123`
    const githubItems = sourceIds
      .map((id) => {
        const match = id.match(/^github:([^/]+)\/([^#]+)#(\d+)$/);
        return match
          ? { sourceId: id, owner: match[1], repo: match[2], number: parseInt(match[3], 10) }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
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

            let isUnassigned = false;
            if (currentUsername) {
              const assignees = (data.assignees || []).map((a: { login: string }) =>
                a.login.toLowerCase()
              );
              const isAssigned = assignees.includes(currentUsername);

              if (data.pull_request) {
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
