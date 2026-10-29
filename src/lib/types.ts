import { Task, TaskStatus } from '@/db/schema';

export type { TaskStatus };

export type TaskSourceType = 'issue' | 'pr' | 'review_request';

export interface NormalizedItem {
  source: 'github';
  sourceType: TaskSourceType;
  sourceId: string; // e.g. 'github:owner/repo#123'
  title: string;
  url: string;
  repository: string;
  author: string;
  authorAvatarUrl: string;
  isClosed: boolean;
  sourceCreatedAt: string; // ISO 8601
  sourceUpdatedAt: string; // ISO 8601
  metadata: Record<string, unknown>;
}

export interface SyncResult {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  autoResolved: number;
  removed?: number;
  errors: string[];
  tasks?: Task[];
}
