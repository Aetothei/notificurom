import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, TaskStatus } from '@/db/schema';
import { AgeBadge } from './AgeBadge';
import { StatBadge } from './StatBadge';
import {
  ExternalLink,
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

  const renderSourceBadge = () => {
    if (task.sourceType === 'review_request') {
      return (
        <StatBadge
          icon="mdi:eye-outline"
          value="Review"
          variant="amber"
          className="px-2.5 py-0.5 text-[11px]"
        />
      );
    }
    if (task.sourceType === 'pr') {
      return (
        <StatBadge
          icon="mdi:source-pull"
          value="PR"
          variant="blue"
          className="px-2.5 py-0.5 text-[11px]"
        />
      );
    }
    return (
      <StatBadge
        icon="mdi:record-circle-outline"
        value="Issue"
        variant="teal"
        className="px-2.5 py-0.5 text-[11px]"
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
      className={`group relative rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] backdrop-blur-xl p-4 transition-all duration-200 text-zinc-100 flex flex-col gap-3 select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      } ${
        isOverlay
          ? 'shadow-[0_16px_40px_rgba(0,0,0,0.65)] bg-[#161822]/95 z-50 cursor-grabbing scale-[1.02]'
          : ''
      }`}
    >
      {/* Card Header: Source Pill + Repo#Number + Open Link */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden flex-wrap min-w-0">
          {renderSourceBadge()}
          {task.repository && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onFilterRepo?.(task.repository!);
              }}
              className="text-xs font-mono text-zinc-400 hover:text-amber-300 truncate max-w-[180px] transition-colors cursor-pointer text-left"
              title={`Filter by ${task.repository}`}
            >
              {task.repository}
              {issueNumber ? <span className="text-zinc-500">#{issueNumber}</span> : null}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
              title="Open in GitHub"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
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

      {/* Card Footer: Age Badge + Author + Quick Move Buttons */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <AgeBadge
          sourceCreatedAt={task.sourceCreatedAt}
          statusUpdatedAt={task.statusUpdatedAt}
          isDone={task.status === 'done'}
        />

        <div className="flex items-center gap-1.5">
          {task.author && (
            <div
              className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono"
              title={`Author: ${task.author}`}
            >
              {task.authorAvatarUrl ? (
                <img
                  src={task.authorAvatarUrl}
                  alt={task.author}
                  className="w-4 h-4 rounded-full"
                />
              ) : (
                <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                  {task.author.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate max-w-[65px]">{task.author}</span>
            </div>
          )}

          {!isOverlay && onMoveColumn && (
            <div
              className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-1 gap-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {prevStatus && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveColumn(task.id, prevStatus);
                  }}
                  className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
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
                  className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 flex items-center justify-center transition-colors cursor-pointer"
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
                  className="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-rose-500/20 text-zinc-500 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                  title="Remove from board"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
