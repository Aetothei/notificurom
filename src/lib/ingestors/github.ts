import { NormalizedItem, TaskSourceType } from '../types';
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

export class GitHubIngestor {
  readonly provider = 'github' as const;

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

  private buildRecentlyClosedQueries(autoArchiveClosed: boolean): string[] {
    if (!autoArchiveClosed) return [];

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return [
      `is:closed closed:>=${sevenDaysAgo} is:issue assignee:@me`,
      `is:closed closed:>=${sevenDaysAgo} is:pr assignee:@me`,
      `is:closed closed:>=${sevenDaysAgo} is:pr review-requested:@me`,
    ];
  }

  async fetchItems(accessToken: string, autoArchiveClosed = true): Promise<NormalizedItem[]> {
    const token = accessToken.trim();
    if (!token) return [];

    if (token === 'gho_e2e_mock_token') {
      return getMockE2EGitHubItems();
    }

    const activeQueries = DEFAULT_GITHUB_QUERIES;
    const closedQueries = this.buildRecentlyClosedQueries(autoArchiveClosed);
    const allQueries = [...activeQueries, ...closedQueries];

    const itemsMap = new Map<string, NormalizedItem>();

    const responses = await Promise.all(
      allQueries.map(async (query) => {
        const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`;
        const response = await fetch(url, {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
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
        return { query, items: data.items || [] };
      })
    );

    for (const { query, items } of responses) {
      for (const item of items) {
        const repo = this.extractRepoFromUrl(item.html_url, item.repository_url);
        const sourceId = `github:${repo}#${item.number}`;
        const sourceType = this.determineSourceType(item, query);

        if (!itemsMap.has(sourceId)) {
          itemsMap.set(sourceId, {
            source: 'github',
            sourceType,
            sourceId,
            title: item.title,
            url: item.html_url,
            repository: repo,
            author: item.user?.login || 'unknown',
            authorAvatarUrl: item.user?.avatar_url || '',
            isClosed: item.state === 'closed',
            sourceCreatedAt: item.created_at,
            sourceUpdatedAt: item.updated_at || item.created_at,
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
}

function getMockE2EGitHubItems(): NormalizedItem[] {
  const now = new Date().toISOString();
  return [
    {
      source: 'github',
      sourceType: 'issue',
      sourceId: 'github:owner/repo#101',
      title: 'Task Alpha',
      url: 'https://github.com/owner/repo/issues/101',
      repository: 'owner/repo',
      author: 'octocat',
      authorAvatarUrl: 'https://github.com/octocat.png',
      isClosed: false,
      sourceCreatedAt: now,
      sourceUpdatedAt: now,
      metadata: {
        number: 101,
        state: 'open',
        isPullRequest: false,
        labels: [{ name: 'security', color: '10b981' }],
        assignees: ['octocat'],
      },
    },
    {
      source: 'github',
      sourceType: 'pr',
      sourceId: 'github:owner/repo#102',
      title: 'Task Beta',
      url: 'https://github.com/owner/repo/pull/102',
      repository: 'owner/repo',
      author: 'octocat',
      authorAvatarUrl: 'https://github.com/octocat.png',
      isClosed: false,
      sourceCreatedAt: now,
      sourceUpdatedAt: now,
      metadata: {
        number: 102,
        state: 'open',
        isPullRequest: true,
        labels: [],
        assignees: ['octocat'],
      },
    },
  ];
}
