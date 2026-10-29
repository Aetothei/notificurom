import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, TaskStatus } from '@/db/schema';
import { AgeBadge } from './AgeBadge';
import { StatBadge } from './StatBadge';
import {
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onMoveColumn?: (taskId: string, targetStatus: TaskStatus) => void;
  onDelete?: (taskId: string) => void;
  onFilterRepo?: (repo: string) => void;
  isOverlay?: boolean;
}

const STATUS_ORDER: TaskStatus[] = ['inbox', 'next', 'in_progress', 'waiting', 'done'];

interface CardLabel {
  name: string;
  color?: string;
  description?: string;
}

interface CardMetadata {
  number?: number;
  labels?: CardLabel[];
  [key: string]: unknown;
}

export function TaskCard({
  task,
  onMoveColumn,
  onDelete,
  onFilterRepo,
  isOverlay = false,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  let metadata: CardMetadata = {};
  try {
    if (task.metadata) {
      metadata = JSON.parse(task.metadata);
    }
  } catch {
    metadata = {};
  }

  const issueNumber =
    metadata.number ||
    (task.sourceId.includes('#') ? task.sourceId.split('#')[1] : undefined);

  const currentIndex = STATUS_ORDER.indexOf(task.status as TaskStatus);
  const prevStatus = currentIndex > 0 ? STATUS_ORDER[currentIndex - 1] : null;
  const nextStatus = currentIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIndex + 1] : null;
  const isDone = task.status === 'done';

  // Split "org/repo" so we can render org muted and repo bright
  const repoParts = task.repository ? task.repository.split('/') : [];
  const orgName = repoParts.length === 2 ? repoParts[0] : null;
  const repoName = repoParts.length === 2 ? repoParts[1] : task.repository;

  const renderSourceBadge = () => {
    if (task.sourceType === 'review_request') {
      return (
        <StatBadge
          icon="mdi:eye-outline"
          value="Review"
          variant="amber"
          className="px-2 py-0.5 text-[11px]"
        />
      );
    }
    if (task.sourceType === 'pr') {
      return (
        <StatBadge
          icon="mdi:source-pull"
          value="PR"
          variant="blue"
          className="px-2 py-0.5 text-[11px]"
        />
      );
    }
    return (
      <StatBadge
        icon="mdi:record-circle-outline"
        value="Issue"
        variant="teal"
        className="px-2 py-0.5 text-[11px]"
      />
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-task-id={task.id}
      data-testid="task-card"
      className={`group relative rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl p-3.5 transition-all duration-200 text-zinc-100 flex flex-col gap-2.5 select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : isDone ? 'opacity-75 hover:opacity-100' : ''
      } ${
        isOverlay
          ? 'shadow-[0_16px_40px_rgba(0,0,0,0.65)] bg-[#161822]/95 z-50 cursor-grabbing scale-[1.02] opacity-100'
          : ''
      }`}
    >
      {/* Top Row: Source Badge + Repo Name + Hover Quick Actions */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {renderSourceBadge()}
          {task.repository && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onFilterRepo?.(task.repository!);
              }}
              className="text-xs font-mono truncate hover:text-amber-300 transition-colors cursor-pointer text-left min-w-0 flex-1"
              title={`Filter by ${task.repository}${issueNumber ? `#${issueNumber}` : ''}`}
            >
              {orgName && <span className="text-zinc-500">{orgName}/</span>}
              <span className="text-zinc-300">{repoName}</span>
              {issueNumber ? <span className="text-zinc-500">#{issueNumber}</span> : null}
            </button>
          )}
        </div>

        {/* Hover Quick Actions (Top-right overlay so footer never gets squeezed) */}
        {!isOverlay && onMoveColumn && (
          <div
            className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {prevStatus && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveColumn(task.id, prevStatus);
                }}
                className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
                title={`Move back to ${prevStatus}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {nextStatus && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveColumn(task.id, nextStatus);
                }}
                className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
                title={`Move forward to ${nextStatus}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task.id);
                }}
                className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove from board"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Title (clickable to open in GitHub, draggable anywhere) */}
      {task.url ? (
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-semibold leading-snug tracking-tight line-clamp-3 text-zinc-100 hover:text-amber-300 transition-colors w-fit"
        >
          {task.title}
        </a>
      ) : (
        <div className="text-sm font-semibold leading-snug tracking-tight line-clamp-3 text-zinc-100">
          {task.title}
        </div>
      )}

      {/* Labels / Tags */}
      {Array.isArray(metadata.labels) && metadata.labels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {metadata.labels.slice(0, 3).map((l: CardLabel, idx: number) => (
            <span
              key={idx}
              className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium truncate max-w-[120px] bg-white/[0.06] text-zinc-300"
              title={l.description || l.name}
            >
              {l.name}
            </span>
          ))}
          {metadata.labels.length > 3 && (
            <span className="text-[10px] text-zinc-500 font-mono">
              +{metadata.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Card Footer: Age Badge + Full Author Name */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <AgeBadge
          sourceCreatedAt={task.sourceCreatedAt}
          statusUpdatedAt={task.statusUpdatedAt}
          isDone={isDone}
        />

        {task.author && (
          <div
            className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono min-w-0"
            title={`Author: ${task.author}`}
          >
            {task.authorAvatarUrl ? (
              <img
                src={task.authorAvatarUrl}
                alt={task.author}
                className="w-4 h-4 rounded-full shrink-0"
              />
            ) : (
              <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[10px] shrink-0">
                {task.author.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate max-w-[110px]">{task.author}</span>
          </div>
        )}
      </div>
    </div>
  );
}
