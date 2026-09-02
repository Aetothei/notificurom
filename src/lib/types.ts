import { Account, User, UserSetting } from '@/db/schema';

export type TaskStatus = 'inbox' | 'next' | 'in_progress' | 'waiting' | 'done';

export type TaskSourceType = 'issue' | 'pr' | 'review_request' | 'message' | 'task';

export interface NormalizedItem {
  source: string; // 'github', 'slack', etc.
  sourceType: TaskSourceType;
  sourceId: string; // unique identifier e.g. 'github:repo#123'
  title: string;
  url: string;
  repository?: string;
  author?: string;
  authorAvatarUrl?: string;
  isClosed: boolean;
  sourceCreatedAt: string; // ISO 8601
  sourceUpdatedAt?: string; // ISO 8601
  metadata: Record<string, unknown>;
}

export interface IngestorItemStatus {
  isClosed: boolean;
  isNotFound?: boolean;
  isUnassigned?: boolean;
  title?: string;
}

export interface IngestorContext {
  user: User;
  account: Account;
  settings: UserSetting;
}

export interface Ingestor {
  readonly provider: string;
  isEnabled(context: IngestorContext): Promise<boolean>;
  fetchItems(context: IngestorContext): Promise<NormalizedItem[]>;
  checkItemsStatus?(
    sourceIds: string[],
    context: IngestorContext
  ): Promise<Map<string, IngestorItemStatus>>;
}

export interface SyncResult {
  source: string;
  fetched: number;
  created: number;
  updated: number;
  autoResolved: number;
  removed?: number;
  errors: string[];
}
